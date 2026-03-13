/**
 * @file fs-paths.ts
 * @description Cross-platform string path helpers for editor game-root workflows.
 */

import {
  GAME_CONFIG_FILE,
  PROJECT_FILE_NAME,
  PUBLISHED_ASSETS_MANIFEST_FILE,
} from './project-document';

export interface GameRootPaths {
  rootPath: string;
  projectFilePath: string;
  assetsPath: string;
  pluginsPath: string;
  runtimePath: string;
  runtimeBinPath: string;
  runtimeModelsPath: string;
  configPath: string;
  gameConfigPath: string;
  manifestsPath: string;
  publishedAssetsManifestPath: string;
  exportsPath: string;
}

export function detectPathSeparator(value: string): '/' | '\\' {
  return value.includes('\\') ? '\\' : '/';
}

export function trimTrailingSeparators(value: string): string {
  return value.replace(/[\\/]+$/, '');
}

export function normalizeInputPath(value: string): string {
  return trimTrailingSeparators(value.trim());
}

export function basenameFsPath(value: string): string {
  const normalized = trimTrailingSeparators(value);
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

export function dirnameFsPath(value: string): string {
  const normalized = trimTrailingSeparators(value);
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (index < 0) return normalized;
  if (index === 0) return normalized.slice(0, 1);
  return normalized.slice(0, index);
}

export function joinFsPath(rootPath: string, ...segments: string[]): string {
  const separator = detectPathSeparator(rootPath);
  const normalizedRoot = trimTrailingSeparators(rootPath);
  const cleanSegments = segments
    .map((segment) => segment.replace(/^[\\/]+/, '').replace(/[\\/]+$/, ''))
    .filter((segment) => segment.length > 0);
  return [normalizedRoot, ...cleanSegments].join(separator);
}

export function isProjectFilePath(value: string): boolean {
  return basenameFsPath(value).toLowerCase() === PROJECT_FILE_NAME.toLowerCase();
}

export function resolveGameRootPaths(rootPath: string): GameRootPaths {
  const normalizedRoot = normalizeInputPath(rootPath);
  return {
    rootPath: normalizedRoot,
    projectFilePath: joinFsPath(normalizedRoot, PROJECT_FILE_NAME),
    assetsPath: joinFsPath(normalizedRoot, 'assets'),
    pluginsPath: joinFsPath(normalizedRoot, 'plugins'),
    runtimePath: joinFsPath(normalizedRoot, 'runtime'),
    runtimeBinPath: joinFsPath(normalizedRoot, 'runtime', 'bin'),
    runtimeModelsPath: joinFsPath(normalizedRoot, 'runtime', 'models'),
    configPath: joinFsPath(normalizedRoot, 'config'),
    gameConfigPath: joinFsPath(normalizedRoot, 'config', GAME_CONFIG_FILE),
    manifestsPath: joinFsPath(normalizedRoot, 'manifests'),
    publishedAssetsManifestPath: joinFsPath(normalizedRoot, 'manifests', PUBLISHED_ASSETS_MANIFEST_FILE),
    exportsPath: joinFsPath(normalizedRoot, 'exports'),
  };
}

export function inferGameRootFromInputPath(inputPath: string): { rootPath: string; projectFilePath: string } {
  const normalized = normalizeInputPath(inputPath);
  if (isProjectFilePath(normalized)) {
    return {
      rootPath: dirnameFsPath(normalized),
      projectFilePath: normalized,
    };
  }

  const paths = resolveGameRootPaths(normalized);
  return {
    rootPath: paths.rootPath,
    projectFilePath: paths.projectFilePath,
  };
}
