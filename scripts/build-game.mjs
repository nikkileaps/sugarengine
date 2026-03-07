#!/usr/bin/env node

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { resolveGameSelection } from './lib/active-game.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function runOrExit(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main() {
  const selection = await resolveGameSelection();
  if (!selection?.slug || !selection.rootPath || !selection.projectFilePath) {
    console.error('✗ Missing active game selection with root path.');
    console.error('  Open the game in SugarEngine or run: npm run game:use -- <game-slug|/path/to/project.sgrgame>');
    process.exit(1);
  }

  const env = {
    ...process.env,
    GAME_SLUG: selection.slug,
    GAME_ROOT: selection.rootPath,
    GAME_PROJECT: selection.projectFilePath,
    VITE_GAME_SLUG: selection.slug,
  };

  const publicGamesDir = path.join(projectRoot, 'public', 'games');
  if (fsSync.existsSync(publicGamesDir)) {
    // Avoid cross-game bleed: rebuild staged public/games from scratch each build.
    await fs.rm(publicGamesDir, { recursive: true, force: true });
  }

  console.log(`Building game: ${selection.slug}`);
  runOrExit('npm', ['run', 'game:export'], env);
  runOrExit('npm', ['run', 'game:stage'], env);
  runOrExit('npx', ['vite', 'build', '--config', 'vite.config.game.ts'], env);

  const gameHtmlPath = path.join(projectRoot, 'dist-game', 'game.html');
  const indexHtmlPath = path.join(projectRoot, 'dist-game', 'index.html');

  if (fsSync.existsSync(gameHtmlPath)) {
    if (fsSync.existsSync(indexHtmlPath)) {
      await fs.rm(indexHtmlPath, { force: true });
    }
    await fs.rename(gameHtmlPath, indexHtmlPath);
  }
}

main().catch((err) => {
  console.error(`✗ game:build failed: ${err.message}`);
  process.exit(1);
});
