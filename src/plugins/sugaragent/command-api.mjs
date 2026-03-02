import { runSugarAgentSimCli, runSugarAgentSimCliFromProcess } from './sim/cli.mjs';
import {
  runSugarAgentLoreIngestCli,
  runSugarAgentLoreIngestCliFromProcess,
} from './lore/ingest-cli.mjs';
import { runSugarAgentBundleCli, runSugarAgentBundleCliFromProcess } from './runtime/bundle-cli.mjs';
import { createSugarAgentSession } from './session/runtime.mjs';
import {
  runSugarAgentAuthoringPackCli,
  runSugarAgentAuthoringPackCliFromProcess,
} from './authoring/pack-cli.mjs';
import {
  runSugarAgentEvalCli,
  runSugarAgentEvalCliFromProcess,
} from './eval/cli.mjs';

const COMMANDS = new Set(['sim', 'lore:ingest', 'bundle:local-llm', 'authoring:pack', 'eval']);

async function runProgrammatic(command, argv) {
  if (command === 'sim') {
    await runSugarAgentSimCli(argv);
    return;
  }
  if (command === 'lore:ingest') {
    runSugarAgentLoreIngestCli(argv);
    return;
  }
  if (command === 'bundle:local-llm') {
    runSugarAgentBundleCli(argv);
    return;
  }
  if (command === 'authoring:pack') {
    runSugarAgentAuthoringPackCli(argv);
    return;
  }
  if (command === 'eval') {
    await runSugarAgentEvalCli(argv);
    return;
  }
  throw new Error(`Unknown SugarAgent command: ${command}`);
}

async function runFromProcess(command, argv) {
  if (command === 'sim') {
    await runSugarAgentSimCliFromProcess(argv);
    return;
  }
  if (command === 'lore:ingest') {
    runSugarAgentLoreIngestCliFromProcess(argv);
    return;
  }
  if (command === 'bundle:local-llm') {
    runSugarAgentBundleCliFromProcess(argv);
    return;
  }
  if (command === 'authoring:pack') {
    runSugarAgentAuthoringPackCliFromProcess(argv);
    return;
  }
  if (command === 'eval') {
    await runSugarAgentEvalCliFromProcess(argv);
    return;
  }
  console.error(
    `[sugaragent] Unknown command: ${command}. Supported: ${Array.from(COMMANDS).join(', ')}`,
  );
  process.exit(1);
}

export const SugarAgent = {
  /**
   * Single turn/session API for non-game clients (CLI today, game host later).
   */
  async createAgentSession(options = {}) {
    return createSugarAgentSession(options);
  },

  /**
   * Single public command API for non-game callers.
   * mode=process preserves CLI error/exit behavior.
   * mode=programmatic throws errors instead of exiting.
   */
  async execute({ command, argv = [], mode = 'process' }) {
    if (!COMMANDS.has(command)) {
      if (mode === 'process') {
        console.error(
          `[sugaragent] Unknown command: ${command}. Supported: ${Array.from(COMMANDS).join(', ')}`,
        );
        process.exit(1);
        return;
      }
      throw new Error(`Unknown SugarAgent command: ${command}`);
    }

    if (mode === 'programmatic') {
      await runProgrammatic(command, argv);
      return;
    }

    await runFromProcess(command, argv);
  },
};
