/**
 * @file service.ts
 * @description Host-backed game-root lifecycle service for create/open/save workflows.
 */

import {
  createEmptyPublishedAssetsManifest,
  createStarterGameConfig,
  createStarterProjectDocument,
  normalizeLoadedProjectDocument,
  stringifyProjectDocument,
  type EditorProjectDocument,
} from './project-document';
import {
  inferGameRootFromInputPath,
  joinFsPath,
  resolveGameRootPaths,
  type GameRootPaths,
} from './fs-paths';
import { buildWebReleaseTargetScaffold } from './release-target-scaffold';
import type {
  SugarAgentGenerationConfig,
  WebPublishEnvironment,
  WebPublishFrontendConfig,
  WebPublishProfile,
  WebPublishTarget,
} from './web-publish-profile';
import {
  normalizeWebPublishSugarAgentGenerationConfig,
} from './web-publish-profile';

const GAME_ROOT_ENDPOINT = '/__sugarengine/game-root';
const GAME_ROOT_PICKER_ENDPOINT = '/__sugarengine/pick-directory';
const GAME_PROJECT_PICKER_ENDPOINT = '/__sugarengine/pick-project-file';
interface GameRootResponse {
  ok: boolean;
  rootPath?: string;
  projectFilePath?: string;
  project?: unknown;
  exportPath?: string;
  target?: WebPublishTarget;
  environment?: WebPublishEnvironment;
  profilePath?: string;
  frontend?: WebPublishFrontendConfig;
  sugaragent?: WebPublishProfile['sugaragent'];
  error?: string;
}

interface DirectoryPickerResponse {
  ok: boolean;
  path?: string | null;
  cancelled?: boolean;
  error?: string;
}

interface TauriFsModule {
  exists: (path: string) => Promise<boolean>;
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  readTextFile: (path: string) => Promise<string>;
  writeTextFile: (path: string, content: string) => Promise<void>;
}

export interface OpenGameResult {
  rootPath: string;
  projectFilePath: string;
  project: EditorProjectDocument;
}

export interface CreateGameInput {
  rootPath: string;
  name: string;
  slug: string;
}

export interface PublishWebTargetInput {
  rootPath: string;
  projectFilePath: string;
  gameId: string;
  target: WebPublishTarget;
  environment: WebPublishEnvironment;
  frontend: WebPublishFrontendConfig;
  sugaragent?: {
    generation: SugarAgentGenerationConfig;
  };
}

export interface PublishWebTargetResult {
  rootPath: string;
  projectFilePath: string;
  exportPath: string;
}

export interface LoadWebPublishProfileInput {
  rootPath: string;
  environment: WebPublishEnvironment;
}

export interface LoadWebPublishProfileResult extends WebPublishProfile {}

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

async function loadTauriFs(): Promise<TauriFsModule> {
  return import('@tauri-apps/plugin-fs' as string) as unknown as Promise<TauriFsModule>;
}

async function postGameRootOperation(payload: Record<string, unknown>): Promise<GameRootResponse> {
  const response = await fetch(GAME_ROOT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({} as GameRootResponse));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error ?? `${response.status} ${response.statusText}`);
  }
  return data;
}

async function registerOpenGameRoot(gameId: string, rootPath: string): Promise<void> {
  try {
    await postGameRootOperation({ op: 'register', gameId, rootPath });
  } catch {
    // Vite host registration is only available in local editor/dev workflows.
  }
}

async function writeScaffoldFiles(
  fsApi: TauriFsModule,
  rootPaths: GameRootPaths,
  project: EditorProjectDocument,
): Promise<void> {
  const directories = [
    rootPaths.rootPath,
    rootPaths.assetsPath,
    joinFsPath(rootPaths.assetsPath, 'audio'),
    joinFsPath(rootPaths.assetsPath, 'items'),
    joinFsPath(rootPaths.assetsPath, 'models'),
    joinFsPath(rootPaths.assetsPath, 'regions'),
    joinFsPath(rootPaths.assetsPath, 'ui'),
    rootPaths.pluginsPath,
    rootPaths.runtimePath,
    rootPaths.runtimeBinPath,
    rootPaths.runtimeModelsPath,
    rootPaths.configPath,
    rootPaths.manifestsPath,
    rootPaths.exportsPath,
    rootPaths.webExportPath,
  ];

  for (const directory of directories) {
    await fsApi.mkdir(directory, { recursive: true });
  }

  await fsApi.writeTextFile(rootPaths.projectFilePath, stringifyProjectDocument(project));
  await fsApi.writeTextFile(
    rootPaths.gameConfigPath,
    `${JSON.stringify(createStarterGameConfig(project.meta.gameId), null, 2)}\n`,
  );
  await fsApi.writeTextFile(
    rootPaths.publishedAssetsManifestPath,
    `${JSON.stringify(createEmptyPublishedAssetsManifest(), null, 2)}\n`,
  );

  const webTargetScaffold = buildWebReleaseTargetScaffold(rootPaths, {
    gameId: project.meta.gameId,
    gameName: project.meta.name,
  });
  for (const directory of webTargetScaffold.directories) {
    await fsApi.mkdir(directory, { recursive: true });
  }
  for (const file of webTargetScaffold.files) {
    if (file.overwrite === 'never' && await fsApi.exists(file.path)) continue;
    await fsApi.writeTextFile(file.path, file.content);
  }
}

async function createGameWithTauri(input: CreateGameInput): Promise<OpenGameResult> {
  const fsApi = await loadTauriFs();
  const rootPaths = resolveGameRootPaths(input.rootPath);
  const project = createStarterProjectDocument({
    gameId: input.slug,
    name: input.name,
  });

  const conflictingPaths = [
    rootPaths.projectFilePath,
    rootPaths.gameConfigPath,
    rootPaths.publishedAssetsManifestPath,
  ];

  for (const filePath of conflictingPaths) {
    if (await fsApi.exists(filePath)) {
      throw new Error(`Refusing to scaffold over existing file: ${filePath}`);
    }
  }

  await writeScaffoldFiles(fsApi, rootPaths, project);
  await registerOpenGameRoot(project.meta.gameId, rootPaths.rootPath);

  return {
    rootPath: rootPaths.rootPath,
    projectFilePath: rootPaths.projectFilePath,
    project,
  };
}

async function openGameWithTauri(inputPath: string): Promise<OpenGameResult> {
  const fsApi = await loadTauriFs();
  const resolved = inferGameRootFromInputPath(inputPath);
  if (!await fsApi.exists(resolved.projectFilePath)) {
    throw new Error(`No project.sgrgame found at ${resolved.projectFilePath}`);
  }

  const raw = await fsApi.readTextFile(resolved.projectFilePath);
  const project = normalizeLoadedProjectDocument(JSON.parse(raw), {
    fallbackName: resolved.rootPath,
  });
  await registerOpenGameRoot(project.meta.gameId, resolved.rootPath);

  return {
    rootPath: resolved.rootPath,
    projectFilePath: resolved.projectFilePath,
    project,
  };
}

async function saveGameWithTauri(result: OpenGameResult): Promise<void> {
  const fsApi = await loadTauriFs();
  await fsApi.writeTextFile(result.projectFilePath, stringifyProjectDocument(result.project));
  await registerOpenGameRoot(result.project.meta.gameId, result.rootPath);
}

export async function createGame(input: CreateGameInput): Promise<OpenGameResult> {
  if (isTauriEnvironment()) {
    return createGameWithTauri(input);
  }

  const response = await postGameRootOperation({ op: 'create', ...input });
  if (!response.rootPath || !response.projectFilePath) {
    throw new Error('Game root creation did not return filesystem paths.');
  }

  const project = normalizeLoadedProjectDocument(response.project, {
    fallbackName: input.name,
    fallbackGameId: input.slug,
  });

  return {
    rootPath: response.rootPath,
    projectFilePath: response.projectFilePath,
    project,
  };
}

export async function openGame(inputPath: string): Promise<OpenGameResult> {
  if (isTauriEnvironment()) {
    return openGameWithTauri(inputPath);
  }

  const response = await postGameRootOperation({ op: 'open', path: inputPath });
  if (!response.rootPath || !response.projectFilePath) {
    throw new Error('Open game did not return filesystem paths.');
  }

  const project = normalizeLoadedProjectDocument(response.project, {
    fallbackName: response.rootPath,
  });

  return {
    rootPath: response.rootPath,
    projectFilePath: response.projectFilePath,
    project,
  };
}

export async function saveGame(result: OpenGameResult): Promise<void> {
  if (isTauriEnvironment()) {
    await saveGameWithTauri(result);
    return;
  }

  await postGameRootOperation({
    op: 'save',
    rootPath: result.rootPath,
    projectFilePath: result.projectFilePath,
    project: result.project,
  });
}

export async function publishWebTarget(input: PublishWebTargetInput): Promise<PublishWebTargetResult> {
  if (isTauriEnvironment()) {
    throw new Error('Web target publishing is not wired for the desktop build yet. Use the local editor/dev host for now.');
  }

  const response = await postGameRootOperation({
    op: 'publish-web',
    rootPath: input.rootPath,
    projectFilePath: input.projectFilePath,
    gameId: input.gameId,
    target: input.target,
    environment: input.environment,
    frontend: input.frontend,
    sugaragent: input.sugaragent,
  });

  if (!response.rootPath || !response.projectFilePath || !response.exportPath) {
    throw new Error('Publish web target did not return the export path.');
  }

  return {
    rootPath: response.rootPath,
    projectFilePath: response.projectFilePath,
    exportPath: response.exportPath,
  };
}

export async function loadWebPublishProfile(
  input: LoadWebPublishProfileInput,
): Promise<LoadWebPublishProfileResult> {
  if (isTauriEnvironment()) {
    throw new Error('Web target profile loading is not wired for the desktop build yet. Use the local editor/dev host for now.');
  }

  const response = await postGameRootOperation({
    op: 'read-web-publish-profile',
    rootPath: input.rootPath,
    environment: input.environment,
  });

  if (
    response.target !== 'web'
    || (response.environment !== 'production' && response.environment !== 'staging')
    || typeof response.profilePath !== 'string'
    || typeof response.frontend?.gameApiBaseUrl !== 'string'
    || (response.frontend.credentials !== 'include'
      && response.frontend.credentials !== 'same-origin'
      && response.frontend.credentials !== 'omit')
  ) {
    throw new Error('Web target profile did not return the expected publish settings.');
  }

  return {
    target: response.target,
    environment: response.environment,
    profilePath: response.profilePath,
    frontend: {
      gameApiBaseUrl: response.frontend.gameApiBaseUrl,
      backendRequired: response.frontend.backendRequired === true,
      credentials: response.frontend.credentials,
    },
    sugaragent: {
      generation: normalizeWebPublishSugarAgentGenerationConfig(
        response.sugaragent
        && typeof response.sugaragent === 'object'
        && typeof response.sugaragent.generation === 'object'
          ? response.sugaragent.generation
          : null,
      ),
    },
  };
}

export async function registerGameRoot(gameId: string, rootPath: string): Promise<void> {
  await registerOpenGameRoot(gameId, rootPath);
}

export async function pickGameRootDirectory(): Promise<string | null> {
  const response = await fetch(GAME_ROOT_PICKER_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await response.json().catch(() => ({} as DirectoryPickerResponse));
  if (!response.ok) {
    throw new Error(data.error ?? `${response.status} ${response.statusText}`);
  }
  if (data.cancelled) return null;
  return typeof data.path === 'string' && data.path.trim().length > 0
    ? data.path.trim()
    : null;
}

export async function pickGameProjectFile(): Promise<string | null> {
  const response = await fetch(GAME_PROJECT_PICKER_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await response.json().catch(() => ({} as DirectoryPickerResponse));
  if (!response.ok) {
    throw new Error(data.error ?? `${response.status} ${response.statusText}`);
  }
  if (data.cancelled) return null;
  return typeof data.path === 'string' && data.path.trim().length > 0
    ? data.path.trim()
    : null;
}
