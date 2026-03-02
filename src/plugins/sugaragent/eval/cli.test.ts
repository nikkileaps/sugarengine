import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('sugaragent eval CLI (ADR-007)', () => {
  it('runs smoke suite and writes report artifacts', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-eval-cli-'));
    const output = execFileSync(
      'node',
      ['scripts/sugaragent-eval.mjs', '--suite', 'smoke', '--output', outputDir, '--provider', 'local', '--runtime', 'mock'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('suite=smoke status=pass');
    expect(output).toContain('metric=loreFaithfulness');
    expect(output).toContain('beat completionPassed=');
    expect(fs.existsSync(path.join(outputDir, 'report.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'transcripts', 'smoke.beat-completion.json'))).toBe(true);
  });

  it('replays a captured transcript', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-eval-cli-replay-'));
    execFileSync(
      'node',
      ['scripts/sugaragent-eval.mjs', '--suite', 'smoke', '--output', outputDir, '--provider', 'local', '--runtime', 'mock', '--quiet'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    const transcriptPath = path.join(outputDir, 'transcripts', 'smoke.intent-safety.json');
    const replayOutput = execFileSync(
      'node',
      [
        'scripts/sugaragent-eval.mjs',
        '--replay',
        transcriptPath,
        '--output',
        path.join(outputDir, 'replay'),
        '--provider',
        'local',
        '--runtime',
        'mock',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(replayOutput).toContain('replay case=smoke.intent-safety');
    expect(replayOutput).toContain('match=true');
  });
});
