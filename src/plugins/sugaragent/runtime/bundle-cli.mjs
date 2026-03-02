#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  buildModelUrl,
  DEFAULT_MODEL_PROFILE,
  getModelProfile,
  listModelProfiles,
} from './model-profiles.mjs';

const DEFAULTS = {
  runtimeTag: 'b8182',
  runtimeArchiveUrl: 'https://github.com/ggml-org/llama.cpp/releases/download/b8182/llama-b8182-bin-macos-arm64.tar.gz',
};

const BUNDLE_ROOT = path.resolve('src/plugins/sugaragent/runtime/bundle');
const BIN_DIR = path.join(BUNDLE_ROOT, 'bin');
const MODEL_DIR = path.join(BUNDLE_ROOT, 'models');
const LOCK_PATH = path.join(BUNDLE_ROOT, 'bundle.lock.json');
const PRIMARY_RUNTIME_BINARY = 'llama-completion';
const FALLBACK_RUNTIME_BINARY = 'llama-cli';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.stdio ?? 'pipe',
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? '';
    const stdout = result.stdout?.trim() ?? '';
    const detail = stderr || stdout || `exit code ${result.status}`;
    throw new Error(`${command} ${args.join(' ')} failed: ${detail}`);
  }
  return result.stdout ?? '';
}

function parseArgs(argv) {
  const profile = getModelProfile(DEFAULT_MODEL_PROFILE);
  if (!profile) {
    throw new Error(`Missing default model profile: ${DEFAULT_MODEL_PROFILE}`);
  }

  const parsed = {
    runtimeArchiveUrl: DEFAULTS.runtimeArchiveUrl,
    profile: profile.id,
    modelUrl: null,
    modelFileName: null,
    customModelUrl: false,
    customModelFileName: false,
    listProfiles: false,
    force: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--profile') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --profile');
      if (!getModelProfile(value)) {
        throw new Error(
          `Unknown profile "${value}". Use --list-profiles to see supported profile IDs.`,
        );
      }
      parsed.profile = value;
      i += 1;
      continue;
    }
    if (token === '--list-profiles') {
      parsed.listProfiles = true;
      continue;
    }
    if (token === '--runtime-archive-url') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --runtime-archive-url');
      parsed.runtimeArchiveUrl = value;
      i += 1;
      continue;
    }
    if (token === '--model-url') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --model-url');
      parsed.modelUrl = value;
      parsed.customModelUrl = true;
      i += 1;
      continue;
    }
    if (token === '--model-file-name') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --model-file-name');
      parsed.modelFileName = value;
      parsed.customModelFileName = true;
      i += 1;
      continue;
    }
    if (token === '--force') {
      parsed.force = true;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  const selectedProfile = getModelProfile(parsed.profile);
  if (!selectedProfile) {
    throw new Error(`Unknown profile: ${parsed.profile}`);
  }

  if (!parsed.modelFileName) {
    if (parsed.customModelUrl) {
      let derived = null;
      try {
        const parsedUrl = new URL(parsed.modelUrl);
        derived = path.basename(decodeURIComponent(parsedUrl.pathname));
      } catch {
        derived = path.basename(parsed.modelUrl);
      }
      if (!derived || !derived.endsWith('.gguf')) {
        throw new Error(
          'Unable to infer --model-file-name from --model-url. Pass --model-file-name explicitly.',
        );
      }
      parsed.modelFileName = derived;
    } else {
      parsed.modelFileName = selectedProfile.modelFileName;
    }
  }
  if (!parsed.modelUrl) {
    parsed.modelUrl = buildModelUrl(selectedProfile);
  }

  return parsed;
}

function printProfiles() {
  const profiles = listModelProfiles();
  console.log('[sugaragent:bundle] Available model profiles:');
  for (const profile of profiles) {
    console.log(`- ${profile.id}: ${profile.label}`);
    console.log(`  ${profile.description}`);
    console.log(`  repo=${profile.modelRepo}`);
    console.log(`  file=${profile.modelFileName}`);
    if (typeof profile.fallbackModelFileName === 'string') {
      const fallbackRepo = typeof profile.fallbackModelRepo === 'string'
        ? profile.fallbackModelRepo
        : profile.modelRepo;
      console.log(`  fallback=${fallbackRepo}/${profile.fallbackModelFileName}`);
    }
  }
  console.log(`[sugaragent:bundle] Default profile: ${DEFAULT_MODEL_PROFILE}`);
}

function ensureBundleDirs() {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  fs.mkdirSync(MODEL_DIR, { recursive: true });
}

function downloadFile(url, destinationPath) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  run('curl', ['-L', '--fail', '--retry', '3', '--retry-delay', '2', '-C', '-', '-o', destinationPath, url], {
    stdio: 'inherit',
  });
}

function buildFallbackCandidate(profile) {
  const fallbackRepo = typeof profile.fallbackModelRepo === 'string' ? profile.fallbackModelRepo : profile.modelRepo;
  const fallbackModelFileName = typeof profile.fallbackModelFileName === 'string'
    ? profile.fallbackModelFileName
    : null;
  if (!fallbackModelFileName) return null;
  return {
    repo: fallbackRepo,
    modelFileName: fallbackModelFileName,
    modelUrl: `https://huggingface.co/${fallbackRepo}/resolve/main/${fallbackModelFileName}`,
  };
}

function downloadProfileModel(selectedProfile, requested) {
  const primary = {
    repo: selectedProfile.modelRepo,
    modelFileName: requested.modelFileName,
    modelUrl: requested.modelUrl,
  };
  const candidates = [primary];
  const fallback = buildFallbackCandidate(selectedProfile);
  if (
    fallback
    && fallback.modelUrl !== primary.modelUrl
    && !requested.customModelUrl
    && !requested.customModelFileName
  ) {
    candidates.push(fallback);
  }

  let lastError = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (!candidate) continue;
    const modelPath = path.join(MODEL_DIR, candidate.modelFileName);
    try {
      console.log(
        `[sugaragent:bundle] Downloading GGUF model${i === 0 ? '' : ' (fallback)'}: ${candidate.modelFileName}`,
      );
      downloadFile(candidate.modelUrl, modelPath);
      return {
        repo: candidate.repo,
        modelFileName: candidate.modelFileName,
        modelUrl: candidate.modelUrl,
        modelPath,
        usedFallback: i > 0,
      };
    } catch (error) {
      lastError = error;
      if (i < candidates.length - 1) {
        console.warn(
          `[sugaragent:bundle] primary model download failed, trying fallback profile artifact...`,
        );
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('Failed to download profile model');
}

function installRuntimeBinary(runtimeArchivePath) {
  const listing = run('tar', ['-tzf', runtimeArchivePath]);
  const lines = listing.split('\n').filter(Boolean);
  const binaryEntry = lines.find(
    (line) => line.endsWith(`/${PRIMARY_RUNTIME_BINARY}`) || line === PRIMARY_RUNTIME_BINARY,
  ) ?? lines.find((line) => line.endsWith(`/${FALLBACK_RUNTIME_BINARY}`) || line === FALLBACK_RUNTIME_BINARY);
  if (!binaryEntry) {
    throw new Error(`Unable to locate ${PRIMARY_RUNTIME_BINARY} or ${FALLBACK_RUNTIME_BINARY} in runtime archive`);
  }

  const tempExtractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-llama-extract-'));
  run('tar', ['-xzf', runtimeArchivePath, '-C', tempExtractDir], {
    stdio: 'inherit',
  });

  const binaryEntryDir = path.dirname(binaryEntry);
  const extractedBinDir = path.join(tempExtractDir, binaryEntryDir);
  if (!fs.existsSync(extractedBinDir)) {
    throw new Error(`Unable to locate extracted runtime directory: ${binaryEntryDir}`);
  }

  fs.rmSync(BIN_DIR, { recursive: true, force: true });
  fs.mkdirSync(BIN_DIR, { recursive: true });
  run('cp', ['-R', '-L', `${extractedBinDir}/.`, BIN_DIR], {
    stdio: 'inherit',
  });

  const completionPath = path.join(BIN_DIR, PRIMARY_RUNTIME_BINARY);
  const cliPath = path.join(BIN_DIR, FALLBACK_RUNTIME_BINARY);
  const targetBinaryPath = fs.existsSync(completionPath) ? completionPath : cliPath;
  if (!fs.existsSync(targetBinaryPath)) {
    throw new Error(
      `${PRIMARY_RUNTIME_BINARY} or ${FALLBACK_RUNTIME_BINARY} not found after runtime extraction`,
    );
  }
  fs.chmodSync(targetBinaryPath, 0o755);
}

function resolveRuntimeBinaryPath() {
  const completionPath = path.join(BIN_DIR, PRIMARY_RUNTIME_BINARY);
  const cliPath = path.join(BIN_DIR, FALLBACK_RUNTIME_BINARY);
  if (fs.existsSync(completionPath)) return completionPath;
  if (fs.existsSync(cliPath)) return cliPath;
  return completionPath;
}

function writeLockFile(metadata) {
  fs.writeFileSync(LOCK_PATH, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

function getFileSize(filePath) {
  return fs.statSync(filePath).size;
}

function resolveLockModelPath() {
  if (!fs.existsSync(LOCK_PATH)) return null;
  try {
    const raw = fs.readFileSync(LOCK_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const relativePath = parsed?.model?.modelPath;
    if (typeof relativePath !== 'string' || relativePath.length === 0) return null;
    const resolved = path.resolve(relativePath);
    return fs.existsSync(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function isDirectExecution(metaUrl) {
  const entryPoint = process.argv[1];
  if (!entryPoint) return false;
  return metaUrl === pathToFileURL(path.resolve(entryPoint)).href;
}

export function runSugarAgentBundleCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.listProfiles) {
    printProfiles();
    return;
  }
  ensureBundleDirs();
  const selectedProfile = getModelProfile(args.profile);
  if (!selectedProfile) {
    throw new Error(`Unknown profile: ${args.profile}`);
  }

  const binaryPath = resolveRuntimeBinaryPath();
  const modelPath = path.join(MODEL_DIR, args.modelFileName);
  const binaryExists = fs.existsSync(binaryPath);
  const lockedModelPath = resolveLockModelPath();
  const existingModelPath = lockedModelPath ?? modelPath;
  const modelExists = fs.existsSync(existingModelPath);

  if (binaryExists && modelExists && !args.force) {
    console.log('[sugaragent:bundle] Bundle already present. Use --force to re-download.');
    console.log(`[sugaragent:bundle] profile=${selectedProfile.id}`);
    console.log(`[sugaragent:bundle] runtime-binary=${binaryPath}`);
    console.log(`[sugaragent:bundle] model=${existingModelPath}`);
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-bundle-'));
  const runtimeArchivePath = path.join(tempDir, 'llama-runtime.tar.gz');

  console.log('[sugaragent:bundle] Downloading llama.cpp runtime archive...');
  downloadFile(args.runtimeArchiveUrl, runtimeArchivePath);
  console.log('[sugaragent:bundle] Installing llama.cpp runtime binaries...');
  installRuntimeBinary(runtimeArchivePath);
  const installedBinaryPath = resolveRuntimeBinaryPath();

  console.log(`[sugaragent:bundle] Preparing GGUF model for profile "${selectedProfile.id}"...`);
  const modelDownload = downloadProfileModel(selectedProfile, args);

  const metadata = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runtime: {
      archiveUrl: args.runtimeArchiveUrl,
      binaryPath: path.relative(process.cwd(), installedBinaryPath),
      binaryBytes: getFileSize(installedBinaryPath),
    },
    model: {
      profile: selectedProfile.id,
      url: modelDownload.modelUrl,
      modelPath: path.relative(process.cwd(), modelDownload.modelPath),
      modelBytes: getFileSize(modelDownload.modelPath),
      repo: modelDownload.repo,
      modelFileName: modelDownload.modelFileName,
      usedFallback: modelDownload.usedFallback,
    },
  };
  writeLockFile(metadata);

  console.log('[sugaragent:bundle] Bundle ready.');
  console.log(`[sugaragent:bundle] profile=${selectedProfile.id}`);
  console.log(`[sugaragent:bundle] runtime-binary=${installedBinaryPath}`);
  console.log(`[sugaragent:bundle] model=${modelDownload.modelPath}`);
  console.log(`[sugaragent:bundle] lock=${LOCK_PATH}`);
}

export function runSugarAgentBundleCliFromProcess(argv = process.argv.slice(2)) {
  try {
    runSugarAgentBundleCli(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sugaragent:bundle] ${message}`);
    process.exit(1);
  }
}

if (isDirectExecution(import.meta.url)) {
  runSugarAgentBundleCliFromProcess();
}
