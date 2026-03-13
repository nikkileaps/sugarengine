/**
 * @file plugin-artifacts.ts
 * @description Client-side service for reading/writing plugin artifact files.
 *
 * Supports both Tauri (direct filesystem) and dev server (HTTP middleware) modes.
 * Artifacts are stored under {gameRoot}/plugins/{pluginId}/...
 */

import { joinFsPath } from './fs-paths';

const PLUGIN_ARTIFACT_ENDPOINT = '/__sugarengine/plugin-artifact';

interface PluginArtifactResponse {
  ok: boolean;
  content?: string;
  files?: string[];
  error?: string;
}

interface TauriFsModule {
  exists: (path: string) => Promise<boolean>;
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  readTextFile: (path: string) => Promise<string>;
  writeTextFile: (path: string, content: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  readDir: (path: string) => Promise<Array<{ name: string; isDirectory: boolean }>>;
}

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

async function loadTauriFs(): Promise<TauriFsModule> {
  return import('@tauri-apps/plugin-fs' as string) as unknown as Promise<TauriFsModule>;
}

async function postPluginArtifactOp(payload: Record<string, unknown>): Promise<PluginArtifactResponse> {
  const response = await fetch(PLUGIN_ARTIFACT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}) as PluginArtifactResponse);
  if (!response.ok || data.ok === false) {
    throw new Error(data.error ?? `${response.status} ${response.statusText}`);
  }
  return data;
}

/** List all JSON artifact files for a plugin. Returns relative paths. */
export async function listPluginArtifacts(
  gameRootPath: string,
  gameId: string,
  pluginId: string,
): Promise<string[]> {
  if (isTauriEnvironment()) {
    const fsApi = await loadTauriFs();
    const pluginDir = joinFsPath(gameRootPath, 'plugins', pluginId);
    if (!await fsApi.exists(pluginDir)) return [];

    const files: string[] = [];
    const walk = async (dir: string, prefix: string) => {
      const entries = await fsApi.readDir(dir);
      for (const entry of entries) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory) {
          await walk(joinFsPath(dir, entry.name), relativePath);
        } else if (entry.name.endsWith('.json')) {
          files.push(relativePath);
        }
      }
    };
    await walk(pluginDir, '');
    return files;
  }

  const data = await postPluginArtifactOp({ op: 'list', gameId, pluginId });
  return data.files ?? [];
}

/** Read a single plugin artifact file. Returns JSON string or null if not found. */
export async function readPluginArtifact(
  gameRootPath: string,
  gameId: string,
  pluginId: string,
  artifactPath: string,
): Promise<string | null> {
  if (isTauriEnvironment()) {
    const fsApi = await loadTauriFs();
    const filePath = joinFsPath(gameRootPath, 'plugins', pluginId, artifactPath);
    if (!await fsApi.exists(filePath)) return null;
    return await fsApi.readTextFile(filePath);
  }

  try {
    const data = await postPluginArtifactOp({ op: 'read', gameId, pluginId, artifactPath });
    return data.content ?? null;
  } catch {
    return null;
  }
}

/** Write a single plugin artifact file. Creates directories as needed. */
export async function writePluginArtifact(
  gameRootPath: string,
  gameId: string,
  pluginId: string,
  artifactPath: string,
  content: string,
): Promise<void> {
  if (isTauriEnvironment()) {
    const fsApi = await loadTauriFs();
    const filePath = joinFsPath(gameRootPath, 'plugins', pluginId, artifactPath);
    // Ensure parent directory
    const lastSlash = filePath.lastIndexOf('/');
    if (lastSlash > 0) {
      await fsApi.mkdir(filePath.slice(0, lastSlash), { recursive: true });
    }
    await fsApi.writeTextFile(filePath, content);
    return;
  }

  await postPluginArtifactOp({ op: 'write', gameId, pluginId, artifactPath, content });
}

/** Delete a single plugin artifact file. */
export async function deletePluginArtifact(
  gameRootPath: string,
  gameId: string,
  pluginId: string,
  artifactPath: string,
): Promise<void> {
  if (isTauriEnvironment()) {
    const fsApi = await loadTauriFs();
    const filePath = joinFsPath(gameRootPath, 'plugins', pluginId, artifactPath);
    if (await fsApi.exists(filePath)) {
      await fsApi.remove(filePath);
    }
    return;
  }

  await postPluginArtifactOp({ op: 'delete', gameId, pluginId, artifactPath });
}

/**
 * Read all sugarlang artifacts from a project and return them as a
 * Map<relativePath, jsonString>. This is the primary input for
 * deserializeContentBundle().
 */
export async function loadAllSugarlangArtifacts(
  gameRootPath: string,
  gameId: string,
): Promise<Map<string, string>> {
  const files = await listPluginArtifacts(gameRootPath, gameId, 'sugarlang');
  const result = new Map<string, string>();

  for (const relativePath of files) {
    const content = await readPluginArtifact(gameRootPath, gameId, 'sugarlang', relativePath);
    if (content !== null) {
      result.set(relativePath, content);
    }
  }

  return result;
}

/**
 * Write a full set of sugarlang artifacts to the project.
 * Takes a Map<relativePath, jsonString> as produced by serializeContentBundle().
 */
export async function writeAllSugarlangArtifacts(
  gameRootPath: string,
  gameId: string,
  files: Map<string, string>,
): Promise<void> {
  for (const [relativePath, content] of files) {
    await writePluginArtifact(gameRootPath, gameId, 'sugarlang', relativePath, content);
  }
}
