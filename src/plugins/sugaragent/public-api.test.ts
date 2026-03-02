import { describe, expect, it } from 'vitest';
import { SugarAgent } from './index';

describe('SugarAgent public API', () => {
  it('exposes a single coherent facade for plugin callers', () => {
    expect(Object.keys(SugarAgent).sort()).toEqual(['createPlugin']);
  });

  it('creates plugin instances through the facade', () => {
    const plugin = SugarAgent.createPlugin();
    expect(plugin.descriptor.id).toBe('sugaragent');
  });
});
