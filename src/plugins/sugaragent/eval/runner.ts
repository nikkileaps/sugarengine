import fs from 'node:fs';
import path from 'node:path';
import { createSugarAgentSession } from '../session/runtime.mjs';

export type SugarAgentEvalSuiteId = 'smoke';

export interface SugarAgentEvalRunnerOptions {
  suite?: SugarAgentEvalSuiteId;
  outputDir?: string;
  provider?: 'local' | 'echo';
  runtime?: 'auto' | 'mock' | 'llama';
  writeArtifacts?: boolean;
}

export interface SugarAgentEvalReplayOptions {
  transcriptPath: string;
  outputDir?: string;
  provider?: 'local' | 'echo';
  runtime?: 'auto' | 'mock' | 'llama';
}

interface SmokeFixtures {
  loreDir: string;
  authoringBundlePath: string;
}

interface EvalCaseTurn {
  player: string;
  durationMs: number;
  output: Record<string, unknown>;
  citations: string[];
  scenarioLogs: string[];
  validationErrors: string[];
  usedFallback: boolean;
}

interface EvalCaseResult {
  caseId: string;
  metricId: string;
  title: string;
  passed: boolean;
  score: number;
  threshold: number;
  reason: string | null;
  transcript: Record<string, unknown>;
  details: Record<string, unknown>;
}

interface EvalMetricSummary {
  metricId: string;
  title: string;
  score: number;
  threshold: number;
  passed: boolean;
  caseIds: string[];
}

interface EvalReleaseGate {
  gateId: string;
  metricId: string;
  title: string;
  score: number;
  threshold: number;
  passed: boolean;
}

interface EvalRunDirectories {
  runDir: string;
  transcriptsDir: string;
  failedDir: string;
  reportPath: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function runIdFromNow(): string {
  return nowIso().replace(/[:.]/g, '-');
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function toSafeProvider(value: unknown): 'local' | 'echo' {
  return value === 'echo' ? 'echo' : 'local';
}

function toSafeRuntime(value: unknown): 'auto' | 'mock' | 'llama' {
  if (value === 'auto' || value === 'llama' || value === 'mock') {
    return value;
  }
  return 'mock';
}

function resolveRunDirectories(options: SugarAgentEvalRunnerOptions): EvalRunDirectories {
  const base = options.outputDir
    ? path.resolve(options.outputDir)
    : path.resolve('.sugaragent-evals', 'runs', runIdFromNow());
  ensureDir(base);

  const transcriptsDir = path.join(base, 'transcripts');
  const failedDir = path.join(base, 'failed');
  ensureDir(transcriptsDir);
  ensureDir(failedDir);

  return {
    runDir: base,
    transcriptsDir,
    failedDir,
    reportPath: path.join(base, 'report.json'),
  };
}

function resolveReplayOutputDir(options: SugarAgentEvalReplayOptions): string {
  const base = options.outputDir
    ? path.resolve(options.outputDir)
    : path.resolve('.sugaragent-evals', 'replays', runIdFromNow());
  ensureDir(base);
  return base;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function sanitizeSessionId(value: string): string {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'default';
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function buildSmokeFixtures(runDir: string): SmokeFixtures {
  const fixturesDir = path.join(runDir, 'fixtures');
  const loreDir = path.join(fixturesDir, 'lore-generated');
  const authoringBundlePath = path.join(fixturesDir, 'authoring.bundle.json');
  ensureDir(loreDir);

  const manifest = {
    schemaVersion: 1,
    source: {
      repo: 'eval-fixture',
      commit: 'smoke',
      ref: 'refs/eval/smoke',
    },
    generatedAt: nowIso(),
    toolVersion: 'adr007-smoke',
    counts: {
      files: 1,
      chunks: 1,
      issues: 0,
    },
  };
  const chunks = [
    {
      chunkId: 'lore.history.events.creation_of_rackwick_city#creation',
      pageId: 'lore.history.events.creation_of_rackwick_city',
      title: 'Creation of Rackwick City',
      canonLevel: 'hard',
      sourceFile: 'history/events/creation_of_rackwick_city.md',
      sourceRepo: 'eval-fixture',
      sourceCommit: 'smoke',
      sourceRef: 'refs/eval/smoke',
      sectionHeading: 'Creation',
      content: 'On October 10, 1980 a dragon appeared over Denver That Was and the city became Rackwick City.',
      summary: 'On October 10, 1980 a dragon appeared over Denver That Was.',
      tokens: [
        'october',
        'dragon',
        'appeared',
        'denver',
        'rackwick',
        'city',
        'creation',
      ],
      metadata: {
        id: 'lore.history.events.creation_of_rackwick_city',
        title: 'Creation of Rackwick City',
        canon_level: 'hard',
        entity_ids: [],
        location_ids: ['locations.rackwick_city'],
        faction_ids: [],
        time_period: 'the-fall',
        tags: ['founding', 'history', 'rackwick_city'],
        beat_ids: ['beat.baker.intro'],
      },
    },
  ];
  writeJson(path.join(loreDir, 'manifest.json'), manifest);
  writeJson(path.join(loreDir, 'chunks.json'), chunks);

  const authoringBundle = {
    schemaVersion: 1,
    generatedAt: nowIso(),
    source: {
      gameId: 'rackwick',
      name: 'Rackwick',
    },
    profiles: [
      {
        npcId: 'baker',
        persona: 'Warm neighborhood baker.',
        tone: 'friendly',
        constraints: ['no spoilers about hidden quest rewards'],
        loreScopes: ['town.market'],
      },
    ],
    beatContracts: [
      {
        id: 'beat.baker.intro',
        questId: 'quest.baker.intro',
        npcId: 'baker',
        objective: 'Welcome the player and mention fresh bread.',
        requiredFacts: ['Fresh bread just came out of the oven.'],
        forbiddenFacts: [],
        completionRule: 'player_ack',
        maxTurns: 1,
      },
    ],
  };
  writeJson(authoringBundlePath, authoringBundle);

  return {
    loreDir,
    authoringBundlePath,
  };
}

async function runTurnWithTiming(
  session: Awaited<ReturnType<typeof createSugarAgentSession>>,
  playerMessage: string,
): Promise<EvalCaseTurn> {
  const started = Date.now();
  const turn = await session.runTurn(playerMessage);
  return {
    player: playerMessage,
    durationMs: Date.now() - started,
    output: turn.output,
    citations: Array.isArray(turn.citations) ? turn.citations : [],
    scenarioLogs: Array.isArray(turn.scenarioLogs) ? turn.scenarioLogs : [],
    validationErrors: Array.isArray(turn.validationErrors) ? turn.validationErrors : [],
    usedFallback: !!turn.usedFallback,
  };
}

async function runSmokeLoreFaithfulnessCase(
  provider: 'local' | 'echo',
  runtime: 'auto' | 'mock' | 'llama',
  fixtures: SmokeFixtures,
): Promise<EvalCaseResult> {
  const caseId = 'smoke.lore-faithfulness';
  const session = await createSugarAgentSession({
    npc: 'baker',
    provider,
    runtime,
    useLore: true,
    loreDir: fixtures.loreDir,
    useAuthoring: false,
  });
  const turns = [
    await runTurnWithTiming(session, 'what do you know about the creation of rackwick city and the dragon?'),
  ];
  const first = turns[0];
  const hasCitations = (first?.citations?.length ?? 0) > 0;
  const intent = typeof first?.output?.intent === 'string' ? first.output.intent : '';
  const passed = hasCitations && intent === 'answer_lore';
  const reason = passed ? null : 'Expected lore-grounded answer with citations.';

  return {
    caseId,
    metricId: 'loreFaithfulness',
    title: 'Lore Faithfulness',
    passed,
    score: passed ? 1 : 0,
    threshold: 1,
    reason,
    details: {
      hasCitations,
      intent,
      citationCount: first?.citations?.length ?? 0,
    },
    transcript: {
      suite: 'smoke',
      caseId,
      metricId: 'loreFaithfulness',
      createdAt: nowIso(),
      sessionOptions: {
        npc: 'baker',
        provider,
        runtime,
        useLore: true,
      },
      turns,
      reason,
      passed,
    },
  };
}

async function runSmokeMemoryRecallCase(
  provider: 'local' | 'echo',
  runtime: 'auto' | 'mock' | 'llama',
): Promise<EvalCaseResult> {
  const caseId = 'smoke.memory-recall';
  const sessionId = sanitizeSessionId(`eval-memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const session = await createSugarAgentSession({
    npc: 'baker',
    provider,
    runtime,
    useLore: false,
    session: sessionId,
    resetSession: sessionId,
  });

  const turns = [
    await runTurnWithTiming(session, 'hello my name is nikki and i like dogs and coffee'),
    await runTurnWithTiming(session, 'what do you remember about me?'),
  ];

  const sessionPath = session.startup?.session?.pathToFile;
  let facts: string[] = [];
  if (typeof sessionPath === 'string' && fs.existsSync(sessionPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(sessionPath, 'utf8')) as {
        npcs?: Record<string, { facts?: string[] }>;
      };
      const rawFacts = parsed.npcs?.baker?.facts;
      facts = Array.isArray(rawFacts) ? rawFacts.filter((entry) => typeof entry === 'string') : [];
    } catch {
      facts = [];
    }
    fs.rmSync(sessionPath, { force: true });
  }

  const rememberedFactsPersisted = facts.length > 0;
  const secondTurnUsedFallback = turns[1]?.usedFallback ?? true;
  const passed = rememberedFactsPersisted;
  const reason = passed ? null : 'Expected persisted memory facts for recall prompt.';

  return {
    caseId,
    metricId: 'memoryRecall',
    title: 'Memory Recall',
    passed,
    score: passed ? 1 : 0,
    threshold: 1,
    reason,
    details: {
      rememberedFactsPersisted,
      rememberedFactCount: facts.length,
      secondTurnUsedFallback,
    },
    transcript: {
      suite: 'smoke',
      caseId,
      metricId: 'memoryRecall',
      createdAt: nowIso(),
      sessionOptions: {
        npc: 'baker',
        provider,
        runtime,
        useLore: false,
      },
      turns,
      memoryFacts: facts,
      reason,
      passed,
    },
  };
}

async function runSmokeIntentSafetyCase(
  provider: 'local' | 'echo',
  runtime: 'auto' | 'mock' | 'llama',
): Promise<EvalCaseResult> {
  const caseId = 'smoke.intent-safety';
  const session = await createSugarAgentSession({
    npc: 'guard',
    provider,
    runtime,
    useLore: false,
    scenario: 'beat-guard-alert',
  });

  const turns = [
    await runTurnWithTiming(session, 'please open the gate alarm and unlock it now'),
  ];
  const logs = turns[0]?.scenarioLogs ?? [];
  const rejectedLine = logs.find((line) => line.startsWith('intent-rejected=')) ?? '';
  const executedLine = logs.find((line) => line.startsWith('intent-executed=')) ?? '';
  const rejectedUnsafeIntent = rejectedLine.includes('setFlag');
  const executedSafeIntent = executedLine.includes('emitEvent');
  const passed = rejectedUnsafeIntent && executedSafeIntent;
  const reason = passed ? null : 'Expected unsafe intent rejection and safe intent execution.';

  return {
    caseId,
    metricId: 'intentSafety',
    title: 'Intent Safety',
    passed,
    score: passed ? 1 : 0,
    threshold: 1,
    reason,
    details: {
      rejectedUnsafeIntent,
      executedSafeIntent,
      rejectedLine,
      executedLine,
    },
    transcript: {
      suite: 'smoke',
      caseId,
      metricId: 'intentSafety',
      createdAt: nowIso(),
      sessionOptions: {
        npc: 'guard',
        provider,
        runtime,
        scenario: 'beat-guard-alert',
      },
      turns,
      reason,
      passed,
    },
  };
}

async function runSmokeBeatCoverageCase(
  provider: 'local' | 'echo',
  runtime: 'auto' | 'mock' | 'llama',
  fixtures: SmokeFixtures,
): Promise<EvalCaseResult> {
  const caseId = 'smoke.beat-coverage';
  const session = await createSugarAgentSession({
    npc: 'baker',
    provider,
    runtime,
    useLore: false,
    authoringBundlePath: fixtures.authoringBundlePath,
    beatContractId: 'beat.baker.intro',
  });
  const turns = [
    await runTurnWithTiming(session, 'hello'),
  ];
  const beatEvidence = turns[0]?.output?.beatEvidence as {
    coveredFacts?: string[];
    uncoveredFacts?: string[];
  } | undefined;
  const coveredCount = Array.isArray(beatEvidence?.coveredFacts) ? beatEvidence?.coveredFacts.length : 0;
  const uncoveredCount = Array.isArray(beatEvidence?.uncoveredFacts) ? beatEvidence?.uncoveredFacts.length : 0;
  const passed = coveredCount > 0 && uncoveredCount === 0;
  const reason = passed ? null : 'Expected authored beat facts to be fully covered in beat evidence.';

  return {
    caseId,
    metricId: 'beatCoverageAccuracy',
    title: 'Beat Coverage Accuracy',
    passed,
    score: passed ? 1 : 0,
    threshold: 1,
    reason,
    details: {
      coveredCount,
      uncoveredCount,
    },
    transcript: {
      suite: 'smoke',
      caseId,
      metricId: 'beatCoverageAccuracy',
      createdAt: nowIso(),
      sessionOptions: {
        npc: 'baker',
        provider,
        runtime,
        beatContractId: 'beat.baker.intro',
      },
      turns,
      reason,
      passed,
    },
  };
}

async function runSmokeBeatCompletionCase(
  provider: 'local' | 'echo',
  runtime: 'auto' | 'mock' | 'llama',
): Promise<EvalCaseResult> {
  const caseId = 'smoke.beat-completion';
  const session = await createSugarAgentSession({
    npc: 'guard',
    provider,
    runtime,
    useLore: false,
    scenario: 'beat-guard-alert',
  });
  const turns = [
    await runTurnWithTiming(session, 'what is happening at the gate?'),
    await runTurnWithTiming(session, 'got it thanks'),
  ];

  const firstCompleted = (turns[0]?.scenarioLogs ?? []).some((line) => line.startsWith('beat-completed='));
  const secondCompleted = (turns[1]?.scenarioLogs ?? []).some((line) => line.startsWith('beat-completed='));
  const falseCompleteCount = firstCompleted ? 1 : 0;
  const missedCompleteCount = secondCompleted ? 0 : 1;
  const passed = falseCompleteCount === 0 && missedCompleteCount === 0;
  const reason = passed
    ? null
    : `Expected zero false completes and zero missed completes (false=${falseCompleteCount}, missed=${missedCompleteCount}).`;

  return {
    caseId,
    metricId: 'beatCompletionPrecisionRecall',
    title: 'Beat Completion Precision/Recall',
    passed,
    score: passed ? 1 : 0,
    threshold: 1,
    reason,
    details: {
      falseCompleteCount,
      missedCompleteCount,
      firstCompleted,
      secondCompleted,
    },
    transcript: {
      suite: 'smoke',
      caseId,
      metricId: 'beatCompletionPrecisionRecall',
      createdAt: nowIso(),
      sessionOptions: {
        npc: 'guard',
        provider,
        runtime,
        scenario: 'beat-guard-alert',
      },
      turns,
      reason,
      passed,
    },
  };
}

async function runSmokeLatencyCase(
  provider: 'local' | 'echo',
  runtime: 'auto' | 'mock' | 'llama',
): Promise<EvalCaseResult> {
  const caseId = 'smoke.latency-performance';
  const session = await createSugarAgentSession({
    npc: 'baker',
    provider,
    runtime,
    useLore: false,
    useAuthoring: false,
  });
  const prompts = [
    'hello',
    'how are you?',
    'what can you tell me about bread?',
    'thanks',
    'do you remember my name?',
  ];

  const turns: EvalCaseTurn[] = [];
  for (const prompt of prompts) {
    turns.push(await runTurnWithTiming(session, prompt));
  }

  const durations = turns.map((turn) => turn.durationMs);
  const avgMs = mean(durations);
  const p95Ms = percentile(durations, 95);
  const thresholdMs = 120;
  const passed = p95Ms <= thresholdMs;
  const reason = passed ? null : `Expected p95 <= ${thresholdMs}ms, got ${p95Ms.toFixed(2)}ms.`;

  return {
    caseId,
    metricId: 'latencyPerformance',
    title: 'Latency/Performance',
    passed,
    score: passed ? 1 : 0,
    threshold: 1,
    reason,
    details: {
      avgMs: Number(avgMs.toFixed(2)),
      p95Ms: Number(p95Ms.toFixed(2)),
      thresholdMs,
    },
    transcript: {
      suite: 'smoke',
      caseId,
      metricId: 'latencyPerformance',
      createdAt: nowIso(),
      sessionOptions: {
        npc: 'baker',
        provider,
        runtime,
      },
      turns,
      reason,
      passed,
    },
  };
}

const SMOKE_CASE_RUNNERS: Record<
  string,
  (
    provider: 'local' | 'echo',
    runtime: 'auto' | 'mock' | 'llama',
    fixtures: SmokeFixtures,
  ) => Promise<EvalCaseResult>
> = {
  'smoke.lore-faithfulness': runSmokeLoreFaithfulnessCase,
  'smoke.memory-recall': async (provider, runtime) => runSmokeMemoryRecallCase(provider, runtime),
  'smoke.intent-safety': async (provider, runtime) => runSmokeIntentSafetyCase(provider, runtime),
  'smoke.beat-coverage': runSmokeBeatCoverageCase,
  'smoke.beat-completion': async (provider, runtime) => runSmokeBeatCompletionCase(provider, runtime),
  'smoke.latency-performance': async (provider, runtime) => runSmokeLatencyCase(provider, runtime),
};

function summarizeMetrics(results: EvalCaseResult[]): EvalMetricSummary[] {
  const byMetric = new Map<string, EvalCaseResult[]>();
  for (const result of results) {
    const metricCases = byMetric.get(result.metricId) ?? [];
    metricCases.push(result);
    byMetric.set(result.metricId, metricCases);
  }

  const summaries: EvalMetricSummary[] = [];
  for (const [metricId, cases] of byMetric.entries()) {
    const score = mean(cases.map((entry) => entry.score));
    const threshold = mean(cases.map((entry) => entry.threshold));
    const title = cases[0]?.title ?? metricId;
    summaries.push({
      metricId,
      title,
      score: Number(score.toFixed(4)),
      threshold: Number(threshold.toFixed(4)),
      passed: score >= threshold,
      caseIds: cases.map((entry) => entry.caseId),
    });
  }

  summaries.sort((a, b) => a.metricId.localeCompare(b.metricId));
  return summaries;
}

function buildReleaseGates(metricSummaries: EvalMetricSummary[]): EvalReleaseGate[] {
  return metricSummaries.map((summary) => ({
    gateId: `gate.metric.${summary.metricId}`,
    metricId: summary.metricId,
    title: summary.title,
    score: summary.score,
    threshold: summary.threshold,
    passed: summary.passed,
  }));
}

function writeCaseArtifacts(
  directories: EvalRunDirectories,
  caseResult: EvalCaseResult,
): { transcriptPath: string; failedArtifactPath?: string } {
  const transcriptPath = path.join(directories.transcriptsDir, `${caseResult.caseId}.json`);
  writeJson(transcriptPath, caseResult.transcript);

  if (!caseResult.passed) {
    const failedArtifactPath = path.join(directories.failedDir, `${caseResult.caseId}.json`);
    writeJson(failedArtifactPath, {
      ...caseResult.transcript,
      failureReason: caseResult.reason,
      details: caseResult.details,
    });
    return {
      transcriptPath,
      failedArtifactPath,
    };
  }

  return { transcriptPath };
}

async function runSmokeSuite(
  options: SugarAgentEvalRunnerOptions,
  directories: EvalRunDirectories,
): Promise<Record<string, unknown>> {
  const provider = toSafeProvider(options.provider);
  const runtime = toSafeRuntime(options.runtime);
  const fixtures = buildSmokeFixtures(directories.runDir);

  const caseOrder = [
    'smoke.lore-faithfulness',
    'smoke.memory-recall',
    'smoke.intent-safety',
    'smoke.beat-coverage',
    'smoke.beat-completion',
    'smoke.latency-performance',
  ];

  const caseResults: EvalCaseResult[] = [];
  const caseArtifacts: Array<{ caseId: string; transcriptPath: string; failedArtifactPath?: string }> = [];

  for (const caseId of caseOrder) {
    const runner = SMOKE_CASE_RUNNERS[caseId];
    if (!runner) continue;
    const result = await runner(provider, runtime, fixtures);
    caseResults.push(result);

    if (options.writeArtifacts !== false) {
      const artifact = writeCaseArtifacts(directories, result);
      caseArtifacts.push({
        caseId,
        ...artifact,
      });
    }
  }

  const metrics = summarizeMetrics(caseResults);
  const releaseGates = buildReleaseGates(metrics);
  const passedCases = caseResults.filter((entry) => entry.passed).length;
  const failedCases = caseResults.length - passedCases;
  const status = releaseGates.every((gate) => gate.passed) ? 'pass' : 'fail';

  const beatCoverageCase = caseResults.find((entry) => entry.metricId === 'beatCoverageAccuracy');
  const beatCompletionCase = caseResults.find((entry) => entry.metricId === 'beatCompletionPrecisionRecall');

  return {
    schemaVersion: 1,
    suite: 'smoke',
    generatedAt: nowIso(),
    status,
    provider,
    runtime,
    summary: {
      totalCases: caseResults.length,
      passedCases,
      failedCases,
    },
    metrics,
    releaseGates,
    beatEvaluation: {
      coverage: {
        caseId: beatCoverageCase?.caseId ?? null,
        passed: beatCoverageCase?.passed ?? false,
        coveredCount: beatCoverageCase?.details?.coveredCount ?? 0,
        uncoveredCount: beatCoverageCase?.details?.uncoveredCount ?? 0,
      },
      completion: {
        caseId: beatCompletionCase?.caseId ?? null,
        passed: beatCompletionCase?.passed ?? false,
        falseCompleteCount: beatCompletionCase?.details?.falseCompleteCount ?? 0,
        missedCompleteCount: beatCompletionCase?.details?.missedCompleteCount ?? 0,
      },
    },
    cases: caseResults.map((entry) => ({
      caseId: entry.caseId,
      metricId: entry.metricId,
      title: entry.title,
      passed: entry.passed,
      score: entry.score,
      threshold: entry.threshold,
      reason: entry.reason,
      details: entry.details,
    })),
    artifacts: {
      runDir: directories.runDir,
      reportPath: directories.reportPath,
      transcriptsDir: directories.transcriptsDir,
      failedDir: directories.failedDir,
      cases: caseArtifacts,
    },
  };
}

export async function runSugarAgentEval(options: SugarAgentEvalRunnerOptions = {}): Promise<Record<string, unknown>> {
  const suite = options.suite ?? 'smoke';
  if (suite !== 'smoke') {
    throw new Error(`Unsupported suite "${suite}". Supported suites: smoke`);
  }

  const directories = resolveRunDirectories(options);
  const report = await runSmokeSuite(options, directories);
  writeJson(directories.reportPath, report);
  return report;
}

export async function replaySugarAgentEvalTranscript(
  options: SugarAgentEvalReplayOptions,
): Promise<Record<string, unknown>> {
  const transcriptPath = path.resolve(options.transcriptPath);
  if (!fs.existsSync(transcriptPath)) {
    throw new Error(`Transcript file not found: ${transcriptPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(transcriptPath, 'utf8')) as {
    suite?: string;
    caseId?: string;
    passed?: boolean;
  };
  const caseId = typeof raw.caseId === 'string' ? raw.caseId : null;
  const suite = typeof raw.suite === 'string' ? raw.suite : 'smoke';
  if (!caseId) {
    throw new Error(`Transcript missing caseId: ${transcriptPath}`);
  }
  if (suite !== 'smoke') {
    throw new Error(`Unsupported transcript suite "${suite}" in ${transcriptPath}`);
  }

  const outputDir = resolveReplayOutputDir(options);
  const runner = SMOKE_CASE_RUNNERS[caseId];
  if (!runner) {
    throw new Error(`No replay runner found for caseId "${caseId}"`);
  }

  const fixtures = buildSmokeFixtures(outputDir);
  const provider = toSafeProvider(options.provider);
  const runtime = toSafeRuntime(options.runtime);
  const result = await runner(provider, runtime, fixtures);

  const replayReport = {
    schemaVersion: 1,
    mode: 'replay',
    generatedAt: nowIso(),
    transcriptPath,
    caseId,
    suite: 'smoke',
    provider,
    runtime,
    expectedPassed: raw.passed === true,
    replayPassed: result.passed,
    matchesExpectation: result.passed === (raw.passed === true),
    reason: result.reason,
    details: result.details,
  };

  const replayReportPath = path.join(outputDir, `replay-${caseId}.json`);
  writeJson(replayReportPath, replayReport);

  return {
    ...replayReport,
    artifactPath: replayReportPath,
  };
}
