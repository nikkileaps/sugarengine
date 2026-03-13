export interface SugarAgentCitation {
  sourceId: string;
  snippet?: string;
}

export interface SugarAgentBeatEvidence {
  beatId?: string;
  coveredFacts: string[];
  uncoveredFacts: string[];
  completionSignal: 'none' | 'player_ack' | 'player_action' | 'engine_flag';
  confidence: number;
}

export interface SugarAgentTurnOutput {
  utterance: string;
  emotion: string;
  intent: string;
  proposedIntents: Array<Record<string, unknown>>;
  citations: SugarAgentCitation[];
  beatEvidence?: SugarAgentBeatEvidence;
}

export interface TurnValidationResult {
  valid: boolean;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function validateBeatEvidence(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return ['beatEvidence must be an object'];
  }

  const { beatId, coveredFacts, uncoveredFacts, completionSignal, confidence } = value;
  if (beatId !== undefined && typeof beatId !== 'string') {
    errors.push('beatEvidence.beatId must be a string when present');
  }
  if (!isStringArray(coveredFacts)) {
    errors.push('beatEvidence.coveredFacts must be string[]');
  }
  if (!isStringArray(uncoveredFacts)) {
    errors.push('beatEvidence.uncoveredFacts must be string[]');
  }
  if (
    completionSignal !== 'none' &&
    completionSignal !== 'player_ack' &&
    completionSignal !== 'player_action' &&
    completionSignal !== 'engine_flag'
  ) {
    errors.push('beatEvidence.completionSignal must be one of: none, player_ack, player_action, engine_flag');
  }
  if (typeof confidence !== 'number' || Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    errors.push('beatEvidence.confidence must be a number between 0 and 1');
  }

  return errors;
}

export function validateTurnOutput(value: unknown): TurnValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, errors: ['turn output must be an object'] };
  }

  if (typeof value.utterance !== 'string' || value.utterance.trim().length === 0) {
    errors.push('utterance must be a non-empty string');
  }
  if (typeof value.emotion !== 'string' || value.emotion.trim().length === 0) {
    errors.push('emotion must be a non-empty string');
  }
  if (typeof value.intent !== 'string' || value.intent.trim().length === 0) {
    errors.push('intent must be a non-empty string');
  }
  if (!Array.isArray(value.proposedIntents) || !value.proposedIntents.every(isRecord)) {
    errors.push('proposedIntents must be an array of objects');
  }
  if (
    !Array.isArray(value.citations) ||
    !value.citations.every((entry) => isRecord(entry) && typeof entry.sourceId === 'string')
  ) {
    errors.push('citations must be an array of { sourceId: string }');
  }
  if (value.beatEvidence !== undefined) {
    errors.push(...validateBeatEvidence(value.beatEvidence));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function parseTurnOutput(value: unknown): SugarAgentTurnOutput | null {
  const validation = validateTurnOutput(value);
  if (!validation.valid) return null;
  return value as SugarAgentTurnOutput;
}
