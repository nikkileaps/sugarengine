import type {
  PluginAgentBeatContract,
  PluginAgentBeatEvidence,
} from '../plugins';

export interface RuntimeAgentBeatContract extends PluginAgentBeatContract {
  questId: string;
}

export interface RuntimeQuestBeatState {
  questId: string;
  currentStageId: string;
}

export interface RuntimeAgentBeatSelectionContext {
  npcId: string;
  activeQuests: RuntimeQuestBeatState[];
  contractsByNpc: Map<string, RuntimeAgentBeatContract[]>;
  getObjectiveState: (questId: string, objectiveId: string) => 'active' | 'completed' | null;
}

export interface RuntimeBeatCompletionEvaluation {
  passed: boolean;
  coveragePassed: boolean;
  rulePassed: boolean;
  beatIdMatched: boolean;
  forbiddenPassed: boolean;
  confidencePassed: boolean;
  missingRequiredFacts: string[];
  forbiddenFactMentions: string[];
  confidence: number;
  completionSignal: PluginAgentBeatEvidence['completionSignal'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const entries = value
    .map((entry) => toNonEmptyString(entry))
    .filter((entry): entry is string => typeof entry === 'string');
  return Array.from(new Set(entries));
}

function normalizeComparableFact(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeCompletionRule(value: unknown): PluginAgentBeatContract['completionRule'] | null {
  return value === 'player_ack' || value === 'player_action' || value === 'engine_flag'
    ? value
    : null;
}

function normalizeMaxTurns(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(1, Math.floor(value));
}

function normalizeContract(raw: unknown, questId: string): RuntimeAgentBeatContract | null {
  if (!isRecord(raw)) return null;

  const id = toNonEmptyString(raw.id);
  const npcId = toNonEmptyString(raw.npcId);
  const objective = toNonEmptyString(raw.objective);
  const completionRule = normalizeCompletionRule(raw.completionRule);

  if (!id || !npcId || !objective || !completionRule) return null;

  const requiredFacts = normalizeStringArray(raw.requiredFacts);
  if (requiredFacts.length === 0) return null;

  return {
    id,
    questId,
    npcId,
    objective,
    requiredFacts,
    forbiddenFacts: normalizeStringArray(raw.forbiddenFacts),
    completionRule,
    completionTarget: toNonEmptyString(raw.completionTarget) ?? undefined,
    maxTurns: normalizeMaxTurns(raw.maxTurns),
    fallbackScriptId: toNonEmptyString(raw.fallbackScriptId) ?? undefined,
    stageId: toNonEmptyString(raw.stageId) ?? undefined,
    objectiveId: toNonEmptyString(raw.objectiveId) ?? undefined,
  };
}

/**
 * Parse optional SugarAgent beat contracts from project data.
 * Invalid entries are skipped to preserve backwards compatibility.
 */
export function parseRuntimeAgentBeatContracts(projectData: unknown): Map<string, RuntimeAgentBeatContract[]> {
  const byNpc = new Map<string, RuntimeAgentBeatContract[]>();
  if (!isRecord(projectData) || !Array.isArray(projectData.quests)) return byNpc;

  for (const quest of projectData.quests) {
    if (!isRecord(quest)) continue;
    const questId = toNonEmptyString(quest.id);
    if (!questId || !Array.isArray(quest.agentBeatContracts)) continue;

    for (const rawContract of quest.agentBeatContracts) {
      const contract = normalizeContract(rawContract, questId);
      if (!contract) continue;

      const current = byNpc.get(contract.npcId) ?? [];
      current.push(contract);
      byNpc.set(contract.npcId, current);
    }
  }

  return byNpc;
}

function contractMatchesQuestState(
  contract: RuntimeAgentBeatContract,
  questState: RuntimeQuestBeatState,
  getObjectiveState: RuntimeAgentBeatSelectionContext['getObjectiveState'],
): boolean {
  if (contract.questId !== questState.questId) return false;
  if (contract.stageId && contract.stageId !== questState.currentStageId) return false;
  if (!contract.objectiveId) return true;
  return getObjectiveState(contract.questId, contract.objectiveId) === 'active';
}

/**
 * Select the best active beat contract for an NPC using current quest state.
 * Priority is objective-bound contracts first, then stage-bound, then generic quest contracts.
 */
export function selectActiveAgentBeatContract(
  context: RuntimeAgentBeatSelectionContext,
): RuntimeAgentBeatContract | null {
  const contracts = context.contractsByNpc.get(context.npcId) ?? [];
  if (contracts.length === 0) return null;

  for (const questState of context.activeQuests) {
    const questContracts = contracts.filter((contract) =>
      contractMatchesQuestState(contract, questState, context.getObjectiveState),
    );
    if (questContracts.length === 0) continue;

    const ranked = [...questContracts].sort((left, right) => {
      const leftSpecificity = left.objectiveId ? 3 : left.stageId ? 2 : 1;
      const rightSpecificity = right.objectiveId ? 3 : right.stageId ? 2 : 1;
      if (leftSpecificity !== rightSpecificity) {
        return rightSpecificity - leftSpecificity;
      }
      return left.id.localeCompare(right.id);
    });

    return ranked[0] ?? null;
  }

  return null;
}

/**
 * Hard guardrail: once maxTurns is exceeded, runtime should route to scripted fallback.
 */
export function shouldFallbackToScriptedForBeat(
  contract: RuntimeAgentBeatContract,
  turnCount: number,
): boolean {
  if (!contract.maxTurns) return false;
  return turnCount > contract.maxTurns;
}

/**
 * Deterministically evaluate beat completion in the engine host.
 */
export function evaluateAgentBeatCompletion(
  contract: RuntimeAgentBeatContract,
  evidence: PluginAgentBeatEvidence | undefined,
  readFlag: (flagName: string) => unknown,
): RuntimeBeatCompletionEvaluation {
  const requiredFacts = normalizeStringArray(contract.requiredFacts).map(normalizeComparableFact);
  const coveredFacts = normalizeStringArray(evidence?.coveredFacts).map(normalizeComparableFact);
  const uncoveredFacts = normalizeStringArray(evidence?.uncoveredFacts).map(normalizeComparableFact);
  const forbiddenFacts = normalizeStringArray(contract.forbiddenFacts).map(normalizeComparableFact);

  const coveredSet = new Set(coveredFacts);
  const uncoveredSet = new Set(uncoveredFacts);
  const missingRequiredFacts = requiredFacts.filter((fact) => !coveredSet.has(fact));
  const uncoveredAccurate = missingRequiredFacts.every((fact) => uncoveredSet.has(fact));
  const coveragePassed = missingRequiredFacts.length === 0 && uncoveredAccurate;

  const forbiddenFactMentions = forbiddenFacts.filter((fact) => coveredSet.has(fact));
  const forbiddenPassed = forbiddenFactMentions.length === 0;

  const beatIdMatched = typeof evidence?.beatId === 'string' && evidence.beatId === contract.id;

  const completionSignal = evidence?.completionSignal ?? 'none';
  const confidence = typeof evidence?.confidence === 'number' && Number.isFinite(evidence.confidence)
    ? Math.max(0, Math.min(1, evidence.confidence))
    : 0;
  const confidencePassed = confidence >= 0.5;

  let rulePassed = false;
  switch (contract.completionRule) {
    case 'player_ack':
      rulePassed = completionSignal === 'player_ack';
      break;
    case 'player_action':
      rulePassed = completionSignal === 'player_action';
      break;
    case 'engine_flag': {
      if (contract.completionTarget) {
        rulePassed = readFlag(contract.completionTarget) === true;
      } else {
        rulePassed = completionSignal === 'engine_flag';
      }
      break;
    }
  }

  const passed = beatIdMatched
    && coveragePassed
    && forbiddenPassed
    && rulePassed
    && confidencePassed;

  return {
    passed,
    coveragePassed,
    rulePassed,
    beatIdMatched,
    forbiddenPassed,
    confidencePassed,
    missingRequiredFacts,
    forbiddenFactMentions,
    confidence,
    completionSignal,
  };
}
