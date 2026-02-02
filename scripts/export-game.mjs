#!/usr/bin/env node
/**
 * Export project data for production build.
 *
 * Usage:
 *   node scripts/export-game.mjs [path/to/project.sgrgame]
 *
 * If no path is provided, looks for project.sgrgame in current directory.
 * Outputs to public/game.json for Vite to include in build.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function exportGame() {
  // Get project file path from args or default
  const projectPath = process.argv[2] || path.join(projectRoot, 'project.sgrgame');
  const outputPath = path.join(projectRoot, 'public', 'game.json');

  console.log(`Reading project from: ${projectPath}`);

  try {
    const content = await fs.readFile(projectPath, 'utf-8');
    const project = JSON.parse(content);

    // Transform to game format (add defaultEpisode if not present)
    const gameData = {
      ...project,
      defaultEpisode: project.defaultEpisode || project.episodes?.[0]?.id,
    };

    // Ensure public directory exists
    await fs.mkdir(path.join(projectRoot, 'public'), { recursive: true });

    // Write game.json
    await fs.writeFile(outputPath, JSON.stringify(gameData, null, 2));

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
      console.error('Usage: node scripts/export-game.mjs [path/to/project.sgrgame]');
      console.error('');
      console.error('First, save your project from the editor, then run this script');
      console.error('with the path to your saved .sgrgame file.');
      process.exit(1);
    }
    console.error('✗ Export failed:', err.message);
    process.exit(1);
  }
}

exportGame();
