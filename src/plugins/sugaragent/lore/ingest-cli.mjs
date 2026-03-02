#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ingestLoreDirectory,
  writeLoreArtifacts,
} from './lore-lib.mjs';

const DEFAULT_LOCK_PATH = 'src/plugins/sugaragent/lore/lore-source.lock.json';

function toOptionalString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseLockFile(lockPath) {
  if (!fs.existsSync(lockPath)) return null;

  const raw = fs.readFileSync(lockPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Invalid lore lock file format: ${lockPath}`);
  }

  return {
    repo: toOptionalString(parsed.repo),
    commit: toOptionalString(parsed.commit),
    ref: toOptionalString(parsed.ref),
    source: toOptionalString(parsed.source),
  };
}

function writeLockFile(lockPath, values) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, `${JSON.stringify(values, null, 2)}\n`, 'utf8');
}

function parseArgs(argv) {
  const parsed = {
    source: null,
    commit: null,
    output: 'src/plugins/sugaragent/lore/generated',
    repo: 'local',
    ref: null,
    lock: DEFAULT_LOCK_PATH,
    useLock: true,
    writeLock: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--source') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --source');
      parsed.source = value;
      i += 1;
      continue;
    }

    if (token === '--commit') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --commit');
      parsed.commit = value;
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

    if (token === '--repo') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --repo');
      parsed.repo = value;
      i += 1;
      continue;
    }

    if (token === '--ref') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --ref');
      parsed.ref = value;
      i += 1;
      continue;
    }

    if (token === '--lock') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --lock');
      parsed.lock = value;
      i += 1;
      continue;
    }

    if (token === '--no-lock') {
      parsed.useLock = false;
      continue;
    }

    if (token === '--write-lock') {
      parsed.writeLock = true;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  let lockValues = null;
  const lockPath = path.resolve(parsed.lock);
  if (parsed.useLock) {
    lockValues = parseLockFile(lockPath);
    if (!parsed.source && lockValues?.source) {
      parsed.source = lockValues.source;
    }
    if (!parsed.commit && lockValues?.commit) {
      parsed.commit = lockValues.commit;
    }
    if (parsed.repo === 'local' && lockValues?.repo) {
      parsed.repo = lockValues.repo;
    }
    if (!parsed.ref && lockValues?.ref) {
      parsed.ref = lockValues.ref;
    }
  }

  if (!parsed.source) {
    throw new Error('Missing required --source <path>');
  }
  if (!parsed.commit) {
    throw new Error('Missing required --commit <sha-or-label>');
  }

  return {
    ...parsed,
    lockPath,
    loadedLock: lockValues,
  };
}

function isDirectExecution(metaUrl) {
  const entryPoint = process.argv[1];
  if (!entryPoint) return false;
  return metaUrl === pathToFileURL(path.resolve(entryPoint)).href;
}

export function runSugarAgentLoreIngestCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const artifacts = ingestLoreDirectory({
    sourceDir: args.source,
    commit: args.commit,
    repo: args.repo,
    ref: args.ref ?? undefined,
  });
  const written = writeLoreArtifacts(args.output, artifacts);

  if (args.writeLock) {
    writeLockFile(args.lockPath, {
      repo: args.repo,
      commit: args.commit,
      ref: args.ref ?? undefined,
      source: args.source,
    });
  }

  console.log(`[sugaragent:lore:ingest] source=${path.resolve(args.source)}`);
  console.log(`[sugaragent:lore:ingest] output=${path.resolve(args.output)}`);
  console.log(`[sugaragent:lore:ingest] repo=${args.repo}`);
  console.log(`[sugaragent:lore:ingest] commit=${args.commit}`);
  if (args.ref) {
    console.log(`[sugaragent:lore:ingest] ref=${args.ref}`);
  }
  if (args.useLock) {
    console.log(`[sugaragent:lore:ingest] lock=${args.lockPath}${args.loadedLock ? ' (loaded)' : ' (missing)'}`);
  }
  if (args.writeLock) {
    console.log(`[sugaragent:lore:ingest] lock-updated=${args.lockPath}`);
  }
  console.log(`[sugaragent:lore:ingest] chunks=${artifacts.manifest.counts.chunks} files=${artifacts.manifest.counts.files}`);
  if (artifacts.issues.length > 0) {
    console.log(`[sugaragent:lore:ingest] issues=${artifacts.issues.length}`);
    for (const issue of artifacts.issues) {
      console.log(`[sugaragent:lore:ingest] warn: ${issue}`);
    }
  }
  console.log(`[sugaragent:lore:ingest] wrote ${written.manifestPath}`);
  console.log(`[sugaragent:lore:ingest] wrote ${written.chunksPath}`);
}

export function runSugarAgentLoreIngestCliFromProcess(argv = process.argv.slice(2)) {
  try {
    runSugarAgentLoreIngestCli(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[sugaragent:lore:ingest] ${message}`);
    process.exit(1);
  }
}

if (isDirectExecution(import.meta.url)) {
  runSugarAgentLoreIngestCliFromProcess();
}
