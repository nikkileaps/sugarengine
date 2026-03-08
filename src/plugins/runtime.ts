import type { EnginePlugin } from '../engine/plugins';
import { createSugarAgentPluginFromProject } from './sugaragent/project-plugin';

/**
 * Build runtime plugin instances from project configuration.
 *
 * Plugin-specific project parsing stays inside the plugin package so engine
 * host/runtime bootstrap remains generic.
 */
export function buildRuntimePluginsFromProject(projectData: unknown): EnginePlugin[] {
  const plugins: EnginePlugin[] = [];

  const sugarAgent = createSugarAgentPluginFromProject(projectData);
  if (sugarAgent) {
    plugins.push(sugarAgent);
  }

  return plugins;
}
