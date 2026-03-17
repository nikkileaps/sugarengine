import type { DialogueManager } from '../dialogue/DialogueManager';
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

/**
 * Adapts the existing DialogueManager (scripted node-graph dialogue) into a
 * ConversationProvider for the ConversationHost.
 *
 * The DialogueManager owns its own UI (DialoguePanel) and advance/choice flow,
 * so this provider delegates turn execution to it. The ConversationHost manages
 * session lifecycle and middleware hooks around the scripted conversation.
 */
export class ScriptedDialogueProvider implements ConversationProvider {
  readonly descriptor: ConversationProviderDescriptor = {
    id: 'scripted-dialogue',
    // Scripted has highest priority (lowest number) — quest/default dialogue
    // takes precedence over agent conversation.
    priority: 10,
    supportsEngagementKinds: ['default'],
  };

  constructor(private dialogueManager: DialogueManager) {}

  getEngagementOptions(
    _npcId: string,
    context: ProviderSelectionContext,
  ): ConversationEngagementOption[] {
    if (!context.dialogueId) return [];
    return [
      {
        kind: 'default',
        providerId: this.descriptor.id,
        label: 'Talk',
        presentationKind: 'dialogue_panel',
        driverKind: 'dialogue_manager_driven',
        priority: this.descriptor.priority,
      },
    ];
  }

  canHandle(_npcId: string, context: ProviderSelectionContext): boolean {
    // Handle any interaction where a pre-resolved dialogueId is provided.
    // The caller (Game.ts) resolves quest dialogue, BT dialogue, or default
    // dialogue BEFORE consulting the host, so dialogueId is the signal.
    return !!context.dialogueId;
  }

  async startSession(_session: ConversationSession, context: ProviderSelectionContext): Promise<void> {
    if (context.dialogueId) {
      await this.dialogueManager.start(context.dialogueId);
    }
  }

  async produceTurn(
    _session: ConversationSession,
    _constraints: ProviderConstraintBundle,
    _playerInput?: PlayerInput,
  ): Promise<ProviderTurnOutput> {
    // Scripted dialogue manages its own turn flow via DialogueManager/DialoguePanel.
    // produceTurn is not called in the normal scripted path — the DialogueManager
    // handles node traversal, choices, and advance internally.
    // This exists to satisfy the interface; Sugarlang's scripted provider will use
    // produceTurn for its own language-learning turns.
    return {
      utterance: '',
      responseContract: { mode: 'free_form' },
    };
  }

  async endSession(_session: ConversationSession): Promise<void> {
    // DialogueManager handles its own cleanup via its onEnd callback.
  }
}
