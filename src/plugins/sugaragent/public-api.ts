import type { EnginePlugin } from '../../engine/plugins';
import {
  createSugarAgentPlugin,
} from './plugin';
import type {
  SugarAgentPluginOptions,
} from './plugin';

export type {
  SugarAgentPluginOptions,
} from './plugin';

export interface SugarAgentPublicApi {
  createPlugin(options?: SugarAgentPluginOptions): EnginePlugin;
}

export const SugarAgent: SugarAgentPublicApi = {
  createPlugin(options = {}) {
    return createSugarAgentPlugin(options);
  },
};
