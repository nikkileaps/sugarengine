import type { EnginePlugin } from '../../engine/plugins';
import type { DialogueTree } from '../../engine/dialogue/types';
import { loadContentFromProject, loadContentFromArtifacts } from './content/loader';
import { createSugarlangPlugin, type SugarlangPluginOptions } from './plugin';
import type { ConversationMiddleware, ConversationProvider } from '../../engine/conversation/types';
import { FIND_THE_LUGGAGE_BUNDLE } from './content/find-the-luggage';

type SugarlangPluginResult = EnginePlugin & {
  getMiddleware(): ConversationMiddleware;
  getProvider(): ConversationProvider;
};

/**
 * Sugarlang project configuration shape.
 *
 * When `sugarlang` is present in the project data, it can be:
 *   - An object with `enabled: true` and optional `artifacts`: artifact file map
 *   - An object with inline `SugarlangProjectData` fields (legacy)
 *   - `'demo'`: explicitly use built-in demo content (tests/dev only)
 */
export interface SugarlangProjectConfig {
  enabled?: boolean;
  /** Artifact files loaded from plugins/sugarlang/ — Map<relativePath, jsonString> */
  artifacts?: Record<string, string>;
}

/**
 * Create a Sugarlang plugin from project data.
 *
 * Loading priority:
 *   1. If `sugarlang.artifacts` contains artifact files, load from those (V1 artifact model)
 *   2. If `sugarlang` contains inline content data, load from that (legacy inline model)
 *   3. If `sugarlang === 'demo'`, use the built-in demo bundle explicitly
 */
/**
 * Build a getDialogueTree resolver from the project's dialogues array.
 * The sugarlang provider uses this to look up dialogue trees by ID from
 * the game's canonical dialogue data — no duplication needed.
 */
function buildDialogueTreeResolver(
  projectData: Record<string, unknown>,
): (dialogueId: string) => DialogueTree | undefined {
  const dialogues = projectData.dialogues;
  if (!Array.isArray(dialogues)) return () => undefined;

  const map = new Map<string, DialogueTree>();
  for (const d of dialogues) {
    if (d && typeof d === 'object' && typeof d.id === 'string') {
      map.set(d.id, d as DialogueTree);
    }
  }
  return (id) => map.get(id);
}

export function createSugarlangPluginFromProject(
  projectData: unknown,
  options: Omit<SugarlangPluginOptions, 'contentBundle'> = {},
): SugarlangPluginResult | null {
  if (!projectData || typeof projectData !== 'object') return null;

  // Only activate when the project explicitly has a `sugarlang` key.
  const project = projectData as Record<string, unknown>;
  if (!('sugarlang' in project)) return null;

  const sugarlangData = project.sugarlang;
  const getDialogueTree = buildDialogueTreeResolver(project);

  if (sugarlangData === 'demo') {
    console.info('[sugarlang] Using explicit built-in Find the Luggage demo bundle.');
    return createSugarlangPlugin({
      ...options,
      contentBundle: FIND_THE_LUGGAGE_BUNDLE,
      getDialogueTree,
    });
  }

  // Check for V1 artifact-backed content
  if (sugarlangData && typeof sugarlangData === 'object') {
    const config = sugarlangData as SugarlangProjectConfig;

    // Explicit disabled check
    if (config.enabled === false) return null;

    // V1: Load from artifact files
    if (config.artifacts && typeof config.artifacts === 'object') {
      const artifactFiles = new Map(Object.entries(config.artifacts));
      if (artifactFiles.size > 0) {
        const { bundle, errors, warnings } = loadContentFromArtifacts(artifactFiles);

        if (errors.length > 0) {
          console.warn('[sugarlang] Artifact loading errors:', errors);
        }
        if (warnings.length > 0) {
          console.warn('[sugarlang] Artifact loading warnings:', warnings);
        }

        if (bundle.scenarios.size > 0 || bundle.sceneLanguagePacks.size > 0) {
          console.info(`[sugarlang] Loaded from ${artifactFiles.size} artifact files.`);
          return createSugarlangPlugin({
            ...options,
            contentBundle: bundle,
            getDialogueTree,
          });
        }
      }
    }

    // Legacy: Load from inline project data (scenarios, sceneLanguagePacks, etc.)
    if ('scenarios' in config || 'sceneLanguagePacks' in config) {
      const { bundle, warnings } = loadContentFromProject(sugarlangData);

      if (bundle.scenarios.size === 0 && bundle.sceneLanguagePacks.size === 0) {
        return null;
      }

      if (warnings.length > 0) {
        console.warn('[sugarlang] Content loaded with warnings:', warnings);
      }

      return createSugarlangPlugin({
        ...options,
        contentBundle: bundle,
        getDialogueTree,
      });
    }
  }

  console.info('[sugarlang] No Sugarlang artifacts or inline content found; plugin not loaded.');
  return null;
}
