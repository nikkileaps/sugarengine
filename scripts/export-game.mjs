#!/usr/bin/env node
/**
 * Export project data for production builds.
 *
 * Usage:
 *   node scripts/export-game.mjs --slug rackwick-city
 *   node scripts/export-game.mjs --slug wordlark --project games/wordlark/project.sgrgame
 *   node scripts/export-game.mjs --slug rackwick-city --project /path/to/project.sgrgame --out /tmp/game.json
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveGameSlug } from './lib/active-game.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const result = {
    slug: process.env.GAME_SLUG || '',
    projectPath: '',
    outPath: '',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--slug') {
      result.slug = argv[i + 1] || result.slug;
      i++;
      continue;
    }
    if (arg === '--project') {
      result.projectPath = argv[i + 1] || '';
      i++;
      continue;
    }
    if (arg === '--out') {
      result.outPath = argv[i + 1] || '';
      i++;
      continue;
    }
    if (!arg.startsWith('--') && !result.projectPath) {
      // Back-compat positional project file argument.
      result.projectPath = arg;
    }
  }

  return result;
}

async function resolveProjectPath(rawProjectPath, slug) {
  if (rawProjectPath) {
    return path.isAbsolute(rawProjectPath)
      ? rawProjectPath
      : path.join(projectRoot, rawProjectPath);
  }

  return path.join(projectRoot, 'games', slug, 'project.sgrgame');
}

function normalizeGameMeta(project, slug) {
  const inputMeta = typeof project.meta === 'object' && project.meta !== null
    ? project.meta
    : {};

  const gameId = typeof inputMeta.gameId === 'string' && inputMeta.gameId.trim()
    ? inputMeta.gameId.trim()
    : slug;

  const name = typeof inputMeta.name === 'string' && inputMeta.name.trim()
    ? inputMeta.name.trim()
    : slug;

  return {
    ...inputMeta,
    gameId,
    name,
    contentBasePath: `games/${slug}/assets/`,
  };
}

async function exportGame() {
  const args = parseArgs(process.argv.slice(2));
  const slug = await resolveGameSlug({ cliSlug: args.slug });
  if (!slug) {
    console.error('✗ Missing game selection. Use --slug <game-slug>, set GAME_SLUG, or run: npm run game:use -- <game-slug>');
    process.exit(1);
  }

  const projectPath = await resolveProjectPath(args.projectPath, slug);
  const outputPath = args.outPath
    ? (path.isAbsolute(args.outPath) ? args.outPath : path.join(projectRoot, args.outPath))
    : path.join(projectRoot, 'public', 'games', slug, 'game.json');

  console.log(`Slug: ${slug}`);
  console.log(`Reading project from: ${projectPath}`);

  try {
    const content = await fs.readFile(projectPath, 'utf-8');
    const project = JSON.parse(content);

    const gameData = {
      ...project,
      meta: normalizeGameMeta(project, slug),
      defaultEpisode: project.defaultEpisode || project.episodes?.[0]?.id,
    };

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write game.json
    await fs.writeFile(outputPath, `${JSON.stringify(gameData, null, 2)}\n`);

    console.log(`✓ Exported to: ${outputPath}`);
    console.log(`  Episodes: ${project.episodes?.length || 0}`);
    console.log(`  Regions: ${project.regions?.length || 0}`);
    console.log(`  Dialogues: ${project.dialogues?.length || 0}`);
    console.log(`  Quests: ${project.quests?.length || 0}`);
    console.log(`  NPCs: ${project.npcs?.length || 0}`);
    console.log(`  Items: ${project.items?.length || 0}`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`✗ Project file not found: ${projectPath}`);
      console.error('');
      console.error('Usage: node scripts/export-game.mjs --slug <game-slug> [--project path/to/project.sgrgame]');
      console.error('');
      console.error('Expected default project location: games/<slug>/project.sgrgame');
      console.error('Save your project there, or pass --project explicitly.');
      process.exit(1);
    }
    console.error('✗ Export failed:', err.message);
    process.exit(1);
  }
}

exportGame();
