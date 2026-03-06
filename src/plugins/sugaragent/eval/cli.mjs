import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  replaySugarAgentEvalTranscript,
  runSugarAgentEval,
} from './runner.mjs';

const DEFAULT_DEPLOYMENT_TARGET = 'development';
const DEFAULT_RERANKER_CLASS = 'learned';

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function normalizeDeploymentTarget(value) {
  return value === 'production' ? 'production' : 'development';
}

function normalizeRerankerClass(value) {
  return value === 'heuristic' ? 'heuristic' : 'learned';
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveDefaultProjectPath(cwd) {
  const activeGamePath = path.resolve(cwd, 'games', '.active-game');
  if (fs.existsSync(activeGamePath)) {
    const slug = normalizeOptionalString(fs.readFileSync(activeGamePath, 'utf8'));
    if (slug) {
      const candidate = path.resolve(cwd, 'games', slug, 'project.sgrgame');
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  const localProject = path.resolve(cwd, 'project.sgrgame');
  if (fs.existsSync(localProject)) {
    return localProject;
  }

  return null;
}

function extractSugarAgentEvalConfig(projectData, projectPath) {
  const defaults = {
    deploymentTarget: DEFAULT_DEPLOYMENT_TARGET,
    rerankerClass: DEFAULT_RERANKER_CLASS,
    rerankerBaseline: null,
  };

  if (!isRecord(projectData)) {
    return defaults;
  }

  const applyConfig = (raw) => {
    if (!isRecord(raw)) return;
    defaults.deploymentTarget = normalizeDeploymentTarget(
      raw.evalDeploymentTarget ?? raw.deploymentTarget,
    );
    defaults.rerankerClass = normalizeRerankerClass(
      raw.evalRerankerClass ?? raw.rerankerClass,
    );

    const configuredBaseline = normalizeOptionalString(
      raw.evalRerankerBaselinePath ?? raw.rerankerBaselinePath,
    );
    if (configuredBaseline) {
      defaults.rerankerBaseline = path.isAbsolute(configuredBaseline)
        ? configuredBaseline
        : path.resolve(path.dirname(projectPath), configuredBaseline);
    }
  };

  if (isRecord(projectData.sugaragent)) {
    applyConfig(projectData.sugaragent);
  }

  if (Array.isArray(projectData.plugins)) {
    for (const plugin of projectData.plugins) {
      if (!isRecord(plugin) || plugin.id !== 'sugaragent' || plugin.enabled === false) continue;
      applyConfig(plugin);
    }
  }

  return defaults;
}

function resolveEvalDefaultsFromProject(cwd) {
  const projectPath = resolveDefaultProjectPath(cwd);
  if (!projectPath) {
    return {
      deploymentTarget: DEFAULT_DEPLOYMENT_TARGET,
      rerankerClass: DEFAULT_RERANKER_CLASS,
      rerankerBaseline: null,
      sourceProjectPath: null,
      warning: null,
    };
  }

  try {
    const raw = fs.readFileSync(projectPath, 'utf8');
    const parsed = JSON.parse(raw);
    const defaults = extractSugarAgentEvalConfig(parsed, projectPath);
    return {
      ...defaults,
      sourceProjectPath: projectPath,
      warning: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown project parse error';
    return {
      deploymentTarget: DEFAULT_DEPLOYMENT_TARGET,
      rerankerClass: DEFAULT_RERANKER_CLASS,
      rerankerBaseline: null,
      sourceProjectPath: projectPath,
      warning: `Could not parse project defaults at ${projectPath}: ${message}`,
    };
  }
}

function parseArgs(argv) {
  const parsed = {
    suite: 'smoke',
    output: null,
    provider: 'local',
    runtime: 'mock',
    deploymentTarget: null,
    rerankerBaseline: null,
    rerankerClass: null,
    replay: null,
    quiet: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--suite') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --suite');
      parsed.suite = value;
      i += 1;
      continue;
    }

    if (token === '--output') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --output');
      parsed.output = value;
      i += 1;
      continue;
    }

    if (token === '--provider') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --provider');
      if (value !== 'local' && value !== 'echo') {
        throw new Error('Invalid value for --provider. Use "local" or "echo".');
      }
      parsed.provider = value;
      i += 1;
      continue;
    }

    if (token === '--runtime') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --runtime');
      if (value !== 'auto' && value !== 'mock' && value !== 'llama') {
        throw new Error('Invalid value for --runtime. Use "auto", "mock", or "llama".');
      }
      parsed.runtime = value;
      i += 1;
      continue;
    }

    if (token === '--replay') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --replay');
      parsed.replay = value;
      i += 1;
      continue;
    }

    if (token === '--deployment-target') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --deployment-target');
      if (value !== 'development' && value !== 'production') {
        throw new Error('Invalid value for --deployment-target. Use "development" or "production".');
      }
      parsed.deploymentTarget = value;
      i += 1;
      continue;
    }

    if (token === '--reranker-baseline') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --reranker-baseline');
      parsed.rerankerBaseline = value;
      i += 1;
      continue;
    }

    if (token === '--reranker-class') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --reranker-class');
      if (value !== 'heuristic' && value !== 'learned') {
        throw new Error('Invalid value for --reranker-class. Use "heuristic" or "learned".');
      }
      parsed.rerankerClass = value;
      i += 1;
      continue;
    }

    if (token === '--quiet') {
      parsed.quiet = true;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return parsed;
}

function isDirectExecution(metaUrl) {
  const entryPoint = process.argv[1];
  if (!entryPoint) return false;
  return metaUrl === pathToFileURL(path.resolve(entryPoint)).href;
}

function printSuiteReport(report) {
  console.log(`[sugaragent:eval] suite=${report.suite} status=${report.status}`);
  if (report?.suiteVersion) {
    console.log(`[sugaragent:eval] suiteVersion=${report.suiteVersion}`);
  }
  if (report?.deploymentTarget) {
    console.log(`[sugaragent:eval] deploymentTarget=${report.deploymentTarget}`);
  }
  if (report?.pipeline) {
    const version = typeof report.pipeline.version === 'string' ? report.pipeline.version : 'v2';
    const enabled = report.pipeline.enabled === true;
    console.log(`[sugaragent:eval] pipeline version=${version} enabled=${enabled}`);
  }
  for (const metric of report.metrics ?? []) {
    console.log(
      `[sugaragent:eval] metric=${metric.metricId} passed=${metric.passed} score=${metric.score} threshold=${metric.threshold}`,
    );
  }
  const beatCoverage = report.beatEvaluation?.coverage;
  const beatCompletion = report.beatEvaluation?.completion;
  if (beatCoverage && beatCompletion) {
    console.log(
      `[sugaragent:eval] beat coveragePassed=${beatCoverage.passed} covered=${beatCoverage.coveredCount} uncovered=${beatCoverage.uncoveredCount}`,
    );
    console.log(
      `[sugaragent:eval] beat completionPassed=${beatCompletion.passed} falseComplete=${beatCompletion.falseCompleteCount} missedComplete=${beatCompletion.missedCompleteCount}`,
    );
  }
  console.log(`[sugaragent:eval] report=${report.artifacts?.reportPath}`);
  if (report?.gateSummary) {
    console.log(
      `[sugaragent:eval] gates total=${report.gateSummary.totalGates} failedBlocking=${report.gateSummary.failedBlockingGateCount}`,
    );
  }
  for (const gate of report.releaseGates ?? []) {
    const gateType = typeof gate.gateType === 'string' ? gate.gateType : 'metric';
    const blocking = gate.blocking === true;
    console.log(
      `[sugaragent:eval] gate=${gate.gateId} type=${gateType} blocking=${blocking} passed=${gate.passed} score=${gate.score} threshold=${gate.threshold}`,
    );
  }
  if (report?.rerankerPromotion) {
    const observed = Array.isArray(report.rerankerPromotion.observedClasses)
      ? report.rerankerPromotion.observedClasses.join(',')
      : 'unknown';
    console.log(
      `[sugaragent:eval] reranker promotion passed=${report.rerankerPromotion.passed} blocking=${report.rerankerPromotion.blocking} observed=${observed} candidate=${report.rerankerPromotion.candidateScore} baseline=${report.rerankerPromotion.baselineScore}`,
    );
  }

  const failedCases = (report.cases ?? []).filter((entry) => entry && entry.passed === false);
  for (const failed of failedCases) {
    const reason = typeof failed.reason === 'string' ? failed.reason : 'unknown';
    console.log(`[sugaragent:eval] failed case=${failed.caseId} reason=${reason}`);
  }
}

function printReplayReport(report) {
  console.log(
    `[sugaragent:eval] replay case=${report.caseId} passed=${report.replayPassed} expected=${report.expectedPassed} match=${report.matchesExpectation}`,
  );
  if (report?.pipeline) {
    const version = typeof report.pipeline.version === 'string' ? report.pipeline.version : 'v2';
    const enabled = report.pipeline.enabled === true;
    console.log(`[sugaragent:eval] replay pipeline version=${version} enabled=${enabled}`);
  }
  if (typeof report.reason === 'string' && report.reason.length > 0) {
    console.log(`[sugaragent:eval] replay reason=${report.reason}`);
  }
  if (typeof report.artifactPath === 'string') {
    console.log(`[sugaragent:eval] replay artifact=${report.artifactPath}`);
  }
}

export async function runSugarAgentEvalCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const projectDefaults = resolveEvalDefaultsFromProject(process.cwd());
  if (!args.quiet && projectDefaults.sourceProjectPath) {
    console.log(`[sugaragent:eval] project defaults=${projectDefaults.sourceProjectPath}`);
  }
  if (!args.quiet && projectDefaults.warning) {
    console.warn(`[sugaragent:eval] ${projectDefaults.warning}`);
  }
  const deploymentTarget = args.deploymentTarget ?? projectDefaults.deploymentTarget;
  const rerankerClass = args.rerankerClass ?? projectDefaults.rerankerClass;
  const rerankerBaseline = args.rerankerBaseline ?? projectDefaults.rerankerBaseline;

  if (args.replay) {
    const replayReport = await replaySugarAgentEvalTranscript({
      transcriptPath: args.replay,
      outputDir: args.output ?? undefined,
      provider: args.provider,
      runtime: args.runtime,
      rerankerCandidateClass: rerankerClass,
    });
    if (!args.quiet) {
      printReplayReport(replayReport);
    }
    return replayReport;
  }

  const report = await runSugarAgentEval({
    suite: args.suite,
    outputDir: args.output ?? undefined,
    provider: args.provider,
    runtime: args.runtime,
    deploymentTarget,
    rerankerBaselinePath: rerankerBaseline ?? undefined,
    rerankerCandidateClass: rerankerClass,
    writeArtifacts: true,
  });
  if (!args.quiet) {
    printSuiteReport(report);
  }
  return report;
}

export async function runSugarAgentEvalCliFromProcess(argv = process.argv.slice(2)) {
  try {
    const report = await runSugarAgentEvalCli(argv);
    const failed = report?.status === 'fail' || report?.replayPassed === false;
    if (failed) {
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[sugaragent:eval] ${message}`);
    process.exit(1);
  }
}

if (isDirectExecution(import.meta.url)) {
  await runSugarAgentEvalCliFromProcess();
}
