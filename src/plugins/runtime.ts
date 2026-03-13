import type { EnginePlugin } from '../engine/plugins';
import type { ConversationMiddleware, ConversationProvider } from '../engine/conversation/types';
import { createSugarAgentPluginFromProject } from './sugaragent/project-plugin';
import { createSugarlangPluginFromProject } from './sugarlang/project-plugin';

/**
 * Result of building runtime plugins from project data.
 * Includes both the standard EnginePlugin list and any conversation middleware
 * that needs to be registered with the ConversationHost separately.
 */
export interface RuntimePluginBuildResult {
  plugins: EnginePlugin[];
  conversationMiddleware: ConversationMiddleware[];
  conversationProviders: ConversationProvider[];
}

/**
 * Build runtime plugin instances from project configuration.
 *
 * Plugin-specific project parsing stays inside the plugin package so engine
 * host/runtime bootstrap remains generic.
 */
export function buildRuntimePluginsFromProject(projectData: unknown): RuntimePluginBuildResult {
  const plugins: EnginePlugin[] = [];
  const conversationMiddleware: ConversationMiddleware[] = [];
  const conversationProviders: ConversationProvider[] = [];

  const sugarAgent = createSugarAgentPluginFromProject(projectData);
  if (sugarAgent) {
    plugins.push(sugarAgent);
  }

  const sugarlang = createSugarlangPluginFromProject(projectData);
  if (sugarlang) {
    plugins.push(sugarlang);
    conversationMiddleware.push(sugarlang.getMiddleware());
    conversationProviders.push(sugarlang.getProvider());
  }

  return { plugins, conversationMiddleware, conversationProviders };
}
