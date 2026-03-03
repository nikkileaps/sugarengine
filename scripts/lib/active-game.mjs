import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(__dirname, '..', '..');
export const gamesRoot = path.join(projectRoot, 'games');
export const activeGameFile = path.join(gamesRoot, '.active-game');

function cleanSlug(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function readActiveGameSlug() {
  if (!fsSync.existsSync(activeGameFile)) {
    return '';
  }
  const content = await fs.readFile(activeGameFile, 'utf-8');
  return cleanSlug(content);
}

export async function writeActiveGameSlug(slug) {
  const clean = cleanSlug(slug);
  if (!clean) {
    throw new Error('Cannot write empty game slug');
  }
  await fs.mkdir(gamesRoot, { recursive: true });
  await fs.writeFile(activeGameFile, `${clean}\n`);
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

export async function resolveGameSlug({ cliSlug = '', envSlug = process.env.GAME_SLUG || '' } = {}) {
  const requested = cleanSlug(cliSlug) || cleanSlug(envSlug) || await readActiveGameSlug();
  if (!requested) {
    return '';
  }
  return requested;
}
