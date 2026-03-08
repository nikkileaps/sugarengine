/**
 * Sugarlang Scripted Provider.
 *
 * A ConversationProvider that produces turns from scene language packs.
 * Reads the target language and learner band from the constraint bundle
 * (set by sugarlang middleware) and walks through the pre-authored turns
 * for the resolved band realization.
 *
 * This provider handles sugarlang-enabled NPCs that have a scenario
 * mapped in the content bundle. It does NOT require SugarAgent or any LLM.
 */

import type {
  ConversationProvider,
  ConversationProviderDescriptor,
  ConversationSession,
  ProviderConstraintBundle,
  ProviderSelectionContext,
  ProviderTurnOutput,
  PlayerInput,
  ResponseContract,
} from '../../engine/conversation/types';
import type { SugarlangContentBundle, SceneTurn, LearnerBandId } from './types';
import { resolveSceneBandContent } from './content/loader';
import { evaluateTurn } from './evaluator';
import type { EvaluationResult } from './evaluator';

// ---------------------------------------------------------------------------
// Session-local state (stored on session.middlewareState)
// ---------------------------------------------------------------------------

const PROVIDER_KEY = 'sugarlang-provider';

interface ProviderSessionState {
  scenarioId: string;
  /** The resolved band's turns for this session. */
  turns: SceneTurn[];
  /** Current turn position (next turn to produce). */
  turnCursor: number;
  /** Attempt count for the current turn (for recovery logic). */
  attemptCount: number;
  /** The last evaluation result. */
  lastEvaluation?: EvaluationResult;
  /** Whether the scene is complete. */
  complete: boolean;
}

function getProviderState(session: ConversationSession): ProviderSessionState | undefined {
  return session.middlewareState[PROVIDER_KEY] as ProviderSessionState | undefined;
}

function setProviderState(session: ConversationSession, state: ProviderSessionState): void {
  session.middlewareState[PROVIDER_KEY] = state;
}

// ---------------------------------------------------------------------------
// Turn → ResponseContract mapping
// ---------------------------------------------------------------------------

function turnToResponseContract(turn: SceneTurn): ResponseContract {
  const contract: ResponseContract = {
    mode: turn.responseMode,
  };

  if (turn.responseData?.choices) {
    contract.choices = turn.responseData.choices;
  }
  if (turn.responseData?.blanks) {
    contract.blanks = turn.responseData.blanks;
  }
  if (turn.responseData?.wordBank) {
    contract.wordBank = turn.responseData.wordBank;
  }
  if (turn.responseData?.maxLength) {
    contract.maxLength = turn.responseData.maxLength;
  }
  if (turn.responseData?.hintText) {
    contract.hintText = turn.responseData.hintText;
  }

  return contract;
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export interface SugarlangProviderConfig {
  contentBundle: SugarlangContentBundle;
  /** Resolve the scenario ID for a given NPC (by id or name). */
  getScenarioForNpc(npcId: string, npcName?: string): string | undefined;
}

export function createSugarlangScriptedProvider(
  config: SugarlangProviderConfig,
): ConversationProvider {
  const { contentBundle } = config;

  const descriptor: ConversationProviderDescriptor = {
    id: 'sugarlang-scripted',
    // Between scripted dialogue (10) and SugarAgent (100).
    // Scripted quest/BT dialogues take precedence; sugarlang takes precedence over agent.
    priority: 50,
  };

  function canHandle(npcId: string, context: ProviderSelectionContext): boolean {
    // Only handle when there's NO pre-resolved dialogueId (quest/BT/default dialogues
    // go to ScriptedDialogueProvider instead).
    if (context.dialogueId) return false;
    // Handle when the NPC has a sugarlang scenario (by id or name).
    return !!config.getScenarioForNpc(npcId, context.npcName);
  }

  async function startSession(
    session: ConversationSession,
    _context: ProviderSelectionContext,
  ): Promise<void> {
    const scenarioId = config.getScenarioForNpc(session.npcId, session.npcName);
    if (!scenarioId) return;

    // Resolve band and language — these may be set by middleware, but we also
    // need them here for turn resolution. Use session values as defaults.
    const targetLang = session.targetLanguage ?? 'es';
    const band = (session.learnerBandOverride ?? 'B0') as LearnerBandId;

    const bandContent = resolveSceneBandContent(contentBundle, scenarioId, targetLang, band);

    setProviderState(session, {
      scenarioId,
      turns: bandContent?.turns ?? [],
      turnCursor: 0,
      attemptCount: 0,
      complete: false,
    });
  }

  async function produceTurn(
    session: ConversationSession,
    constraints: ProviderConstraintBundle,
    playerInput?: PlayerInput,
  ): Promise<ProviderTurnOutput> {
    let state = getProviderState(session);

    // If middleware resolved a different band/language than what we initialized with,
    // re-resolve the turns. This handles the case where middleware sets the band
    // after startSession.
    if (state && constraints.learnerBand && constraints.targetLanguage) {
      const currentBand = (constraints.learnerBand ?? 'B0') as LearnerBandId;
      const currentLang = constraints.targetLanguage;
      const bandContent = resolveSceneBandContent(
        contentBundle,
        state.scenarioId,
        currentLang,
        currentBand,
      );
      if (bandContent && state.turns !== bandContent.turns) {
        state.turns = bandContent.turns;
        // Don't reset cursor — only re-resolve if it's the first turn
        if (session.turnIndex === 0) {
          state.turnCursor = 0;
        }
      }
    }

    if (!state || state.turns.length === 0) {
      // No content — signal completion
      return {
        utterance: '',
        responseContract: { mode: 'free_form' },
        hostActionProposals: [{ type: 'closeConversation' }],
      };
    }

    // --- Evaluate previous turn's response if player input is provided ---
    if (playerInput && state.turnCursor > 0) {
      const previousTurn = state.turns[state.turnCursor - 1];
      if (previousTurn) {
        state.attemptCount++;
        const evalResult = evaluateTurn(playerInput, previousTurn, state.attemptCount);
        state.lastEvaluation = evalResult;

        if (!evalResult.correct && state.attemptCount < 3) {
          // Retry the same turn with feedback
          const retryContract = turnToResponseContract(previousTurn);
          retryContract.hintText = evalResult.feedback ?? retryContract.hintText;

          setProviderState(session, state);
          return {
            utterance: evalResult.feedback ?? 'Try again!',
            speakerId: previousTurn.speakerId,
            speakerName: previousTurn.speakerName,
            emotion: 'encouraging',
            responseContract: retryContract,
          };
        }

        // If 3+ failed attempts, reveal answer and advance
        if (!evalResult.correct && state.attemptCount >= 3) {
          // Advance past this turn after revealing the answer
          state.attemptCount = 0;
        } else {
          // Correct — reset attempt counter and advance
          state.attemptCount = 0;
        }
      }
    }

    // --- Produce the next turn ---
    if (state.turnCursor >= state.turns.length) {
      // All turns exhausted — end the scene
      state.complete = true;
      setProviderState(session, state);
      return {
        utterance: '',
        responseContract: { mode: 'free_form' },
        hostActionProposals: [{ type: 'closeConversation' }],
      };
    }

    const currentTurn = state.turns[state.turnCursor]!;
    state.turnCursor++;
    state.attemptCount = 0;
    setProviderState(session, state);

    const responseContract = turnToResponseContract(currentTurn);

    return {
      utterance: currentTurn.targetText,
      speakerId: currentTurn.speakerId,
      speakerName: currentTurn.speakerName,
      emotion: currentTurn.emotion,
      responseContract,
      groundingMetadata: constraints.groundingScope
        ? { references: constraints.groundingScope }
        : undefined,
      diagnostics: {
        supportText: currentTurn.supportText,
        turnId: currentTurn.turnId,
        teachingConcepts: currentTurn.teachingConcepts,
      },
    };
  }

  async function endSession(session: ConversationSession): Promise<void> {
    // Clean up session state
    delete session.middlewareState[PROVIDER_KEY];
  }

  return {
    descriptor,
    canHandle,
    startSession,
    produceTurn,
    endSession,
  };
}
