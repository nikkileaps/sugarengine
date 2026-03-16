import type { PluginIntent, PluginIntentResult } from '../plugins/types';
import type {
  ConversationEngagementOption,
  ConversationSession,
  ConversationProvider,
  ConversationMiddleware,
  ConversationMiddlewareStage,
  ConversationTurnEnvelope,
  ProviderConstraintBundle,
  ProviderSelectionContext,
  PlayerInput,
} from './types';
import { createReplayCollector, type ReplayBundle, type ReplayCollector } from './replay';

// ---------------------------------------------------------------------------
// Host Context (what the host needs from the Game)
// ---------------------------------------------------------------------------

export interface ConversationHostContext {
  executeIntent(intent: PluginIntent): Promise<PluginIntentResult>;
  addMovementLock(id: string): void;
  removeMovementLock(id: string): void;
}

// ---------------------------------------------------------------------------
// Host Events (what the host emits to the outside world)
// ---------------------------------------------------------------------------

export interface ConversationHostEventHandlers {
  onSessionStart?: (session: ConversationSession) => void;
  onSessionEnd?: (session: ConversationSession) => void;
  onTurnProduced?: (envelope: ConversationTurnEnvelope) => void;
  /** Called when a session ends with the complete replay bundle. */
  onReplayAvailable?: (bundle: ReplayBundle) => void;
}

// ---------------------------------------------------------------------------
// Language Context
// ---------------------------------------------------------------------------

export interface LanguageContext {
  targetLanguage?: string;
  supportLanguage?: string;
  learnerBandOverride?: string;
}

// ---------------------------------------------------------------------------
// ConversationHost
// ---------------------------------------------------------------------------

let nextSessionId = 1;
let nextTraceId = 1;

function generateSessionId(): string {
  return `session_${nextSessionId++}_${Date.now()}`;
}

function generateTraceId(): string {
  return `trace_${nextTraceId++}_${Date.now()}`;
}

function generateTurnId(sessionId: string, turnIndex: number): string {
  return `${sessionId}_turn_${turnIndex}`;
}

/**
 * Engine-owned conversation orchestrator.
 *
 * Manages session lifecycle, provider selection, ordered middleware execution,
 * and normalized turn envelopes. Replaces the previous first-plugin-wins
 * interaction model with a proper provider + middleware pipeline.
 */
export class ConversationHost {
  private providers: ConversationProvider[] = [];
  private middlewares: ConversationMiddleware[] = [];
  private activeSession: ConversationSession | null = null;
  private activeReplayCollector: ReplayCollector | null = null;
  private hostContext: ConversationHostContext;
  private eventHandlers: ConversationHostEventHandlers = {};
  private languageContext: LanguageContext = {};

  constructor(hostContext: ConversationHostContext) {
    this.hostContext = hostContext;
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  registerProvider(provider: ConversationProvider): void {
    this.providers.push(provider);
    this.providers.sort((a, b) => a.descriptor.priority - b.descriptor.priority);
  }

  registerMiddleware(middleware: ConversationMiddleware): void {
    this.middlewares.push(middleware);
    // Sort by priority for each stage execution
    this.middlewares.sort((a, b) => a.descriptor.priority - b.descriptor.priority);
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  setEventHandlers(handlers: ConversationHostEventHandlers): void {
    this.eventHandlers = handlers;
  }

  setLanguageContext(context: LanguageContext): void {
    this.languageContext = { ...context };
    // Update active session if language context changes
    if (this.activeSession) {
      this.activeSession.targetLanguage = context.targetLanguage;
      this.activeSession.supportLanguage = context.supportLanguage;
      this.activeSession.learnerBandOverride = context.learnerBandOverride;
    }
  }

  getLanguageContext(): Readonly<LanguageContext> {
    return this.languageContext;
  }

  // -------------------------------------------------------------------------
  // Session Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start a conversation with an NPC.
   * Selects the appropriate provider and runs the middleware session-start hooks.
   */
  async startConversation(
    npcId: string,
    npcName: string | undefined,
    selectionContext: ProviderSelectionContext,
  ): Promise<ConversationSession | null> {
    if (this.activeSession) {
      console.warn('[ConversationHost] Cannot start conversation: one is already active');
      return null;
    }

    // Enrich selection context with language settings so providers can
    // pre-resolve band policy during canHandle (e.g. B4 agent_preferred).
    const enrichedContext: ProviderSelectionContext = {
      ...selectionContext,
      targetLanguage: selectionContext.targetLanguage ?? this.languageContext.targetLanguage,
      supportLanguage: selectionContext.supportLanguage ?? this.languageContext.supportLanguage,
      learnerBandOverride: selectionContext.learnerBandOverride ?? this.languageContext.learnerBandOverride,
    };

    // Select provider
    const provider = this.selectProvider(npcId, enrichedContext);
    if (!provider) {
      console.warn(`[ConversationHost] No provider can handle NPC "${npcId}"`);
      return null;
    }

    const selectedEngagement = enrichedContext.selectedEngagement;

    // Create session
    const session: ConversationSession = {
      sessionId: generateSessionId(),
      traceId: generateTraceId(),
      npcId,
      npcName,
      providerId: provider.descriptor.id,
      engagementKind: selectedEngagement?.kind ?? 'default',
      presentationKind: selectedEngagement?.presentationKind ?? 'dialogue_panel',
      driverKind: selectedEngagement?.driverKind ?? 'host_turn_driven',
      turnIndex: 0,
      targetLanguage: this.languageContext.targetLanguage,
      supportLanguage: this.languageContext.supportLanguage,
      learnerBandOverride: this.languageContext.learnerBandOverride,
      middlewareState: {},
    };

    // Start provider session (pass enriched context so provider can access dialogueId, language, etc.)
    await provider.startSession(session, enrichedContext);

    // Run middleware session-start hooks
    for (const mw of this.middlewares) {
      if (mw.onSessionStart) {
        try {
          await mw.onSessionStart(session);
        } catch (error) {
          console.error(`[ConversationHost] Middleware "${mw.descriptor.id}" failed in onSessionStart`, error);
        }
      }
    }

    this.activeSession = session;
    this.activeReplayCollector = createReplayCollector(session);
    this.hostContext.addMovementLock('conversation');

    console.log(
      `[ConversationHost] session started → trace=${session.traceId} provider=${session.providerId}` +
      ` engagement=${session.engagementKind}/${session.presentationKind}/${session.driverKind}` +
      ` npc=${npcId} lang=${session.targetLanguage ?? '?'}/${session.supportLanguage ?? '?'}` +
      ` band=${session.learnerBandOverride ?? 'auto'}`,
    );

    this.eventHandlers.onSessionStart?.(session);

    return session;
  }

  /**
   * Submit player input and produce the next NPC turn.
   * Runs the full middleware pipeline around provider execution.
   */
  async submitTurn(playerInput?: PlayerInput): Promise<ConversationTurnEnvelope | null> {
    const session = this.activeSession;
    if (!session) {
      console.warn('[ConversationHost] Cannot submit turn: no active session');
      return null;
    }

    const provider = this.findProvider(session.providerId);
    if (!provider) {
      console.error(`[ConversationHost] Provider "${session.providerId}" not found`);
      return null;
    }

    const turnId = generateTurnId(session.sessionId, session.turnIndex);

    // Build initial constraint bundle
    const constraints: ProviderConstraintBundle = {
      sessionId: session.sessionId,
      turnId,
      targetLanguage: session.targetLanguage,
      supportLanguage: session.supportLanguage,
      learnerBand: session.learnerBandOverride,
      hardConstraints: {},
      advisoryPreferences: {},
    };

    // --- Pre-provider middleware stages ---
    await this.runBeforeProvider(session, constraints, 'context_hydration');
    await this.runBeforeProvider(session, constraints, 'learner_policy');
    await this.runBeforeProvider(session, constraints, 'pre_provider');

    // --- Provider execution ---
    const providerOutput = await provider.produceTurn(session, constraints, playerInput);

    // --- Build normalized envelope ---
    const envelope: ConversationTurnEnvelope = {
      sessionId: session.sessionId,
      turnId,
      turnIndex: session.turnIndex,
      providerId: session.providerId,
      utterance: providerOutput.utterance,
      speakerId: providerOutput.speakerId,
      speakerName: providerOutput.speakerName,
      emotion: providerOutput.emotion,
      intent: providerOutput.intent,
      responseContract: providerOutput.responseContract,
      targetLanguage: session.targetLanguage,
      supportLanguage: session.supportLanguage,
      hostActionProposals: providerOutput.hostActionProposals ?? [],
      groundingMetadata: providerOutput.groundingMetadata,
      providerDiagnostics: providerOutput.diagnostics,
      turnEvidence: providerOutput.turnEvidence,
      middlewareAnnotations: {},
      traceId: session.traceId,
      timestampMs: Date.now(),
    };

    // --- Post-provider middleware stages ---
    await this.runAfterProvider(session, envelope, 'post_provider');
    await this.runAfterProvider(session, envelope, 'analysis');
    await this.runAfterProvider(session, envelope, 'telemetry');

    // --- Execute validated host actions ---
    for (const action of envelope.hostActionProposals) {
      const result = await this.hostContext.executeIntent(action);
      if (!result.success) {
        console.warn(`[ConversationHost] Host action rejected: ${result.error}`);
      }
    }

    // Capture for replay
    this.activeReplayCollector?.addTurn(envelope);

    console.log(
      `[ConversationHost] turn ${envelope.turnIndex} → trace=${envelope.traceId}` +
      ` provider=${envelope.providerId} mode=${envelope.responseContract.mode}` +
      (envelope.turnEvidence ? ' evidence=yes' : '') +
      (envelope.middlewareAnnotations['sugarlang'] ? ` sl=${JSON.stringify((envelope.middlewareAnnotations['sugarlang'] as any)?.resolvedBand)}` : ''),
    );

    // Advance turn counter
    session.turnIndex++;

    this.eventHandlers.onTurnProduced?.(envelope);

    return envelope;
  }

  /**
   * End the active conversation session.
   */
  async endConversation(): Promise<void> {
    const session = this.activeSession;
    if (!session) return;

    const provider = this.findProvider(session.providerId);

    // Run middleware session-end hooks
    for (const mw of this.middlewares) {
      if (mw.onSessionEnd) {
        try {
          await mw.onSessionEnd(session);
        } catch (error) {
          console.error(`[ConversationHost] Middleware "${mw.descriptor.id}" failed in onSessionEnd`, error);
        }
      }
    }

    // End provider session
    if (provider) {
      await provider.endSession(session);
    }

    // Finalize and emit replay bundle
    if (this.activeReplayCollector) {
      const replayBundle = this.activeReplayCollector.finalize();
      this.activeReplayCollector = null;
      console.log(
        `[ConversationHost] session ended → trace=${replayBundle.session.traceId}` +
        ` turns=${replayBundle.turnCount} provider=${replayBundle.session.providerId}`,
      );
      this.eventHandlers.onReplayAvailable?.(replayBundle);
    }

    this.activeSession = null;
    this.hostContext.removeMovementLock('conversation');
    this.eventHandlers.onSessionEnd?.(session);
  }

  // -------------------------------------------------------------------------
  // State Queries
  // -------------------------------------------------------------------------

  isActive(): boolean {
    return this.activeSession !== null;
  }

  getActiveSession(): Readonly<ConversationSession> | null {
    return this.activeSession;
  }

  /**
   * Check whether any registered provider can handle the given NPC.
   * Used by the interaction system to decide whether to show the prompt.
   */
  hasProviderFor(npcId: string, context: ProviderSelectionContext): boolean {
    return this.selectProvider(npcId, context) !== null;
  }

  listEngagementOptions(
    npcId: string,
    context: ProviderSelectionContext,
  ): ConversationEngagementOption[] {
    const enrichedContext: ProviderSelectionContext = {
      ...context,
      targetLanguage: context.targetLanguage ?? this.languageContext.targetLanguage,
      supportLanguage: context.supportLanguage ?? this.languageContext.supportLanguage,
      learnerBandOverride: context.learnerBandOverride ?? this.languageContext.learnerBandOverride,
    };

    const options: ConversationEngagementOption[] = [];
    const seen = new Set<string>();

    for (const provider of this.providers) {
      const advertised = provider.getEngagementOptions?.(npcId, enrichedContext)
        ?? this.buildFallbackOptions(provider, npcId, enrichedContext);

      for (const option of advertised) {
        if (option.providerId !== provider.descriptor.id) continue;
        const key = `${option.kind}:${option.providerId}:${option.presentationKind}:${option.driverKind}`;
        if (seen.has(key)) continue;
        if (!provider.canHandle(npcId, { ...enrichedContext, selectedEngagement: option })) continue;
        seen.add(key);
        options.push(option);
      }
    }

    options.sort((left, right) => {
      const leftPriority = left.priority ?? this.findProvider(left.providerId)?.descriptor.priority ?? 999;
      const rightPriority = right.priority ?? this.findProvider(right.providerId)?.descriptor.priority ?? 999;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return left.label.localeCompare(right.label);
    });

    return options;
  }

  // -------------------------------------------------------------------------
  // Provider Management
  // -------------------------------------------------------------------------

  private selectProvider(
    npcId: string,
    context: ProviderSelectionContext,
  ): ConversationProvider | null {
    if (context.selectedEngagement) {
      const provider = this.findProvider(context.selectedEngagement.providerId);
      if (!provider) return null;
      return provider.canHandle(npcId, context) ? provider : null;
    }

    for (const provider of this.providers) {
      if (provider.canHandle(npcId, context)) {
        return provider;
      }
    }
    return null;
  }

  private buildFallbackOptions(
    provider: ConversationProvider,
    npcId: string,
    context: ProviderSelectionContext,
  ): ConversationEngagementOption[] {
    const supportedKinds = provider.descriptor.supportsEngagementKinds ?? [];
    if (supportedKinds.length !== 1) return [];

    const kind = supportedKinds[0]!;
    const option: ConversationEngagementOption = {
      kind,
      providerId: provider.descriptor.id,
      label: kind === 'chat' ? 'Chat' : 'Talk',
      presentationKind: kind === 'chat' ? 'chat_panel' : 'dialogue_panel',
      driverKind: kind === 'chat' ? 'host_turn_driven' : 'host_turn_driven',
      priority: provider.descriptor.priority,
    };

    return provider.canHandle(npcId, { ...context, selectedEngagement: option })
      ? [option]
      : [];
  }

  private findProvider(id: string): ConversationProvider | null {
    return this.providers.find((p) => p.descriptor.id === id) ?? null;
  }

  // -------------------------------------------------------------------------
  // Middleware Pipeline
  // -------------------------------------------------------------------------

  private getMiddlewaresForStage(
    stage: ConversationMiddlewareStage,
  ): ConversationMiddleware[] {
    return this.middlewares.filter((mw) => mw.descriptor.stages.includes(stage));
  }

  private async runBeforeProvider(
    session: ConversationSession,
    constraints: ProviderConstraintBundle,
    stage: 'context_hydration' | 'learner_policy' | 'pre_provider',
  ): Promise<void> {
    for (const mw of this.getMiddlewaresForStage(stage)) {
      if (mw.beforeProvider) {
        try {
          await mw.beforeProvider(session, constraints, stage);
        } catch (error) {
          console.error(`[ConversationHost] Middleware "${mw.descriptor.id}" failed in ${stage}`, error);
        }
      }
    }
  }

  private async runAfterProvider(
    session: ConversationSession,
    envelope: ConversationTurnEnvelope,
    stage: 'post_provider' | 'analysis' | 'telemetry',
  ): Promise<void> {
    for (const mw of this.getMiddlewaresForStage(stage)) {
      if (mw.afterProvider) {
        try {
          await mw.afterProvider(session, envelope, stage);
        } catch (error) {
          console.error(`[ConversationHost] Middleware "${mw.descriptor.id}" failed in ${stage}`, error);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  async dispose(): Promise<void> {
    if (this.activeSession) {
      await this.endConversation();
    }
    this.providers = [];
    this.middlewares = [];
  }
}
