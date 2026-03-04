import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  replaySugarAgentEvalTranscript,
  runSugarAgentEval,
} from './runner.ts';

describe('SugarAgent eval runner (ADR-007 MVP)', () => {
  it('runs smoke suite and emits metric + beat-evaluation report', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-eval-smoke-'));
    const report = await runSugarAgentEval({
      suite: 'smoke',
      outputDir,
      provider: 'local',
      runtime: 'mock',
    });

    expect(report.suite).toBe('smoke');
    expect(report.status).toBe('pass');
    expect(Array.isArray(report.metrics)).toBe(true);
    expect(report.metrics.some((metric: { metricId?: string }) => metric.metricId === 'loreFaithfulness')).toBe(true);
    expect(report.metrics.some((metric: { metricId?: string }) => metric.metricId === 'identityConsistency')).toBe(true);
    expect(report.metrics.some((metric: { metricId?: string }) => metric.metricId === 'beatCompletionPrecisionRecall')).toBe(true);
    expect(report.beatEvaluation?.coverage?.coveredCount).toBeGreaterThanOrEqual(1);
    expect(report.beatEvaluation?.completion?.falseCompleteCount).toBe(0);
    expect(fs.existsSync(path.join(outputDir, 'report.json'))).toBe(true);
  });

  it('replays a captured transcript and writes replay artifact', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-eval-replay-'));
    const report = await runSugarAgentEval({
      suite: 'smoke',
      outputDir,
      provider: 'local',
      runtime: 'mock',
    });
    const transcriptPath = path.join(outputDir, 'transcripts', 'smoke.intent-safety.json');
    expect(fs.existsSync(transcriptPath)).toBe(true);

    const replay = await replaySugarAgentEvalTranscript({
      transcriptPath,
      outputDir: path.join(outputDir, 'replay'),
      provider: 'local',
      runtime: 'mock',
    });

    expect(report.status).toBe('pass');
    expect(replay.caseId).toBe('smoke.intent-safety');
    expect(replay.replayPassed).toBe(true);
    expect(replay.matchesExpectation).toBe(true);
    expect(typeof replay.artifactPath).toBe('string');
    expect(fs.existsSync(replay.artifactPath as string)).toBe(true);
  });
});
