import type { EnginePlugin } from '../../engine/plugins';
import {
  buildSugarAgentAuthoringBundle,
  type SugarAgentPackProject,
} from './authoring/artifacts';
import {
  createSugarAgentPlugin,
  type SugarAgentPluginOptions,
} from './plugin';

export function createSugarAgentPluginFromProject(
  projectData: unknown,
  options: Omit<SugarAgentPluginOptions, 'authoringBundle' | 'runtimeMode'> = {},
): EnginePlugin | null {
  const result = buildSugarAgentAuthoringBundle((projectData ?? {}) as SugarAgentPackProject);
  if (!result.enabled) return null;
  if (result.errors.length > 0) {
    console.warn('[sugaragent] Authoring bundle generated with errors; invalid entries were ignored.', result.errors);
  }
  if (result.warnings.length > 0) {
    console.warn('[sugaragent] Authoring bundle generated with warnings.', result.warnings);
  }
  return createSugarAgentPlugin({
    ...options,
    authoringBundle: result.bundle,
    runtimeMode: result.bundle?.policy.runtimeMode,
  });
}
