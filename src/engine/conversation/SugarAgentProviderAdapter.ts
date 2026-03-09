import type { PluginManager } from '../plugins/PluginManager';
import type { PluginPedagogyContext } from '../plugins/types';
import type {
  ConversationProvider,
  ConversationProviderDescriptor,
  ConversationSession,
  ProviderConstraintBundle,
  ProviderSelectionContext,
  ProviderTurnOutput,
  PlayerInput,
} from './types';

/**
 * Context builder for constructing the legacy PluginAgentTurnRequest
 * from the new ConversationHost session and constraints.
 */
export interface SugarAgentAdapterContext {
  gameId?: string;
  getCurrentRegion(): string | undefined;
  getCurrentEpisode(): string | undefined;
  getNpcInteractionMode(npcId: string): 'scripted' | 'agent' | 'hybrid';
  getNpcInteractionPolicy(npcId: string): 'scripted-first' | 'agent-first' | 'fallback';
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
  };

  constructor(
    private pluginManager: PluginManager,
    private adapterContext: SugarAgentAdapterContext,
  ) {}

  canHandle(_npcId: string, context: ProviderSelectionContext): boolean {
    // SugarAgent handles conversations when:
    // 1. The NPC is in agent or hybrid mode
    // 2. There's no quest dialogue (quest dialogue is handled by scripted provider)
    // 3. A plugin exists that can handle agent turns
    if (context.hasQuestDialogue) return false;
    return context.npcInteractionMode === 'agent' || context.npcInteractionMode === 'hybrid';
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

    // Bridge engine-mediated pedagogy constraints into the agent turn request
    const pedagogyContext: PluginPedagogyContext | undefined =
      (constraints.learnerBand || constraints.supportLanguagePolicy || constraints.groundingScope)
        ? {
            learnerBand: constraints.learnerBand,
            supportLanguagePolicy: constraints.supportLanguagePolicy,
            targetLanguage: constraints.targetLanguage,
            supportLanguage: constraints.supportLanguage,
            communicativeTask: constraints.communicativeTask,
            correctionPosture: constraints.hardConstraints['correctionPosture'] as string | undefined,
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
              conceptId: ref.conceptId,
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
        ` grounding=${pedagogyContext.groundingScope?.length ?? 0} refs` +
        ` task=${pedagogyContext.communicativeTask ?? '?'}`,
      );
    }

    const result = await this.pluginManager.runAgentTurn({
      npcId: session.npcId,
      npcName: session.npcName,
      playerMessage: message,
      context: {
        gameId: this.adapterContext.gameId,
        regionPath: this.adapterContext.getCurrentRegion(),
        episodeId: this.adapterContext.getCurrentEpisode(),
        interactionMode: this.adapterContext.getNpcInteractionMode(session.npcId),
        interactionPolicy: this.adapterContext.getNpcInteractionPolicy(session.npcId),
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
