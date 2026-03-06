#!/usr/bin/env node

import readline from 'node:readline';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createSugarAgentSession,
} from '../session/runtime.mjs';

function sanitizeSessionId(sessionId) {
  return String(sessionId)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'default';
}

function parseArgs(argv) {
  const parsed = {
    npc: 'baker',
    ask: null,
    provider: 'echo',
    runtime: 'llama',
    simulateInvalidJson: 'never',
    debugStructured: false,
    useAuthoring: true,
    authoringBundlePath: 'public/plugins/sugaragent/authoring.bundle.json',
    beatContractId: null,
    ticks: null,
    tickBudget: 6,
    loreDir: 'src/plugins/sugaragent/lore/generated',
    useLore: true,
    llamaBin: null,
    modelPath: null,
    llamaTimeoutMs: 120000,
    llamaBinArgs: [],
    llamaArgs: [],
    session: null,
    resetSession: null,
    scenario: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--npc') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --npc');
      parsed.npc = value;
      i += 1;
      continue;
    }

    if (token === '--ask') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --ask');
      parsed.ask = value;
      i += 1;
      continue;
    }

    if (token === '--provider') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --provider');
      if (value !== 'echo' && value !== 'local') {
        throw new Error('Invalid value for --provider. Use "echo" or "local".');
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

    if (token === '--simulate-invalid-json') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --simulate-invalid-json');
      if (value !== 'never' && value !== 'once' && value !== 'always') {
        throw new Error('Invalid value for --simulate-invalid-json. Use "never", "once", or "always".');
      }
      parsed.simulateInvalidJson = value;
      i += 1;
      continue;
    }

    if (token === '--debug-structured') {
      parsed.debugStructured = true;
      continue;
    }

    if (token === '--lore-dir') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --lore-dir');
      parsed.loreDir = value;
      i += 1;
      continue;
    }

    if (token === '--llama-bin') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --llama-bin');
      parsed.llamaBin = value;
      i += 1;
      continue;
    }

    if (token === '--model-path') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --model-path');
      parsed.modelPath = value;
      i += 1;
      continue;
    }

    if (token === '--llama-timeout-ms') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --llama-timeout-ms');
      const parsedMs = Number.parseInt(value, 10);
      if (!Number.isFinite(parsedMs) || parsedMs <= 0) {
        throw new Error('Invalid value for --llama-timeout-ms. Must be a positive integer.');
      }
      parsed.llamaTimeoutMs = parsedMs;
      i += 1;
      continue;
    }

    if (token === '--llama-bin-arg') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --llama-bin-arg');
      parsed.llamaBinArgs.push(value);
      i += 1;
      continue;
    }

    if (token === '--llama-arg') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --llama-arg');
      parsed.llamaArgs.push(value);
      i += 1;
      continue;
    }

    if (token === '--no-lore') {
      parsed.useLore = false;
      continue;
    }

    if (token === '--session') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --session');
      parsed.session = value;
      i += 1;
      continue;
    }

    if (token === '--reset-session') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --reset-session');
      parsed.resetSession = value;
      i += 1;
      continue;
    }

    if (token === '--scenario') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --scenario');
      parsed.scenario = value;
      i += 1;
      continue;
    }

    if (token === '--authoring-bundle') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --authoring-bundle');
      parsed.authoringBundlePath = value;
      i += 1;
      continue;
    }

    if (token === '--beat-contract') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --beat-contract');
      parsed.beatContractId = value;
      i += 1;
      continue;
    }

    if (token === '--no-authoring') {
      parsed.useAuthoring = false;
      continue;
    }

    if (token === '--ticks') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --ticks');
      const parsedTicks = Number.parseInt(value, 10);
      if (!Number.isFinite(parsedTicks) || parsedTicks <= 0) {
        throw new Error('Invalid value for --ticks. Must be a positive integer.');
      }
      parsed.ticks = parsedTicks;
      i += 1;
      continue;
    }

    if (token === '--tick-budget') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --tick-budget');
      const parsedBudget = Number.parseInt(value, 10);
      if (!Number.isFinite(parsedBudget) || parsedBudget <= 0) {
        throw new Error('Invalid value for --tick-budget. Must be a positive integer.');
      }
      parsed.tickBudget = parsedBudget;
      i += 1;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  if (parsed.resetSession && !parsed.session) {
    parsed.session = parsed.resetSession;
  }
  if (
    parsed.resetSession
    && parsed.session
    && sanitizeSessionId(parsed.resetSession) !== sanitizeSessionId(parsed.session)
  ) {
    throw new Error('When both --session and --reset-session are provided, they must reference the same session ID.');
  }

  return parsed;
}

function formatReply(npc, turn) {
  return `${npc}> ${turn.utterance}`;
}

function printSessionStartup(startup) {
  if (startup.scenario) {
    console.log(`[sugaragent:sim] scenario=${startup.scenario.id} (${startup.scenario.description})`);
  }
  if (startup.pipeline) {
    const version = typeof startup.pipeline.version === 'string' ? startup.pipeline.version : 'v2';
    const enabled = startup.pipeline.enabled === true;
    console.log(`[sugaragent:sim] pipeline version=${version} enabled=${enabled}`);
  }

  if (startup.authoring) {
    if (startup.authoring.loaded) {
      const profile = startup.authoring.profileNpcId ? ` profile=${startup.authoring.profileNpcId}` : '';
      const beat = startup.authoring.beatContractId ? ` beat=${startup.authoring.beatContractId}` : '';
      console.log(`[sugaragent:sim] authoring loaded: ${startup.authoring.pathToFile}${profile}${beat}`);
    } else if (startup.authoring.enabled && startup.authoring.warning) {
      console.log(`[sugaragent:sim] authoring warning: ${startup.authoring.warning}`);
    }
  }

  if (startup.reset) {
    console.log(
      `[sugaragent:sim] session reset: ${startup.reset.sessionId} (${startup.reset.pathToFile})${startup.reset.existed ? '' : ' [no existing file]'}`,
    );
  }

  if (startup.session) {
    console.log(
      `[sugaragent:sim] session ${startup.session.loaded ? 'loaded' : 'created'}: ${startup.session.id} (${startup.session.pathToFile})`,
    );
  }

  if (startup.lore?.loaded) {
    console.log(
      `[sugaragent:sim] lore loaded: ${startup.lore.chunkCount} chunks from ${path.resolve(startup.lore.dir)}`,
    );
  }

  if (startup.runtime?.warning) {
    console.log(`[sugaragent:sim] ${startup.runtime.warning}`);
  }

  if (startup.runtime?.health) {
    const detail = startup.runtime.health.detail ?? 'n/a';
    console.log(
      `[sugaragent:sim] local runtime health: ${startup.runtime.health.ok ? 'ok' : 'down'} (${detail}) [mode=${startup.runtime.mode}]`,
    );
  }
}

function printTurnResult(args, result) {
  for (const line of result.scenarioLogs ?? []) {
    console.log(`[sugaragent:sim] ${line}`);
  }

  if (Array.isArray(result.validationErrors) && result.validationErrors.length > 0) {
    console.log(`[sugaragent:sim] validation=${result.validationErrors.join(' | ')}`);
  }

  if (result?.routing && typeof result.routing === 'object') {
    const intent = typeof result.routing.intent === 'string' ? result.routing.intent : 'unknown';
    const confidence = Number.isFinite(result.routing.confidence)
      ? result.routing.confidence.toFixed(2)
      : 'n/a';
    const margin = Number.isFinite(result.routing.margin)
      ? result.routing.margin.toFixed(2)
      : 'n/a';
    const policyPath = typeof result.routing.policyPath === 'string'
      ? result.routing.policyPath
      : 'n/a';
    console.log(`[sugaragent:sim] routing intent=${intent} confidence=${confidence} margin=${margin} policy=${policyPath}`);
  }
  if (result?.pipeline && typeof result.pipeline === 'object') {
    const version = typeof result.pipeline.version === 'string' ? result.pipeline.version : 'unknown';
    const enabled = result.pipeline.enabled === true;
    const routeIntent = typeof result.pipeline.routeIntent === 'string'
      ? result.pipeline.routeIntent
      : 'unknown';
    console.log(`[sugaragent:sim] pipeline version=${version} enabled=${enabled} route=${routeIntent}`);
  }

  const groundingSummary = result?.grounding?.summary;
  if (groundingSummary && typeof groundingSummary === 'object') {
    const decision = typeof groundingSummary.decision === 'string' ? groundingSummary.decision : 'n/a';
    const supported = Number.isFinite(groundingSummary.supportedCount) ? groundingSummary.supportedCount : 0;
    const weak = Number.isFinite(groundingSummary.weakCount) ? groundingSummary.weakCount : 0;
    const unsupported = Number.isFinite(groundingSummary.unsupportedCount) ? groundingSummary.unsupportedCount : 0;
    const nonFactual = Number.isFinite(groundingSummary.nonFactualCount) ? groundingSummary.nonFactualCount : 0;
    console.log(
      `[sugaragent:sim] grounding decision=${decision} supported=${supported} weak=${weak} unsupported=${unsupported} non_factual=${nonFactual}`,
    );
  }
  const unsupportedClaimRejections = result?.groundingStats?.unsupportedClaimRejections;
  if (Number.isFinite(unsupportedClaimRejections)) {
    console.log(
      `[sugaragent:sim] grounding-unsupported-rejections-total=${unsupportedClaimRejections}`,
    );
  }

  if (result.usedFallback) {
    console.log('[sugaragent:sim] local provider fallback engaged.');
  }

  if (Array.isArray(result.citations) && result.citations.length > 0) {
    console.log(`[sugaragent:sim] citations=${result.citations.join(' | ')}`);
  }

  if (args.debugStructured) {
    console.log(`[sugaragent:sim] structured=${JSON.stringify(result.output)}`);
    if (result?.grounding) {
      console.log(`[sugaragent:sim] grounding=${JSON.stringify(result.grounding)}`);
    }
    if (result?.routing) {
      console.log(`[sugaragent:sim] routing=${JSON.stringify(result.routing)}`);
    }
    if (result?.pipeline) {
      console.log(`[sugaragent:sim] pipeline=${JSON.stringify(result.pipeline)}`);
    }
  }

  console.log(formatReply(args.npc, result.output));
}

function printCadenceReport(report) {
  console.log(
    `[sugaragent:sim] cadence=${report.scenarioId} ticks=${report.ticks} budget=${report.config.maxNpcUpdatesPerTick}`,
  );
  console.log(
    `[sugaragent:sim] budget maxUsed=${report.maxUpdatesInTick} violations=${report.budgetViolations} deferred=${report.deferredUpdates}`,
  );
  console.log(
    `[sugaragent:sim] tier-updates near=${report.tierUpdates.near} mid=${report.tierUpdates.mid} far=${report.tierUpdates.far}`,
  );
  console.log(
    `[sugaragent:sim] planner ticks=${report.planner.ticksWithFarPlanning} farUpdates=${report.planner.farPlanningUpdates}`,
  );
  console.log(
    `[sugaragent:sim] active-beat npc=${report.activeBeatNpcId} nearTicks=${report.activeBeat.nearTicks} updatedNear=${report.activeBeat.updatedWhileNear} responsiveness=${report.activeBeat.responsiveness}`,
  );
  console.log(
    `[sugaragent:sim] beat-guardrail farAutoCompletions=${report.activeBeat.farAutoCompletions}`,
  );
  console.log(
    `[sugaragent:sim] continuity avg=${report.continuity.average} min=${report.continuity.minimum} transitions=${report.transitions}`,
  );
}

async function runOneShot(args, session) {
  if (!args.ask) return;
  const result = await session.runTurn(args.ask);
  printTurnResult(args, result);
}

async function runInteractive(args, session) {
  console.log('[sugaragent:sim] Type /exit to quit.');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  rl.setPrompt('you> ');
  rl.prompt();

  rl.on('line', async (line) => {
    const message = line.trim();
    if (!message) {
      rl.prompt();
      return;
    }

    if (message === '/exit') {
      rl.close();
      return;
    }

    try {
      const result = await session.runTurn(message);
      printTurnResult(args, result);
    } finally {
      rl.prompt();
    }
  });

  return new Promise((resolve) => {
    rl.on('close', () => {
      console.log('[sugaragent:sim] Session ended.');
      resolve();
    });
  });
}

function isDirectExecution(metaUrl) {
  const entryPoint = process.argv[1];
  if (!entryPoint) return false;
  return metaUrl === pathToFileURL(path.resolve(entryPoint)).href;
}

export async function runSugarAgentSimCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  console.log(`[sugaragent:sim] Loaded SugarAgent sim for NPC "${args.npc}" (provider=${args.provider}).`);

  const session = await createSugarAgentSession({
    npc: args.npc,
    provider: args.provider,
    runtime: args.runtime,
    simulateInvalidJson: args.simulateInvalidJson,
    loreDir: args.loreDir,
    useLore: args.useLore,
    llamaBin: args.llamaBin,
    modelPath: args.modelPath,
    llamaTimeoutMs: args.llamaTimeoutMs,
    llamaBinArgs: args.llamaBinArgs,
    llamaArgs: args.llamaArgs,
    session: args.session,
    resetSession: args.resetSession,
    scenario: args.scenario,
    useAuthoring: args.useAuthoring,
    authoringBundlePath: args.authoringBundlePath,
    beatContractId: args.beatContractId,
    tickBudget: args.tickBudget,
  });

  printSessionStartup(session.startup);

  if (args.ticks) {
    const report = session.runTicks(args.ticks);
    printCadenceReport(report);
    return;
  }

  if (args.scenario === 'crowd-town') {
    throw new Error('Scenario "crowd-town" requires --ticks <positive-int>.');
  }

  if (args.ask) {
    await runOneShot(args, session);
    return;
  }

  await runInteractive(args, session);
}

export async function runSugarAgentSimCliFromProcess(argv = process.argv.slice(2)) {
  try {
    await runSugarAgentSimCli(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[sugaragent:sim] ${message}`);
    process.exit(1);
  }
}

if (isDirectExecution(import.meta.url)) {
  await runSugarAgentSimCliFromProcess();
}
