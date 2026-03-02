import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSugarAgentAuthoringBundle } from './artifacts.mjs';

function parseArgs(argv) {
  const parsed = {
    project: 'project.sgrgame',
    out: 'public/plugins/sugaragent/authoring.bundle.json',
    quiet: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--project') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --project');
      parsed.project = value;
      i += 1;
      continue;
    }

    if (token === '--out') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --out');
      parsed.out = value;
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

export function runSugarAgentAuthoringPackCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const projectPath = path.resolve(args.project);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project file not found: ${projectPath}`);
  }

  const raw = fs.readFileSync(projectPath, 'utf8');
  const project = JSON.parse(raw);
  const result = buildSugarAgentAuthoringBundle(project);

  for (const warning of result.warnings) {
    if (!args.quiet) {
      console.log(`[sugaragent:authoring] warning: ${warning}`);
    }
  }

  if (!result.enabled) {
    if (!args.quiet) {
      console.log('[sugaragent:authoring] sugaragent plugin disabled; no authoring artifact emitted.');
    }
    return {
      enabled: false,
      outPath: null,
      warnings: result.warnings,
      errors: [],
    };
  }

  if (result.errors.length > 0 || !result.bundle) {
    for (const error of result.errors) {
      console.error(`[sugaragent:authoring] error: ${error}`);
    }
    throw new Error(`SugarAgent authoring validation failed (${result.errors.length} error${result.errors.length === 1 ? '' : 's'}).`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(result.bundle, null, 2)}\n`, 'utf8');

  if (!args.quiet) {
    console.log(`[sugaragent:authoring] wrote ${outPath}`);
    console.log(`[sugaragent:authoring] profiles=${result.bundle.profiles.length} beatContracts=${result.bundle.beatContracts.length}`);
  }

  return {
    enabled: true,
    outPath,
    warnings: result.warnings,
    errors: [],
  };
}

export function runSugarAgentAuthoringPackCliFromProcess(argv = process.argv.slice(2)) {
  try {
    runSugarAgentAuthoringPackCli(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[sugaragent:authoring] ${message}`);
    process.exit(1);
  }
}

if (isDirectExecution(import.meta.url)) {
  runSugarAgentAuthoringPackCliFromProcess();
}
