import type {
  SugarAgentGenerationConfig,
} from '../../../../packages/sugaragent-runtime-core/src/runtime/generation-config.js';
import {
  resolveSugarAgentGenerationConfig,
} from '../../../../packages/sugaragent-runtime-core/src/runtime/generation-config.js';

export type SugarAgentCompletionRule = 'player_ack' | 'player_action' | 'engine_flag';

export interface SugarAgentAgentProfile {
  persona?: string;
  tone?: string;
  constraints?: string[];
  safetyBounds?: string[]; // Legacy alias accepted for backward compatibility.
  loreScopes?: string[];
  selfEntityId?: string;
  selfLoreScopes?: string[];
  relatedLoreScopes?: string[];
}

export interface SugarAgentBeatContract {
  id: string;
  npcId: string;
  objective: string;
  requiredFacts: string[];
  forbiddenFacts?: string[];
  completionRule: SugarAgentCompletionRule;
  completionTarget?: string;
  maxTurns?: number;
  fallbackScriptId?: string;
  stageId?: string;
  objectiveId?: string;
}

export interface SugarAgentPackProject {
  meta?: {
    gameId?: string;
    name?: string;
  };
  plugins?: Array<string | {
    id: string;
    enabled?: boolean;
    generation?: SugarAgentGenerationConfig;
    runtimeMode?: 'llama' | 'auto' | 'mock';
    runtime?: 'llama' | 'auto' | 'mock'; // Legacy alias accepted for backward compatibility.
    globalSafetyBounds?: string[];
    safetyBounds?: string[]; // Legacy alias accepted for backward compatibility.
  }>;
  sugaragent?: {
    enabled?: boolean;
    generation?: SugarAgentGenerationConfig;
    runtimeMode?: 'llama' | 'auto' | 'mock';
    runtime?: 'llama' | 'auto' | 'mock'; // Legacy alias accepted for backward compatibility.
    globalSafetyBounds?: string[];
    safetyBounds?: string[]; // Legacy alias accepted for backward compatibility.
  };
  npcs?: Array<{
    id: string;
    name?: string;
    agentProfile?: SugarAgentAgentProfile;
    [key: string]: unknown;
  }>;
  dialogues?: Array<{
    id: string;
    [key: string]: unknown;
  }>;
  quests?: Array<{
    id: string;
    name?: string;
    stages?: Array<{
      id: string;
      objectives?: Array<{ id: string; [key: string]: unknown }>;
      [key: string]: unknown;
    }>;
    agentBeatContracts?: SugarAgentBeatContract[];
    [key: string]: unknown;
  }>;
}

export interface SugarAgentPackedProfile {
  npcId: string;
  persona?: string;
  tone?: string;
  constraints: string[];
  loreScopes: string[];
  selfEntityId?: string;
  selfLoreScopes: string[];
  relatedLoreScopes: string[];
}

export interface SugarAgentPackedBeatContract {
  id: string;
  questId: string;
  npcId: string;
  objective: string;
  requiredFacts: string[];
  forbiddenFacts: string[];
  completionRule: SugarAgentCompletionRule;
  completionTarget?: string;
  maxTurns?: number;
  fallbackScriptId?: string;
  stageId?: string;
  objectiveId?: string;
}

export interface SugarAgentAuthoringBundleV1 {
  schemaVersion: 1;
  generatedAt: string;
  source: {
    gameId?: string;
    name?: string;
  };
  policy: {
    generation?: SugarAgentGenerationConfig;
    runtimeMode?: 'llama' | 'auto' | 'mock';
    globalSafetyBounds: string[];
  };
  profiles: SugarAgentPackedProfile[];
  beatContracts: SugarAgentPackedBeatContract[];
}

export interface SugarAgentPackResult {
  enabled: boolean;
  bundle: SugarAgentAuthoringBundleV1 | null;
  errors: string[];
  warnings: string[];
}

export interface SugarAgentBeatContractLookup {
  contractId?: string;
  npcId?: string;
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const entries = value
    .map((entry) => toNonEmptyString(entry))
    .filter((entry): entry is string => typeof entry === 'string');
  return Array.from(new Set(entries));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeProfile(npcId: string, profile: SugarAgentAgentProfile): SugarAgentPackedProfile {
  return {
    npcId,
    persona: toNonEmptyString(profile.persona),
    tone: toNonEmptyString(profile.tone),
    constraints: normalizeStringArray(profile.constraints ?? profile.safetyBounds),
    loreScopes: normalizeStringArray(profile.loreScopes),
    selfEntityId: toNonEmptyString(profile.selfEntityId),
    selfLoreScopes: normalizeStringArray(profile.selfLoreScopes),
    relatedLoreScopes: normalizeStringArray(profile.relatedLoreScopes),
  };
}

function extractGlobalSafetyBounds(project: SugarAgentPackProject): string[] {
  const values: string[] = [];
  values.push(...normalizeStringArray(project.sugaragent?.globalSafetyBounds ?? project.sugaragent?.safetyBounds));

  if (Array.isArray(project.plugins)) {
    for (const plugin of project.plugins) {
      if (!isRecord(plugin) || plugin.id !== 'sugaragent') continue;
      values.push(...normalizeStringArray(plugin.globalSafetyBounds ?? plugin.safetyBounds));
    }
  }

  return Array.from(new Set(values));
}

function normalizeRuntimeMode(value: unknown): 'llama' | 'auto' | 'mock' | undefined {
  return value === 'llama' || value === 'auto' || value === 'mock'
    ? value
    : undefined;
}

function normalizeGenerationConfig(
  value: unknown,
  legacyRuntimeMode?: unknown,
): SugarAgentGenerationConfig | undefined {
  if (typeof value !== 'object' || value === null) {
    if (legacyRuntimeMode === undefined) return undefined;
  }

  const resolved = resolveSugarAgentGenerationConfig({
    generation: (typeof value === 'object' && value !== null)
      ? value as SugarAgentGenerationConfig
      : undefined,
    legacyRuntimeMode,
  });

  return {
    provider: resolved.provider,
    selfHosted: {
      runtimeMode: resolved.selfHosted.runtimeMode,
    },
    openai: {
      model: resolved.openai.model,
      baseUrl: resolved.openai.baseUrl,
    },
  };
}

function extractRuntimeMode(project: SugarAgentPackProject): 'llama' | 'auto' | 'mock' | undefined {
  let runtimeMode = normalizeRuntimeMode(project.sugaragent?.runtimeMode ?? project.sugaragent?.runtime);

  if (Array.isArray(project.plugins)) {
    for (const plugin of project.plugins) {
      if (!isRecord(plugin) || plugin.id !== 'sugaragent') continue;
      runtimeMode = normalizeRuntimeMode(plugin.runtimeMode ?? plugin.runtime) ?? runtimeMode;
    }
  }

  return runtimeMode;
}

function extractGenerationConfig(project: SugarAgentPackProject): SugarAgentGenerationConfig | undefined {
  let generation = normalizeGenerationConfig(
    project.sugaragent?.generation,
    project.sugaragent?.runtimeMode ?? project.sugaragent?.runtime,
  );

  if (Array.isArray(project.plugins)) {
    for (const plugin of project.plugins) {
      if (!isRecord(plugin) || plugin.id !== 'sugaragent') continue;
      generation = normalizeGenerationConfig(
        plugin.generation,
        plugin.runtimeMode ?? plugin.runtime,
      ) ?? generation;
    }
  }

  return generation;
}

function isValidCompletionRule(value: unknown): value is SugarAgentCompletionRule {
  return value === 'player_ack' || value === 'player_action' || value === 'engine_flag';
}

function isPluginEnabled(project: SugarAgentPackProject): boolean {
  if (project.sugaragent?.enabled === true) {
    return true;
  }

  if (!Array.isArray(project.plugins)) return false;

  for (const plugin of project.plugins) {
    if (typeof plugin === 'string') {
      if (plugin === 'sugaragent') return true;
      continue;
    }
    if (
      typeof plugin === 'object'
      && plugin !== null
      && plugin.id === 'sugaragent'
      && plugin.enabled !== false
    ) {
      return true;
    }
  }

  return false;
}

function hasSugarAgentAuthoringData(project: SugarAgentPackProject): boolean {
  const hasProfile = Array.isArray(project.npcs)
    && project.npcs.some((npc) => npc && typeof npc.id === 'string' && typeof npc.agentProfile === 'object' && npc.agentProfile !== null);
  if (hasProfile) return true;

  return Array.isArray(project.quests)
    && project.quests.some((quest) => Array.isArray(quest.agentBeatContracts) && quest.agentBeatContracts.length > 0);
}

function normalizePackedProfile(raw: unknown): SugarAgentPackedProfile | null {
  if (!isRecord(raw)) return null;
  const npcId = toNonEmptyString(raw.npcId);
  if (!npcId) return null;
  return {
    npcId,
    persona: toNonEmptyString(raw.persona),
    tone: toNonEmptyString(raw.tone),
    constraints: normalizeStringArray(raw.constraints ?? raw.safetyBounds),
    loreScopes: normalizeStringArray(raw.loreScopes),
    selfEntityId: toNonEmptyString(raw.selfEntityId),
    selfLoreScopes: normalizeStringArray(raw.selfLoreScopes),
    relatedLoreScopes: normalizeStringArray(raw.relatedLoreScopes),
  };
}

function normalizePackedBeatContract(raw: unknown): SugarAgentPackedBeatContract | null {
  if (!isRecord(raw)) return null;
  const id = toNonEmptyString(raw.id);
  const questId = toNonEmptyString(raw.questId);
  const npcId = toNonEmptyString(raw.npcId);
  const objective = toNonEmptyString(raw.objective);
  if (!id || !questId || !npcId || !objective) return null;

  const requiredFacts = normalizeStringArray(raw.requiredFacts);
  if (requiredFacts.length === 0) return null;

  if (!isValidCompletionRule(raw.completionRule)) return null;

  const maxTurns = typeof raw.maxTurns === 'number' && Number.isFinite(raw.maxTurns)
    ? Math.max(1, Math.floor(raw.maxTurns))
    : undefined;

  return {
    id,
    questId,
    npcId,
    objective,
    requiredFacts,
    forbiddenFacts: normalizeStringArray(raw.forbiddenFacts),
    completionRule: raw.completionRule,
    completionTarget: toNonEmptyString(raw.completionTarget),
    maxTurns,
    fallbackScriptId: toNonEmptyString(raw.fallbackScriptId),
    stageId: toNonEmptyString(raw.stageId),
    objectiveId: toNonEmptyString(raw.objectiveId),
  };
}

export function parseSugarAgentAuthoringBundle(raw: unknown): SugarAgentAuthoringBundleV1 | null {
  if (!isRecord(raw) || raw.schemaVersion !== 1) return null;

  const generatedAt = toNonEmptyString(raw.generatedAt);
  if (!generatedAt) return null;

  const source = isRecord(raw.source) ? raw.source : {};
  const policy = isRecord(raw.policy) ? raw.policy : {};
  const profiles = Array.isArray(raw.profiles)
    ? raw.profiles
      .map((entry) => normalizePackedProfile(entry))
      .filter((entry): entry is SugarAgentPackedProfile => entry !== null)
    : [];
  const beatContracts = Array.isArray(raw.beatContracts)
    ? raw.beatContracts
      .map((entry) => normalizePackedBeatContract(entry))
      .filter((entry): entry is SugarAgentPackedBeatContract => entry !== null)
    : [];

  const uniqueProfiles = Array.from(
    new Map(profiles.map((profile) => [profile.npcId, profile])).values(),
  );
  const uniqueBeatContracts = Array.from(
    new Map(beatContracts.map((contract) => [contract.id, contract])).values(),
  );

  return {
    schemaVersion: 1,
    generatedAt,
    source: {
      gameId: toNonEmptyString(source.gameId),
      name: toNonEmptyString(source.name),
    },
    policy: {
      generation: normalizeGenerationConfig(
        policy.generation,
        policy.runtimeMode ?? policy.runtime,
      ),
      runtimeMode: normalizeRuntimeMode(policy.runtimeMode ?? policy.runtime),
      globalSafetyBounds: normalizeStringArray(policy.globalSafetyBounds ?? policy.safetyBounds),
    },
    profiles: uniqueProfiles,
    beatContracts: uniqueBeatContracts,
  };
}

export function findSugarAgentProfile(
  bundle: SugarAgentAuthoringBundleV1 | null | undefined,
  npcId: string,
): SugarAgentPackedProfile | null {
  if (!bundle || typeof npcId !== 'string' || npcId.trim().length === 0) return null;
  const normalizedNpcId = npcId.trim();
  return bundle.profiles.find((profile) => profile.npcId === normalizedNpcId) ?? null;
}

export function findSugarAgentBeatContract(
  bundle: SugarAgentAuthoringBundleV1 | null | undefined,
  lookup: SugarAgentBeatContractLookup = {},
): SugarAgentPackedBeatContract | null {
  if (!bundle) return null;

  const byId = toNonEmptyString(lookup.contractId);
  if (byId) {
    return bundle.beatContracts.find((contract) => contract.id === byId) ?? null;
  }

  const byNpc = toNonEmptyString(lookup.npcId);
  if (byNpc) {
    return bundle.beatContracts.find((contract) => contract.npcId === byNpc) ?? null;
  }

  return bundle.beatContracts[0] ?? null;
}

export function buildSugarAgentAuthoringBundle(project: SugarAgentPackProject): SugarAgentPackResult {
  const enabled = isPluginEnabled(project);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!enabled) {
    if (hasSugarAgentAuthoringData(project)) {
      warnings.push('SugarAgent authoring fields found, but plugin is not enabled. Fields will be ignored.');
    }
    return {
      enabled: false,
      bundle: null,
      errors,
      warnings,
    };
  }

  const npcs = Array.isArray(project.npcs) ? project.npcs : [];
  const quests = Array.isArray(project.quests) ? project.quests : [];
  const dialogues = Array.isArray(project.dialogues) ? project.dialogues : [];

  const npcIds = new Set(npcs.map((npc) => npc.id));
  const dialogueIds = new Set(dialogues.map((dialogue) => dialogue.id));

  const profiles: SugarAgentPackedProfile[] = [];
  for (const npc of npcs) {
    if (!npc || typeof npc.id !== 'string') continue;
    if (!npc.agentProfile || typeof npc.agentProfile !== 'object') continue;
    profiles.push(normalizeProfile(npc.id, npc.agentProfile));
  }

  const beatContracts: SugarAgentPackedBeatContract[] = [];
  const seenContractIds = new Set<string>();

  for (const quest of quests) {
    if (!quest || typeof quest.id !== 'string') continue;
    const contracts = Array.isArray(quest.agentBeatContracts) ? quest.agentBeatContracts : [];
    if (contracts.length === 0) continue;

    const stageMap = new Map<string, { objectiveIds: Set<string> }>();
    for (const stage of Array.isArray(quest.stages) ? quest.stages : []) {
      if (!stage || typeof stage.id !== 'string') continue;
      stageMap.set(stage.id, {
        objectiveIds: new Set(
          Array.isArray(stage.objectives)
            ? stage.objectives
              .map((objective) => (objective && typeof objective.id === 'string' ? objective.id : null))
              .filter((id): id is string => typeof id === 'string')
            : [],
        ),
      });
    }

    for (const contract of contracts) {
      if (!contract || typeof contract !== 'object') {
        errors.push(`Quest "${quest.id}" has an invalid agentBeatContract entry (must be an object).`);
        continue;
      }

      const id = toNonEmptyString(contract.id);
      if (!id) {
        errors.push(`Quest "${quest.id}" has an agentBeatContract missing required field "id".`);
        continue;
      }

      if (seenContractIds.has(id)) {
        errors.push(`Duplicate SugarAgent beat contract id: "${id}".`);
        continue;
      }
      seenContractIds.add(id);

      const npcId = toNonEmptyString(contract.npcId);
      if (!npcId) {
        errors.push(`Beat contract "${id}" is missing required field "npcId".`);
        continue;
      }
      if (!npcIds.has(npcId)) {
        errors.push(`Beat contract "${id}" references unknown npcId "${npcId}".`);
      }

      const objective = toNonEmptyString(contract.objective);
      if (!objective) {
        errors.push(`Beat contract "${id}" is missing required field "objective".`);
        continue;
      }

      const requiredFacts = normalizeStringArray(contract.requiredFacts);
      if (requiredFacts.length === 0) {
        errors.push(`Beat contract "${id}" must include at least one required fact.`);
        continue;
      }

      if (!isValidCompletionRule(contract.completionRule)) {
        errors.push(`Beat contract "${id}" has invalid completionRule "${String(contract.completionRule)}".`);
        continue;
      }

      const fallbackScriptId = toNonEmptyString(contract.fallbackScriptId);
      if (fallbackScriptId && !dialogueIds.has(fallbackScriptId)) {
        errors.push(`Beat contract "${id}" references unknown fallbackScriptId "${fallbackScriptId}".`);
      }

      const stageId = toNonEmptyString(contract.stageId);
      if (stageId && !stageMap.has(stageId)) {
        errors.push(`Beat contract "${id}" references unknown stageId "${stageId}" in quest "${quest.id}".`);
      }

      const objectiveId = toNonEmptyString(contract.objectiveId);
      if (objectiveId) {
        if (!stageId) {
          errors.push(`Beat contract "${id}" includes objectiveId but no stageId.`);
        } else {
          const stage = stageMap.get(stageId);
          if (!stage?.objectiveIds.has(objectiveId)) {
            errors.push(`Beat contract "${id}" references unknown objectiveId "${objectiveId}" in stage "${stageId}".`);
          }
        }
      }

      const maxTurns = typeof contract.maxTurns === 'number' && Number.isFinite(contract.maxTurns)
        ? Math.max(1, Math.floor(contract.maxTurns))
        : undefined;

      beatContracts.push({
        id,
        questId: quest.id,
        npcId,
        objective,
        requiredFacts,
        forbiddenFacts: normalizeStringArray(contract.forbiddenFacts),
        completionRule: contract.completionRule,
        completionTarget: toNonEmptyString(contract.completionTarget),
        maxTurns,
        fallbackScriptId,
        stageId,
        objectiveId,
      });
    }
  }

  if (errors.length > 0) {
    return {
      enabled,
      bundle: null,
      errors,
      warnings,
    };
  }

  const globalSafetyBounds = extractGlobalSafetyBounds(project);
  const runtimeMode = extractRuntimeMode(project);
  const generation = extractGenerationConfig(project) ?? normalizeGenerationConfig(undefined, runtimeMode ?? 'llama');

  const bundle: SugarAgentAuthoringBundleV1 = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      gameId: toNonEmptyString(project.meta?.gameId),
      name: toNonEmptyString(project.meta?.name),
    },
    policy: {
      generation,
      runtimeMode,
      globalSafetyBounds,
    },
    profiles,
    beatContracts,
  };

  return {
    enabled,
    bundle,
    errors,
    warnings,
  };
}
