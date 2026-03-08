/**
 * Sugarlang Deterministic Evaluator.
 *
 * Evaluates player responses against scene-pack evaluation rules for B0/B1
 * response modes. Deterministic-first per ADR-SL-005: no LLM required for
 * low-band evaluation.
 *
 * Evaluation is split into:
 *   - taskSuccess:     Did the player accomplish the communicative goal?
 *   - formAccuracy:    Was the answer linguistically correct?
 *   - supportUsed:     Did the player rely on support affordances?
 */

import type { PlayerInput, ResponseContractMode } from '../../engine/conversation/types';
import type { SceneTurn } from './types';

// ---------------------------------------------------------------------------
// Evaluation Result
// ---------------------------------------------------------------------------

export interface EvaluationResult {
  /** Whether the player's response was accepted as correct. */
  correct: boolean;
  /** Communicative task success (player accomplished the goal). */
  taskSuccess: boolean;
  /** Form accuracy (the specific answer matched perfectly). */
  formAccuracy: boolean;
  /** Which accepted answer matched, if any. */
  matchedAnswer?: string;
  /** Feedback message for the player. */
  feedback?: string;
  /** Number of attempts so far (for recovery logic). */
  attemptCount: number;
}

// ---------------------------------------------------------------------------
// Normalize helpers
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function matchesAcceptedAnswer(input: string, accepted: string[]): string | undefined {
  const norm = normalize(input);
  const normNoAccent = stripAccents(norm);

  for (const answer of accepted) {
    const normAnswer = normalize(answer);
    if (norm === normAnswer) return answer;
    if (normNoAccent === stripAccents(normAnswer)) return answer;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Per-mode evaluators
// ---------------------------------------------------------------------------

function evaluateYesNo(
  input: PlayerInput,
  turn: SceneTurn,
): Pick<EvaluationResult, 'correct' | 'taskSuccess' | 'formAccuracy' | 'matchedAnswer'> {
  const expected = turn.evaluation?.expectedYesNo;
  if (expected === undefined) {
    return { correct: true, taskSuccess: true, formAccuracy: true };
  }

  // yes_no can come as text ("yes", "no", "sí", "no") or choiceIndex (0=yes, 1=no)
  let playerSaidYes: boolean;
  if (input.choiceIndex !== undefined) {
    playerSaidYes = input.choiceIndex === 0;
  } else if (input.text !== undefined) {
    const norm = normalize(input.text);
    const yesWords = ['yes', 'yeah', 'yep', 'sí', 'si'];
    playerSaidYes = yesWords.includes(norm);
  } else {
    return { correct: false, taskSuccess: false, formAccuracy: false };
  }

  const correct = playerSaidYes === expected;
  return {
    correct,
    taskSuccess: correct,
    formAccuracy: correct,
    matchedAnswer: correct ? (playerSaidYes ? 'yes' : 'no') : undefined,
  };
}

function evaluateObjectSelection(
  input: PlayerInput,
  turn: SceneTurn,
): Pick<EvaluationResult, 'correct' | 'taskSuccess' | 'formAccuracy' | 'matchedAnswer'> {
  const accepted = turn.evaluation?.acceptedObjectIds ?? [];
  if (accepted.length === 0) {
    return { correct: true, taskSuccess: true, formAccuracy: true };
  }

  const objectId = input.objectId ?? '';
  const correct = accepted.includes(objectId);
  return {
    correct,
    taskSuccess: correct,
    formAccuracy: correct,
    matchedAnswer: correct ? objectId : undefined,
  };
}

function evaluateBlankFill(
  input: PlayerInput,
  turn: SceneTurn,
): Pick<EvaluationResult, 'correct' | 'taskSuccess' | 'formAccuracy' | 'matchedAnswer'> {
  const accepted = turn.evaluation?.acceptedAnswers ?? [];
  if (accepted.length === 0) {
    return { correct: true, taskSuccess: true, formAccuracy: true };
  }

  // Single blank: use blankFills['blank1'] or text
  const playerAnswer = input.blankFills?.['blank1'] ?? input.text ?? '';
  const matched = matchesAcceptedAnswer(playerAnswer, accepted);
  return {
    correct: !!matched,
    taskSuccess: !!matched,
    formAccuracy: !!matched,
    matchedAnswer: matched,
  };
}

function evaluatePhraseAssembly(
  input: PlayerInput,
  turn: SceneTurn,
): Pick<EvaluationResult, 'correct' | 'taskSuccess' | 'formAccuracy' | 'matchedAnswer'> {
  const accepted = turn.evaluation?.acceptedAnswers ?? [];
  if (accepted.length === 0) {
    return { correct: true, taskSuccess: true, formAccuracy: true };
  }

  const playerPhrase = input.text ?? '';
  const matched = matchesAcceptedAnswer(playerPhrase, accepted);

  // For phrase assembly, allow partial communicative success even if form is wrong.
  // If the player used the right words but wrong order, taskSuccess may still be true.
  let taskSuccess = !!matched;
  if (!matched && playerPhrase) {
    const playerTokens = new Set(normalize(playerPhrase).split(/\s+/));
    for (const answer of accepted) {
      const answerTokens = normalize(answer).split(/\s+/);
      const hasAllTokens = answerTokens.every((t) => playerTokens.has(t));
      if (hasAllTokens && playerTokens.size === answerTokens.length) {
        taskSuccess = true;
        break;
      }
    }
  }

  return {
    correct: !!matched,
    taskSuccess,
    formAccuracy: !!matched,
    matchedAnswer: matched,
  };
}

// ---------------------------------------------------------------------------
// Main evaluator
// ---------------------------------------------------------------------------

const MODE_EVALUATORS: Partial<
  Record<
    ResponseContractMode,
    (
      input: PlayerInput,
      turn: SceneTurn,
    ) => Pick<EvaluationResult, 'correct' | 'taskSuccess' | 'formAccuracy' | 'matchedAnswer'>
  >
> = {
  yes_no: evaluateYesNo,
  object_selection: evaluateObjectSelection,
  single_blank: evaluateBlankFill,
  blank_fill: evaluateBlankFill,
  phrase_assembly: evaluatePhraseAssembly,
  word_bank: evaluateBlankFill,
};

/**
 * Evaluate a player's response against a scene turn's evaluation rules.
 */
export function evaluateTurn(
  input: PlayerInput,
  turn: SceneTurn,
  attemptCount: number = 1,
): EvaluationResult {
  const evaluator = MODE_EVALUATORS[turn.responseMode];
  if (!evaluator) {
    // Unknown mode or modes without deterministic evaluation (short_text, open_text, etc.)
    return {
      correct: true,
      taskSuccess: true,
      formAccuracy: true,
      attemptCount,
    };
  }

  const result = evaluator(input, turn);

  // Generate feedback based on result and attempt count
  let feedback: string | undefined;
  if (!result.correct) {
    if (attemptCount >= 2) {
      // After 2 failures, provide stronger hint per golden slice recovery rules
      feedback = generateRecoveryFeedback(turn, attemptCount);
    } else {
      feedback = 'Try again!';
    }
  }

  return {
    ...result,
    feedback,
    attemptCount,
  };
}

// ---------------------------------------------------------------------------
// Recovery feedback (golden slice failure/recovery contract)
// ---------------------------------------------------------------------------

function generateRecoveryFeedback(turn: SceneTurn, attemptCount: number): string {
  const mode = turn.responseMode;

  if (attemptCount >= 3) {
    // Reveal the answer after 3 attempts
    const answers = turn.evaluation?.acceptedAnswers;
    if (answers && answers.length > 0) {
      return `The answer is: ${answers[0]}`;
    }
    const objectIds = turn.evaluation?.acceptedObjectIds;
    if (objectIds && objectIds.length > 0) {
      return `Look for: ${objectIds[0]}`;
    }
    if (turn.evaluation?.expectedYesNo !== undefined) {
      return turn.evaluation.expectedYesNo ? 'The answer is: Yes' : 'The answer is: No';
    }
  }

  // After 2 attempts, give a stronger hint
  switch (mode) {
    case 'yes_no':
      return turn.evaluation?.expectedYesNo ? 'Look carefully — the answer is yes.' : 'Look carefully — the answer is no.';
    case 'object_selection':
      return turn.responseData?.hintText ?? 'Look more carefully at the objects in the scene.';
    case 'single_blank':
    case 'blank_fill':
    case 'word_bank':
      return turn.responseData?.hintText ?? 'Check the word bank for the right answer.';
    case 'phrase_assembly':
      return 'Try putting the words in a different order.';
    default:
      return 'Try again with a different answer.';
  }
}
