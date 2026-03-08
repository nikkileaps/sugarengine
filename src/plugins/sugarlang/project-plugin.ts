import type { EnginePlugin } from '../../engine/plugins';
import { loadContentFromProject } from './content/loader';
import { createSugarlangPlugin, type SugarlangPluginOptions } from './plugin';
import type { ConversationMiddleware, ConversationProvider } from '../../engine/conversation/types';
import { FIND_THE_LUGGAGE_BUNDLE } from './content/find-the-luggage';

type SugarlangPluginResult = EnginePlugin & {
  getMiddleware(): ConversationMiddleware;
  getProvider(): ConversationProvider;
};

/**
 * Create a Sugarlang plugin from project data.
 *
 * If the project has a `sugarlang` section, content is loaded from there.
 * Otherwise, falls back to the built-in Find the Luggage demo bundle so
 * the plugin can be tested in preview without manual project wiring.
 *
 * In a future phase, the editor will persist sugarlang content into the
 * project file and provide a toggle to enable/disable the plugin per project.
 */
export function createSugarlangPluginFromProject(
  projectData: unknown,
  options: Omit<SugarlangPluginOptions, 'contentBundle'> = {},
): SugarlangPluginResult | null {
  if (!projectData || typeof projectData !== 'object') return null;

  // Only activate when the project explicitly has a `sugarlang` key.
  const project = projectData as Record<string, unknown>;
  if (!('sugarlang' in project)) return null;

  const sugarlangData = project.sugarlang;

  // If the key is present with real content data, load it.
  if (sugarlangData && typeof sugarlangData === 'object') {
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
    });
  }

  // Key is present but has no real data (e.g. `sugarlang: true` or `sugarlang: 'demo'`)
  // — fall back to built-in demo content for preview testing.
  console.info('[sugarlang] No project sugarlang data found, using built-in Find the Luggage demo.');
  return createSugarlangPlugin({
    ...options,
    contentBundle: FIND_THE_LUGGAGE_BUNDLE,
  });
}
