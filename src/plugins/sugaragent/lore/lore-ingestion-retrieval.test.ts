import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { ensureSugarAgentToolsBuilt, sugarAgentToolPath } from '../test-utils/tools-bin';

const LORE_INGEST_TOOL_PATH = sugarAgentToolPath('lore-ingest');
const SIM_TOOL_PATH = sugarAgentToolPath('sim');

beforeAll(() => {
  ensureSugarAgentToolsBuilt();
});

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeLorePage(
  sourceDir: string,
  options: {
    foundingLine?: string;
    festivalLine?: string;
  } = {},
): void {
  const loreDir = path.join(sourceDir, 'town');
  fs.mkdirSync(loreDir, { recursive: true });
  const foundingLine = options.foundingLine ?? 'Valle Fresca was founded by Mayor Alba after the long rains.';
  const festivalLine = options.festivalLine ?? 'The town hosts a spring lantern festival each year.';

  const markdown = `---
id: lore.town.founding
title: Founding of Valle Fresca
canon_level: hard
entity_ids: [npc.mayor_alba]
location_ids: [loc.valle_fresca]
---
# Founding
${foundingLine}

## Festival
${festivalLine}
`;

  fs.writeFileSync(path.join(loreDir, 'founding.md'), markdown, 'utf8');
}

describe('SugarAgent lore ingestion and retrieval flow', () => {
  it('ingests markdown lore into generated artifacts', () => {
    const sourceDir = createTempDir('sugaragent-lore-source-');
    const outputDir = createTempDir('sugaragent-lore-output-');
    writeLorePage(sourceDir);

    const output = execFileSync(
      'node',
      [
        LORE_INGEST_TOOL_PATH,
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
    const factsPath = path.join(outputDir, 'facts.json');
    const migrationsPath = path.join(outputDir, 'migrations.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(fs.existsSync(chunksPath)).toBe(true);
    expect(fs.existsSync(factsPath)).toBe(true);
    expect(fs.existsSync(migrationsPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      schemaVersion: number;
      loreArtifactVersion?: string;
      source: { commit: string };
      counts: { chunks: number; facts?: number };
    };
    const chunks = JSON.parse(fs.readFileSync(chunksPath, 'utf8')) as Array<{
      chunkId: string;
      sourceFile: string;
      sourceCommit?: string;
    }>;
    const facts = JSON.parse(fs.readFileSync(factsPath, 'utf8')) as Array<{
      factId: string;
      provenance?: {
        offsets?: { start?: number; end?: number };
        anchor?: { signatureHash?: string };
      };
    }>;

    expect(manifest.schemaVersion).toBeGreaterThanOrEqual(2);
    expect(manifest.source.commit).toBe('abc123');
    expect(typeof manifest.loreArtifactVersion).toBe('string');
    expect(manifest.counts.chunks).toBeGreaterThan(0);
    expect((manifest.counts.facts ?? 0)).toBeGreaterThan(0);
    expect(chunks.some((chunk) => chunk.chunkId.startsWith('lore.town.founding#'))).toBe(true);
    expect(chunks.some((chunk) => chunk.sourceFile.endsWith('founding.md'))).toBe(true);
    expect(chunks.some((chunk) => chunk.sourceCommit === 'abc123')).toBe(true);
    expect(facts.every((fact) => typeof fact.factId === 'string' && fact.factId.startsWith('fact.'))).toBe(true);
    expect(facts.every((fact) => typeof fact.provenance?.offsets?.start === 'number')).toBe(true);
    expect(facts.every((fact) => typeof fact.provenance?.anchor?.signatureHash === 'string')).toBe(true);
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
        LORE_INGEST_TOOL_PATH,
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

  it('keeps factId stable on non-semantic edits and emits migration mapping on semantic edits', () => {
    const sourceDir = createTempDir('sugaragent-lore-source-');
    const outputDir = createTempDir('sugaragent-lore-output-');
    writeLorePage(sourceDir);

    execFileSync(
      'node',
      [
        LORE_INGEST_TOOL_PATH,
        '--source',
        sourceDir,
        '--commit',
        'phase5-a',
        '--output',
        outputDir,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );
    const baselineFacts = JSON.parse(fs.readFileSync(path.join(outputDir, 'facts.json'), 'utf8')) as Array<{
      factId: string;
      statement: string;
    }>;
    const baselineFactByStatement = new Map(
      baselineFacts.map((fact) => [fact.statement, fact.factId] as const),
    );
    expect(baselineFactByStatement.size).toBeGreaterThan(0);

    writeLorePage(sourceDir, {
      foundingLine: 'Valle Fresca was founded by Mayor Alba after the long rains.   ',
      festivalLine: 'The town hosts a spring lantern festival each year.',
    });
    execFileSync(
      'node',
      [
        LORE_INGEST_TOOL_PATH,
        '--source',
        sourceDir,
        '--commit',
        'phase5-b',
        '--output',
        outputDir,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );
    const nonSemanticFacts = JSON.parse(fs.readFileSync(path.join(outputDir, 'facts.json'), 'utf8')) as Array<{
      factId: string;
      statement: string;
    }>;
    const nonSemanticFactByStatement = new Map(
      nonSemanticFacts.map((fact) => [fact.statement, fact.factId] as const),
    );
    expect(nonSemanticFactByStatement.get('Valle Fresca was founded by Mayor Alba after the long rains.'))
      .toBe(baselineFactByStatement.get('Valle Fresca was founded by Mayor Alba after the long rains.'));

    writeLorePage(sourceDir, {
      foundingLine: 'Valle Fresca was founded by Mayor Alba after the ash storms.',
      festivalLine: 'The town hosts a spring lantern festival each year.',
    });
    execFileSync(
      'node',
      [
        LORE_INGEST_TOOL_PATH,
        '--source',
        sourceDir,
        '--commit',
        'phase5-c',
        '--output',
        outputDir,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );
    const semanticFacts = JSON.parse(fs.readFileSync(path.join(outputDir, 'facts.json'), 'utf8')) as Array<{
      factId: string;
      statement: string;
      supersedesFactIds?: string[];
    }>;
    const migrations = JSON.parse(fs.readFileSync(path.join(outputDir, 'migrations.json'), 'utf8')) as {
      mappings?: Array<{ oldFactId: string; newFactId: string | null; kind: string }>;
    };
    const semanticFact = semanticFacts.find((fact) => fact.statement.includes('ash storms'));
    const baselineFactId = baselineFactByStatement.get('Valle Fresca was founded by Mayor Alba after the long rains.');
    expect(semanticFact).toBeDefined();
    expect(semanticFact?.factId).not.toBe(baselineFactId);
    expect(Array.isArray(semanticFact?.supersedesFactIds)).toBe(true);
    expect(semanticFact?.supersedesFactIds?.includes(baselineFactId ?? '')).toBe(true);
    expect((migrations.mappings ?? []).some((entry) => entry.oldFactId === baselineFactId && entry.newFactId === semanticFact?.factId)).toBe(true);
  });

  it('uses ingested lore for citation-backed local sim answers', () => {
    const sourceDir = createTempDir('sugaragent-lore-source-');
    const outputDir = createTempDir('sugaragent-lore-output-');
    writeLorePage(sourceDir);

    execFileSync(
      'node',
      [
        LORE_INGEST_TOOL_PATH,
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
        SIM_TOOL_PATH,
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
    expect(simOutput).not.toContain('From the archives:');
    expect(simOutput).toContain('founded by Mayor Alba');
    expect(simOutput).toContain('@def456');
  });
});
