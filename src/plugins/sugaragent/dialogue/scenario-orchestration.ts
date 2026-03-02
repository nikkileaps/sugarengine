export type CompletionSignal = 'none' | 'player_ack' | 'player_action' | 'engine_flag';

export interface SimBeatContract {
  beatId: string;
  objective: string;
  requiredFacts: string[];
  forbiddenFacts?: string[];
  completionRule: CompletionSignal;
  completionTarget?: string;
  maxTurns?: number;
  fallbackScriptId?: string;
}

export interface SimScenario {
  id: string;
  description: string;
  beatContract: SimBeatContract;
  fallbackScriptLine: string;
  allowedIntentTypes: string[];
  inferIntents?: (playerMessage: string) => Array<Record<string, unknown>>;
}

export interface CreateSimScenarioFromBeatContractOptions {
  id?: string;
  description?: string;
  fallbackScriptLine?: string;
  allowedIntentTypes?: string[];
}

export interface ScenarioState {
  turnCount: number;
  completed: boolean;
  coveredFacts: string[];
}

export interface TurnOutput {
  utterance: string;
  emotion: string;
  intent: string;
  proposedIntents: Array<Record<string, unknown>>;
  citations: Array<Record<string, unknown>>;
  beatEvidence?: {
    beatId?: string;
    coveredFacts: string[];
    uncoveredFacts: string[];
    completionSignal: CompletionSignal;
    confidence: number;
  };
}

export interface ScenarioTurnResult {
  output: TurnOutput;
  state: ScenarioState | null;
  logs: string[];
}

function normalizeText(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 3);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function uniqueRecords(items: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const result: Array<Record<string, unknown>> = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function inferGuardAlertIntents(playerMessage: string): Array<Record<string, unknown>> {
  const normalized = normalizeText(playerMessage);
  const intents: Array<Record<string, unknown>> = [];
  if (normalized.includes('gate')) {
    intents.push({ type: 'emitEvent', eventName: 'guard_gate_status_shared' });
    intents.push({ type: 'setFlag', flag: 'gate.open', value: true });
  }
  if (normalized.includes('alarm')) {
    intents.push({ type: 'emitEvent', eventName: 'guard_alarm_ping' });
  }
  if (normalized.includes('open') || normalized.includes('unlock')) {
    intents.push({ type: 'setFlag', flag: 'gate.unlocked', value: true });
  }
  if (normalized.includes('understood') || normalized.includes('got it')) {
    intents.push({ type: 'triggerObjective', objectiveType: 'talkToNpc', targetId: 'npc.guard' });
  }
  return uniqueRecords(intents);
}

const SCENARIOS: Record<string, SimScenario> = {
  'beat-guard-alert': {
    id: 'beat-guard-alert',
    description: 'Guard briefing beat with intent gating and turn-budget fallback.',
    beatContract: {
      beatId: 'beat.guard.alert',
      objective: 'Explain the gate alert and required passphrase to the player.',
      requiredFacts: [
        'The city gate is under alert lockdown.',
        'Captain Rowan requires the passphrase Sunforge before entry.',
      ],
      forbiddenFacts: [],
      completionRule: 'player_ack',
      completionTarget: 'ack_gate_alert',
      maxTurns: 2,
      fallbackScriptId: 'dlg.guard.alert.fallback',
    },
    fallbackScriptLine: 'Hold there. Gate stays locked under alert. Speak with Captain Rowan and the Sunforge passphrase.',
    allowedIntentTypes: ['emitEvent', 'triggerObjective'],
    inferIntents: inferGuardAlertIntents,
  },
};

function buildAuthoringFallbackLine(contract: {
  objective: string;
  requiredFacts: string[];
}, explicitLine: string | undefined): string {
  if (typeof explicitLine === 'string' && explicitLine.trim().length > 0) {
    return explicitLine.trim();
  }

  const required = Array.isArray(contract.requiredFacts)
    ? contract.requiredFacts.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  if (required.length > 0) {
    return `Let me make this clear: ${required.slice(0, 2).join(' ')}`;
  }
  return `Let me make this clear: ${contract.objective}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function factCoveredByUtterance(utterance: string, fact: string): boolean {
  const utteranceTokens = new Set(tokenize(utterance));
  const factTokens = tokenize(fact);
  if (factTokens.length === 0) return false;

  let matches = 0;
  for (const token of factTokens) {
    if (utteranceTokens.has(token)) {
      matches += 1;
    }
  }
  return matches / factTokens.length >= 0.6;
}

function detectCompletionSignal(completionRule: CompletionSignal, playerMessage: string): CompletionSignal {
  const normalized = normalizeText(playerMessage);
  if (completionRule === 'player_ack') {
    if (
      normalized.includes('got it')
      || normalized.includes('understood')
      || normalized.includes('okay')
      || normalized.includes('ok')
      || normalized.includes('thanks')
      || normalized.includes('thank you')
    ) {
      return 'player_ack';
    }
    return 'none';
  }
  if (completionRule === 'player_action') {
    if (normalized.includes('i did it') || normalized.includes('done')) {
      return 'player_action';
    }
    return 'none';
  }
  if (completionRule === 'engine_flag') {
    if (normalized.includes('flag set')) {
      return 'engine_flag';
    }
    return 'none';
  }
  return 'none';
}

function buildBeatEvidence({
  beatContract,
  utterance,
  playerMessage,
  priorCoveredFacts = [],
}: {
  beatContract: SimBeatContract;
  utterance: string;
  playerMessage: string;
  priorCoveredFacts?: string[];
}) {
  const requiredFacts = Array.isArray(beatContract.requiredFacts)
    ? beatContract.requiredFacts.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const covered = new Set(
    Array.isArray(priorCoveredFacts)
      ? priorCoveredFacts.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
      : [],
  );

  for (const fact of requiredFacts) {
    if (factCoveredByUtterance(utterance, fact)) {
      covered.add(fact);
    }
  }

  const coveredFacts = requiredFacts.filter((fact) => covered.has(fact));
  const uncoveredFacts = requiredFacts.filter((fact) => !covered.has(fact));
  const completionSignal = detectCompletionSignal(beatContract.completionRule, playerMessage);
  const coverageRatio = requiredFacts.length > 0 ? coveredFacts.length / requiredFacts.length : 1;
  const confidence = clamp(
    0.2 + coverageRatio * 0.65 + (completionSignal !== 'none' ? 0.15 : 0),
    0,
    1,
  );

  return {
    beatId: beatContract.beatId,
    coveredFacts,
    uncoveredFacts,
    completionSignal,
    confidence,
  };
}

function mergeProposedIntents(
  existing: Array<Record<string, unknown>> | undefined,
  inferred: Array<Record<string, unknown>> | undefined,
): Array<Record<string, unknown>> {
  const safeExisting = Array.isArray(existing) ? existing.filter((entry): entry is Record<string, unknown> => isRecord(entry)) : [];
  const safeInferred = Array.isArray(inferred) ? inferred.filter((entry): entry is Record<string, unknown> => isRecord(entry)) : [];
  return uniqueRecords([...safeExisting, ...safeInferred]);
}

function gateProposedIntents(
  proposedIntents: Array<Record<string, unknown>>,
  allowedIntentTypes: string[] | undefined,
  scenarioId: string,
) {
  const allowed = new Set(Array.isArray(allowedIntentTypes) ? allowedIntentTypes : []);
  const executed: Array<{ intent: Record<string, unknown>; result: { success: boolean } }> = [];
  const rejected: Array<{ intent: unknown; reason: string }> = [];

  for (const rawIntent of proposedIntents) {
    if (!isRecord(rawIntent)) {
      rejected.push({
        intent: rawIntent,
        reason: 'intent is not an object',
      });
      continue;
    }
    const intentType = typeof rawIntent.type === 'string' ? rawIntent.type : '';
    if (!intentType) {
      rejected.push({
        intent: rawIntent,
        reason: 'intent.type is required',
      });
      continue;
    }
    if (!allowed.has(intentType)) {
      rejected.push({
        intent: rawIntent,
        reason: `intent type "${intentType}" is not allowed for scenario ${scenarioId}`,
      });
      continue;
    }

    executed.push({
      intent: rawIntent,
      result: { success: true },
    });
  }

  return { executed, rejected };
}

function createBeatPromptBlock(scenario: SimScenario, scenarioState: ScenarioState): string {
  const contract = scenario.beatContract;
  const turn = scenarioState.turnCount + 1;
  const maxTurns = contract.maxTurns ?? 3;
  const requiredFacts = Array.isArray(contract.requiredFacts) ? contract.requiredFacts : [];
  const forbiddenFacts = Array.isArray(contract.forbiddenFacts) ? contract.forbiddenFacts : [];

  return [
    `Active beat contract: ${contract.beatId}`,
    `Beat objective: ${contract.objective}`,
    `Beat completion rule: ${contract.completionRule}`,
    `Beat turn budget: ${turn}/${maxTurns}`,
    `Required beat facts: ${requiredFacts.length > 0 ? requiredFacts.join(' | ') : 'none'}`,
    `Forbidden beat facts: ${forbiddenFacts.length > 0 ? forbiddenFacts.join(' | ') : 'none'}`,
    'Output beatEvidence with coveredFacts/uncoveredFacts/completionSignal/confidence.',
    'proposedIntents may include candidate engine intents when relevant.',
  ].join('\n');
}

function evaluateCompletion(
  beatContract: SimBeatContract,
  beatEvidence: {
    completionSignal: CompletionSignal;
    uncoveredFacts: string[];
  },
): boolean {
  const signal = beatEvidence?.completionSignal ?? 'none';
  const uncovered = Array.isArray(beatEvidence?.uncoveredFacts) ? beatEvidence.uncoveredFacts : [];
  if (beatContract.completionRule === 'player_ack') {
    return signal === 'player_ack' && uncovered.length === 0;
  }
  if (beatContract.completionRule === 'player_action') {
    return signal === 'player_action';
  }
  if (beatContract.completionRule === 'engine_flag') {
    return signal === 'engine_flag';
  }
  return false;
}

export function getSimScenario(scenarioId: string | null | undefined): SimScenario | null {
  if (!scenarioId) return null;
  return SCENARIOS[scenarioId] ?? null;
}

export function createSimScenarioFromBeatContract(
  contract: {
    id: string;
    npcId: string;
    objective: string;
    requiredFacts: string[];
    forbiddenFacts?: string[];
    completionRule: 'player_ack' | 'player_action' | 'engine_flag';
    completionTarget?: string;
    maxTurns?: number;
    fallbackScriptId?: string;
  },
  options: CreateSimScenarioFromBeatContractOptions = {},
): SimScenario {
  const maxTurns = typeof contract.maxTurns === 'number' && Number.isFinite(contract.maxTurns)
    ? Math.max(1, Math.floor(contract.maxTurns))
    : 3;
  const requiredFacts = Array.isArray(contract.requiredFacts)
    ? contract.requiredFacts.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const forbiddenFacts = Array.isArray(contract.forbiddenFacts)
    ? contract.forbiddenFacts.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
    : [];

  return {
    id: options.id ?? `authoring:${contract.id}`,
    description: options.description
      ?? `Authored beat contract ${contract.id} for ${contract.npcId}.`,
    beatContract: {
      beatId: contract.id,
      objective: contract.objective,
      requiredFacts,
      forbiddenFacts,
      completionRule: contract.completionRule,
      completionTarget: contract.completionTarget,
      maxTurns,
      fallbackScriptId: contract.fallbackScriptId,
    },
    fallbackScriptLine: buildAuthoringFallbackLine(contract, options.fallbackScriptLine),
    allowedIntentTypes: Array.isArray(options.allowedIntentTypes)
      ? options.allowedIntentTypes.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
      : ['emitEvent', 'triggerObjective', 'setFlag'],
  };
}

export function listSimScenarioIds(): string[] {
  return Object.keys(SCENARIOS);
}

export function createScenarioState(scenario: SimScenario | null): ScenarioState | null {
  if (!scenario) return null;
  return {
    turnCount: 0,
    completed: false,
    coveredFacts: [],
  };
}

export function buildScenarioPromptBlock(
  scenario: SimScenario | null,
  scenarioState: ScenarioState | null,
): string | null {
  if (!scenario || !scenarioState) return null;
  if (!scenario.beatContract) return null;
  return createBeatPromptBlock(scenario, scenarioState);
}

export function orchestrateScenarioTurn({
  scenario,
  scenarioState,
  playerMessage,
  turnOutput,
}: {
  scenario: SimScenario | null;
  scenarioState: ScenarioState | null;
  playerMessage: string;
  turnOutput: TurnOutput;
}): ScenarioTurnResult {
  if (!scenario || !scenarioState || !scenario.beatContract) {
    return {
      output: turnOutput,
      state: scenarioState,
      logs: [],
    };
  }

  const nextState: ScenarioState = {
    ...scenarioState,
    turnCount: (scenarioState.turnCount ?? 0) + 1,
  };
  const inferredIntents = typeof scenario.inferIntents === 'function'
    ? scenario.inferIntents(playerMessage)
    : [];
  const mergedProposedIntents = mergeProposedIntents(turnOutput.proposedIntents, inferredIntents);
  const gated = gateProposedIntents(mergedProposedIntents, scenario.allowedIntentTypes, scenario.id);

  let output: TurnOutput = {
    ...turnOutput,
    proposedIntents: mergedProposedIntents,
  };

  let beatEvidence = buildBeatEvidence({
    beatContract: scenario.beatContract,
    utterance: output.utterance,
    playerMessage,
    priorCoveredFacts: scenarioState.coveredFacts,
  });

  if (beatEvidence.uncoveredFacts.length > 0) {
    output = {
      ...output,
      utterance: `${output.utterance} ${beatEvidence.uncoveredFacts.join(' ')}`.trim(),
    };
    beatEvidence = buildBeatEvidence({
      beatContract: scenario.beatContract,
      utterance: output.utterance,
      playerMessage,
      priorCoveredFacts: scenarioState.coveredFacts,
    });
  }

  const completed = evaluateCompletion(scenario.beatContract, beatEvidence);
  const maxTurns = scenario.beatContract.maxTurns ?? 3;
  const shouldFallback = !completed && nextState.turnCount >= maxTurns;

  if (shouldFallback) {
    output = {
      ...output,
      utterance: scenario.fallbackScriptLine,
      intent: 'fallback_script',
    };
    beatEvidence = {
      ...beatEvidence,
      completionSignal: 'none',
      confidence: Math.min(beatEvidence.confidence, 0.4),
    };
  }

  output = {
    ...output,
    beatEvidence,
  };

  nextState.completed = completed;
  nextState.coveredFacts = Array.isArray(beatEvidence.coveredFacts) ? beatEvidence.coveredFacts : [];

  const logs: string[] = [];
  if (gated.executed.length > 0) {
    const executedTypes = gated.executed
      .map((entry) => (typeof entry.intent.type === 'string' ? entry.intent.type : 'unknown'))
      .join(',');
    logs.push(`intent-executed=${executedTypes}`);
  }
  if (gated.rejected.length > 0) {
    const rejectedLog = gated.rejected
      .map((entry) => {
        const intentType = isRecord(entry.intent) && typeof entry.intent.type === 'string'
          ? entry.intent.type
          : 'unknown';
        return `${intentType}:${entry.reason}`;
      })
      .join(' | ');
    logs.push(`intent-rejected=${rejectedLog}`);
  }
  logs.push(
    `beat-evidence=beatId=${beatEvidence.beatId ?? 'n/a'} covered=${beatEvidence.coveredFacts.length} uncovered=${beatEvidence.uncoveredFacts.length} signal=${beatEvidence.completionSignal} confidence=${beatEvidence.confidence.toFixed(2)}`,
  );
  if (completed) {
    logs.push(`beat-completed=${scenario.beatContract.beatId}`);
  }
  if (shouldFallback) {
    logs.push(`beat-fallback=${scenario.beatContract.fallbackScriptId ?? 'scripted'}`);
  }

  return {
    output,
    state: nextState,
    logs,
  };
}
