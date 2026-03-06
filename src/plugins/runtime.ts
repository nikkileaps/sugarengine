import type { EnginePlugin } from '../engine/plugins';
import { SugarAgent } from './sugaragent';

interface ProjectPluginObject {
  id?: unknown;
  enabled?: unknown;
  runtimeMode?: unknown;
  runtime?: unknown;
}

interface ProjectLike {
  plugins?: unknown;
  sugaragent?: {
    enabled?: unknown;
    runtimeMode?: unknown;
    runtime?: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPluginObject(value: unknown): value is ProjectPluginObject {
  return isRecord(value);
}

function normalizeSugarAgentRuntimeMode(value: unknown): 'llama' | 'auto' | 'mock' {
  if (value === 'auto' || value === 'mock' || value === 'llama') {
    return value;
  }
  return 'llama';
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

function resolveSugarAgentRuntimeMode(projectData: unknown): 'llama' | 'auto' | 'mock' {
  if (!isRecord(projectData)) return 'llama';
  const project = projectData as ProjectLike;

  if (project.sugaragent && isRecord(project.sugaragent)) {
    return normalizeSugarAgentRuntimeMode(project.sugaragent.runtimeMode ?? project.sugaragent.runtime);
  }

  if (!Array.isArray(project.plugins)) {
    return 'llama';
  }

  for (const plugin of project.plugins) {
    if (!isPluginObject(plugin) || plugin.id !== 'sugaragent') continue;
    return normalizeSugarAgentRuntimeMode(plugin.runtimeMode ?? plugin.runtime);
  }

  return 'llama';
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
    plugins.push(SugarAgent.createPlugin({
      runtimeMode: resolveSugarAgentRuntimeMode(projectData),
    }));
  }

  return plugins;
}
