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
  /** Deferred correction feedback to show on the next turn (for 'delayed' correctionPosture). */
  deferredCorrection?: string;
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
  // For chip_composition, use chips as the wordBank in the contract
  if (turn.responseMode === 'chip_composition' && turn.responseData?.chips) {
    contract.wordBank = turn.responseData.chips;
  } else if (turn.responseData?.wordBank) {
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
      // B2: downgrade to multiple_choice with human-readable intent labels
      const intents = turn.evaluation?.intents;
      const choices: string[] = [];
      if (intents) {
        for (const intent of intents) {
          choices.push(intent.label);
        }
      }
      if (choices.length === 0) {
        choices.push('sí', 'no');
      }
      // Include the word bank as a hint in the recovery contract
      const wordBank = turn.responseData?.wordBank;
      return {
        utterance: evalResult.feedback ?? 'Let me give you some options.',
        speakerId: turn.speakerId,
        speakerName: turn.speakerName,
        emotion: 'encouraging',
        responseContract: {
          mode: 'multiple_choice',
          choices,
          wordBank,
          hintText: wordBank ? `Words you can use: ${wordBank.join(', ')}` : undefined,
        },
      };
    }

    case 'B3': {
      // B3: after the authored repair ladder is exhausted, keep the learner on
      // the same scene turn and reveal the full insert bank as a last guided
      // typing attempt instead of switching to meta UI copy.
      const wordBank = turn.responseData?.wordBank ?? [];
      return {
        utterance: turn.initialDelivery ?? turn.targetText,
        speakerId: turn.speakerId,
        speakerName: turn.speakerName,
        emotion: 'patient',
        responseContract: {
          mode: 'short_text',
          maxLength: turn.responseData?.maxLength ?? 80,
          wordBank,
          hintText: wordBank.length > 0
            ? 'Use these words if they help you respond.'
            : 'Try one short reply.',
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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract target-language words from a turn's teaching concepts that appear
 * in the rendered utterance. Used for tap-to-prefill clarification.
 */
function extractTappableWords(turn: SceneTurn): string[] {
  const text = turn.initialDelivery ?? turn.targetText;
  const words: string[] = [];
  // Use the chips or word bank as the source of tappable words at low bands
  const candidates = turn.responseData?.chips ?? turn.responseData?.wordBank ?? [];
  for (const word of candidates) {
    if (text.toLowerCase().includes(word.toLowerCase())) {
      words.push(word);
    }
  }
  // If no candidates found from response data, try extracting from targetText
  if (words.length === 0) {
    const targetWords = turn.targetText.split(/\s+/);
    for (const w of targetWords) {
      const clean = w.replace(/[¿?¡!.,]/g, '');
      if (clean.length > 2 && text.toLowerCase().includes(clean.toLowerCase())) {
        words.push(clean);
      }
    }
  }
  return words;
}

function isRepairOptionVisible(
  attemptCount: number,
  option: NonNullable<SceneTurn['repairOptions']>[number],
): boolean {
  if (option.minAttempt != null && attemptCount < option.minAttempt) return false;
  if (option.maxAttempt != null && attemptCount > option.maxAttempt) return false;
  return true;
}

function getVisibleRepairOptions(
  attemptCount: number,
  turn: SceneTurn,
): NonNullable<SceneTurn['repairOptions']> {
  return (turn.repairOptions ?? []).filter((option) => isRepairOptionVisible(attemptCount, option));
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

      if (bandId === 'B2') {
        // B2 recovery: player picked an intent label from multiple_choice.
        // Match by label and accept as taskSuccess.
        const choiceText = (playerInput.text ?? '').trim();
        const intents = originalTurn.evaluation?.intents;
        const matchedIntent = intents?.find(
          (i) => i.label.toLowerCase() === choiceText.toLowerCase(),
        );
        if (matchedIntent) {
          // Build evidence for the successful recovery
          const bandUsed = (session.learnerBandOverride ?? 'B0') as LearnerBandId;
          state.lastTurnEvidence = {
            turnId: originalTurn.turnId,
            timestamp: new Date().toISOString(),
            playerInput: choiceText,
            responseMode: 'multiple_choice',
            bandUsed,
            policyUsed: 'recovery',
            supportShown: true,
            supportRequested: true,
            groundingShown: false,
            groundingUsed: false,
            retries: 3,
            deliveryType: originalTurn.initialDelivery ? 'initialDelivery' : 'targetText',
            teachingConcepts: originalTurn.teachingConcepts,
            taskSuccess: true,
            formAccuracy: 0.3,
            supportDependence: 1,
          };
          console.log(`[SL·P2] B2 recovery → matched intent="${matchedIntent.intentId}" via label`);
        }
        // Advance to next turn regardless (fall through below)
      } else if (bandId === 'B4') {
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

    // --- Handle repair response (player tapped a repair option) ---
    else if (playerInput?.text?.startsWith('repair:') && state.turnCursor > 0) {
      const previousTurn = state.turns[state.turnCursor - 1];
      if (previousTurn?.repairOptions) {
        const visibleRepairOptions = getVisibleRepairOptions(state.attemptCount, previousTurn);
        const parts = playerInput.text.substring(7).split(':');
        const repairId = parts[0]!;
        const prefillWord = parts[1];
        const repairOpt = visibleRepairOptions.find((r) => r.repairId === repairId);
        if (repairOpt) {
          // Build the NPC repair reply
          let repairReply = repairOpt.repairReply;
          if (repairOpt.type === 'clarification_template' && prefillWord) {
            repairReply = repairReply.replace('__', prefillWord);
          }
          const responseContract = turnToResponseContract(previousTurn);
          // If the repair option has a response contract override, use it
          if (repairOpt.responseContractOverride) {
            responseContract.mode = repairOpt.responseContractOverride.mode;
            if ('choices' in repairOpt.responseContractOverride) responseContract.choices = repairOpt.responseContractOverride.choices;
            if ('wordBank' in repairOpt.responseContractOverride) responseContract.wordBank = repairOpt.responseContractOverride.wordBank;
            if ('hintText' in repairOpt.responseContractOverride) responseContract.hintText = repairOpt.responseContractOverride.hintText;
          }

          // Build repair-specific evidence record
          const bandUsed = (session.learnerBandOverride ?? 'B0') as LearnerBandId;
          const repairEvidence: TurnEvidence = {
            turnId: previousTurn.turnId,
            timestamp: new Date().toISOString(),
            playerInput: `repair:${repairId}${prefillWord ? `:${prefillWord}` : ''}`,
            responseMode: previousTurn.responseMode,
            bandUsed,
            policyUsed: 'repair',
            supportShown: true,
            supportRequested: true,
            groundingShown: !!repairOpt.groundingAction,
            groundingUsed: !!repairOpt.groundingAction,
            retries: 0,
            deliveryType: previousTurn.initialDelivery ? 'initialDelivery' : 'targetText',
            repairId,
            repairType: repairOpt.type,
            teachingConcepts: previousTurn.teachingConcepts,
            taskSuccess: false,
            formAccuracy: 0,
            supportDependence: 1,
          };
          state.lastTurnEvidence = repairEvidence;

          console.log(
            `[SL·P2] repair → id=${repairId} type=${repairOpt.type}` +
            ` grounding=${repairOpt.groundingAction ? repairOpt.groundingAction.worldObjectId : 'none'}`,
          );

          setProviderState(session, state);
          return {
            utterance: repairReply,
            speakerId: previousTurn.speakerId,
            speakerName: previousTurn.speakerName,
            emotion: 'helpful',
            responseContract,
            groundingMetadata: repairOpt.groundingAction
              ? {
                  references: [{
                    conceptId: repairOpt.repairId,
                    targetForm: prefillWord ?? '',
                    worldObjectId: repairOpt.groundingAction.worldObjectId,
                    highlightAction: repairOpt.groundingAction.type === 'point' ? 'highlight' : repairOpt.groundingAction.type,
                  }],
                }
              : undefined,
            turnEvidence: repairEvidence,
            diagnostics: {
              supportText: previousTurn.supportText,
              targetText: previousTurn.targetText,
              turnId: previousTurn.turnId,
              teachingConcepts: previousTurn.teachingConcepts,
              repairOptions: visibleRepairOptions,
              showRepairOptions: visibleRepairOptions.length > 0,
              tappableWords: extractTappableWords(previousTurn),
              repairUsed: repairId,
            },
          };
        }
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
        const correctionPosture = (constraints.hardConstraints['correctionPosture'] as string | undefined) ?? 'immediate';
        const bandId = (constraints.learnerBand ?? 'B0') as LearnerBandId;
        // Resolve the band-variant object ID from grounding scope
        const bandVariantObjectId = constraints.groundingScope?.find(
          (ref) => ref.conceptId === 'object.suitcase',
        )?.worldObjectId;

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
          deliveryType: previousTurn.initialDelivery ? 'initialDelivery' : 'targetText',
          teachingConcepts: previousTurn.teachingConcepts,
          shownGroundingRefs: constraints.groundingScope?.map((ref) => ref.worldObjectId).filter((id): id is string => !!id),
          bandVariantObjectId,
          taskSuccess: evalResult.taskSuccess,
          formAccuracy: evalResult.formAccuracy,
          supportDependence: state.attemptCount > 1 ? Math.min(1, (state.attemptCount - 1) * 0.33) : 0,
        };

        console.log(
          `[SL·P2] eval → turn=${previousTurn.turnId} correct=${evalResult.correct} formAccuracy=${evalResult.formAccuracy}` +
          ` taskSuccess=${evalResult.taskSuccess} attempt=${state.attemptCount} posture=${correctionPosture}`,
        );
        console.log(
          `[SL·P2] evidence → delivery=${state.lastTurnEvidence.deliveryType}` +
          ` concepts=[${state.lastTurnEvidence.teachingConcepts.join(', ')}]` +
          ` bandVariant=${state.lastTurnEvidence.bandVariantObjectId ?? 'none'}` +
          ` groundingRefs=[${(state.lastTurnEvidence.shownGroundingRefs ?? []).join(', ')}]`,
        );

        // --- Advancement decision: based on taskSuccess, not correct ---
        // taskSuccess=true means the player communicated the right thing.
        // correct=false just means form wasn't perfect (e.g. wrong word order).
        // When taskSuccess=true but correct=false, advance but record lower formAccuracy.

        if (evalResult.taskSuccess) {
          // Player communicated successfully — advance (reset attempt counter)
          state.attemptCount = 0;
          // Fall through to produce next turn below
        } else if (correctionPosture === 'none') {
          // B4: never show correction — always advance on failure
          state.attemptCount = 0;
          console.log(`[SL·P2] posture=none → advancing without correction`);
          // Fall through to produce next turn below
        } else {
          const recoveryThreshold = (bandId === 'B2' || bandId === 'B3') ? 4 : 3;

          if (state.attemptCount >= recoveryThreshold) {
            // Recovery threshold reached — apply band-specific hard recovery.
            const recoveryOutput = buildRecoveryTurn(previousTurn, evalResult, bandId);
            state.attemptCount = 0;

            if (recoveryOutput) {
              // Mark pending so next input is handled as a recovery choice,
              // not evaluated against the turn.
              if (bandId === 'B2' || bandId === 'B4' || (bandId === 'B3' && recoveryOutput.responseContract.mode === 'short_text')) {
                state.pendingRecovery = { originalTurn: previousTurn, bandId };
              }
              setProviderState(session, state);
              return recoveryOutput;
            }
            // null recovery = just advance (fall through)
          } else if (correctionPosture === 'delayed') {
            // B2: don't show correction immediately — store it for the next turn
            state.deferredCorrection = evalResult.feedback ?? 'Check your previous answer.';
            console.log(`[SL·P2] posture=delayed → deferring correction to next turn`);
            // Retry the same turn without correction feedback shown
            const retryContract = turnToResponseContract(previousTurn);
            // On attempt 2+, restore word bank for B3 scaffold gating
            if (state.attemptCount >= 2 && previousTurn.responseData?.wordBank) {
              retryContract.wordBank = previousTurn.responseData.wordBank;
            }

            const visibleRepairOptions = getVisibleRepairOptions(state.attemptCount, previousTurn);

            setProviderState(session, state);
            return {
              utterance: previousTurn.initialDelivery ?? previousTurn.targetText,
              speakerId: previousTurn.speakerId,
              speakerName: previousTurn.speakerName,
              emotion: previousTurn.emotion,
              responseContract: retryContract,
              diagnostics: {
                supportText: previousTurn.supportText,
                targetText: previousTurn.targetText,
                turnId: previousTurn.turnId,
                teachingConcepts: previousTurn.teachingConcepts,
                repairOptions: visibleRepairOptions,
                showRepairOptions: visibleRepairOptions.length > 0,
                tappableWords: extractTappableWords(previousTurn),
              },
            };
          } else if (correctionPosture === 'on_request') {
            // B3: don't auto-correct — re-show the same turn and reveal the
            // next stage of authored repair options after failure. The typed
            // surface stays clean until the learner explicitly asks for more
            // production help via a repair action.
            const retryContract = turnToResponseContract(previousTurn);
            // Keep the first-response surface clean; B3 support should be
            // revealed through authored repair actions, not auto-shown hints.
            delete retryContract.wordBank;

            const visibleRepairOptions = getVisibleRepairOptions(state.attemptCount, previousTurn);
            setProviderState(session, state);
            return {
              utterance: previousTurn.initialDelivery ?? previousTurn.targetText,
              speakerId: previousTurn.speakerId,
              speakerName: previousTurn.speakerName,
              emotion: previousTurn.emotion,
              responseContract: retryContract,
              diagnostics: {
                supportText: previousTurn.supportText,
                targetText: previousTurn.targetText,
                turnId: previousTurn.turnId,
                teachingConcepts: previousTurn.teachingConcepts,
                repairOptions: visibleRepairOptions,
                showRepairOptions: visibleRepairOptions.length > 0,
                tappableWords: extractTappableWords(previousTurn),
              },
            };
          } else {
            // immediate (B0/B1): current behavior — show feedback and retry immediately
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

    // Consume any deferred correction from the previous turn (delayed posture)
    const deferredNote = state.deferredCorrection;
    state.deferredCorrection = undefined;

    setProviderState(session, state);

    const responseContract = turnToResponseContract(currentTurn);

    // B3 scaffold gating: strip wordBank from initial turn (shown on retry only)
    const bandId = (constraints.learnerBand ?? 'B0') as LearnerBandId;
    if (bandId === 'B3' && responseContract.wordBank) {
      delete responseContract.wordBank;
      console.log(`[SL·P2] B3 scaffold gating → wordBank stripped from initial turn ${currentTurn.turnId}`);
    }

    // Render initialDelivery if authored, otherwise fall back to targetText
    let renderedUtterance = currentTurn.initialDelivery ?? currentTurn.targetText;

    // Prepend deferred correction note if present (delayed posture from previous turn)
    if (deferredNote) {
      renderedUtterance = `[Note: ${deferredNote}] ${renderedUtterance}`;
      console.log(`[SL·P2] deferred correction shown: "${deferredNote}"`);
    }

    console.log(
      `[SL·P2] turn → id=${currentTurn.turnId} delivery=${currentTurn.initialDelivery ? 'initialDelivery' : 'targetText'}` +
      ` mode=${currentTurn.responseMode} concepts=[${currentTurn.teachingConcepts.join(', ')}]`,
    );

    // Extract tappable target-language words for clarification prefill
    const visibleRepairOptions = getVisibleRepairOptions(state.attemptCount, currentTurn);
    const tappableWords = currentTurn.teachingConcepts.length > 0 && visibleRepairOptions.some((r) => r.type === 'clarification_template')
      ? extractTappableWords(currentTurn)
      : undefined;
    const showRepairOptions = visibleRepairOptions.length > 0;

    return {
      utterance: renderedUtterance,
      speakerId: currentTurn.speakerId,
      speakerName: currentTurn.speakerName,
      emotion: currentTurn.emotion,
      responseContract,
      groundingMetadata: constraints.groundingScope
        ? { references: constraints.groundingScope }
        : undefined,
      turnEvidence: state.lastTurnEvidence,
      diagnostics: {
        supportText: currentTurn.supportText,
        targetText: currentTurn.targetText,
        turnId: currentTurn.turnId,
        teachingConcepts: currentTurn.teachingConcepts,
        lastTurnEvidence: state.lastTurnEvidence,
        repairOptions: visibleRepairOptions,
        showRepairOptions,
        tappableWords,
        deferredCorrection: deferredNote,
        correctionPosture: constraints.hardConstraints['correctionPosture'],
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
