/**
 * Publish Workflow - Generates dist/ folder structure for deployment
 *
 * Output structure:
 * dist/
 * ├── manifest.json           # Master manifest
 * ├── shared/
 * │   ├── npcs/
 * │   │   └── <uuid>.json
 * │   ├── items/
 * │   │   └── <uuid>.json
 * │   └── regions/
 * │       └── <uuid>/
 * │           ├── config.json
 * │           └── geometry.glb (if exists)
 * └── episodes/
 *     └── <seasonId>/
 *         └── <episodeId>/
 *             ├── manifest.json
 *             ├── quests/
 *             │   └── <uuid>.json
 *             └── dialogues/
 *                 └── <uuid>.json
 */

import type { Season, Episode, GameManifest, EpisodeManifest } from '../../engine/episodes/types';
import type { QuestDefinition } from '../../engine/quests/types';
import type { DialogueTree } from '../../engine/dialogue/types';
import type { RegionData } from '../../engine/loaders/RegionLoader';
import { computeEpisodeDependencies, generateEpisodeManifest } from './dependencyGraph';

export interface PublishableProject {
  meta: {
    gameId: string;
    name: string;
  };
  seasons: Season[];
  episodes: Episode[];
  quests: QuestDefinition[];
  dialogues: DialogueTree[];
  npcs: { id: string; name: string; [key: string]: unknown }[];
  items: { id: string; name: string; [key: string]: unknown }[];
  inspections: { id: string; [key: string]: unknown }[];
  regions: RegionData[];
}

export interface PublishOutput {
  manifest: GameManifest;
  files: PublishFile[];
}

export interface PublishFile {
  path: string;
  content: string;
}

/**
 * Generate all files needed for publishing
 */
export function generatePublishOutput(project: PublishableProject): PublishOutput {
  const files: PublishFile[] = [];

  // Build episode manifests and collect dependencies
  const episodeManifests: Map<string, EpisodeManifest> = new Map();

  for (const episode of project.episodes) {
    const deps = computeEpisodeDependencies(episode, {
      episodes: project.episodes,
      quests: project.quests,
      dialogues: project.dialogues,
      regions: project.regions,
      npcs: project.npcs,
      items: project.items,
      inspections: project.inspections,
    });

    const manifest = generateEpisodeManifest(episode, deps);
    episodeManifests.set(episode.id, manifest);

    // Generate episode files
    const episodePath = `episodes/${episode.seasonId}/${episode.id}`;

    // Episode manifest
    files.push({
      path: `${episodePath}/manifest.json`,
      content: JSON.stringify(manifest, null, 2),
    });

    // Episode quests
    for (const questId of deps.quests) {
      const quest = project.quests.find(q => q.id === questId);
      if (quest) {
        files.push({
          path: `${episodePath}/quests/${questId}.json`,
          content: JSON.stringify(quest, null, 2),
        });
      }
    }

    // Episode dialogues
    for (const dialogueId of deps.dialogues) {
      const dialogue = project.dialogues.find(d => d.id === dialogueId);
      if (dialogue) {
        files.push({
          path: `${episodePath}/dialogues/${dialogueId}.json`,
          content: JSON.stringify(dialogue, null, 2),
        });
      }
    }
  }

  // Collect all shared content referenced by any episode
  const allNpcs = new Set<string>();
  const allItems = new Set<string>();
  const allRegions = new Set<string>();
  const allInspections = new Set<string>();

  for (const manifest of episodeManifests.values()) {
    for (const id of manifest.requires.npcs) allNpcs.add(id);
    for (const id of manifest.requires.items) allItems.add(id);
    for (const id of manifest.requires.regions) allRegions.add(id);
    for (const id of manifest.requires.inspections) allInspections.add(id);
  }

  // Generate shared NPC files
  for (const npcId of allNpcs) {
    const npc = project.npcs.find(n => n.id === npcId);
    if (npc) {
      files.push({
        path: `shared/npcs/${npcId}.json`,
        content: JSON.stringify(npc, null, 2),
      });
    }
  }

  // Generate shared Item files
  for (const itemId of allItems) {
    const item = project.items.find(i => i.id === itemId);
    if (item) {
      files.push({
        path: `shared/items/${itemId}.json`,
        content: JSON.stringify(item, null, 2),
      });
    }
  }

  // Generate shared Region files
  for (const regionId of allRegions) {
    const region = project.regions.find(r => r.id === regionId);
    if (region) {
      files.push({
        path: `shared/regions/${regionId}/config.json`,
        content: JSON.stringify(region, null, 2),
      });
      // Note: geometry.glb would need to be copied separately (binary file)
    }
  }

  // Generate shared Inspection files
  for (const inspectionId of allInspections) {
    const inspection = project.inspections.find(i => i.id === inspectionId);
    if (inspection) {
      files.push({
        path: `shared/inspections/${inspectionId}.json`,
        content: JSON.stringify(inspection, null, 2),
      });
    }
  }

  // Generate master manifest
  const gameManifest: GameManifest = {
    gameId: project.meta.gameId,
    version: 1,
    seasons: project.seasons,
    episodes: project.episodes,
    released: {
      latestSeasonId: project.seasons[project.seasons.length - 1]?.id || '',
      latestEpisodeId: project.episodes[project.episodes.length - 1]?.id || '',
    },
    episodeUrls: {},
  };

  // Build episode URLs
  for (const episode of project.episodes) {
    gameManifest.episodeUrls[episode.id] = `episodes/${episode.seasonId}/${episode.id}/manifest.json`;
  }

  files.push({
    path: 'manifest.json',
    content: JSON.stringify(gameManifest, null, 2),
  });

  return {
    manifest: gameManifest,
    files,
  };
}

/**
 * Generate a downloadable ZIP of the publish output
 * Note: This is a simplified version - in production you'd use JSZip or similar
 */
export function downloadPublishOutput(output: PublishOutput): void {
  // For now, just download the manifest and show instructions
  const blob = new Blob([output.files.find(f => f.path === 'manifest.json')?.content || '{}'], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'manifest.json';
  a.click();
  URL.revokeObjectURL(url);

  console.log('Publish output:', output);
  console.log('Files to generate:', output.files.map(f => f.path));

  alert(
    `Generated ${output.files.length} files for publishing.\n\n` +
    `Files include:\n` +
    `- manifest.json (master manifest)\n` +
    `- shared/ (NPCs, items, regions, inspections)\n` +
    `- episodes/ (per-episode quests and dialogues)\n\n` +
    `See console for full file list.`
  );
}

/**
 * Validate project before publishing
 */
export function validateForPublish(project: PublishableProject): string[] {
  const errors: string[] = [];

  if (project.seasons.length === 0) {
    errors.push('No seasons defined');
  }

  if (project.episodes.length === 0) {
    errors.push('No episodes defined');
  }

  // Check each episode has valid completion condition
  for (const episode of project.episodes) {
    if (episode.completionCondition) {
      if (episode.completionCondition.type === 'quest') {
        const condition = episode.completionCondition as { type: 'quest'; questId: string };
        const questExists = project.quests.some(q => q.id === condition.questId);
        if (!questExists) {
          errors.push(`Episode "${episode.name}" references non-existent completion quest`);
        }
      }
    }
  }

  // Check for orphaned episode references in quests
  for (const quest of project.quests) {
    if (quest.episodeId) {
      const episodeExists = project.episodes.some(e => e.id === quest.episodeId);
      if (!episodeExists) {
        errors.push(`Quest "${quest.name}" references non-existent episode`);
      }
    }
  }

  // Check for orphaned episode references in dialogues
  for (const dialogue of project.dialogues) {
    if (dialogue.episodeId) {
      const episodeExists = project.episodes.some(e => e.id === dialogue.episodeId);
      if (!episodeExists) {
        errors.push(`Dialogue "${dialogue.name || dialogue.id}" references non-existent episode`);
      }
    }
  }

  return errors;
}
