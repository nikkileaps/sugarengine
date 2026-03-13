import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(__dirname, '..', '..');
export const gamesRoot = path.join(projectRoot, 'games');
export const activeGameStateDir = path.join(projectRoot, '.sugarengine');
export const activeGameFile = path.join(activeGameStateDir, 'active-game.json');
export const legacyActiveGameFile = path.join(gamesRoot, '.active-game');
export const projectFileName = 'project.sgrgame';

function cleanSlug(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanPath(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toAbsoluteInputPath(value) {
  const trimmed = cleanPath(value);
  if (!trimmed) return '';
  return path.normalize(path.isAbsolute(trimmed) ? trimmed : path.join(projectRoot, trimmed));
}

function isProjectFilePath(value) {
  return path.basename(value).toLowerCase() === projectFileName;
}

function looksLikePath(value) {
  const trimmed = cleanPath(value);
  if (!trimmed) return false;
  return path.isAbsolute(trimmed)
    || trimmed.includes('/')
    || trimmed.includes('\\')
    || trimmed.toLowerCase().endsWith(`.${projectFileName.split('.').pop()}`);
}

function inferPathsFromInput(input) {
  const absoluteInput = toAbsoluteInputPath(input);
  if (!absoluteInput) {
    return {
      rootPath: '',
      projectFilePath: '',
    };
  }
  if (isProjectFilePath(absoluteInput)) {
    return {
      rootPath: path.dirname(absoluteInput),
      projectFilePath: absoluteInput,
    };
  }
  return {
    rootPath: absoluteInput,
    projectFilePath: path.join(absoluteInput, projectFileName),
  };
}

function normalizeSelection(value) {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value;
  const slug = cleanSlug(raw.slug ?? raw.gameId);
  const inputRoot = cleanPath(raw.rootPath);
  const inputProject = cleanPath(raw.projectFilePath);
  const rootPath = inputRoot ? toAbsoluteInputPath(inputRoot) : '';
  const projectFilePath = inputProject
    ? toAbsoluteInputPath(inputProject)
    : rootPath
      ? path.join(rootPath, projectFileName)
      : '';
  const derivedRootPath = !rootPath && projectFilePath
    ? path.dirname(projectFilePath)
    : rootPath;
  if (!slug) return null;
  return {
    slug,
    rootPath: derivedRootPath,
    projectFilePath,
  };
}

function readActiveGameSelectionSyncInternal() {
  if (fsSync.existsSync(activeGameFile)) {
    try {
      const parsed = JSON.parse(fsSync.readFileSync(activeGameFile, 'utf-8'));
      return normalizeSelection(parsed);
    } catch {
      return null;
    }
  }

  if (fsSync.existsSync(legacyActiveGameFile)) {
    const slug = cleanSlug(fsSync.readFileSync(legacyActiveGameFile, 'utf-8'));
    if (!slug) return null;
    const rootPath = path.join(gamesRoot, slug);
    return {
      slug,
      rootPath,
      projectFilePath: path.join(rootPath, projectFileName),
    };
  }

  return null;
}

async function readProjectSlug(projectFilePath) {
  const resolvedProjectPath = toAbsoluteInputPath(projectFilePath);
  if (!resolvedProjectPath || !fsSync.existsSync(resolvedProjectPath)) {
    return '';
  }
  try {
    const raw = await fs.readFile(resolvedProjectPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const meta = typeof parsed?.meta === 'object' && parsed.meta !== null ? parsed.meta : {};
    return cleanSlug(meta.gameId) || cleanSlug(meta.name);
  } catch {
    return '';
  }
}

export function readActiveGameSelectionSync() {
  return readActiveGameSelectionSyncInternal();
}

export async function readActiveGameSelection() {
  return readActiveGameSelectionSyncInternal();
}

export async function readActiveGameSlug() {
  const selection = await readActiveGameSelection();
  return selection?.slug ?? '';
}

export async function writeActiveGameSelection(selection) {
  const normalized = normalizeSelection(selection);
  if (!normalized?.slug) {
    throw new Error('Cannot write active game selection without slug');
  }
  await fs.mkdir(activeGameStateDir, { recursive: true });
  await fs.writeFile(activeGameFile, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8');
}

export async function writeActiveGameSlug(slug) {
  const clean = cleanSlug(slug);
  if (!clean) {
    throw new Error('Cannot write empty game slug');
  }
  const inRepoRoot = path.join(gamesRoot, clean);
  await writeActiveGameSelection({
    slug: clean,
    rootPath: fsSync.existsSync(inRepoRoot) ? inRepoRoot : '',
    projectFilePath: fsSync.existsSync(inRepoRoot)
      ? path.join(inRepoRoot, projectFileName)
      : '',
  });
}

export function listGameSlugs() {
  if (!fsSync.existsSync(gamesRoot)) {
    return [];
  }
  return fsSync.readdirSync(gamesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function gameExists(slug) {
  const clean = cleanSlug(slug);
  if (!clean) {
    return false;
  }
  return fsSync.existsSync(path.join(gamesRoot, clean));
}

export async function resolveGameSelection({
  cliSlug = '',
  cliPath = '',
  envSlug = process.env.GAME_SLUG || '',
  envPath = process.env.GAME_ROOT || process.env.GAME_PROJECT || '',
} = {}) {
  const requestedPath = cleanPath(cliPath) || cleanPath(envPath);
  if (requestedPath) {
    const inferred = inferPathsFromInput(requestedPath);
    const projectSlug = await readProjectSlug(inferred.projectFilePath);
    return {
      slug: cleanSlug(cliSlug) || projectSlug || path.basename(inferred.rootPath),
      rootPath: inferred.rootPath,
      projectFilePath: inferred.projectFilePath,
    };
  }

  const requestedSlug = cleanSlug(cliSlug) || cleanSlug(envSlug);
  const activeSelection = await readActiveGameSelection();
  if (requestedSlug) {
    if (activeSelection?.slug === requestedSlug) {
      return activeSelection;
    }
    if (gameExists(requestedSlug)) {
      const rootPath = path.join(gamesRoot, requestedSlug);
      return {
        slug: requestedSlug,
        rootPath,
        projectFilePath: path.join(rootPath, projectFileName),
      };
    }
    return {
      slug: requestedSlug,
      rootPath: '',
      projectFilePath: '',
    };
  }

  return activeSelection;
}

export async function resolveGameSlug(options = {}) {
  const selection = await resolveGameSelection(options);
  return selection?.slug ?? '';
}

export async function resolveSelectionFromInput(input) {
  const trimmed = cleanPath(input);
  if (!trimmed) {
    return null;
  }
  if (!looksLikePath(trimmed)) {
    if (gameExists(trimmed)) {
      const rootPath = path.join(gamesRoot, trimmed);
      return {
        slug: cleanSlug(trimmed),
        rootPath,
        projectFilePath: path.join(rootPath, projectFileName),
      };
    }
    const activeSelection = await readActiveGameSelection();
    if (activeSelection?.slug === cleanSlug(trimmed)) {
      return activeSelection;
    }
    return null;
  }

  const inferred = inferPathsFromInput(trimmed);
  const projectSlug = await readProjectSlug(inferred.projectFilePath);
  return {
    slug: projectSlug || cleanSlug(path.basename(inferred.rootPath)),
    rootPath: inferred.rootPath,
    projectFilePath: inferred.projectFilePath,
  };
}
