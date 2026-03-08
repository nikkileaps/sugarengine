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
import type { SceneTurn, IntentFamily } from './types';

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
// Text normalization for B2-B4
// ---------------------------------------------------------------------------

function normalizeForIntent(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[¿¡.,!?;:"""''()[\]{}]/g, '')
    .replace(/\s+/g, ' ');
}

function containsKeyword(normalized: string, keyword: string): boolean {
  const normKw = normalizeForIntent(keyword);
  // For multi-word keywords, check substring. For single words, check word boundary.
  if (normKw.includes(' ')) {
    return stripAccents(normalized).includes(stripAccents(normKw)) ||
           normalized.includes(normKw);
  }
  const words = normalized.split(' ');
  const wordsNoAccent = stripAccents(normalized).split(' ');
  const kwNoAccent = stripAccents(normKw);
  // Check exact match or prefix match (for verb stems like "ayud" matching "ayudar")
  return words.some((w) => w === normKw || w.startsWith(normKw)) ||
         wordsNoAccent.some((w) => w === kwNoAccent || w.startsWith(kwNoAccent));
}

// ---------------------------------------------------------------------------
// Intent + Slot evaluators (B2-B4)
// ---------------------------------------------------------------------------

interface IntentMatchResult {
  matched: boolean;
  intentId?: string;
  requiredSlotsFilled: number;
  requiredSlotsTotal: number;
  optionalSlotsFilled: number;
  optionalSlotsTotal: number;
}

function matchIntent(normalized: string, intent: IntentFamily): IntentMatchResult {
  // Check if any keyword pattern matches
  const hasKeyword = intent.keywordPatterns.some((kw) => containsKeyword(normalized, kw));
  if (!hasKeyword) {
    return {
      matched: false,
      intentId: intent.intentId,
      requiredSlotsFilled: 0,
      requiredSlotsTotal: intent.requiredSlots.length,
      optionalSlotsFilled: 0,
      optionalSlotsTotal: intent.optionalSlots.length,
    };
  }

  // Check required slots
  let requiredFilled = 0;
  for (const slot of intent.requiredSlots) {
    if (slot.keywords.some((kw) => containsKeyword(normalized, kw))) {
      requiredFilled++;
    }
  }

  // Check optional slots
  let optionalFilled = 0;
  for (const slot of intent.optionalSlots) {
    if (slot.keywords.some((kw) => containsKeyword(normalized, kw))) {
      optionalFilled++;
    }
  }

  const allRequiredMet = requiredFilled === intent.requiredSlots.length;

  return {
    matched: allRequiredMet,
    intentId: intent.intentId,
    requiredSlotsFilled: requiredFilled,
    requiredSlotsTotal: intent.requiredSlots.length,
    optionalSlotsFilled: optionalFilled,
    optionalSlotsTotal: intent.optionalSlots.length,
  };
}

function evaluateTextInput(
  input: PlayerInput,
  turn: SceneTurn,
): Pick<EvaluationResult, 'correct' | 'taskSuccess' | 'formAccuracy' | 'matchedAnswer'> {
  const intents = turn.evaluation?.intents;
  if (!intents || intents.length === 0) {
    // No intent evaluation configured — accept any input
    return { correct: true, taskSuccess: true, formAccuracy: true };
  }

  const text = input.text ?? '';
  if (!text.trim()) {
    return { correct: false, taskSuccess: false, formAccuracy: false };
  }

  const normalized = normalizeForIntent(text);

  // Try matching each intent
  let bestMatch: IntentMatchResult | null = null;
  for (const intent of intents) {
    const result = matchIntent(normalized, intent);
    if (result.matched) {
      // Pick best match based on optional slot fill
      if (!bestMatch || result.optionalSlotsFilled > bestMatch.optionalSlotsFilled) {
        bestMatch = result;
      }
    }
  }

  if (bestMatch) {
    // Compute form accuracy based on slot coverage
    const totalSlots = bestMatch.requiredSlotsTotal + bestMatch.optionalSlotsTotal;
    const filledSlots = bestMatch.requiredSlotsFilled + bestMatch.optionalSlotsFilled;
    const formAccuracy = totalSlots > 0 ? filledSlots === totalSlots : true;

    return {
      correct: true,
      taskSuccess: true,
      formAccuracy,
      matchedAnswer: bestMatch.intentId,
    };
  }

  // No intent matched — check if any intent had a partial keyword match (weak but communicative)
  for (const intent of intents) {
    // If there are no required slots and the keyword matched but we returned false, re-check
    if (intent.requiredSlots.length === 0) {
      const hasKeyword = intent.keywordPatterns.some((kw) => containsKeyword(normalized, kw));
      if (hasKeyword) {
        return {
          correct: true,
          taskSuccess: true,
          formAccuracy: false,
          matchedAnswer: intent.intentId,
        };
      }
    }
  }

  return { correct: false, taskSuccess: false, formAccuracy: false };
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
  short_text: evaluateTextInput,
  open_text: evaluateTextInput,
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
    // B2-B4: reveal intent hint
    const intents = turn.evaluation?.intents;
    if (intents && intents.length > 0) {
      const firstIntent = intents[0]!;
      const exampleWords = firstIntent.keywordPatterns.slice(0, 3).join(', ');
      return `Try using words like: ${exampleWords}`;
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
    case 'short_text':
      return generateShortTextRecovery(turn, attemptCount);
    case 'open_text':
      return generateOpenTextRecovery(turn, attemptCount);
    default:
      return 'Try again with a different answer.';
  }
}

/** B2 recovery: show support-language prompt + template choices. */
function generateShortTextRecovery(turn: SceneTurn, attemptCount: number): string {
  if (attemptCount >= 3) {
    // Offer template choices (downgrade to constrained)
    const intents = turn.evaluation?.intents;
    if (intents && intents.length > 0) {
      const templates = intents
        .map((i) => i.keywordPatterns[0])
        .filter(Boolean);
      if (templates.length > 0) {
        return `Try one of these: ${templates.join(' / ')}`;
      }
    }
  }
  // After 2 attempts, show support-language prompt
  if (turn.responseData?.hintText) {
    return turn.responseData.hintText;
  }
  const wordBank = turn.responseData?.wordBank;
  if (wordBank && wordBank.length > 0) {
    return `Try using: ${wordBank.join(', ')}`;
  }
  return 'Try expressing the same idea with simpler words.';
}

/** B3/B4 recovery: simplify NPC line or offer structured support. */
function generateOpenTextRecovery(turn: SceneTurn, attemptCount: number): string {
  if (attemptCount >= 3) {
    // Offer structured support
    const intents = turn.evaluation?.intents;
    if (intents && intents.length > 0) {
      const options = intents.map((i) => i.label).join(' / ');
      return `You could try to: ${options}`;
    }
  }
  // After 2 attempts, suggest approach
  return turn.responseData?.hintText ?? 'Try a shorter, simpler response.';
}
