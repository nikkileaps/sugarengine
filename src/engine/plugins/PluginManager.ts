import {
  EnginePlugin,
  PLUGIN_API_VERSION,
  PluginAgentTurnRequest,
  PluginAgentTurnResult,
  PluginEvent,
  PluginHostContext,
  PluginInteractionResolution,
  InteractionRequest,
} from './types';

/**
 * Runtime plugin orchestrator.
 *
 * Owns plugin lifecycle, event fan-out, interaction resolution chain,
 * and namespaced plugin persistence.
 */
export class PluginManager {
  private plugins: EnginePlugin[] = [];
  private listeners: Set<(event: PluginEvent) => void> = new Set();
  private initialized = false;
  private readonly context;

  constructor(
    private host: PluginHostContext,
    plugins: EnginePlugin[] = [],
  ) {
    this.context = {
      getNearbyInteraction: () => this.host.getNearbyInteraction(),
      getNearbyInteractable: () => this.host.getNearbyInteractable(),
      getNPCInfo: (npcId: string) => this.host.getNPCInfo(npcId),
      getPlayerPosition: () => this.host.getPlayerPosition(),
      getRegionInfo: () => this.host.getRegionInfo(),
      executeIntent: (intent: Parameters<PluginHostContext['executeIntent']>[0]) => this.host.executeIntent(intent),
      emit: (event: PluginEvent) => this.emit(event),
      subscribe: (handler: (event: PluginEvent) => void) => this.subscribe(handler),
    };

    for (const plugin of plugins) {
      this.register(plugin);
    }
  }

  register(plugin: EnginePlugin): void {
    if (plugin.descriptor.apiVersion !== PLUGIN_API_VERSION) {
      throw new Error(
        `[PluginManager] Plugin "${plugin.descriptor.id}" has unsupported apiVersion ` +
        `${plugin.descriptor.apiVersion}. Expected ${PLUGIN_API_VERSION}.`,
      );
    }

    if (this.plugins.some((p) => p.descriptor.id === plugin.descriptor.id)) {
      throw new Error(`[PluginManager] Duplicate plugin id: "${plugin.descriptor.id}"`);
    }

    this.plugins.push(plugin);
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    for (const plugin of this.plugins) {
      try {
        await plugin.init(this.context);
      } catch (error) {
        console.error(`[PluginManager] Failed to initialize plugin "${plugin.descriptor.id}"`, error);
      }
    }

    this.initialized = true;
  }

  update(delta: number): void {
    for (const plugin of this.plugins) {
      if (!plugin.onUpdate) continue;

      try {
        plugin.onUpdate(delta);
      } catch (error) {
        console.error(`[PluginManager] Plugin "${plugin.descriptor.id}" failed during update`, error);
      }
    }
  }

  emit(event: PluginEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[PluginManager] Event listener failed', error);
      }
    }

    for (const plugin of this.plugins) {
      if (!plugin.onEvent) continue;

      try {
        plugin.onEvent(event);
      } catch (error) {
        console.error(`[PluginManager] Plugin "${plugin.descriptor.id}" failed while handling event "${event.type}"`, error);
      }
    }
  }

  subscribe(handler: (event: PluginEvent) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  async resolveInteraction(request: InteractionRequest): Promise<PluginInteractionResolution | null> {
    for (const plugin of this.plugins) {
      if (!plugin.resolveInteraction) continue;

      try {
        const result = await plugin.resolveInteraction(request);
        if (result) {
          return result;
        }
      } catch (error) {
        console.error(`[PluginManager] Plugin "${plugin.descriptor.id}" failed in resolveInteraction`, error);
      }
    }

    return null;
  }

  async runAgentTurn(request: PluginAgentTurnRequest): Promise<PluginAgentTurnResult | null> {
    for (const plugin of this.plugins) {
      if (!plugin.runAgentTurn) continue;

      try {
        const result = await plugin.runAgentTurn(request);
        if (result) {
          return result;
        }
      } catch (error) {
        console.error(`[PluginManager] Plugin "${plugin.descriptor.id}" failed in runAgentTurn`, error);
      }
    }

    return null;
  }

  serializeState(): Record<string, unknown> {
    const byPlugin: Record<string, unknown> = {};

    for (const plugin of this.plugins) {
      if (!plugin.serializeState) continue;

      try {
        const state = plugin.serializeState();
        if (state !== undefined) {
          byPlugin[plugin.descriptor.id] = state;
        }
      } catch (error) {
        console.error(`[PluginManager] Plugin "${plugin.descriptor.id}" failed while serializing state`, error);
      }
    }

    return byPlugin;
  }

  loadState(stateByPlugin: Record<string, unknown> | undefined): void {
    if (!stateByPlugin) return;

    for (const plugin of this.plugins) {
      if (!plugin.loadState) continue;

      if (!(plugin.descriptor.id in stateByPlugin)) continue;
      const pluginState = stateByPlugin[plugin.descriptor.id];

      try {
        plugin.loadState(pluginState);
      } catch (error) {
        console.error(`[PluginManager] Plugin "${plugin.descriptor.id}" failed while loading state`, error);
      }
    }
  }

  async dispose(): Promise<void> {
    for (let i = this.plugins.length - 1; i >= 0; i--) {
      const plugin = this.plugins[i];
      if (!plugin) continue;

      try {
        await plugin.dispose();
      } catch (error) {
        console.error(`[PluginManager] Plugin "${plugin.descriptor.id}" failed during dispose`, error);
      }
    }

    this.listeners.clear();
    this.initialized = false;
  }

  getPlugins(): readonly EnginePlugin[] {
    return this.plugins;
  }
}
