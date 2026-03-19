import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_BUNDLE_DIR = path.resolve(__dirname, '../../../../src/plugins/sugaragent/runtime/bundle');

export function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveExistingPath(candidate: string | undefined): string | null {
  if (!candidate) return null;
  const resolved = path.resolve(candidate);
  return fs.existsSync(resolved) ? resolved : null;
}

export function resolveRuntimeBundleDir(): string | null {
  const explicit = resolveExistingPath(normalizeOptionalString(process.env.SUGARAGENT_RUNTIME_BUNDLE_DIR));
  if (explicit) return explicit;
  return resolveExistingPath(WORKSPACE_BUNDLE_DIR);
}

export function resolveEmbeddingModelDir(): string | null {
  const explicit = resolveExistingPath(normalizeOptionalString(process.env.SUGARAGENT_EMBEDDING_MODEL_DIR));
  if (explicit) return explicit;
  const bundleDir = resolveRuntimeBundleDir();
  if (!bundleDir) return null;
  return resolveExistingPath(path.join(bundleDir, 'embeddings', 'all-MiniLM-L6-v2'));
}

export function resolveBundleAssetPath(input: { bundleDir: string; lockedPath: string }): string {
  const normalized = input.lockedPath.replace(/\\/g, '/');
  const bundleMarkerIndex = normalized.indexOf('bundle/');
  if (bundleMarkerIndex >= 0) {
    const suffix = normalized.slice(bundleMarkerIndex + 'bundle/'.length);
    return path.join(input.bundleDir, suffix);
  }
  return path.resolve(input.lockedPath);
}
