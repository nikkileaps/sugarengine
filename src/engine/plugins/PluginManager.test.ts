import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginManager } from './PluginManager';
import type {
  EnginePlugin,
  PluginEvent,
  PluginHostContext,
} from './types';
import { PLUGIN_API_VERSION } from './types';

function createHostContext(): PluginHostContext {
  return {
    getNearbyInteraction: () => null,
    getNearbyInteractable: () => null,
    getNPCInfo: () => undefined,
    getPlayerPosition: () => ({ x: 0, y: 0, z: 0 }),
    getRegionInfo: () => ({ path: 'test-region' }),
    executeIntent: async () => ({ success: true }),
  };
}

function createPlugin(
  id: string,
  overrides: Partial<EnginePlugin> = {},
): EnginePlugin {
  return {
    descriptor: {
      id,
      version: '1.0.0',
      apiVersion: PLUGIN_API_VERSION,
    },
    init: () => {},
    dispose: () => {},
    ...overrides,
  };
}

describe('PluginManager', () => {
  const host = createHostContext();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects duplicate plugin IDs', () => {
    const manager = new PluginManager(host);
    manager.register(createPlugin('alpha'));

    expect(() => manager.register(createPlugin('alpha'))).toThrow('Duplicate plugin id');
  });

  it('rejects unsupported plugin api versions', () => {
    const manager = new PluginManager(host);
    const invalid = createPlugin('legacy', {
      descriptor: {
        id: 'legacy',
        version: '0.9.0',
        apiVersion: 999,
      },
    });

    expect(() => manager.register(invalid)).toThrow('unsupported apiVersion');
  });

  it('initializes and updates plugins in order', async () => {
    const order: string[] = [];
    const manager = new PluginManager(host, [
      createPlugin('first', {
        init: () => { order.push('init:first'); },
        onUpdate: () => { order.push('update:first'); },
      }),
      createPlugin('second', {
        init: () => { order.push('init:second'); },
        onUpdate: () => { order.push('update:second'); },
      }),
    ]);

    await manager.init();
    manager.update(0.016);

    expect(order).toEqual([
      'init:first',
      'init:second',
      'update:first',
      'update:second',
    ]);
  });

  it('isolates plugin failures during interaction resolution', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = new PluginManager(host, [
      createPlugin('broken', {
        resolveInteraction: async () => {
          throw new Error('boom');
        },
      }),
      createPlugin('handler', {
        resolveInteraction: async () => ({ type: 'handled' }),
      }),
    ]);

    const result = await manager.resolveInteraction({
      npcId: 'npc-1',
      hasQuestDialogue: false,
      hasBehaviorTree: false,
    });

    expect(result).toEqual({ type: 'handled' });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('runs agent turns through plugins and isolates failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = new PluginManager(host, [
      createPlugin('broken', {
        runAgentTurn: async () => {
          throw new Error('boom');
        },
      }),
      createPlugin('agent', {
        runAgentTurn: async () => ({ utterance: 'Hello there.' }),
      }),
    ]);

    const result = await manager.runAgentTurn({
      npcId: 'npc-1',
      npcName: 'Baker',
      playerMessage: 'hi',
    });

    expect(result).toEqual({ utterance: 'Hello there.' });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('emits events to subscribers and plugins', () => {
    const received: string[] = [];
    const pluginEventHandler = vi.fn((event: PluginEvent) => {
      received.push(`plugin:${event.type}`);
    });
    const manager = new PluginManager(host, [
      createPlugin('listener', { onEvent: pluginEventHandler }),
    ]);

    const unsubscribe = manager.subscribe((event) => {
      received.push(`bus:${event.type}`);
    });

    manager.emit({ type: 'dialogueEnded' });
    unsubscribe();
    manager.emit({ type: 'dialogueEnded' });

    expect(received).toEqual([
      'bus:dialogueEnded',
      'plugin:dialogueEnded',
      'plugin:dialogueEnded',
    ]);
  });

  it('serializes and restores plugin namespaced state', () => {
    const loader = vi.fn();
    const manager = new PluginManager(host, [
      createPlugin('alpha', {
        serializeState: () => ({ count: 3 }),
        loadState: loader,
      }),
      createPlugin('beta', {
        serializeState: () => undefined,
      }),
    ]);

    const snapshot = manager.serializeState();
    expect(snapshot).toEqual({ alpha: { count: 3 } });

    manager.loadState({ alpha: { count: 9 }, unknown: { x: 1 } });
    expect(loader).toHaveBeenCalledWith({ count: 9 });
  });
});
