import type { PluginManager } from '../plugins/PluginManager';
import type { PluginPedagogyContext } from '../plugins/types';
import type {
  ConversationEngagementOption,
  ConversationProvider,
  ConversationProviderDescriptor,
  ConversationSession,
  ProviderConstraintBundle,
  ProviderSelectionContext,
  ProviderTurnOutput,
  PlayerInput,
} from './types';
import {
  deriveLegacySugarAgentInteraction,
  type NPCInteractionCapabilities,
} from './interactionCapabilities';

/**
 * Context builder for constructing the legacy PluginAgentTurnRequest
 * from the new ConversationHost session and constraints.
 */
export interface SugarAgentAdapterContext {
  gameId?: string;
  getCurrentRegion(): string | undefined;
  getCurrentRegionInfo?(): { path: string; name?: string } | null;
  getCurrentEpisode(): string | undefined;
  getNpcInteractionCapabilities(npcId: string): NPCInteractionCapabilities;
  buildQuestSnapshot(): Array<{
    questId: string;
    currentStageId: string;
    objectives: Array<{ objectiveId: string; state: 'active' | 'completed' | 'inactive' }>;
  }>;
  serializeFlags(): Record<string, unknown>;
}

/**
 * Adapts the existing SugarAgent plugin (which implements EnginePlugin.runAgentTurn)
 * into a ConversationProvider for the ConversationHost.
 *
 * This is the migration bridge: existing SugarAgent behavior is preserved while
 * participating in the new provider/middleware pipeline.
 */
export class SugarAgentProviderAdapter implements ConversationProvider {
  readonly descriptor: ConversationProviderDescriptor = {
    id: 'sugaragent',
    // Agent provider has lower priority (higher number) than scripted
    priority: 100,
    supportsEngagementKinds: ['chat'],
  };

  constructor(
    private pluginManager: PluginManager,
    private adapterContext: SugarAgentAdapterContext,
  ) {}

  getEngagementOptions(
    _npcId: string,
    context: ProviderSelectionContext,
  ): ConversationEngagementOption[] {
    if (context.hasQuestDialogue) return [];
    if (!context.npcInteractionCapabilities.chat.enabled) return [];
    return [
      {
        kind: 'chat',
        providerId: this.descriptor.id,
        label: 'Chat',
        description: 'Free conversation with this character.',
        presentationKind: 'chat_panel',
        driverKind: 'host_turn_driven',
        priority: this.descriptor.priority,
      },
    ];
  }

  canHandle(_npcId: string, context: ProviderSelectionContext): boolean {
    // SugarAgent handles conversations when:
    // 1. The NPC has chat capability enabled
    // 2. There's no quest dialogue (quest dialogue is handled by scripted provider)
    if (context.hasQuestDialogue) return false;
    if (context.selectedEngagement && context.selectedEngagement.kind !== 'chat') return false;
    return context.npcInteractionCapabilities.chat.enabled;
  }

  async startSession(_session: ConversationSession, _context: ProviderSelectionContext): Promise<void> {
    // SugarAgent plugin manages its own session state internally
    // via resolveInteraction -> openAgentConversation
  }

  async produceTurn(
    session: ConversationSession,
    constraints: ProviderConstraintBundle,
    playerInput?: PlayerInput,
  ): Promise<ProviderTurnOutput> {
    const message = playerInput?.text ?? '';
    const regionInfo = this.adapterContext.getCurrentRegionInfo?.() ?? null;

    // Bridge engine-mediated pedagogy constraints into the agent turn request
    const pedagogyContext: PluginPedagogyContext | undefined =
      (
        constraints.targetLanguage
        || constraints.supportLanguage
        || constraints.learnerBand
        || constraints.supportLanguagePolicy
        || constraints.deliveryContract
        || constraints.groundingScope
        || constraints.availableTrackedLexicalEntryIds
        || constraints.teachingSubset
        || constraints.ambientHaloAllowance
      )
        ? {
            learnerBand: constraints.learnerBand,
            supportLanguagePolicy: constraints.supportLanguagePolicy,
            targetLanguage: constraints.targetLanguage,
            supportLanguage: constraints.supportLanguage,
            correctionPosture: constraints.hardConstraints?.['correctionPosture'] as string | undefined,
            deliveryContract: constraints.deliveryContract,
            availableTrackedLexicalEntryIds: constraints.availableTrackedLexicalEntryIds,
            teachingSubset: constraints.teachingSubset,
            ambientHaloAllowance: constraints.ambientHaloAllowance,
            responseContract: constraints.responseContract
              ? {
                  mode: constraints.responseContract.mode,
                  choices: constraints.responseContract.choices,
                  wordBank: constraints.responseContract.wordBank,
                  maxLength: constraints.responseContract.maxLength,
                  hintText: constraints.responseContract.hintText,
                }
              : undefined,
            groundingScope: constraints.groundingScope?.map((ref) => ({
              lexicalEntryId: ref.lexicalEntryId,
              targetForm: ref.targetForm,
              worldObjectId: ref.worldObjectId,
              worldAttribute: ref.worldAttribute,
            })),
            sceneSemantics: constraints.sceneSemantics,
          }
        : undefined;

    if (pedagogyContext) {
      console.log(
        `[SugarAgentAdapter] pedagogy bridged → band=${pedagogyContext.learnerBand}` +
        ` policy=${pedagogyContext.supportLanguagePolicy}` +
        ` posture=${pedagogyContext.correctionPosture ?? 'none'}` +
        ` delivery=${pedagogyContext.deliveryContract?.detailLevel ?? 'none'}` +
        ` trackedPool=${pedagogyContext.availableTrackedLexicalEntryIds?.length ?? 0}` +
        ` focus=${pedagogyContext.teachingSubset?.focusLexicalEntryIds.length ?? 0}` +
        ` grounding=${pedagogyContext.groundingScope?.length ?? 0} refs`,
      );
    }

    const result = await this.pluginManager.runAgentTurn({
      npcId: session.npcId,
      npcName: session.npcName,
      playerMessage: message,
      context: {
        traceId: session.traceId,
        gameId: this.adapterContext.gameId,
        regionPath: regionInfo?.path ?? this.adapterContext.getCurrentRegion(),
        regionName: regionInfo?.name,
        episodeId: this.adapterContext.getCurrentEpisode(),
        ...deriveLegacySugarAgentInteraction(
          this.adapterContext.getNpcInteractionCapabilities(session.npcId),
          session.engagementKind,
        ),
        questSnapshot: this.adapterContext.buildQuestSnapshot(),
        flagSnapshot: this.adapterContext.serializeFlags(),
        pedagogyContext,
      },
    });

    if (!result) {
      return {
        utterance: 'I lost my train of thought. Could you try again?',
        emotion: 'neutral',
        intent: 'fallback',
        responseContract: { mode: 'free_form' },
      };
    }

    // Map existing PluginAgentTurnResult → ProviderTurnOutput
    return {
      utterance: result.utterance,
      emotion: result.emotion,
      intent: result.intent,
      responseContract: constraints.responseContract ?? { mode: 'free_form' },
      hostActionProposals: Array.isArray(result.actions) ? result.actions : [],
      diagnostics: result.diagnostics,
    };
  }

  async endSession(_session: ConversationSession): Promise<void> {
    // SugarAgent plugin manages its own session cleanup
  }
}
