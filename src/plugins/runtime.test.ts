import { describe, expect, it } from 'vitest';
import { buildRuntimePluginsFromProject } from './runtime';

describe('buildRuntimePluginsFromProject', () => {
  it('returns no plugins when config has no plugin entries', () => {
    const plugins = buildRuntimePluginsFromProject({});
    expect(plugins).toHaveLength(0);
  });

  it('enables SugarAgent from string plugin id', () => {
    const plugins = buildRuntimePluginsFromProject({
      plugins: ['sugaragent'],
    });

    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.descriptor.id).toBe('sugaragent');
  });

  it('enables SugarAgent from object plugin entry', () => {
    const plugins = buildRuntimePluginsFromProject({
      plugins: [{ id: 'sugaragent', enabled: true }],
    });

    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.descriptor.id).toBe('sugaragent');
  });

  it('treats object plugin entry as enabled when enabled is omitted', () => {
    const plugins = buildRuntimePluginsFromProject({
      plugins: [{ id: 'sugaragent' }],
    });

    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.descriptor.id).toBe('sugaragent');
  });

  it('does not enable SugarAgent when explicitly disabled', () => {
    const plugins = buildRuntimePluginsFromProject({
      plugins: [{ id: 'sugaragent', enabled: false }],
    });

    expect(plugins).toHaveLength(0);
  });

  it('supports top-level sugaragent.enabled gate', () => {
    const plugins = buildRuntimePluginsFromProject({
      sugaragent: { enabled: true },
    });

    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.descriptor.id).toBe('sugaragent');
  });

  it('ignores unrelated plugin ids', () => {
    const plugins = buildRuntimePluginsFromProject({
      plugins: ['foo', { id: 'bar', enabled: true }],
    });

    expect(plugins).toHaveLength(0);
  });
});
