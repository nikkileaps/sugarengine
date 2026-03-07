#!/usr/bin/env node

import fsSync from 'fs';
import path from 'path';
import {
  activeGameFile,
  listGameSlugs,
  readActiveGameSelection,
  resolveSelectionFromInput,
  writeActiveGameSelection,
} from './lib/active-game.mjs';

function printUsage() {
  console.log('Usage: npm run game:use -- <game-slug | /path/to/game-root | /path/to/project.sgrgame>');
}

async function main() {
  const inputArg = (process.argv[2] || '').trim();

  if (!inputArg) {
    const current = await readActiveGameSelection();
    if (current?.slug) {
      console.log(`Active game: ${current.slug}`);
      if (current.rootPath) {
        console.log(`Root path: ${current.rootPath}`);
      }
      if (current.projectFilePath) {
        console.log(`Project file: ${current.projectFilePath}`);
      }
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

  const selection = await resolveSelectionFromInput(inputArg);
  if (!selection?.slug) {
    console.error(`✗ Could not resolve a game from: ${inputArg}`);
    process.exit(1);
  }
  if (selection.projectFilePath && !fsSync.existsSync(selection.projectFilePath)) {
    console.error(`✗ Project file not found: ${selection.projectFilePath}`);
    process.exit(1);
  }

  await writeActiveGameSelection(selection);
  console.log(`✓ Active game set to: ${selection.slug}`);
  if (selection.rootPath) {
    console.log(`  Root path: ${selection.rootPath}`);
  }
  if (selection.projectFilePath) {
    console.log(`  Project file: ${selection.projectFilePath}`);
  }
}

main().catch((err) => {
  console.error(`✗ Failed to set active game: ${err.message}`);
  process.exit(1);
});
