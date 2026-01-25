/**
 * Dependency Graph - Computes episode dependencies from content analysis
 *
 * The dependency chain (ECS perspective):
 * Episode
 *   -> Quests (narrative content)
 *     -> Regions (where objectives happen)
 *       -> Entity Spawns (what entities to create)
 *         -> Component Templates (NPC/Item definitions)
 *   -> Dialogues (narrative content)
 *     -> Component Templates (NPC definitions for speakers)
 */

import type { Episode, EpisodeManifest } from '../../engine/episodes/types';
import type { QuestDefinition } from '../../engine/quests/types';
import type { DialogueTree } from '../../engine/dialogue/types';
import type { RegionData } from '../../engine/loaders/RegionLoader';

/** Project data structure for dependency computation */
export interface ProjectData {
  episodes: Episode[];
  quests: QuestDefinition[];
  dialogues: DialogueTree[];
  regions: RegionData[];
  npcs: { id: string; name: string }[];
  items: { id: string; name: string }[];
  inspections: { id: string }[];
}

/** Forward dependency: what does X need? */
export interface ForwardDependencies {
  npcs: Set<string>;
  items: Set<string>;
  regions: Set<string>;
  quests: Set<string>;
  dialogues: Set<string>;
  inspections: Set<string>;
}

/** Reverse dependency: what uses X? */
export interface ReverseDependencies {
  usedByEpisodes: Set<string>;
  usedByQuests: Set<string>;
  usedByRegions: Set<string>;
  usedByDialogues: Set<string>;
}

/** Bidirectional dependency graph */
export interface DependencyGraph {
  forward: Map<string, ForwardDependencies>;
  reverse: {
    npcs: Map<string, ReverseDependencies>;
    items: Map<string, ReverseDependencies>;
    regions: Map<string, ReverseDependencies>;
    quests: Map<string, ReverseDependencies>;
    dialogues: Map<string, ReverseDependencies>;
    inspections: Map<string, ReverseDependencies>;
  };
}

/** Validation warning */
export interface DependencyWarning {
  type: 'missing_reference' | 'orphan' | 'circular';
  severity: 'error' | 'warning';
  message: string;
  sourceId: string;
  sourceType: string;
  targetId?: string;
  targetType?: string;
}

// Well-known speaker IDs that are not NPCs
const SYSTEM_SPEAKERS = new Set([
  'e095b3b2-3351-403a-abe1-88861fa489ad', // PLAYER
  '1a44e7dd-fd2c-4862-a489-59692155e406', // NARRATOR
]);

/**
 * Build a bidirectional dependency graph from project data
 */
export function buildDependencyGraph(project: ProjectData): DependencyGraph {
  const graph: DependencyGraph = {
    forward: new Map(),
    reverse: {
      npcs: new Map(),
      items: new Map(),
      regions: new Map(),
      quests: new Map(),
      dialogues: new Map(),
      inspections: new Map(),
    },
  };

  // Initialize reverse lookup maps for all known entities
  for (const npc of project.npcs) {
    graph.reverse.npcs.set(npc.id, createEmptyReverse());
  }
  for (const item of project.items) {
    graph.reverse.items.set(item.id, createEmptyReverse());
  }
  for (const region of project.regions) {
    if (region.id) graph.reverse.regions.set(region.id, createEmptyReverse());
  }
  for (const quest of project.quests) {
    graph.reverse.quests.set(quest.id, createEmptyReverse());
  }
  for (const dialogue of project.dialogues) {
    graph.reverse.dialogues.set(dialogue.id, createEmptyReverse());
  }
  for (const inspection of project.inspections) {
    graph.reverse.inspections.set(inspection.id, createEmptyReverse());
  }

  // Compute forward dependencies for each episode
  for (const episode of project.episodes) {
    const deps = computeEpisodeDependencies(episode, project);
    graph.forward.set(episode.id, deps);

    // Update reverse dependencies
    for (const npcId of deps.npcs) {
      const reverse = graph.reverse.npcs.get(npcId) || createEmptyReverse();
      reverse.usedByEpisodes.add(episode.id);
      graph.reverse.npcs.set(npcId, reverse);
    }
    for (const itemId of deps.items) {
      const reverse = graph.reverse.items.get(itemId) || createEmptyReverse();
      reverse.usedByEpisodes.add(episode.id);
      graph.reverse.items.set(itemId, reverse);
    }
    for (const regionId of deps.regions) {
      const reverse = graph.reverse.regions.get(regionId) || createEmptyReverse();
      reverse.usedByEpisodes.add(episode.id);
      graph.reverse.regions.set(regionId, reverse);
    }
    for (const questId of deps.quests) {
      const reverse = graph.reverse.quests.get(questId) || createEmptyReverse();
      reverse.usedByEpisodes.add(episode.id);
      graph.reverse.quests.set(questId, reverse);
    }
    for (const dialogueId of deps.dialogues) {
      const reverse = graph.reverse.dialogues.get(dialogueId) || createEmptyReverse();
      reverse.usedByEpisodes.add(episode.id);
      graph.reverse.dialogues.set(dialogueId, reverse);
    }
    for (const inspectionId of deps.inspections) {
      const reverse = graph.reverse.inspections.get(inspectionId) || createEmptyReverse();
      reverse.usedByEpisodes.add(episode.id);
      graph.reverse.inspections.set(inspectionId, reverse);
    }
  }

  return graph;
}

/**
 * Compute all dependencies for an episode
 */
export function computeEpisodeDependencies(
  episode: Episode,
  project: ProjectData
): ForwardDependencies {
  const deps: ForwardDependencies = {
    npcs: new Set(),
    items: new Set(),
    regions: new Set(),
    quests: new Set(),
    dialogues: new Set(),
    inspections: new Set(),
  };

  // 1. Gather episode quests
  const episodeQuests = project.quests.filter(q => q.episodeId === episode.id);

  for (const quest of episodeQuests) {
    deps.quests.add(quest.id);

    for (const stage of quest.stages) {
      for (const objective of stage.objectives) {
        if (objective.type === 'talk' && objective.target) {
          deps.npcs.add(objective.target);
          if (objective.dialogue) {
            deps.dialogues.add(objective.dialogue);
          }
        }
        if (objective.type === 'location' && objective.target) {
          deps.regions.add(objective.target);
        }
        if (objective.type === 'collect' && objective.target) {
          deps.items.add(objective.target);
        }
      }
    }

    // Quest rewards
    for (const reward of quest.rewards || []) {
      if (reward.type === 'item' && reward.id) {
        deps.items.add(reward.id);
      }
    }
  }

  // 2. Gather episode dialogues
  const episodeDialogues = project.dialogues.filter(d => d.episodeId === episode.id);

  for (const dialogue of episodeDialogues) {
    deps.dialogues.add(dialogue.id);

    for (const node of dialogue.nodes) {
      if (node.speaker && !SYSTEM_SPEAKERS.has(node.speaker)) {
        deps.npcs.add(node.speaker);
      }
    }
  }

  // 3. Walk regions -> entity spawns -> component templates
  for (const regionId of deps.regions) {
    const region = project.regions.find(r => r.id === regionId);
    if (!region) continue;

    addRegionDependencies(region, deps);
  }

  // 4. Add manual includes
  if (episode.manualIncludes) {
    for (const npcId of episode.manualIncludes.npcs || []) {
      deps.npcs.add(npcId);
    }
    for (const itemId of episode.manualIncludes.items || []) {
      deps.items.add(itemId);
    }
    for (const regionId of episode.manualIncludes.regions || []) {
      deps.regions.add(regionId);
      // Also add that region's entity spawns
      const region = project.regions.find(r => r.id === regionId);
      if (region) {
        addRegionDependencies(region, deps);
      }
    }
  }

  return deps;
}

/**
 * Add dependencies from a region's entity spawns
 */
function addRegionDependencies(region: RegionData, deps: ForwardDependencies): void {
  // NPC spawns -> need NPC component template
  for (const spawn of region.npcs || []) {
    deps.npcs.add(spawn.id);
  }

  // Item spawns -> need Item component template
  for (const spawn of region.pickups || []) {
    deps.items.add(spawn.itemId);
  }

  // Inspectable spawns -> need Inspection content
  for (const spawn of region.inspectables || []) {
    deps.inspections.add(spawn.inspectionId);
  }
}

/**
 * Generate episode manifest from computed dependencies
 */
export function generateEpisodeManifest(
  episode: Episode,
  deps: ForwardDependencies
): EpisodeManifest {
  return {
    seasonId: episode.seasonId,
    episodeId: episode.id,
    version: 1,
    requires: {
      npcs: Array.from(deps.npcs),
      items: Array.from(deps.items),
      regions: Array.from(deps.regions),
      quests: Array.from(deps.quests),
      dialogues: Array.from(deps.dialogues),
      inspections: Array.from(deps.inspections),
    },
    completionCondition: episode.completionCondition,
  };
}

/**
 * Validate dependencies and find broken references
 */
export function validateDependencies(
  graph: DependencyGraph,
  project: ProjectData
): DependencyWarning[] {
  const warnings: DependencyWarning[] = [];

  const knownNpcs = new Set(project.npcs.map(n => n.id));
  const knownItems = new Set(project.items.map(i => i.id));
  const knownRegions = new Set(project.regions.map(r => r.id).filter(Boolean) as string[]);
  const knownQuests = new Set(project.quests.map(q => q.id));
  const knownDialogues = new Set(project.dialogues.map(d => d.id));
  const knownInspections = new Set(project.inspections.map(i => i.id));

  // Check each episode's dependencies
  for (const [episodeId, deps] of graph.forward) {
    for (const npcId of deps.npcs) {
      if (!knownNpcs.has(npcId)) {
        warnings.push({
          type: 'missing_reference',
          severity: 'error',
          message: `Episode references unknown NPC: ${npcId}`,
          sourceId: episodeId,
          sourceType: 'episode',
          targetId: npcId,
          targetType: 'npc',
        });
      }
    }

    for (const itemId of deps.items) {
      if (!knownItems.has(itemId)) {
        warnings.push({
          type: 'missing_reference',
          severity: 'error',
          message: `Episode references unknown item: ${itemId}`,
          sourceId: episodeId,
          sourceType: 'episode',
          targetId: itemId,
          targetType: 'item',
        });
      }
    }

    for (const regionId of deps.regions) {
      if (!knownRegions.has(regionId)) {
        warnings.push({
          type: 'missing_reference',
          severity: 'error',
          message: `Episode references unknown region: ${regionId}`,
          sourceId: episodeId,
          sourceType: 'episode',
          targetId: regionId,
          targetType: 'region',
        });
      }
    }

    for (const questId of deps.quests) {
      if (!knownQuests.has(questId)) {
        warnings.push({
          type: 'missing_reference',
          severity: 'error',
          message: `Episode references unknown quest: ${questId}`,
          sourceId: episodeId,
          sourceType: 'episode',
          targetId: questId,
          targetType: 'quest',
        });
      }
    }

    for (const dialogueId of deps.dialogues) {
      if (!knownDialogues.has(dialogueId)) {
        warnings.push({
          type: 'missing_reference',
          severity: 'error',
          message: `Episode references unknown dialogue: ${dialogueId}`,
          sourceId: episodeId,
          sourceType: 'episode',
          targetId: dialogueId,
          targetType: 'dialogue',
        });
      }
    }

    for (const inspectionId of deps.inspections) {
      if (!knownInspections.has(inspectionId)) {
        warnings.push({
          type: 'missing_reference',
          severity: 'error',
          message: `Episode references unknown inspection: ${inspectionId}`,
          sourceId: episodeId,
          sourceType: 'episode',
          targetId: inspectionId,
          targetType: 'inspection',
        });
      }
    }
  }

  // Check for orphaned content (not used by any episode)
  for (const [npcId, reverse] of graph.reverse.npcs) {
    if (reverse.usedByEpisodes.size === 0) {
      warnings.push({
        type: 'orphan',
        severity: 'warning',
        message: `NPC is not used by any episode`,
        sourceId: npcId,
        sourceType: 'npc',
      });
    }
  }

  for (const [questId, reverse] of graph.reverse.quests) {
    if (reverse.usedByEpisodes.size === 0) {
      const quest = project.quests.find(q => q.id === questId);
      // Only warn if quest has an episodeId but episode doesn't exist
      if (quest?.episodeId) {
        const episodeExists = project.episodes.some(e => e.id === quest.episodeId);
        if (!episodeExists) {
          warnings.push({
            type: 'missing_reference',
            severity: 'warning',
            message: `Quest references non-existent episode`,
            sourceId: questId,
            sourceType: 'quest',
            targetId: quest.episodeId,
            targetType: 'episode',
          });
        }
      }
    }
  }

  return warnings;
}

/**
 * Get deletion impact - what would break if we delete this item?
 */
export function getDeletionImpact(
  graph: DependencyGraph,
  type: 'npc' | 'item' | 'region' | 'quest' | 'dialogue' | 'inspection',
  id: string
): { affectedEpisodes: string[]; warnings: string[] } {
  const reverseMap = graph.reverse[type === 'npc' ? 'npcs' :
                                   type === 'item' ? 'items' :
                                   type === 'region' ? 'regions' :
                                   type === 'quest' ? 'quests' :
                                   type === 'dialogue' ? 'dialogues' : 'inspections'];

  const reverse = reverseMap.get(id);
  if (!reverse) {
    return { affectedEpisodes: [], warnings: [] };
  }

  const affectedEpisodes = Array.from(reverse.usedByEpisodes);
  const warnings: string[] = [];

  if (affectedEpisodes.length > 0) {
    warnings.push(`This ${type} is used in ${affectedEpisodes.length} episode(s)`);
  }

  return { affectedEpisodes, warnings };
}

function createEmptyReverse(): ReverseDependencies {
  return {
    usedByEpisodes: new Set(),
    usedByQuests: new Set(),
    usedByRegions: new Set(),
    usedByDialogues: new Set(),
  };
}
