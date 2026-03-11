import { describe, expect, it } from 'vitest';
import { createSugarlangPluginFromProject } from './project-plugin';
import { generateFindTheLuggageArtifacts } from './content/migrate-to-artifacts';

describe('createSugarlangPluginFromProject', () => {
  it('does not fall back to demo content when sugarlang is enabled with no artifacts', () => {
    const plugin = createSugarlangPluginFromProject({
      sugarlang: { enabled: true },
    });

    expect(plugin).toBeNull();
  });

  it('still supports the explicit demo mode', () => {
    const plugin = createSugarlangPluginFromProject({
      sugarlang: 'demo',
    });

    expect(plugin).not.toBeNull();
    expect(plugin?.descriptor.id).toBe('sugarlang');
  });

  it('loads artifact-backed content when artifact files are present', () => {
    const files = Object.fromEntries(generateFindTheLuggageArtifacts('approved'));
    const plugin = createSugarlangPluginFromProject({
      sugarlang: {
        enabled: true,
        artifacts: files,
      },
    });

    expect(plugin).not.toBeNull();
    expect(plugin?.descriptor.id).toBe('sugarlang');
  });
});
