#!/usr/bin/env node

import path from 'path';
import {
  activeGameFile,
  gameExists,
  listGameSlugs,
  readActiveGameSlug,
  writeActiveGameSlug,
} from './lib/active-game.mjs';

function printUsage() {
  console.log('Usage: npm run game:use -- <game-slug>');
}

async function main() {
  const slugArg = (process.argv[2] || '').trim();

  if (!slugArg) {
    const current = await readActiveGameSlug();
    if (current) {
      console.log(`Active game: ${current}`);
      console.log(`Config file: ${path.relative(process.cwd(), activeGameFile)}`);
    } else {
      console.log('No active game selected.');
      printUsage();
    }

    const available = listGameSlugs();
    if (available.length > 0) {
      console.log(`Available games: ${available.join(', ')}`);
    }
    return;
  }

  if (!gameExists(slugArg)) {
    console.error(`✗ Unknown game slug: ${slugArg}`);
    const available = listGameSlugs();
    if (available.length > 0) {
      console.error(`  Available games: ${available.join(', ')}`);
    }
    process.exit(1);
  }

  await writeActiveGameSlug(slugArg);
  console.log(`✓ Active game set to: ${slugArg}`);
}

main().catch((err) => {
  console.error(`✗ Failed to set active game: ${err.message}`);
  process.exit(1);
});
