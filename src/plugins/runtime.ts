import type { EnginePlugin } from '../engine/plugins';
import { SugarAgent } from './sugaragent';

interface ProjectPluginObject {
  id?: unknown;
  enabled?: unknown;
}

interface ProjectLike {
  plugins?: unknown;
  sugaragent?: {
    enabled?: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPluginObject(value: unknown): value is ProjectPluginObject {
  return isRecord(value);
}

function isSugarAgentEnabledFromProject(projectData: unknown): boolean {
  if (!isRecord(projectData)) return false;
  const project = projectData as ProjectLike;

  // Backward-compatible top-level plugin gate used in authoring pack checks.
  if (project.sugaragent?.enabled === true) {
    return true;
  }

  if (!Array.isArray(project.plugins)) {
    return false;
  }

  for (const plugin of project.plugins) {
    if (plugin === 'sugaragent') {
      return true;
    }
    if (
      isPluginObject(plugin)
      && plugin.id === 'sugaragent'
      && plugin.enabled !== false
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Build runtime plugin instances from project configuration.
 *
 * This is intentionally outside core engine modules so SugarEngine core remains
 * plugin-host only and does not depend on specific plugin packages.
 */
export function buildRuntimePluginsFromProject(projectData: unknown): EnginePlugin[] {
  const plugins: EnginePlugin[] = [];

  if (isSugarAgentEnabledFromProject(projectData)) {
    plugins.push(SugarAgent.createPlugin());
  }

  return plugins;
}

