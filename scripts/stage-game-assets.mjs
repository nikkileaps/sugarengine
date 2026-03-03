#!/usr/bin/env node
/**
 * Stage a game's source assets into public/games/<slug>/ for Vite static serving.
 *
 * Usage:
 *   node scripts/stage-game-assets.mjs --slug rackwick-city
 *   node scripts/stage-game-assets.mjs --slug wordlark --no-clean
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveGameSlug } from './lib/active-game.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const result = {
    slug: process.env.GAME_SLUG || '',
    clean: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--slug') {
      result.slug = argv[i + 1] || result.slug;
      i++;
      continue;
    }
    if (arg === '--no-clean') {
      result.clean = false;
    }
  }

  return result;
}

async function stageAssets() {
  const args = parseArgs(process.argv.slice(2));
  const slug = await resolveGameSlug({ cliSlug: args.slug });
  if (!slug) {
    console.error('✗ Missing game selection. Use --slug <game-slug>, set GAME_SLUG, or run: npm run game:use -- <game-slug>');
    process.exit(1);
  }

  const sourceDir = path.join(projectRoot, 'games', slug, 'assets');
  const targetDir = path.join(projectRoot, 'public', 'games', slug, 'assets');

  if (!fsSync.existsSync(sourceDir)) {
    console.error(`✗ Source assets directory not found: ${sourceDir}`);
    process.exit(1);
  }

  if (args.clean && fsSync.existsSync(targetDir)) {
    await fs.rm(targetDir, { recursive: true, force: true });
  }

  await fs.mkdir(targetDir, { recursive: true });
  await fs.cp(sourceDir, targetDir, { recursive: true });

  console.log(`✓ Staged assets for '${slug}'`);
  console.log(`  from: ${sourceDir}`);
  console.log(`  to:   ${targetDir}`);
}

stageAssets().catch((err) => {
  console.error('✗ Failed to stage assets:', err.message);
  process.exit(1);
});
