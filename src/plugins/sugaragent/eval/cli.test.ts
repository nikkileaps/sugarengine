import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('sugaragent eval CLI (Phase 8)', () => {
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
    expect(output).toContain('metric=ragFaithfulness');
    expect(output).toContain('gate=gate.layer.atomic_factual_support');
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

  it('exits non-zero for production target when reranker promotion gate fails', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-eval-cli-prod-gate-'));
    expect(() => {
      execFileSync(
        'node',
        [
          'scripts/sugaragent-eval.mjs',
          '--suite',
          'smoke',
          '--output',
          outputDir,
          '--provider',
          'local',
          '--runtime',
          'mock',
          '--deployment-target',
          'production',
          '--reranker-class',
          'heuristic',
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );
    }).toThrow();
  });

  it('reads eval defaults from active game project plugin config', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-eval-cli-project-defaults-'));
    const gameSlug = 'phase8-defaults';
    const gameDir = path.join(workspaceDir, 'games', gameSlug);
    fs.mkdirSync(gameDir, { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, 'games', '.active-game'), `${gameSlug}\n`, 'utf8');
    fs.writeFileSync(
      path.join(gameDir, 'project.sgrgame'),
      JSON.stringify({
        meta: { gameId: gameSlug, name: 'Phase8 Defaults' },
        plugins: [
          {
            id: 'sugaragent',
            enabled: true,
            evalDeploymentTarget: 'production',
            evalRerankerClass: 'heuristic',
          },
        ],
      }),
      'utf8',
    );

    const outputDir = path.join(workspaceDir, 'eval-output');
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'sugaragent-eval.mjs');

    try {
      execFileSync(
        'node',
        [scriptPath, '--suite', 'smoke', '--output', outputDir, '--provider', 'local', '--runtime', 'mock'],
        {
          cwd: workspaceDir,
          encoding: 'utf8',
        },
      );
      throw new Error('Expected eval run to fail from project-configured production gate.');
    } catch (error) {
      const detail = error as { stdout?: string; stderr?: string };
      const output = `${detail.stdout ?? ''}\n${detail.stderr ?? ''}`;
      expect(output).toContain('project defaults=');
      expect(output).toContain('deploymentTarget=production');
      expect(output).toContain('reranker promotion passed=false blocking=true');
    }
  });
});
