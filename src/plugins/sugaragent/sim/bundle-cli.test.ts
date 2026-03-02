import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('sugaragent bundle CLI profiles', () => {
  it('lists available model profiles', () => {
    const output = execFileSync(
      'node',
      ['scripts/sugaragent-bundle-local-llm.mjs', '--list-profiles'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('Available model profiles');
    expect(output).toContain('- mobile:');
    expect(output).toContain('- balanced:');
    expect(output).toContain('- quality:');
    expect(output).toContain('Default profile: balanced');
  });

  it('fails fast on unknown profile id', () => {
    let output = '';
    try {
      execFileSync(
        'node',
        ['scripts/sugaragent-bundle-local-llm.mjs', '--profile', 'nope', '--list-profiles'],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    } catch (error) {
      const details = error as { stderr?: string; message?: string };
      output = details.stderr ?? details.message ?? String(error);
    }

    expect(output).toContain('Unknown profile');
  });
});

