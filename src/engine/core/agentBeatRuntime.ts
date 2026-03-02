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

    const objectiveBound = questContracts.find((contract) => !!contract.objectiveId);
    if (objectiveBound) return objectiveBound;

    const stageBound = questContracts.find((contract) => !!contract.stageId);
    if (stageBound) return stageBound;

    return questContracts[0] ?? null;
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
  const uncovered = Array.isArray(evidence?.uncoveredFacts) ? evidence?.uncoveredFacts : [];
  const coveragePassed = uncovered.length === 0;

  let rulePassed = false;
  switch (contract.completionRule) {
    case 'player_ack':
      rulePassed = evidence?.completionSignal === 'player_ack';
      break;
    case 'player_action':
      rulePassed = evidence?.completionSignal === 'player_action';
      break;
    case 'engine_flag': {
      if (contract.completionTarget) {
        rulePassed = readFlag(contract.completionTarget) === true;
      } else {
        rulePassed = evidence?.completionSignal === 'engine_flag';
      }
      break;
    }
  }

  return {
    passed: coveragePassed && rulePassed,
    coveragePassed,
    rulePassed,
  };
}
