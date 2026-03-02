import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeLorePage(sourceDir: string): void {
  const loreDir = path.join(sourceDir, 'town');
  fs.mkdirSync(loreDir, { recursive: true });

  const markdown = `---
id: lore.town.founding
title: Founding of Valle Fresca
canon_level: hard
entity_ids: [npc.mayor_alba]
location_ids: [loc.valle_fresca]
---
# Founding
Valle Fresca was founded by Mayor Alba after the long rains.

## Festival
The town hosts a spring lantern festival each year.
`;

  fs.writeFileSync(path.join(loreDir, 'founding.md'), markdown, 'utf8');
}

describe('SugarAgent lore phase-2 flow', () => {
  it('ingests markdown lore into generated artifacts', () => {
    const sourceDir = createTempDir('sugaragent-lore-source-');
    const outputDir = createTempDir('sugaragent-lore-output-');
    writeLorePage(sourceDir);

    const output = execFileSync(
      'node',
      [
        'scripts/sugaragent-lore-ingest.mjs',
        '--source',
        sourceDir,
        '--commit',
        'abc123',
        '--output',
        outputDir,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('chunks=');

    const manifestPath = path.join(outputDir, 'manifest.json');
    const chunksPath = path.join(outputDir, 'chunks.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(fs.existsSync(chunksPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      source: { commit: string };
      counts: { chunks: number };
    };
    const chunks = JSON.parse(fs.readFileSync(chunksPath, 'utf8')) as Array<{
      chunkId: string;
      sourceFile: string;
      sourceCommit?: string;
    }>;

    expect(manifest.source.commit).toBe('abc123');
    expect(manifest.counts.chunks).toBeGreaterThan(0);
    expect(chunks.some((chunk) => chunk.chunkId.startsWith('lore.town.founding#'))).toBe(true);
    expect(chunks.some((chunk) => chunk.sourceFile.endsWith('founding.md'))).toBe(true);
    expect(chunks.some((chunk) => chunk.sourceCommit === 'abc123')).toBe(true);
  });

  it('loads repo/commit/source defaults from lore lock file', () => {
    const sourceDir = createTempDir('sugaragent-lore-source-');
    const outputDir = createTempDir('sugaragent-lore-output-');
    const lockPath = path.join(createTempDir('sugaragent-lore-lock-'), 'lore-source.lock.json');
    writeLorePage(sourceDir);
    fs.writeFileSync(
      lockPath,
      `${JSON.stringify({
        repo: 'git@github.com:example/game-lore-wiki.git',
        commit: 'lock-commit-789',
        ref: 'refs/tags/v0.4.0',
        source: sourceDir,
      }, null, 2)}\n`,
      'utf8',
    );

    const output = execFileSync(
      'node',
      [
        'scripts/sugaragent-lore-ingest.mjs',
        '--lock',
        lockPath,
        '--output',
        outputDir,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('lock=');
    expect(output).toContain('(loaded)');
    expect(output).toContain('repo=git@github.com:example/game-lore-wiki.git');
    expect(output).toContain('commit=lock-commit-789');
    expect(output).toContain('ref=refs/tags/v0.4.0');

    const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'manifest.json'), 'utf8')) as {
      source: { commit: string; repo: string; ref?: string };
    };
    expect(manifest.source.commit).toBe('lock-commit-789');
    expect(manifest.source.repo).toBe('git@github.com:example/game-lore-wiki.git');
    expect(manifest.source.ref).toBe('refs/tags/v0.4.0');
  });

  it('uses ingested lore for citation-backed local sim answers', () => {
    const sourceDir = createTempDir('sugaragent-lore-source-');
    const outputDir = createTempDir('sugaragent-lore-output-');
    writeLorePage(sourceDir);

    execFileSync(
      'node',
      [
        'scripts/sugaragent-lore-ingest.mjs',
        '--source',
        sourceDir,
        '--commit',
        'def456',
        '--output',
        outputDir,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    const simOutput = execFileSync(
      'node',
      [
        'scripts/sugaragent-sim.mjs',
        '--npc',
        'librarian',
        '--provider',
        'local',
        '--runtime',
        'mock',
        '--lore-dir',
        outputDir,
        '--ask',
        'Who founded this town?',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(simOutput).toContain('lore loaded:');
    expect(simOutput).toContain('citations=');
    expect(simOutput).toContain('From the archives:');
    expect(simOutput).toContain('founded by Mayor Alba');
    expect(simOutput).toContain('@def456');
  });
});
