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
import type { SugarlangContentBundle, SceneTurn, LearnerBandId, TurnEvidence } from './types';
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
  /** Last turn evidence captured (for middleware analysis stage). */
  lastTurnEvidence?: TurnEvidence;
  /** When set, the next player input is a recovery choice, not a real answer. */
  pendingRecovery?: {
    originalTurn: SceneTurn;
    bandId: LearnerBandId;
  };
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
// Band-specific recovery
// ---------------------------------------------------------------------------

/**
 * Build a recovery turn after max retries, based on the band's recovery strategy.
 * Returns a ProviderTurnOutput that shows the recovery path, or null to just advance.
 */
function buildRecoveryTurn(
  turn: SceneTurn,
  evalResult: EvaluationResult,
  bandId: LearnerBandId,
): ProviderTurnOutput | null {
  switch (bandId) {
    case 'B0':
    case 'B1':
      // B0/B1: reveal answer and advance (already handled by evaluator feedback)
      return {
        utterance: evalResult.feedback ?? 'Let me show you the answer.',
        speakerId: turn.speakerId,
        speakerName: turn.speakerName,
        emotion: 'encouraging',
        responseContract: { mode: 'yes_no' }, // Simple acknowledgment
      };

    case 'B2': {
      // B2: downgrade to multiple_choice with template options
      const intents = turn.evaluation?.intents;
      const choices: string[] = [];
      if (intents) {
        for (const intent of intents) {
          if (intent.keywordPatterns.length > 0) {
            choices.push(intent.keywordPatterns[0]!);
          }
        }
      }
      if (choices.length === 0) {
        choices.push('sí', 'no');
      }
      return {
        utterance: evalResult.feedback ?? 'Let me give you some options.',
        speakerId: turn.speakerId,
        speakerName: turn.speakerName,
        emotion: 'encouraging',
        responseContract: {
          mode: 'multiple_choice',
          choices,
        },
      };
    }

    case 'B3': {
      // B3: simplify the NPC line, reveal grounding, downgrade to constrained
      const wordBank = turn.responseData?.wordBank ?? [];
      return {
        utterance: evalResult.feedback ?? 'Let me make it simpler.',
        speakerId: turn.speakerId,
        speakerName: turn.speakerName,
        emotion: 'patient',
        responseContract: {
          mode: 'short_text',
          maxLength: turn.responseData?.maxLength ?? 80,
          wordBank,
          hintText: 'Use the word bank to help you.',
        },
      };
    }

    case 'B4': {
      // B4: offer clarify/repeat/simplify/temporary structure
      return {
        utterance: evalResult.feedback ?? 'Would you like me to clarify, repeat, or simplify?',
        speakerId: turn.speakerId,
        speakerName: turn.speakerName,
        emotion: 'patient',
        responseContract: {
          mode: 'multiple_choice',
          choices: ['Clarify', 'Repeat', 'Simplify'],
        },
      };
    }

    default:
      return null;
  }
}

/**
 * Handle the player's response to a recovery menu (B3/B4).
 * Returns a turn that fulfills the recovery action, or null to just advance.
 */
function handleRecoveryChoice(
  input: PlayerInput,
  originalTurn: SceneTurn,
  bandId: LearnerBandId,
): ProviderTurnOutput | null {
  const choice = (input.text ?? '').toLowerCase().trim();

  if (bandId === 'B4') {
    switch (choice) {
      case 'clarify':
        // Re-show the NPC line with support text revealed
        return {
          utterance: originalTurn.targetText,
          speakerId: originalTurn.speakerId,
          speakerName: originalTurn.speakerName,
          emotion: 'patient',
          responseContract: {
            mode: 'open_text',
            maxLength: originalTurn.responseData?.maxLength ?? 200,
            hintText: originalTurn.supportText || originalTurn.responseData?.hintText,
          },
          diagnostics: {
            supportText: originalTurn.supportText,
            turnId: originalTurn.turnId,
            teachingConcepts: originalTurn.teachingConcepts,
          },
        };

      case 'repeat':
        // Re-show the same turn with the original contract
        return {
          utterance: originalTurn.targetText,
          speakerId: originalTurn.speakerId,
          speakerName: originalTurn.speakerName,
          emotion: originalTurn.emotion,
          responseContract: turnToResponseContract(originalTurn),
          diagnostics: {
            supportText: originalTurn.supportText,
            turnId: originalTurn.turnId,
            teachingConcepts: originalTurn.teachingConcepts,
          },
        };

      case 'simplify': {
        // Downgrade to short_text with word bank and support text
        const wordBank = originalTurn.responseData?.wordBank ?? [];
        const intents = originalTurn.evaluation?.intents ?? [];
        // Add intent keywords as hints if no word bank exists
        const hints = wordBank.length > 0
          ? wordBank
          : intents.flatMap((i) => i.keywordPatterns.slice(0, 2));
        return {
          utterance: originalTurn.supportText || originalTurn.targetText,
          speakerId: originalTurn.speakerId,
          speakerName: originalTurn.speakerName,
          emotion: 'encouraging',
          responseContract: {
            mode: 'short_text',
            maxLength: originalTurn.responseData?.maxLength ?? 80,
            wordBank: hints,
            hintText: originalTurn.responseData?.hintText ?? 'Use the hints above.',
          },
          diagnostics: {
            supportText: originalTurn.supportText,
            turnId: originalTurn.turnId,
            teachingConcepts: originalTurn.teachingConcepts,
          },
        };
      }
    }
  }

  if (bandId === 'B3') {
    // B3 recovery is a downgraded short_text — evaluate the player's response
    // with the original turn's intents. If it matches, great. If not, just advance.
    const evalResult = evaluateTurn(input, originalTurn, 4);
    if (evalResult.correct) {
      return null; // Success — advance to next turn
    }
    // Still failing — just advance so the player isn't stuck
    return null;
  }

  // Unknown choice — advance
  return null;
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

    // --- Handle pending recovery choice (B3/B4 recovery menu response) ---
    if (playerInput && state.pendingRecovery) {
      const { originalTurn, bandId } = state.pendingRecovery;
      state.pendingRecovery = undefined;

      if (bandId === 'B4') {
        const choice = (playerInput.text ?? '').toLowerCase().trim();

        if (choice === 'clarify' || choice === 'repeat' || choice === 'simplify') {
          // This is the menu selection — produce the recovery turn and
          // keep pendingRecovery so the NEXT input evaluates against the original.
          const recoveryResult = handleRecoveryChoice(playerInput, originalTurn, bandId);
          if (recoveryResult) {
            state.pendingRecovery = { originalTurn, bandId: 'B3' }; // B3 = "evaluate next input against original, advance on fail"
            setProviderState(session, state);
            return recoveryResult;
          }
        } else {
          // Player typed a real answer after Clarify/Repeat/Simplify — evaluate it
          const evalResult = evaluateTurn(playerInput, originalTurn, 4);
          if (evalResult.correct) {
            // Advance to next turn (fall through below)
          } else {
            // Still failing after support — just advance so player isn't stuck
          }
        }
      } else {
        // B3: evaluate the response against the original turn
        const recoveryResult = handleRecoveryChoice(playerInput, originalTurn, bandId);
        if (recoveryResult) {
          setProviderState(session, state);
          return recoveryResult;
        }
        // null = advance to next turn (fall through below)
      }
    }

    // --- Evaluate previous turn's response if player input is provided ---
    else if (playerInput && state.turnCursor > 0) {
      const previousTurn = state.turns[state.turnCursor - 1];
      if (previousTurn) {
        state.attemptCount++;
        const evalResult = evaluateTurn(playerInput, previousTurn, state.attemptCount);
        state.lastEvaluation = evalResult;

        // Build turn evidence
        const bandUsed = (constraints.learnerBand ?? 'B0') as LearnerBandId;
        state.lastTurnEvidence = {
          turnId: previousTurn.turnId,
          timestamp: new Date().toISOString(),
          playerInput: playerInput.text ?? playerInput.objectId ?? String(playerInput.choiceIndex ?? ''),
          responseMode: previousTurn.responseMode,
          bandUsed,
          policyUsed: constraints.supportLanguagePolicy ?? 'unknown',
          supportShown: !!constraints.groundingScope,
          supportRequested: false,
          groundingShown: !!constraints.groundingScope,
          groundingUsed: !!playerInput.objectId,
          retries: state.attemptCount - 1,
          taskSuccess: evalResult.taskSuccess,
          formAccuracy: evalResult.formAccuracy ? 1.0 : 0.0,
          supportDependence: state.attemptCount > 1 ? Math.min(1, (state.attemptCount - 1) * 0.33) : 0,
        };

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

        // If 3+ failed attempts, apply band-specific recovery then advance
        if (!evalResult.correct && state.attemptCount >= 3) {
          const bandId = (constraints.learnerBand ?? 'B0') as LearnerBandId;
          const recoveryOutput = buildRecoveryTurn(previousTurn, evalResult, bandId);
          state.attemptCount = 0;

          if (recoveryOutput) {
            // For B4 and B3 recovery with choices, mark pending so next input
            // is handled as a recovery choice, not evaluated against the turn.
            if (bandId === 'B4' || (bandId === 'B3' && recoveryOutput.responseContract.mode === 'short_text')) {
              state.pendingRecovery = { originalTurn: previousTurn, bandId };
            }
            setProviderState(session, state);
            return recoveryOutput;
          }
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
        lastTurnEvidence: state.lastTurnEvidence,
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
