import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { augmentLoreArtifactsWithVectors, ingestLoreDirectory, loadLoreArtifacts, writeLoreArtifacts } from './lore-lib';
import { createSugarAgentSession } from '../session/runtime';

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

    const artifacts = ingestLoreDirectory({
      sourceDir,
      commit: 'abc123',
    });
    writeLoreArtifacts(outputDir, artifacts);

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

  it('writes and reloads chunk vector artifacts when embeddings are available', async () => {
    const sourceDir = createTempDir('sugaragent-lore-source-');
    const outputDir = createTempDir('sugaragent-lore-output-');
    writeLorePage(sourceDir);

    const artifacts = await augmentLoreArtifactsWithVectors({
      artifacts: ingestLoreDirectory({
        sourceDir,
        commit: 'vec123',
      }),
      embedTexts: async (texts) => texts.map((_text, index) => [1, index + 1, 0]),
      embeddingModelId: 'test-embedding-model',
    });
    const written = writeLoreArtifacts(outputDir, artifacts);

    expect(fs.existsSync(path.join(outputDir, 'chunk-vectors.json'))).toBe(true);
    expect(written.chunkVectorsPath).toContain('chunk-vectors.json');

    const loaded = loadLoreArtifacts(outputDir) as {
      vectorManifest?: { embeddingModelId?: string; embeddingDimension?: number } | null;
      chunkVectors?: Array<{ chunkId: string; vector: number[] }>;
    } | null;
    expect(loaded?.vectorManifest?.embeddingModelId).toBe('test-embedding-model');
    expect(loaded?.vectorManifest?.embeddingDimension).toBe(3);
    expect(Array.isArray(loaded?.chunkVectors)).toBe(true);
    expect((loaded?.chunkVectors ?? []).length).toBeGreaterThan(0);
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

    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as {
      source: string;
      commit: string;
      repo: string;
      ref: string;
    };
    const artifacts = ingestLoreDirectory({
      sourceDir: lock.source,
      commit: lock.commit,
      repo: lock.repo,
      ref: lock.ref,
    });
    writeLoreArtifacts(outputDir, artifacts);

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

    writeLoreArtifacts(outputDir, ingestLoreDirectory({
      sourceDir,
      commit: 'phase5-a',
    }));
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
    writeLoreArtifacts(outputDir, ingestLoreDirectory({
      sourceDir,
      commit: 'phase5-b',
      previousArtifacts: {
        manifest: JSON.parse(fs.readFileSync(path.join(outputDir, 'manifest.json'), 'utf8')),
        chunks: JSON.parse(fs.readFileSync(path.join(outputDir, 'chunks.json'), 'utf8')),
        facts: JSON.parse(fs.readFileSync(path.join(outputDir, 'facts.json'), 'utf8')),
      },
    }));
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
    writeLoreArtifacts(outputDir, ingestLoreDirectory({
      sourceDir,
      commit: 'phase5-c',
      previousArtifacts: {
        manifest: JSON.parse(fs.readFileSync(path.join(outputDir, 'manifest.json'), 'utf8')),
        chunks: JSON.parse(fs.readFileSync(path.join(outputDir, 'chunks.json'), 'utf8')),
        facts: JSON.parse(fs.readFileSync(path.join(outputDir, 'facts.json'), 'utf8')),
      },
    }));
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

  it('uses ingested lore for citation-backed local session answers', async () => {
    const sourceDir = createTempDir('sugaragent-lore-source-');
    const outputDir = createTempDir('sugaragent-lore-output-');
    writeLorePage(sourceDir);

    writeLoreArtifacts(outputDir, ingestLoreDirectory({
      sourceDir,
      commit: 'def456',
    }));

    const session = await createSugarAgentSession({
      npc: 'librarian',
      provider: 'local',
      runtime: 'mock',
      loreDir: outputDir,
      useLore: true,
    });
    const result = await session.runTurn('Who founded this town?', {
      npcName: 'Librarian',
    });

    expect(session.startup.lore.loaded).toBe(true);
    expect(session.startup.lore.chunkCount).toBeGreaterThan(0);
    expect(Array.isArray(result.output.citations)).toBe(true);
    expect(result.output.citations.some((citation) => citation.sourceId.startsWith('fact.'))).toBe(true);
    expect(result.output.citations.some((citation) => (citation.snippet ?? '').includes('Mayor Alba'))).toBe(true);
    expect(result.output.utterance).not.toContain('From the archives:');
    expect(result.output.utterance).toContain('Mayor Alba');
  });
});
