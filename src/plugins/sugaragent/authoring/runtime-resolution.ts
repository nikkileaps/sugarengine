/**
 * Purpose:
 * Resolve SugarAgent-authored runtime data from the packed authoring bundle.
 *
 * Responsibilities:
 * - Read plugin policy/runtime settings from the packed bundle.
 * - Resolve NPC profiles for runtime turn generation.
 * - Select the active authored beat contract using generic host quest snapshots.
 *
 * Non-Goals:
 * - Do not read engine host state directly.
 * - Do not execute quest/objective mutations.
 * - Do not perform LLM turn generation.
 *
 * @see ../docs/adr/024-runtime-owned-reply-parts-grounding-contract.md
 * @see ../../../../docs/adr/026-game-root-lifecycle-and-external-game-discovery.md
 */

import type {
  PluginAgentBeatContract,
  PluginAgentProfile,
  PluginQuestSnapshot,
} from '../../../engine/plugins';
import {
  findSugarAgentProfile,
  type SugarAgentAuthoringBundleV1,
  type SugarAgentPackedBeatContract,
  type SugarAgentPackedProfile,
} from './artifacts';

export interface ResolvedSugarAgentPolicy {
  runtimeMode: 'llama' | 'auto' | 'mock';
  globalSafetyBounds: string[];
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)));
}

function toPluginProfile(profile: SugarAgentPackedProfile | null): PluginAgentProfile | undefined {
  if (!profile) return undefined;
  const resolved: PluginAgentProfile = {};
  if (profile.persona) resolved.persona = profile.persona;
  if (profile.tone) resolved.tone = profile.tone;
  if (profile.selfEntityId) resolved.selfEntityId = profile.selfEntityId;
  if (profile.constraints.length > 0) resolved.constraints = profile.constraints;
  if (profile.loreScopes.length > 0) resolved.loreScopes = profile.loreScopes;
  if (profile.selfLoreScopes.length > 0) resolved.selfLoreScopes = profile.selfLoreScopes;
  if (profile.relatedLoreScopes.length > 0) resolved.relatedLoreScopes = profile.relatedLoreScopes;
  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

function toPluginBeatContract(contract: SugarAgentPackedBeatContract | null): PluginAgentBeatContract | undefined {
  if (!contract) return undefined;
  return {
    id: contract.id,
    questId: contract.questId,
    npcId: contract.npcId,
    objective: contract.objective,
    requiredFacts: [...contract.requiredFacts],
    forbiddenFacts: [...contract.forbiddenFacts],
    completionRule: contract.completionRule,
    completionTarget: contract.completionTarget,
    maxTurns: contract.maxTurns,
    fallbackScriptId: contract.fallbackScriptId,
    stageId: contract.stageId,
    objectiveId: contract.objectiveId,
  };
}

function objectiveStateFromSnapshot(
  quest: PluginQuestSnapshot,
  objectiveId: string,
): 'active' | 'completed' | 'inactive' | null {
  return quest.objectives.find((objective: PluginQuestSnapshot['objectives'][number]) => objective.objectiveId === objectiveId)?.state ?? null;
}

function contractMatchesQuestSnapshot(
  contract: SugarAgentPackedBeatContract,
  quest: PluginQuestSnapshot,
): boolean {
  if (contract.questId !== quest.questId) return false;
  if (contract.stageId && contract.stageId !== quest.currentStageId) return false;
  if (!contract.objectiveId) return true;
  return objectiveStateFromSnapshot(quest, contract.objectiveId) === 'active';
}

export function resolveSugarAgentPolicy(
  bundle: SugarAgentAuthoringBundleV1 | null | undefined,
  fallbackRuntimeMode: 'llama' | 'auto' | 'mock' = 'llama',
): ResolvedSugarAgentPolicy {
  return {
    runtimeMode: bundle?.policy.runtimeMode ?? fallbackRuntimeMode,
    globalSafetyBounds: dedupeStrings(bundle?.policy.globalSafetyBounds ?? []),
  };
}

export function resolveSugarAgentProfile(
  bundle: SugarAgentAuthoringBundleV1 | null | undefined,
  npcId: string,
): PluginAgentProfile | undefined {
  return toPluginProfile(findSugarAgentProfile(bundle, npcId));
}

export function selectActiveSugarAgentBeatContract(
  bundle: SugarAgentAuthoringBundleV1 | null | undefined,
  npcId: string,
  activeQuests: PluginQuestSnapshot[] = [],
): PluginAgentBeatContract | undefined {
  if (!bundle || typeof npcId !== 'string' || npcId.trim().length === 0) return undefined;
  const contracts = bundle.beatContracts.filter((contract) => contract.npcId === npcId);
  if (contracts.length === 0) return undefined;

  for (const quest of activeQuests) {
    const questContracts = contracts.filter((contract) => contractMatchesQuestSnapshot(contract, quest));
    if (questContracts.length === 0) continue;
    const ranked = [...questContracts].sort((left, right) => {
      const leftSpecificity = left.objectiveId ? 3 : left.stageId ? 2 : 1;
      const rightSpecificity = right.objectiveId ? 3 : right.stageId ? 2 : 1;
      if (leftSpecificity !== rightSpecificity) {
        return rightSpecificity - leftSpecificity;
      }
      return left.id.localeCompare(right.id);
    });
    return toPluginBeatContract(ranked[0] ?? null);
  }

  return undefined;
}

export function isObjectiveActiveInQuestSnapshot(
  activeQuests: PluginQuestSnapshot[] = [],
  questId: string,
  objectiveId: string,
): boolean {
  const quest = activeQuests.find((entry) => entry.questId === questId);
  if (!quest) return false;
  return objectiveStateFromSnapshot(quest, objectiveId) === 'active';
}
