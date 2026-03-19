import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import {
  DEFAULT_MODEL_PROFILE,
  getModelProfile,
} from './model-profiles.js';
import { REPLY_PARTS_JSON_SCHEMA } from '../session/core/grounding/reply-parts.js';
import {
  normalizeOptionalString,
  resolveBundleAssetPath,
  resolveRuntimeBundleDir,
} from './asset-paths.js';
import type {
  JsonGenerationRequest,
  JsonGenerationService,
} from '../services.js';

const execFileAsync = promisify(execFile);

export interface LocalLlamaGenerationServiceOptions {
  llamaBin?: string | null;
  modelPath?: string | null;
  llamaTimeoutMs?: number;
  llamaBinArgs?: string[];
  llamaArgs?: string[];
}

function resolveLockedBundlePath(selector: (parsed: any) => unknown): string | null {
  const bundleDir = resolveRuntimeBundleDir();
  if (!bundleDir) return null;
  const bundleLockPath = path.join(bundleDir, 'bundle.lock.json');
  if (!fs.existsSync(bundleLockPath)) return null;
  try {
    const raw = fs.readFileSync(bundleLockPath, 'utf8');
    const parsed = JSON.parse(raw);
    const lockedPath = normalizeOptionalString(selector(parsed));
    if (!lockedPath) return null;
    const resolved = resolveBundleAssetPath({ bundleDir, lockedPath });
    return fs.existsSync(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function resolveBundledModelPath(): string | null {
  const bundleDir = resolveRuntimeBundleDir();
  if (!bundleDir) return null;
  const locked = resolveLockedBundlePath((parsed) => parsed?.model?.modelPath);
  if (locked) return locked;

  const profile = getModelProfile(DEFAULT_MODEL_PROFILE);
  const profileModel = normalizeOptionalString(profile?.modelFileName);
  const profileFallback = normalizeOptionalString(profile?.fallbackModelFileName);
  const profileCandidates = [profileModel, profileFallback]
    .filter(Boolean)
    .map((fileName) => path.join(bundleDir, 'models', fileName));
  const legacyBundledModelPath = path.join(bundleDir, 'models', 'qwen2.5-0.5b-instruct-q2_k.gguf');

  for (const candidate of profileCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  if (fs.existsSync(legacyBundledModelPath)) return legacyBundledModelPath;
  return null;
}

function resolveBundledLlamaBin(): string | null {
  const bundleDir = resolveRuntimeBundleDir();
  if (!bundleDir) return null;
  const locked = resolveLockedBundlePath((parsed) => parsed?.runtime?.binaryPath);
  if (locked) return locked;
  const defaultBundledLlamaBin = path.resolve(bundleDir, 'bin/llama-completion');
  return fs.existsSync(defaultBundledLlamaBin) ? defaultBundledLlamaBin : null;
}

function commandExists(command: string | null | undefined): boolean {
  if (!command) return false;
  if (command.includes('/') || command.startsWith('.')) {
    return fs.existsSync(command);
  }
  const lookup = spawnSync('which', [command], { encoding: 'utf8' });
  return lookup.status === 0;
}

function resolveCommandFromPath(command: string): string | null {
  const lookup = spawnSync('which', [command], { encoding: 'utf8' });
  if (lookup.status !== 0) return null;
  const resolved = normalizeOptionalString(lookup.stdout);
  return resolved ?? command;
}

function sanitizeRuntimeOutput(text: unknown): string {
  const source = String(text ?? '');
  const withoutAnsi = source
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001B\][^\u0007]*(\u0007|\u001B\\)/g, '');
  return withoutAnsi.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export function createLocalLlamaGenerationService(
  options: LocalLlamaGenerationServiceOptions = {},
): JsonGenerationService {
  const commandPath = normalizeOptionalString(options.llamaBin)
    ?? normalizeOptionalString(process.env.SUGARAGENT_LLAMA_BIN)
    ?? resolveCommandFromPath('llama-completion')
    ?? resolveBundledLlamaBin();
  const modelPath = normalizeOptionalString(options.modelPath)
    ?? normalizeOptionalString(process.env.SUGARAGENT_MODEL_PATH)
    ?? resolveBundledModelPath();
  const timeoutMs = Number.isFinite(options.llamaTimeoutMs)
    ? Math.max(1, Math.floor(options.llamaTimeoutMs as number))
    : 120000;
  const llamaBinArgs = Array.isArray(options.llamaBinArgs)
    ? options.llamaBinArgs.map((entry) => String(entry))
    : [];
  const llamaArgs = Array.isArray(options.llamaArgs)
    ? options.llamaArgs.map((entry) => String(entry))
    : [];
  let loaded = false;

  return {
    name: 'llama',
    async health() {
      if (!commandPath || !commandExists(commandPath)) {
        return { ok: false, detail: `llama binary not found: ${commandPath ?? '(missing)'}` };
      }
      if (!modelPath || !fs.existsSync(modelPath)) {
        return { ok: false, detail: `model file not found: ${modelPath ?? '(missing)'}` };
      }
      return { ok: true, detail: 'llama-runtime-ready' };
    },
    async loadModel() {
      if (!modelPath || !fs.existsSync(modelPath)) {
        throw new Error(`Model file not found: ${modelPath ?? '(missing)'}`);
      }
      loaded = true;
    },
    async unloadModel() {
      loaded = false;
    },
    async generateStructured(request: JsonGenerationRequest) {
      if (!loaded) {
        throw new Error('Model must be loaded before generateStructured');
      }
      const prompt = typeof request?.prompt === 'string'
        ? request.prompt.trim()
        : '';
      if (!prompt) {
        throw new Error('Prompt must be a non-empty string');
      }

      if (!commandPath) {
        throw new Error('llama binary not configured');
      }
      if (!modelPath) {
        throw new Error('llama model path not configured');
      }

      const commandName = path.basename(commandPath);
      const isCompletionBinary = commandName === 'llama-completion';
      const attempt = Number.isFinite(request?.attempt) ? Math.max(1, Math.floor(request.attempt as number)) : 1;
      const temperature = normalizeOptionalString(request?.temperature)
        ?? (attempt >= 3 ? '0.95' : attempt === 2 ? '0.75' : '0.55');
      const schemaText = normalizeOptionalString(request?.schemaText) ?? REPLY_PARTS_JSON_SCHEMA;
      const maxTokens = Number.isFinite(request?.maxTokens) ? Math.max(32, Math.floor(request.maxTokens as number)) : 180;

      const argsForExec = [
        ...llamaBinArgs,
        '-m',
        modelPath,
        '--device',
        'none',
        '--single-turn',
        ...(isCompletionBinary ? ['--no-conversation'] : []),
        '--no-display-prompt',
        '--color',
        'off',
        '--json-schema',
        schemaText,
        '-n',
        String(maxTokens),
        '--ctx-size',
        '4096',
        '--temp',
        temperature,
        '--top-k',
        '60',
        '--top-p',
        '0.92',
        '--repeat-penalty',
        '1.15',
        '--presence-penalty',
        '0.3',
        '--frequency-penalty',
        '0.25',
        '--no-warmup',
        '-p',
        prompt,
        ...llamaArgs,
      ];

      const { stdout = '', stderr = '' } = await execFileAsync(commandPath, argsForExec, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      });
      const combined = `${stdout}\n${stderr}`;
      const rawText = sanitizeRuntimeOutput(combined).trim();
      return { jsonText: rawText, rawText };
    },
  };
}
