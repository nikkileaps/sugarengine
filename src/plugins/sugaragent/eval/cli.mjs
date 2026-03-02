import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  replaySugarAgentEvalTranscript,
  runSugarAgentEval,
} from './runner.mjs';

function parseArgs(argv) {
  const parsed = {
    suite: 'smoke',
    output: null,
    provider: 'local',
    runtime: 'mock',
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
  if (typeof report.reason === 'string' && report.reason.length > 0) {
    console.log(`[sugaragent:eval] replay reason=${report.reason}`);
  }
  if (typeof report.artifactPath === 'string') {
    console.log(`[sugaragent:eval] replay artifact=${report.artifactPath}`);
  }
}

export async function runSugarAgentEvalCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.replay) {
    const replayReport = await replaySugarAgentEvalTranscript({
      transcriptPath: args.replay,
      outputDir: args.output ?? undefined,
      provider: args.provider,
      runtime: args.runtime,
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
