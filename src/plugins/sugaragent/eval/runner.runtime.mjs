// AUTO-GENERATED FILE. DO NOT EDIT.
// Source of truth: src/plugins/sugaragent/eval/runner.ts
// Regenerate: node scripts/sugaragent-sync-eval-runner.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createSugarAgentSession } from '../session/runtime.mjs';
function nowIso() {
    return new Date().toISOString();
}
function runIdFromNow() {
    return nowIso().replace(/[:.]/g, '-');
}
function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}
function toSafeProvider(value) {
    return value === 'echo' ? 'echo' : 'local';
}
function toSafeRuntime(value) {
    if (value === 'auto' || value === 'llama' || value === 'mock') {
        return value;
    }
    return 'mock';
}
function resolveRunDirectories(options) {
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
function resolveReplayOutputDir(options) {
    const base = options.outputDir
        ? path.resolve(options.outputDir)
        : path.resolve('.sugaragent-evals', 'replays', runIdFromNow());
    ensureDir(base);
    return base;
}
function mean(values) {
    if (values.length === 0)
        return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function percentile(values, p) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[index] ?? 0;
}
function sanitizeSessionId(value) {
    return String(value)
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'default';
}
function writeJson(filePath, value) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function buildSmokeFixtures(runDir) {
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
async function runTurnWithTiming(session, playerMessage) {
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
async function runSmokeLoreFaithfulnessCase(provider, runtime, fixtures) {
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
async function runSmokeMemoryRecallCase(provider, runtime) {
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
    let facts = [];
    if (typeof sessionPath === 'string' && fs.existsSync(sessionPath)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            const rawFacts = parsed.npcs?.baker?.facts;
            facts = Array.isArray(rawFacts) ? rawFacts.filter((entry) => typeof entry === 'string') : [];
        }
        catch {
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
async function runSmokeIntentSafetyCase(provider, runtime) {
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
async function runSmokeBeatCoverageCase(provider, runtime, fixtures) {
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
    const beatEvidence = turns[0]?.output?.beatEvidence;
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
async function runSmokeBeatCompletionCase(provider, runtime) {
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
async function runSmokeLatencyCase(provider, runtime) {
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
    const turns = [];
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
async function runSmokeIdentityConsistencyCase(provider, runtime, fixtures) {
    const caseId = 'smoke.identity-consistency';
    const session = await createSugarAgentSession({
        npc: 'baker',
        provider,
        runtime,
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
    return {
        caseId,
        metricId: 'identityConsistency',
        title: 'Identity Consistency',
        passed,
        score: passed ? 1 : 0,
        threshold: 1,
        reason,
        details: {
            utterance,
            mentionsSelf,
            mentionsForeign,
        },
        transcript: {
            suite: 'smoke',
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
    };
}
const SMOKE_CASE_RUNNERS = {
    'smoke.lore-faithfulness': runSmokeLoreFaithfulnessCase,
    'smoke.memory-recall': async (provider, runtime) => runSmokeMemoryRecallCase(provider, runtime),
    'smoke.intent-safety': async (provider, runtime) => runSmokeIntentSafetyCase(provider, runtime),
    'smoke.beat-coverage': runSmokeBeatCoverageCase,
    'smoke.beat-completion': async (provider, runtime) => runSmokeBeatCompletionCase(provider, runtime),
    'smoke.latency-performance': async (provider, runtime) => runSmokeLatencyCase(provider, runtime),
    'smoke.identity-consistency': runSmokeIdentityConsistencyCase,
};
function summarizeMetrics(results) {
    const byMetric = new Map();
    for (const result of results) {
        const metricCases = byMetric.get(result.metricId) ?? [];
        metricCases.push(result);
        byMetric.set(result.metricId, metricCases);
    }
    const summaries = [];
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
function buildReleaseGates(metricSummaries) {
    return metricSummaries.map((summary) => ({
        gateId: `gate.metric.${summary.metricId}`,
        metricId: summary.metricId,
        title: summary.title,
        score: summary.score,
        threshold: summary.threshold,
        passed: summary.passed,
    }));
}
function writeCaseArtifacts(directories, caseResult) {
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
async function runSmokeSuite(options, directories) {
    const provider = toSafeProvider(options.provider);
    const runtime = toSafeRuntime(options.runtime);
    const fixtures = buildSmokeFixtures(directories.runDir);
    const caseOrder = [
        'smoke.lore-faithfulness',
        'smoke.identity-consistency',
        'smoke.memory-recall',
        'smoke.intent-safety',
        'smoke.beat-coverage',
        'smoke.beat-completion',
        'smoke.latency-performance',
    ];
    const caseResults = [];
    const caseArtifacts = [];
    for (const caseId of caseOrder) {
        const runner = SMOKE_CASE_RUNNERS[caseId];
        if (!runner)
            continue;
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
export async function runSugarAgentEval(options = {}) {
    const suite = options.suite ?? 'smoke';
    if (suite !== 'smoke') {
        throw new Error(`Unsupported suite "${suite}". Supported suites: smoke`);
    }
    const directories = resolveRunDirectories(options);
    const report = await runSmokeSuite(options, directories);
    writeJson(directories.reportPath, report);
    return report;
}
export async function replaySugarAgentEvalTranscript(options) {
    const transcriptPath = path.resolve(options.transcriptPath);
    if (!fs.existsSync(transcriptPath)) {
        throw new Error(`Transcript file not found: ${transcriptPath}`);
    }
    const raw = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
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
