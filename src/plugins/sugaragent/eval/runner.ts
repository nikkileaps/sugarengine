import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error -- runtime session bridge is authored in .mjs and intentionally treated as untyped at this boundary.
import { createSugarAgentSession } from '../session/runtime.mjs';
const PIPELINE_VERSION_V2 = 'v2';
const SUITE_VERSION_SMOKE = 'phase8-v1';

export type SugarAgentEvalSuiteId = 'smoke';
type EvalLayerId = 'atomic_factual_support' | 'rag_pipeline_quality' | 'human_regression';
type EvalConversationMode = 'character' | 'narrative' | 'hybrid' | 'unknown';
type EvalInitiativeAction = 'npc_initiate' | 'player_respond' | 'clarify' | 'abstain' | 'close' | 'unknown';

export interface SugarAgentEvalRunnerOptions {
  suite?: SugarAgentEvalSuiteId;
  outputDir?: string;
  provider?: 'local' | 'echo';
  runtime?: 'auto' | 'mock' | 'llama';
  deploymentTarget?: 'development' | 'production';
  rerankerBaselinePath?: string;
  rerankerCandidateClass?: 'heuristic' | 'learned';
  writeArtifacts?: boolean;
}

export interface SugarAgentEvalReplayOptions {
  transcriptPath: string;
  outputDir?: string;
  provider?: 'local' | 'echo';
  runtime?: 'auto' | 'mock' | 'llama';
  rerankerCandidateClass?: 'heuristic' | 'learned';
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
  grounding: Record<string, unknown> | null;
  groundingStats: Record<string, unknown> | null;
  routing: Record<string, unknown> | null;
  pipeline: Record<string, unknown> | null;
}

interface EvalCaseResult {
  caseId: string;
  metricId: string;
  title: string;
  layer: EvalLayerId;
  mode: EvalConversationMode;
  initiativeAction: EvalInitiativeAction;
  expectedMode?: EvalConversationMode;
  expectedInitiativeAction?: EvalInitiativeAction;
  humanLabeled?: boolean;
  diagnosticsCoverage: {
    hasMode: boolean;
    hasInitiative: boolean;
    hasRetrievalQualityPath: boolean;
    hasValidationDecision: boolean;
    fallbackReasonRequired: boolean;
    hasFallbackReason: boolean;
  };
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
  layer: EvalLayerId;
  score: number;
  threshold: number;
  passed: boolean;
  caseIds: string[];
}

interface EvalReleaseGate {
  gateId: string;
  gateType: 'metric' | 'layer' | 'mode' | 'initiative' | 'observability' | 'reranker_promotion';
  metricId?: string;
  layer?: EvalLayerId;
  mode?: EvalConversationMode;
  initiativeAction?: EvalInitiativeAction;
  title: string;
  score: number;
  threshold: number;
  passed: boolean;
  blocking: boolean;
  reason?: string;
}

interface EvalRerankerObservation {
  rerankerClass: 'heuristic' | 'learned' | 'unknown';
  modelVersion: string;
  artifactVersion: string;
  latencyMs: number;
}

interface EvalRerankerPromotionGate {
  gateId: string;
  requiredClass: 'learned';
  observedClasses: Array<'heuristic' | 'learned' | 'unknown'>;
  observedModelVersions: string[];
  observedArtifactVersions: string[];
  candidateScore: number;
  baselineScore: number | null;
  threshold: number;
  deploymentTarget: 'development' | 'production';
  passed: boolean;
  blocking: boolean;
  reason: string;
}

interface EvalRunDirectories {
  runDir: string;
  transcriptsDir: string;
  failedDir: string;
  reportPath: string;
}

let ACTIVE_EVAL_RERANKER_CLASS: 'heuristic' | 'learned' = 'heuristic';

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

function toSafeDeploymentTarget(value: unknown): 'development' | 'production' {
  return value === 'production' ? 'production' : 'development';
}

function toSafeRerankerCandidateClass(value: unknown): 'heuristic' | 'learned' {
  return value === 'learned' ? 'learned' : 'heuristic';
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function extractMode(turn: EvalCaseTurn | undefined): EvalConversationMode {
  const mode = asString(asRecord(turn?.pipeline)?.mode);
  if (mode === 'character' || mode === 'narrative' || mode === 'hybrid') {
    return mode;
  }
  return 'unknown';
}

function extractInitiativeAction(turn: EvalCaseTurn | undefined): EvalInitiativeAction {
  const pipeline = asRecord(turn?.pipeline);
  const initiative = asRecord(pipeline?.initiative);
  const decision = asRecord(initiative?.decision);
  const action = asString(decision?.action);
  if (action === 'npc_initiate' || action === 'player_respond' || action === 'clarify' || action === 'abstain' || action === 'close') {
    return action;
  }
  return 'unknown';
}

function extractValidationDecision(turn: EvalCaseTurn | undefined): string | null {
  const grounding = asRecord(turn?.grounding);
  const summary = asRecord(grounding?.summary);
  const decision = asString(summary?.decision);
  if (decision) return decision;
  if (turn?.usedFallback) return 'fallback';
  return null;
}

function extractUnsupportedClaimCount(turn: EvalCaseTurn | undefined): number {
  const grounding = asRecord(turn?.grounding);
  const summary = asRecord(grounding?.summary);
  const unsupported = asNumber(summary?.unsupportedCount);
  return unsupported ?? 0;
}

function extractSupportedClaimCount(turn: EvalCaseTurn | undefined): number {
  const grounding = asRecord(turn?.grounding);
  const summary = asRecord(grounding?.summary);
  const supported = asNumber(summary?.supportedCount);
  return supported ?? 0;
}

function extractRetrievalField(turn: EvalCaseTurn | undefined, field: string): unknown {
  const pipeline = asRecord(turn?.pipeline);
  const retrieval = asRecord(pipeline?.retrieval);
  return retrieval?.[field];
}

function extractFallbackReason(turn: EvalCaseTurn | undefined): string | null {
  const pipeline = asRecord(turn?.pipeline);
  return asString(pipeline?.fallbackReason);
}

function computeDiagnosticsCoverage(turn: EvalCaseTurn | undefined): EvalCaseResult['diagnosticsCoverage'] {
  const hasMode = extractMode(turn) !== 'unknown';
  const hasInitiative = extractInitiativeAction(turn) !== 'unknown';
  const qualityPath = asString(extractRetrievalField(turn, 'qualityPath'));
  const hasRetrievalQualityPath = Boolean(qualityPath);
  const hasValidationDecision = Boolean(extractValidationDecision(turn));
  const fallbackReasonRequired = Boolean(turn?.usedFallback);
  const hasFallbackReason = fallbackReasonRequired ? Boolean(extractFallbackReason(turn)) : true;
  return {
    hasMode,
    hasInitiative,
    hasRetrievalQualityPath,
    hasValidationDecision,
    fallbackReasonRequired,
    hasFallbackReason,
  };
}

function buildCaseResult(params: {
  caseId: string;
  metricId: string;
  title: string;
  layer: EvalLayerId;
  mode: EvalConversationMode;
  initiativeAction: EvalInitiativeAction;
  expectedMode?: EvalConversationMode;
  expectedInitiativeAction?: EvalInitiativeAction;
  humanLabeled?: boolean;
  passed: boolean;
  threshold?: number;
  reason?: string | null;
  details?: Record<string, unknown>;
  transcript: Record<string, unknown>;
  diagnosticsCoverage: EvalCaseResult['diagnosticsCoverage'];
}): EvalCaseResult {
  const threshold = Number.isFinite(params.threshold) ? Number(params.threshold) : 1;
  const score = params.passed ? 1 : 0;
  return {
    caseId: params.caseId,
    metricId: params.metricId,
    title: params.title,
    layer: params.layer,
    mode: params.mode,
    initiativeAction: params.initiativeAction,
    expectedMode: params.expectedMode,
    expectedInitiativeAction: params.expectedInitiativeAction,
    humanLabeled: params.humanLabeled === true,
    diagnosticsCoverage: params.diagnosticsCoverage,
    passed: params.passed,
    score,
    threshold,
    reason: params.reason ?? null,
    details: params.details ?? {},
    transcript: params.transcript,
  };
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
      files: 3,
      chunks: 3,
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
    {
      chunkId: 'lore.npcs.baker#background',
      pageId: 'lore.npcs.baker',
      title: 'Baker',
      canonLevel: 'hard',
      sourceFile: 'npcs/baker.md',
      sourceRepo: 'eval-fixture',
      sourceCommit: 'smoke',
      sourceRef: 'refs/eval/smoke',
      sectionHeading: 'Background',
      content: 'Baker grew up near the market ovens and apprenticed as a child.',
      summary: 'Baker grew up near the market ovens and apprenticed as a child.',
      tokens: [
        'baker',
        'background',
        'market',
        'ovens',
        'apprenticed',
      ],
      metadata: {
        id: 'lore.npcs.baker',
        title: 'Baker',
        canon_level: 'hard',
        entity_ids: ['npc.baker'],
        location_ids: ['locations.rackwick_city'],
        faction_ids: [],
        time_period: 'modern',
        tags: ['baker', 'npc'],
        beat_ids: [],
      },
    },
    {
      chunkId: 'lore.npcs.rowan#background',
      pageId: 'lore.npcs.rowan',
      title: 'Rowan',
      canonLevel: 'hard',
      sourceFile: 'npcs/rowan.md',
      sourceRepo: 'eval-fixture',
      sourceCommit: 'smoke',
      sourceRef: 'refs/eval/smoke',
      sectionHeading: 'Background',
      content: 'Captain Rowan trained with the city watch before joining command.',
      summary: 'Captain Rowan trained with the city watch before joining command.',
      tokens: [
        'rowan',
        'background',
        'captain',
        'watch',
        'command',
      ],
      metadata: {
        id: 'lore.npcs.rowan',
        title: 'Rowan',
        canon_level: 'hard',
        entity_ids: ['npc.rowan'],
        location_ids: ['locations.rackwick_city'],
        faction_ids: [],
        time_period: 'modern',
        tags: ['rowan', 'captain', 'npc'],
        beat_ids: [],
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
        loreScopes: [
          'history.events.creation_of_rackwick_city',
          'npcs.baker',
          'npcs.rowan',
        ],
        selfEntityId: 'npc.baker',
        selfLoreScopes: ['npcs.baker'],
        relatedLoreScopes: ['npcs.rowan'],
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
    grounding: turn.grounding && typeof turn.grounding === 'object'
      ? turn.grounding as Record<string, unknown>
      : null,
    groundingStats: turn.groundingStats && typeof turn.groundingStats === 'object'
      ? turn.groundingStats as Record<string, unknown>
      : null,
    routing: turn.routing && typeof turn.routing === 'object'
      ? turn.routing as Record<string, unknown>
      : null,
    pipeline: turn.pipeline && typeof turn.pipeline === 'object'
      ? turn.pipeline as Record<string, unknown>
      : null,
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
    rerankerClass: ACTIVE_EVAL_RERANKER_CLASS,
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
  const retrievalAttempted = extractRetrievalField(first, 'attempted') === true;
  const retrievalQualityPath = asString(extractRetrievalField(first, 'qualityPath')) ?? 'unknown';
  const passed = hasCitations && intent === 'answer_lore' && retrievalAttempted;
  const reason = passed ? null : 'Expected lore-grounded answer with citations.';
  const mode = extractMode(first);
  const initiativeAction = extractInitiativeAction(first);
  const diagnosticsCoverage = computeDiagnosticsCoverage(first);

  return buildCaseResult({
    caseId,
    metricId: 'ragFaithfulness',
    title: 'RAG Faithfulness',
    layer: 'rag_pipeline_quality',
    mode,
    initiativeAction,
    expectedMode: 'character',
    expectedInitiativeAction: 'player_respond',
    passed,
    reason,
    diagnosticsCoverage,
    details: {
      hasCitations,
      intent,
      citationCount: first?.citations?.length ?? 0,
      retrievalAttempted,
      retrievalQualityPath,
    },
    transcript: {
      suite: 'smoke',
      suiteVersion: SUITE_VERSION_SMOKE,
      caseId,
      metricId: 'ragFaithfulness',
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
  });
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
    rerankerClass: ACTIVE_EVAL_RERANKER_CLASS,
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
  const mode = extractMode(turns[1] ?? turns[0]);
  const initiativeAction = extractInitiativeAction(turns[1] ?? turns[0]);
  const diagnosticsCoverage = computeDiagnosticsCoverage(turns[1] ?? turns[0]);

  return buildCaseResult({
    caseId,
    metricId: 'memoryRecall',
    title: 'Memory Recall',
    layer: 'human_regression',
    mode,
    initiativeAction,
    expectedMode: 'character',
    humanLabeled: true,
    passed,
    reason,
    diagnosticsCoverage,
    details: {
      rememberedFactsPersisted,
      rememberedFactCount: facts.length,
      secondTurnUsedFallback,
    },
    transcript: {
      suite: 'smoke',
      suiteVersion: SUITE_VERSION_SMOKE,
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
  });
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
    rerankerClass: ACTIVE_EVAL_RERANKER_CLASS,
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
  const mode = extractMode(turns[0]);
  const initiativeAction = extractInitiativeAction(turns[0]);
  const diagnosticsCoverage = computeDiagnosticsCoverage(turns[0]);

  return buildCaseResult({
    caseId,
    metricId: 'intentSafety',
    title: 'Intent Safety',
    layer: 'human_regression',
    mode,
    initiativeAction,
    expectedMode: 'narrative',
    humanLabeled: true,
    passed,
    reason,
    diagnosticsCoverage,
    details: {
      rejectedUnsafeIntent,
      executedSafeIntent,
      rejectedLine,
      executedLine,
    },
    transcript: {
      suite: 'smoke',
      suiteVersion: SUITE_VERSION_SMOKE,
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
  });
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
    rerankerClass: ACTIVE_EVAL_RERANKER_CLASS,
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
  const mode = extractMode(turns[0]);
  const initiativeAction = extractInitiativeAction(turns[0]);
  const diagnosticsCoverage = computeDiagnosticsCoverage(turns[0]);

  return buildCaseResult({
    caseId,
    metricId: 'beatCoverageAccuracy',
    title: 'Beat Coverage Accuracy',
    layer: 'human_regression',
    mode,
    initiativeAction,
    expectedMode: 'narrative',
    humanLabeled: true,
    passed,
    reason,
    diagnosticsCoverage,
    details: {
      coveredCount,
      uncoveredCount,
    },
    transcript: {
      suite: 'smoke',
      suiteVersion: SUITE_VERSION_SMOKE,
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
  });
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
    rerankerClass: ACTIVE_EVAL_RERANKER_CLASS,
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
  const mode = extractMode(turns[1] ?? turns[0]);
  const initiativeAction = extractInitiativeAction(turns[1] ?? turns[0]);
  const diagnosticsCoverage = computeDiagnosticsCoverage(turns[1] ?? turns[0]);

  return buildCaseResult({
    caseId,
    metricId: 'beatCompletionPrecisionRecall',
    title: 'Beat Completion Precision/Recall',
    layer: 'human_regression',
    mode,
    initiativeAction,
    expectedMode: 'narrative',
    humanLabeled: true,
    passed,
    reason,
    diagnosticsCoverage,
    details: {
      falseCompleteCount,
      missedCompleteCount,
      firstCompleted,
      secondCompleted,
    },
    transcript: {
      suite: 'smoke',
      suiteVersion: SUITE_VERSION_SMOKE,
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
  });
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
    rerankerClass: ACTIVE_EVAL_RERANKER_CLASS,
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
  const lastTurn = turns[turns.length - 1];
  const mode = extractMode(lastTurn);
  const initiativeAction = extractInitiativeAction(lastTurn);
  const diagnosticsCoverage = computeDiagnosticsCoverage(lastTurn);

  return buildCaseResult({
    caseId,
    metricId: 'latencyPerformance',
    title: 'Latency/Performance',
    layer: 'rag_pipeline_quality',
    mode,
    initiativeAction,
    expectedMode: 'character',
    passed,
    reason,
    diagnosticsCoverage,
    details: {
      avgMs: Number(avgMs.toFixed(2)),
      p95Ms: Number(p95Ms.toFixed(2)),
      thresholdMs,
    },
    transcript: {
      suite: 'smoke',
      suiteVersion: SUITE_VERSION_SMOKE,
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
  });
}

async function runSmokeIdentityConsistencyCase(
  provider: 'local' | 'echo',
  runtime: 'auto' | 'mock' | 'llama',
  fixtures: SmokeFixtures,
): Promise<EvalCaseResult> {
  const caseId = 'smoke.identity-consistency';
  const session = await createSugarAgentSession({
    npc: 'baker',
    provider,
    runtime,
    rerankerClass: ACTIVE_EVAL_RERANKER_CLASS,
    useLore: true,
    loreDir: fixtures.loreDir,
    useAuthoring: true,
    authoringBundlePath: fixtures.authoringBundlePath,
  });

  const turns = [
    await runTurnWithTiming(session, 'tell me about your background as a baker'),
  ];
  const utterance = String(turns[0]?.output?.utterance ?? '');
  const lower = utterance.toLowerCase();
  const mentionsSelf = lower.includes('market ovens') || lower.includes('apprenticed');
  const mentionsForeign = lower.includes('captain rowan');
  const passed = mentionsSelf && !mentionsForeign;
  const reason = passed ? null : 'Expected self-query answer grounded in baker self evidence without cross-entity contamination.';
  const mode = extractMode(turns[0]);
  const initiativeAction = extractInitiativeAction(turns[0]);
  const diagnosticsCoverage = computeDiagnosticsCoverage(turns[0]);

  return buildCaseResult({
    caseId,
    metricId: 'identityConsistency',
    title: 'Identity Consistency',
    layer: 'human_regression',
    mode,
    initiativeAction,
    expectedMode: 'character',
    humanLabeled: true,
    passed,
    reason,
    diagnosticsCoverage,
    details: {
      utterance,
      mentionsSelf,
      mentionsForeign,
    },
    transcript: {
      suite: 'smoke',
      suiteVersion: SUITE_VERSION_SMOKE,
      caseId,
      metricId: 'identityConsistency',
      createdAt: nowIso(),
      sessionOptions: {
        npc: 'baker',
        provider,
        runtime,
        useLore: true,
        useAuthoring: true,
      },
      turns,
      reason,
      passed,
    },
  });
}

async function runSmokeOwnershipAttributionCase(
  provider: 'local' | 'echo',
  runtime: 'auto' | 'mock' | 'llama',
  fixtures: SmokeFixtures,
): Promise<EvalCaseResult> {
  const caseId = 'smoke.ownership-attribution';
  const sessionId = sanitizeSessionId(`eval-ownership-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const session = await createSugarAgentSession({
    npc: 'baker',
    provider,
    runtime,
    rerankerClass: ACTIVE_EVAL_RERANKER_CLASS,
    useLore: true,
    loreDir: fixtures.loreDir,
    useAuthoring: true,
    authoringBundlePath: fixtures.authoringBundlePath,
    session: sessionId,
    resetSession: sessionId,
  });

  const turns = [
    await runTurnWithTiming(session, 'hello'),
    await runTurnWithTiming(session, 'do you remember me?'),
  ];

  const secondUtterance = String(turns[1]?.output?.utterance ?? '');
  const lower = secondUtterance.toLowerCase();
  const hasHallucinatedOwnership = lower.includes('your photo collection')
    || lower.includes('your hobbies')
    || lower.includes('your collection');
  const pipelineVersion = typeof turns[1]?.pipeline?.version === 'string'
    ? String(turns[1]?.pipeline?.version)
    : 'unknown';
  const passed = pipelineVersion === 'v2' && !hasHallucinatedOwnership;
  const reason = passed
    ? null
    : 'Expected V2 ownership-aware memory response without attributing NPC lore/hobbies to the player.';
  const mode = extractMode(turns[1] ?? turns[0]);
  const initiativeAction = extractInitiativeAction(turns[1] ?? turns[0]);
  const diagnosticsCoverage = computeDiagnosticsCoverage(turns[1] ?? turns[0]);

  return buildCaseResult({
    caseId,
    metricId: 'ownershipAttributionSafety',
    title: 'Ownership Attribution Safety',
    layer: 'atomic_factual_support',
    mode,
    initiativeAction,
    expectedMode: 'character',
    passed,
    reason,
    diagnosticsCoverage,
    details: {
      pipelineVersion,
      secondUtterance,
      hasHallucinatedOwnership,
    },
    transcript: {
      suite: 'smoke',
      suiteVersion: SUITE_VERSION_SMOKE,
      caseId,
      metricId: 'ownershipAttributionSafety',
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
  });
}

async function runSmokeAtomicFactualSupportCase(
  provider: 'local' | 'echo',
  runtime: 'auto' | 'mock' | 'llama',
  fixtures: SmokeFixtures,
): Promise<EvalCaseResult> {
  const caseId = 'smoke.atomic-factual-support';
  const session = await createSugarAgentSession({
    npc: 'baker',
    provider,
    runtime,
    rerankerClass: ACTIVE_EVAL_RERANKER_CLASS,
    useLore: true,
    loreDir: fixtures.loreDir,
    useAuthoring: false,
  });

  const turns = [
    await runTurnWithTiming(session, 'what do you know about the creation of rackwick city and the dragon?'),
  ];
  const first = turns[0];
  const supportedClaims = extractSupportedClaimCount(first);
  const unsupportedClaims = extractUnsupportedClaimCount(first);
  const validationDecision = extractValidationDecision(first) ?? 'unknown';
  const citationCount = first?.citations?.length ?? 0;
  const passed = supportedClaims >= 1 && unsupportedClaims === 0 && validationDecision === 'accept' && citationCount >= 1;
  const reason = passed
    ? null
    : `Expected supported grounded claims with zero unsupported claims (supported=${supportedClaims}, unsupported=${unsupportedClaims}, decision=${validationDecision}).`;
  const mode = extractMode(first);
  const initiativeAction = extractInitiativeAction(first);
  const diagnosticsCoverage = computeDiagnosticsCoverage(first);

  return buildCaseResult({
    caseId,
    metricId: 'atomicFactualSupport',
    title: 'Atomic Factual Support',
    layer: 'atomic_factual_support',
    mode,
    initiativeAction,
    expectedMode: 'character',
    passed,
    reason,
    diagnosticsCoverage,
    details: {
      supportedClaims,
      unsupportedClaims,
      validationDecision,
      citationCount,
    },
    transcript: {
      suite: 'smoke',
      suiteVersion: SUITE_VERSION_SMOKE,
      caseId,
      metricId: 'atomicFactualSupport',
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
  });
}

async function runSmokeRetrievalGovernanceCase(
  provider: 'local' | 'echo',
  runtime: 'auto' | 'mock' | 'llama',
): Promise<EvalCaseResult> {
  const caseId = 'smoke.retrieval-governance';
  const session = await createSugarAgentSession({
    npc: 'guard',
    provider,
    runtime,
    rerankerClass: ACTIVE_EVAL_RERANKER_CLASS,
    useLore: false,
    scenario: 'beat-guard-alert',
  });

  const turns = [
    await runTurnWithTiming(session, 'what is happening at the gate?'),
  ];
  const first = turns[0];
  const qualityPath = asString(extractRetrievalField(first, 'qualityPath')) ?? 'unknown';
  const correctiveAttempted = extractRetrievalField(first, 'correctiveAttempted') === true
    || qualityPath.startsWith('corrective_');
  const qualityGatePassed = extractRetrievalField(first, 'qualityGatePassed') === true;
  const initiativeAction = extractInitiativeAction(first);
  const passed = correctiveAttempted
    && qualityPath === 'corrective_fail'
    && !qualityGatePassed
    && (initiativeAction === 'abstain' || initiativeAction === 'clarify');
  const reason = passed
    ? null
    : `Expected bounded corrective retrieval failure path with abstain/clarify behavior (path=${qualityPath}, corrective=${correctiveAttempted}, gatePassed=${qualityGatePassed}, action=${initiativeAction}).`;
  const mode = extractMode(first);
  const diagnosticsCoverage = computeDiagnosticsCoverage(first);

  return buildCaseResult({
    caseId,
    metricId: 'ragRetrievalGovernance',
    title: 'RAG Retrieval Governance',
    layer: 'rag_pipeline_quality',
    mode,
    initiativeAction,
    expectedMode: 'narrative',
    expectedInitiativeAction: 'abstain',
    passed,
    reason,
    diagnosticsCoverage,
    details: {
      qualityPath,
      correctiveAttempted,
      qualityGatePassed,
      initiativeAction,
    },
    transcript: {
      suite: 'smoke',
      suiteVersion: SUITE_VERSION_SMOKE,
      caseId,
      metricId: 'ragRetrievalGovernance',
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
  });
}

async function runSmokeMixedInitiativeOpenerCase(
  provider: 'local' | 'echo',
  runtime: 'auto' | 'mock' | 'llama',
): Promise<EvalCaseResult> {
  const caseId = 'smoke.mixed-initiative-opener';
  const session = await createSugarAgentSession({
    npc: 'guard',
    provider,
    runtime,
    rerankerClass: ACTIVE_EVAL_RERANKER_CLASS,
    useLore: false,
    scenario: 'beat-guard-alert',
  });

  const turns = [
    await runTurnWithTiming(session, 'hello'),
  ];
  const first = turns[0];
  const initiativeAction = extractInitiativeAction(first);
  const primaryGoal = asString(asRecord(asRecord(asRecord(first?.pipeline)?.initiative)?.decision)?.primaryGoal);
  const passed = initiativeAction === 'npc_initiate';
  const reason = passed
    ? null
    : `Expected mixed-initiative narrative opener (action=npc_initiate), got ${initiativeAction}.`;
  const mode = extractMode(first);
  const diagnosticsCoverage = computeDiagnosticsCoverage(first);

  return buildCaseResult({
    caseId,
    metricId: 'mixedInitiativeQuality',
    title: 'Mixed-Initiative Quality',
    layer: 'human_regression',
    mode,
    initiativeAction,
    expectedMode: 'narrative',
    expectedInitiativeAction: 'npc_initiate',
    humanLabeled: true,
    passed,
    reason,
    diagnosticsCoverage,
    details: {
      initiativeAction,
      primaryGoal,
    },
    transcript: {
      suite: 'smoke',
      suiteVersion: SUITE_VERSION_SMOKE,
      caseId,
      metricId: 'mixedInitiativeQuality',
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
  });
}

async function runSmokeCharacterExhaustionCase(
  provider: 'local' | 'echo',
  runtime: 'auto' | 'mock' | 'llama',
): Promise<EvalCaseResult> {
  const caseId = 'smoke.character-exhaustion-close';
  const session = await createSugarAgentSession({
    npc: 'baker',
    provider,
    runtime,
    rerankerClass: ACTIVE_EVAL_RERANKER_CLASS,
    useLore: false,
    useAuthoring: false,
  });

  const prompts = [
    'tell me about coffee',
    'what about coffee',
    'i want coffee',
    'i love coffee',
  ];
  const turns: EvalCaseTurn[] = [];
  for (const prompt of prompts) {
    turns.push(await runTurnWithTiming(session, prompt));
  }

  const closeTurn = turns.find((turn) => extractInitiativeAction(turn) === 'close');
  const closeUtterance = String(closeTurn?.output?.utterance ?? '');
  const closeLower = closeUtterance.toLowerCase();
  const gracefulClose = closeLower.includes('goodbye')
    || closeLower.includes('pick this up again')
    || closeLower.includes('covered');
  const passed = Boolean(closeTurn) && gracefulClose;
  const reason = passed
    ? null
    : 'Expected character-mode novelty exhaustion to trigger close with graceful language.';
  const mode = extractMode(closeTurn ?? turns[turns.length - 1]);
  const initiativeAction = extractInitiativeAction(closeTurn ?? turns[turns.length - 1]);
  const diagnosticsCoverage = computeDiagnosticsCoverage(closeTurn ?? turns[turns.length - 1]);

  return buildCaseResult({
    caseId,
    metricId: 'characterExhaustionQuality',
    title: 'Character Exhaustion Quality',
    layer: 'human_regression',
    mode,
    initiativeAction,
    expectedMode: 'character',
    expectedInitiativeAction: 'close',
    humanLabeled: true,
    passed,
    reason,
    diagnosticsCoverage,
    details: {
      closeDetected: Boolean(closeTurn),
      closeUtterance,
      gracefulClose,
      turnCount: turns.length,
    },
    transcript: {
      suite: 'smoke',
      suiteVersion: SUITE_VERSION_SMOKE,
      caseId,
      metricId: 'characterExhaustionQuality',
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
  });
}

async function runSmokeClarifyBehaviorCase(
  provider: 'local' | 'echo',
  runtime: 'auto' | 'mock' | 'llama',
): Promise<EvalCaseResult> {
  const caseId = 'smoke.clarify-behavior';
  const session = await createSugarAgentSession({
    npc: 'baker',
    provider,
    runtime,
    rerankerClass: ACTIVE_EVAL_RERANKER_CLASS,
    useLore: false,
    useAuthoring: false,
  });

  const turns = [
    await runTurnWithTiming(session, '???'),
  ];
  const first = turns[0];
  const initiativeAction = extractInitiativeAction(first);
  const utterance = String(first?.output?.utterance ?? '');
  const passed = initiativeAction === 'clarify' && /\bclarify\b|\bwhat you want to know\b/i.test(utterance);
  const reason = passed
    ? null
    : `Expected unclear intent to route to clarify action; got action=${initiativeAction}.`;
  const mode = extractMode(first);
  const diagnosticsCoverage = computeDiagnosticsCoverage(first);

  return buildCaseResult({
    caseId,
    metricId: 'clarifyBehavior',
    title: 'Clarify Behavior',
    layer: 'human_regression',
    mode,
    initiativeAction,
    expectedMode: 'character',
    expectedInitiativeAction: 'clarify',
    humanLabeled: true,
    passed,
    reason,
    diagnosticsCoverage,
    details: {
      initiativeAction,
      utterance,
    },
    transcript: {
      suite: 'smoke',
      suiteVersion: SUITE_VERSION_SMOKE,
      caseId,
      metricId: 'clarifyBehavior',
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
  });
}

const SMOKE_CASE_RUNNERS: Record<
  string,
  (
    provider: 'local' | 'echo',
    runtime: 'auto' | 'mock' | 'llama',
    fixtures: SmokeFixtures,
  ) => Promise<EvalCaseResult>
> = {
  'smoke.atomic-factual-support': runSmokeAtomicFactualSupportCase,
  'smoke.lore-faithfulness': runSmokeLoreFaithfulnessCase,
  'smoke.retrieval-governance': async (provider, runtime) => runSmokeRetrievalGovernanceCase(provider, runtime),
  'smoke.memory-recall': async (provider, runtime) => runSmokeMemoryRecallCase(provider, runtime),
  'smoke.intent-safety': async (provider, runtime) => runSmokeIntentSafetyCase(provider, runtime),
  'smoke.mixed-initiative-opener': async (provider, runtime) => runSmokeMixedInitiativeOpenerCase(provider, runtime),
  'smoke.character-exhaustion-close': async (provider, runtime) => runSmokeCharacterExhaustionCase(provider, runtime),
  'smoke.clarify-behavior': async (provider, runtime) => runSmokeClarifyBehaviorCase(provider, runtime),
  'smoke.beat-coverage': runSmokeBeatCoverageCase,
  'smoke.beat-completion': async (provider, runtime) => runSmokeBeatCompletionCase(provider, runtime),
  'smoke.latency-performance': async (provider, runtime) => runSmokeLatencyCase(provider, runtime),
  'smoke.identity-consistency': runSmokeIdentityConsistencyCase,
  'smoke.ownership-attribution': runSmokeOwnershipAttributionCase,
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
    const layer = cases[0]?.layer ?? 'human_regression';
    summaries.push({
      metricId,
      title,
      layer,
      score: Number(score.toFixed(4)),
      threshold: Number(threshold.toFixed(4)),
      passed: score >= threshold,
      caseIds: cases.map((entry) => entry.caseId),
    });
  }

  summaries.sort((a, b) => a.metricId.localeCompare(b.metricId));
  return summaries;
}

function buildMetricGates(metricSummaries: EvalMetricSummary[]): EvalReleaseGate[] {
  return metricSummaries.map((summary) => ({
    gateId: `gate.metric.${summary.metricId}`,
    gateType: 'metric',
    metricId: summary.metricId,
    layer: summary.layer,
    title: summary.title,
    score: summary.score,
    threshold: summary.threshold,
    passed: summary.passed,
    blocking: true,
  }));
}

function buildLayerGates(metricSummaries: EvalMetricSummary[]): EvalReleaseGate[] {
  const byLayer = new Map<EvalLayerId, EvalMetricSummary[]>();
  for (const summary of metricSummaries) {
    const entries = byLayer.get(summary.layer) ?? [];
    entries.push(summary);
    byLayer.set(summary.layer, entries);
  }

  const gates: EvalReleaseGate[] = [];
  for (const [layer, entries] of byLayer.entries()) {
    const score = Number(mean(entries.map((entry) => entry.score)).toFixed(4));
    const threshold = Number(mean(entries.map((entry) => entry.threshold)).toFixed(4));
    gates.push({
      gateId: `gate.layer.${layer}`,
      gateType: 'layer',
      layer,
      title: `Layer: ${layer}`,
      score,
      threshold,
      passed: score >= threshold,
      blocking: true,
      reason: `metrics=${entries.map((entry) => entry.metricId).join(',')}`,
    });
  }

  return gates.sort((a, b) => a.gateId.localeCompare(b.gateId));
}

function buildModeGates(caseResults: EvalCaseResult[]): EvalReleaseGate[] {
  const byMode = new Map<EvalConversationMode, EvalCaseResult[]>();
  for (const result of caseResults) {
    if (result.expectedMode === undefined) continue;
    const mode = result.expectedMode;
    if (mode === 'unknown') continue;
    const entries = byMode.get(mode) ?? [];
    entries.push(result);
    byMode.set(mode, entries);
  }

  const gates: EvalReleaseGate[] = [];
  for (const [mode, entries] of byMode.entries()) {
    const score = Number(mean(entries.map((entry) => (entry.mode === mode ? 1 : 0))).toFixed(4));
    gates.push({
      gateId: `gate.mode.${mode}`,
      gateType: 'mode',
      mode,
      title: `Mode: ${mode}`,
      score,
      threshold: 1,
      passed: score >= 1,
      blocking: true,
      reason: `cases=${entries.map((entry) => entry.caseId).join(',')}`,
    });
  }
  return gates.sort((a, b) => a.gateId.localeCompare(b.gateId));
}

function buildInitiativeGates(caseResults: EvalCaseResult[]): EvalReleaseGate[] {
  const byAction = new Map<EvalInitiativeAction, EvalCaseResult[]>();
  for (const result of caseResults) {
    if (result.expectedInitiativeAction === undefined) continue;
    const action = result.expectedInitiativeAction;
    if (action === 'unknown') continue;
    const entries = byAction.get(action) ?? [];
    entries.push(result);
    byAction.set(action, entries);
  }

  const gates: EvalReleaseGate[] = [];
  for (const [initiativeAction, entries] of byAction.entries()) {
    const score = Number(mean(entries.map((entry) => (entry.initiativeAction === initiativeAction ? 1 : 0))).toFixed(4));
    gates.push({
      gateId: `gate.initiative.${initiativeAction}`,
      gateType: 'initiative',
      initiativeAction,
      title: `Initiative: ${initiativeAction}`,
      score,
      threshold: 1,
      passed: score >= 1,
      blocking: true,
      reason: `cases=${entries.map((entry) => entry.caseId).join(',')}`,
    });
  }
  return gates.sort((a, b) => a.gateId.localeCompare(b.gateId));
}

function buildObservabilityGate(caseResults: EvalCaseResult[]): EvalReleaseGate {
  let checks = 0;
  let passed = 0;
  for (const result of caseResults) {
    const coverage = result.diagnosticsCoverage;
    const values = [
      coverage.hasMode,
      coverage.hasInitiative,
      coverage.hasRetrievalQualityPath,
      coverage.hasValidationDecision,
      coverage.hasFallbackReason,
    ];
    checks += values.length;
    passed += values.filter(Boolean).length;
  }
  const score = checks > 0 ? Number((passed / checks).toFixed(4)) : 0;
  return {
    gateId: 'gate.observability.contract',
    gateType: 'observability',
    title: 'Observability Contract Coverage',
    score,
    threshold: 1,
    passed: score >= 1,
    blocking: true,
  };
}

function inferRerankerClass(entry: Record<string, unknown> | null): 'heuristic' | 'learned' | 'unknown' {
  const explicit = asString(entry?.class);
  if (explicit === 'heuristic' || explicit === 'learned') {
    return explicit;
  }
  const modelVersion = asString(entry?.modelVersion) ?? '';
  if (modelVersion.toLowerCase().includes('cross-encoder') || modelVersion.toLowerCase().includes('rerank') || modelVersion.toLowerCase().includes('learned')) {
    return 'learned';
  }
  if (modelVersion.length > 0) {
    return 'heuristic';
  }
  return 'unknown';
}

function collectRerankerObservations(caseResults: EvalCaseResult[]): EvalRerankerObservation[] {
  const observations: EvalRerankerObservation[] = [];
  for (const result of caseResults) {
    const transcriptRecord = asRecord(result.transcript);
    const turns = Array.isArray(transcriptRecord?.turns) ? transcriptRecord.turns : [];
    for (const turn of turns) {
      const pipeline = asRecord(asRecord(turn)?.pipeline);
      const retrieval = asRecord(pipeline?.retrieval);
      const reranker = asRecord(retrieval?.reranker);
      if (!reranker) continue;
      observations.push({
        rerankerClass: inferRerankerClass(reranker),
        modelVersion: asString(reranker.modelVersion) ?? 'unknown-model',
        artifactVersion: asString(reranker.artifactVersion) ?? 'unknown-artifact',
        latencyMs: asNumber(reranker.latencyMs) ?? 0,
      });
    }
  }
  return observations;
}

function readBaselineScore(filePath: string | undefined | null): number | null {
  if (!filePath) return null;
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Reranker baseline file not found: ${absolute}`);
  }
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8')) as Record<string, unknown>;
  const direct = asNumber(parsed.retrievalRelevanceScore);
  if (direct !== null) return Number(direct.toFixed(4));
  const nested = asRecord(parsed.rerankerBaseline);
  const nestedScore = asNumber(nested?.retrievalRelevanceScore);
  if (nestedScore !== null) return Number(nestedScore.toFixed(4));
  throw new Error(`Reranker baseline file missing retrievalRelevanceScore: ${absolute}`);
}

function buildRerankerPromotionGate(options: {
  caseResults: EvalCaseResult[];
  metricSummaries: EvalMetricSummary[];
  deploymentTarget: 'development' | 'production';
  rerankerBaselinePath?: string;
  overrideCandidateClass?: 'heuristic' | 'learned';
}): EvalRerankerPromotionGate {
  const observations = collectRerankerObservations(options.caseResults);
  const ragMetrics = options.metricSummaries.filter((entry) => entry.layer === 'rag_pipeline_quality');
  const candidateScore = Number(mean(ragMetrics.map((entry) => entry.score)).toFixed(4));
  const observedClassesRaw = observations.map((entry) => entry.rerankerClass);
  const overrideClass = options.overrideCandidateClass;
  const observedClasses = Array.from(new Set(
    overrideClass ? [overrideClass] : (observedClassesRaw.length > 0 ? observedClassesRaw : ['unknown']),
  )) as Array<'heuristic' | 'learned' | 'unknown'>;
  const observedModelVersions = Array.from(new Set(observations.map((entry) => entry.modelVersion))).sort((a, b) => a.localeCompare(b));
  const observedArtifactVersions = Array.from(new Set(observations.map((entry) => entry.artifactVersion))).sort((a, b) => a.localeCompare(b));
  const baselineScore = readBaselineScore(options.rerankerBaselinePath);

  if (options.deploymentTarget !== 'production') {
    return {
      gateId: 'gate.reranker.promotion',
      requiredClass: 'learned',
      observedClasses,
      observedModelVersions,
      observedArtifactVersions,
      candidateScore,
      baselineScore,
      threshold: baselineScore ?? 0,
      deploymentTarget: options.deploymentTarget,
      passed: true,
      blocking: false,
      reason: 'non-production target',
    };
  }

  const learnedOnly = observedClasses.length > 0
    && observedClasses.every((entry) => entry === 'learned');
  if (!learnedOnly) {
    return {
      gateId: 'gate.reranker.promotion',
      requiredClass: 'learned',
      observedClasses,
      observedModelVersions,
      observedArtifactVersions,
      candidateScore,
      baselineScore,
      threshold: baselineScore ?? 0,
      deploymentTarget: options.deploymentTarget,
      passed: false,
      blocking: true,
      reason: 'observed reranker class is not learned-only',
    };
  }

  if (baselineScore === null) {
    return {
      gateId: 'gate.reranker.promotion',
      requiredClass: 'learned',
      observedClasses,
      observedModelVersions,
      observedArtifactVersions,
      candidateScore,
      baselineScore,
      threshold: 0,
      deploymentTarget: options.deploymentTarget,
      passed: false,
      blocking: true,
      reason: 'missing baseline score for production reranker promotion',
    };
  }

  const passed = candidateScore >= baselineScore;
  return {
    gateId: 'gate.reranker.promotion',
    requiredClass: 'learned',
    observedClasses,
    observedModelVersions,
    observedArtifactVersions,
    candidateScore,
    baselineScore,
    threshold: baselineScore,
    deploymentTarget: options.deploymentTarget,
    passed,
    blocking: true,
    reason: passed ? 'candidate meets baseline' : 'candidate below baseline',
  };
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
  const deploymentTarget = toSafeDeploymentTarget(options.deploymentTarget);
  ACTIVE_EVAL_RERANKER_CLASS = toSafeRerankerCandidateClass(options.rerankerCandidateClass);
  const fixtures = buildSmokeFixtures(directories.runDir);

  const caseOrder = [
    'smoke.atomic-factual-support',
    'smoke.lore-faithfulness',
    'smoke.retrieval-governance',
    'smoke.identity-consistency',
    'smoke.ownership-attribution',
    'smoke.memory-recall',
    'smoke.intent-safety',
    'smoke.mixed-initiative-opener',
    'smoke.character-exhaustion-close',
    'smoke.clarify-behavior',
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
  const metricGates = buildMetricGates(metrics);
  const layerGates = buildLayerGates(metrics);
  const modeGates = buildModeGates(caseResults);
  const initiativeGates = buildInitiativeGates(caseResults);
  const observabilityGate = buildObservabilityGate(caseResults);
  const rerankerPromotion = buildRerankerPromotionGate({
    caseResults,
    metricSummaries: metrics,
    deploymentTarget,
    rerankerBaselinePath: options.rerankerBaselinePath,
    overrideCandidateClass: ACTIVE_EVAL_RERANKER_CLASS,
  });
  const rerankerGate: EvalReleaseGate = {
    gateId: rerankerPromotion.gateId,
    gateType: 'reranker_promotion',
    title: 'Reranker Promotion',
    score: rerankerPromotion.candidateScore,
    threshold: rerankerPromotion.threshold,
    passed: rerankerPromotion.passed,
    blocking: rerankerPromotion.blocking,
    reason: rerankerPromotion.reason,
  };
  const releaseGates = [
    ...metricGates,
    ...layerGates,
    ...modeGates,
    ...initiativeGates,
    observabilityGate,
    rerankerGate,
  ];
  const passedCases = caseResults.filter((entry) => entry.passed).length;
  const failedCases = caseResults.length - passedCases;
  const failedBlockingGates = releaseGates.filter((gate) => gate.blocking && gate.passed === false);
  const status = failedBlockingGates.length === 0 ? 'pass' : 'fail';

  const beatCoverageCase = caseResults.find((entry) => entry.metricId === 'beatCoverageAccuracy');
  const beatCompletionCase = caseResults.find((entry) => entry.metricId === 'beatCompletionPrecisionRecall');
  const humanLabeledCases = caseResults.filter((entry) => entry.humanLabeled);
  const mixedInitiativeCases = caseResults.filter((entry) => entry.metricId === 'mixedInitiativeQuality');
  const beatCases = caseResults.filter((entry) => (
    entry.metricId === 'beatCoverageAccuracy' || entry.metricId === 'beatCompletionPrecisionRecall'
  ));

  return {
    schemaVersion: 1,
    suite: 'smoke',
    suiteVersion: SUITE_VERSION_SMOKE,
    generatedAt: nowIso(),
    status,
    provider,
    runtime,
    deploymentTarget,
    pipeline: {
      version: PIPELINE_VERSION_V2,
      enabled: true,
    },
    summary: {
      totalCases: caseResults.length,
      passedCases,
      failedCases,
    },
    metrics,
    gateSummary: {
      totalGates: releaseGates.length,
      failedBlockingGateCount: failedBlockingGates.length,
      failedBlockingGateIds: failedBlockingGates.map((entry) => entry.gateId),
    },
    releaseGates,
    rerankerPromotion,
    layerSummary: {
      atomic: metrics.filter((entry) => entry.layer === 'atomic_factual_support').map((entry) => entry.metricId),
      rag: metrics.filter((entry) => entry.layer === 'rag_pipeline_quality').map((entry) => entry.metricId),
      human: metrics.filter((entry) => entry.layer === 'human_regression').map((entry) => entry.metricId),
    },
    humanRegression: {
      suiteVersion: SUITE_VERSION_SMOKE,
      totalLabeledCases: humanLabeledCases.length,
      labeledCaseIds: humanLabeledCases.map((entry) => entry.caseId),
      mixedInitiativeCaseIds: mixedInitiativeCases.map((entry) => entry.caseId),
      beatCorrectnessCaseIds: beatCases.map((entry) => entry.caseId),
    },
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
      layer: entry.layer,
      passed: entry.passed,
      score: entry.score,
      threshold: entry.threshold,
      mode: entry.mode,
      initiativeAction: entry.initiativeAction,
      expectedMode: entry.expectedMode ?? null,
      expectedInitiativeAction: entry.expectedInitiativeAction ?? null,
      humanLabeled: entry.humanLabeled === true,
      diagnosticsCoverage: entry.diagnosticsCoverage,
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
  ACTIVE_EVAL_RERANKER_CLASS = toSafeRerankerCandidateClass(options.rerankerCandidateClass);
  const result = await runner(provider, runtime, fixtures);

  const replayReport = {
    schemaVersion: 1,
    mode: 'replay',
    generatedAt: nowIso(),
    transcriptPath,
    caseId,
    suite: 'smoke',
    suiteVersion: SUITE_VERSION_SMOKE,
    provider,
    runtime,
    rerankerCandidateClass: ACTIVE_EVAL_RERANKER_CLASS,
    pipeline: {
      version: PIPELINE_VERSION_V2,
      enabled: true,
    },
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
