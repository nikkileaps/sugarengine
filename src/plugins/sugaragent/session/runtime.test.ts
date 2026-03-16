import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { embedTexts as embedTextsWithLocalRuntime, LOCAL_EMBEDDING_MODEL_ID } from '../runtime/local-embedding-runtime';
import { createSugarAgentSession } from './runtime';
import { resetSessionState } from './core/session-state';

const createdSessionIds = new Set<string>();
const tempLoreDirs = new Set<string>();

function makeSessionId(label: string): string {
  return `runtime-social-fast-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

afterEach(() => {
  for (const sessionId of createdSessionIds) {
    resetSessionState(sessionId);
  }
  createdSessionIds.clear();
  for (const dir of tempLoreDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempLoreDirs.clear();
});

function createTempLoreDir(
  chunks: unknown[],
  options: {
    chunkVectors?: Array<{ chunkId: string; vector: number[] }>;
  } = {},
): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-runtime-lore-'));
  tempLoreDirs.add(tempDir);
  fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify({
    schemaVersion: 2,
    loreArtifactVersion: 'test-artifact',
    toolVersion: 'test',
    source: { commit: 'test-commit' },
    embeddings: options.chunkVectors
      ? {
          modelId: LOCAL_EMBEDDING_MODEL_ID,
          dimension: options.chunkVectors[0]?.vector.length ?? 0,
          artifact: 'chunk-vectors.json',
        }
      : undefined,
  }), 'utf8');
  fs.writeFileSync(path.join(tempDir, 'chunks.json'), JSON.stringify(chunks), 'utf8');
  fs.writeFileSync(path.join(tempDir, 'facts.json'), '[]', 'utf8');
  if (options.chunkVectors) {
    fs.writeFileSync(path.join(tempDir, 'chunk-vectors.json'), JSON.stringify({
      manifest: {
        schemaVersion: 1,
        embeddingModelId: LOCAL_EMBEDDING_MODEL_ID,
        embeddingDimension: options.chunkVectors[0]?.vector.length ?? 0,
        artifactVersion: 'test-artifact',
      },
      vectors: options.chunkVectors,
    }), 'utf8');
  }
  return tempDir;
}

describe('session runtime social fast path', () => {
  it('uses bounded social realization for greetings instead of deterministic filler', async () => {
    const sessionId = makeSessionId('greeting');
    createdSessionIds.add(sessionId);
    const session = await createSugarAgentSession({
      npc: 'npc_rick',
      provider: 'local',
      runtime: 'mock',
      session: sessionId,
      useLore: false,
    });

    const result = await session.runTurn('hello', {
      npcName: 'Rick Cheese Roll',
      npcProfile: {
        selfEntityId: 'npc_rick',
      },
    });

    expect(result.output.utterance).toBe("Hi. I'm Rick Cheese Roll.");
    expect(result.usedFallback).toBe(false);
    expect(result.pipeline.generation.replyParts.attempted).toBe(true);
    expect(result.pipeline.evidenceFirst.turnPath).toBe('social_fast');
  });

  it('acknowledges player introductions naturally on the social fast path', async () => {
    const sessionId = makeSessionId('intro');
    createdSessionIds.add(sessionId);
    const session = await createSugarAgentSession({
      npc: 'npc_rick',
      provider: 'local',
      runtime: 'mock',
      session: sessionId,
      useLore: false,
    });

    const result = await session.runTurn("I'm Mim.", {
      npcName: 'Rick Cheese Roll',
      npcProfile: {
        selfEntityId: 'npc_rick',
      },
    });

    expect(result.output.utterance).toBe("Nice to meet you, Mim. I'm Rick Cheese Roll.");
    expect(result.usedFallback).toBe(false);
    expect(result.pipeline.generation.replyParts.attempted).toBe(true);
    expect(result.pipeline.evidenceFirst.turnPath).toBe('social_fast');
  });

  it('recognizes Sugarlang pedagogy context as language adaptation input', async () => {
    const sessionId = makeSessionId('pedagogy');
    createdSessionIds.add(sessionId);
    const session = await createSugarAgentSession({
      npc: 'station-clerk',
      provider: 'local',
      runtime: 'mock',
      session: sessionId,
      useLore: false,
    });

    const result = await session.runTurn('hello', {
      npcName: 'Station Clerk',
      context: {
        pedagogyContext: {
          learnerBand: 'B1',
          targetLanguage: 'es',
          supportLanguage: 'en',
          supportLanguagePolicy: 'light_support',
          availableTrackedLexicalEntryIds: ['object.suitcase'],
          teachingSubset: {
            focusLexicalEntryIds: ['object.suitcase'],
            reinforcementLexicalEntryIds: [],
            ambientLexicalEntryIds: [],
            protectedLexicalEntryIds: ['object.suitcase'],
          },
          groundingScope: [
            {
              lexicalEntryId: 'object.suitcase',
              targetForm: 'maleta',
              worldObjectId: 'suitcase-blue',
            },
          ],
        },
      },
    });

    expect(result.pipeline.evidenceFirst.adaptationApplied).toBe(true);
    expect(result.pipeline.evidenceFirst.turnPath).toBe('social_fast');
  });

  it('keeps acknowledgement-only social follow-ups on the social fast path', async () => {
    const sessionId = makeSessionId('acknowledgement');
    createdSessionIds.add(sessionId);
    const session = await createSugarAgentSession({
      npc: 'npc_rick',
      provider: 'local',
      runtime: 'mock',
      session: sessionId,
      useLore: false,
    });

    const result = await session.runTurn('Yay! I love cheese!', {
      npcName: 'Rick Cheese Roll',
      npcProfile: {
        selfEntityId: 'npc_rick',
      },
    });

    expect(result.output.utterance.toLowerCase()).not.toContain('clarify');
    expect(result.output.utterance.toLowerCase()).not.toContain("don't know");
    expect(result.pipeline.evidenceFirst.turnPath).toBe('social_fast');
    expect(result.routing.intent).toBe('social_chat');
  });

  it('routes named places as lore_world and retrieves world lore even when npc profile only has self scopes', async () => {
    const loreDir = createTempLoreDir([
      {
        chunkId: 'lore.locations.earendale#overview',
        pageId: 'lore.locations.earendale',
        title: 'Earendale',
        sectionHeading: 'Overview',
        summary: 'Earendale is a market town with a busy station.',
        content: 'Earendale is a market town with a busy station.',
        tokens: ['earendale', 'market', 'town', 'busy', 'station'],
        canonLevel: 'hard',
        metadata: {
          id: 'lore.locations.earendale',
          title: 'Earendale',
          canon_level: 'hard',
          entity_ids: [],
          location_ids: ['locations.earendale'],
          faction_ids: [],
          tags: ['earendale'],
          beat_ids: [],
          fact_ids: [],
        },
      },
      {
        chunkId: 'lore.npcs.rick#profile',
        pageId: 'lore.npcs.rick',
        title: 'Rick Cheese Roll',
        sectionHeading: 'Profile',
        summary: 'Rick Cheese Roll runs the station stall.',
        content: 'Rick Cheese Roll runs the station stall.',
        tokens: ['rick', 'cheese', 'roll', 'station', 'stall'],
        canonLevel: 'hard',
        metadata: {
          id: 'lore.npcs.rick',
          title: 'Rick Cheese Roll',
          canon_level: 'hard',
          entity_ids: ['npc.rick'],
          location_ids: [],
          faction_ids: [],
          tags: ['rick'],
          beat_ids: [],
          fact_ids: [],
        },
      },
    ]);
    const sessionId = makeSessionId('earendale');
    createdSessionIds.add(sessionId);
    const session = await createSugarAgentSession({
      npc: 'npc_rick',
      provider: 'local',
      runtime: 'mock',
      session: sessionId,
      useLore: true,
      loreDir,
    });

    const result = await session.runTurn('Do you know anything about Earendale?', {
      npcName: 'Rick Cheese Roll',
      npcProfile: {
        selfEntityId: 'npc.rick',
        selfLoreScopes: ['npcs.rick'],
        relatedLoreScopes: ['npcs.rowan'],
      },
    });
    expect(result.routing.intent).toBe('lore_world');
    expect(result.output.utterance).toContain('Earendale');
    expect(result.output.intent).toBe('answer');
  });

  it('uses vector retrieval artifacts for semantically similar place questions', async () => {
    const chunks = [
      {
        chunkId: 'lore.locations.skyharbor#overview',
        pageId: 'lore.locations.skyharbor',
        title: 'Skyharbor',
        sectionHeading: 'Overview',
        summary: 'Skyharbor is a floating town reached by train.',
        content: 'Skyharbor is a floating town reached by train and known for its suspended walkways.',
        tokens: ['skyharbor', 'floating', 'town', 'reached', 'train', 'suspended', 'walkways'],
        canonLevel: 'hard',
        metadata: {
          id: 'lore.locations.skyharbor',
          title: 'Skyharbor',
          canon_level: 'hard',
          entity_ids: [],
          location_ids: ['locations.skyharbor'],
          faction_ids: [],
          tags: ['skyharbor', 'town'],
          beat_ids: [],
          fact_ids: [],
        },
      },
    ];
    const [vector] = await embedTextsWithLocalRuntime([
      'Skyharbor floating town reached by train suspended walkways',
    ]);
    const loreDir = createTempLoreDir(chunks, {
      chunkVectors: [
        {
          chunkId: 'lore.locations.skyharbor#overview',
          vector,
        },
      ],
    });
    const sessionId = makeSessionId('vector-skyharbor');
    createdSessionIds.add(sessionId);
    const session = await createSugarAgentSession({
      npc: 'npc_rick',
      provider: 'local',
      runtime: 'mock',
      session: sessionId,
      useLore: true,
      loreDir,
    });

    const result = await session.runTurn('Do you know the floating town reached by train?', {
      npcName: 'Rick Cheese Roll',
      npcProfile: {
        selfEntityId: 'npc.rick-roll',
        loreScopes: ['locations.skyharbor'],
      },
    });

    expect(result.pipeline.retrieval.vectorCandidateCount).toBeGreaterThan(0);
    expect(result.pipeline.retrieval.mergedCandidateCount).toBeGreaterThan(0);
    expect(result.output.utterance).toContain('Skyharbor');
  });

  it('retrieves scoped world lore when the npc profile uses a place-scope alias like town.earendale', async () => {
    const loreDir = createTempLoreDir([
      {
        chunkId: 'lore.locations.towns.town.earendale#overview',
        pageId: 'lore.locations.towns.town.earendale',
        title: 'Earendale',
        sectionHeading: 'Overview',
        summary: 'Earendale is a resort town reached by a special train.',
        content: 'Earendale is a resort town reached by a special train.',
        tokens: ['earendale', 'resort', 'town', 'special', 'train'],
        canonLevel: 'hard',
        metadata: {
          id: 'lore.locations.towns.town.earendale',
          title: 'Earendale',
          canon_level: 'hard',
          entity_ids: [],
          location_ids: ['locations.earendale'],
          faction_ids: [],
          tags: ['earendale', 'town'],
          beat_ids: [],
          fact_ids: [],
        },
      },
    ]);
    const sessionId = makeSessionId('earendale-scope-alias');
    createdSessionIds.add(sessionId);
    const session = await createSugarAgentSession({
      npc: 'npc_rick',
      provider: 'local',
      runtime: 'mock',
      session: sessionId,
      useLore: true,
      loreDir,
    });

    const result = await session.runTurn('hey do you know anything about Earendale?', {
      npcName: 'Rick Cheese Roll',
      npcProfile: {
        selfEntityId: 'npc.rick-roll',
        loreScopes: ['town.earendale'],
      },
    });

    expect(result.routing.intent).toBe('lore_world');
    expect(result.pipeline.retrieval.candidateCount).toBeGreaterThan(0);
    expect(result.output.utterance).toContain('Earendale');
    expect(result.output.intent).toBe('answer');
  });

  it('keeps retrieval diagnostics when a broad unsupported lore query still falls back to uncertainty', async () => {
    const loreDir = createTempLoreDir([
      {
        chunkId: 'lore.locations.towns.town.earendale#overview',
        pageId: 'lore.locations.towns.town.earendale',
        title: 'Earendale',
        sectionHeading: 'Overview',
        summary: 'Earendale is a resort town reached by a special train.',
        content: 'Earendale is a resort town reached by a special train.',
        tokens: ['earendale', 'resort', 'town', 'special', 'train'],
        canonLevel: 'hard',
        metadata: {
          id: 'lore.locations.towns.town.earendale',
          title: 'Earendale',
          canon_level: 'hard',
          entity_ids: [],
          location_ids: ['locations.earendale'],
          faction_ids: [],
          tags: ['earendale', 'town'],
          beat_ids: [],
          fact_ids: [],
        },
      },
    ]);
    const sessionId = makeSessionId('earendale-quality-gate');
    createdSessionIds.add(sessionId);
    const session = await createSugarAgentSession({
      npc: 'npc_rick',
      provider: 'local',
      runtime: 'mock',
      session: sessionId,
      useLore: true,
      loreDir,
    });

    const result = await session.runTurn('Do you know anything about Earendale climate economy politics exports founders rituals?', {
      npcName: 'Rick Cheese Roll',
      npcProfile: {
        selfEntityId: 'npc.rick-roll',
        loreScopes: ['town.earendale'],
      },
    });

    expect(result.routing.intent).toBe('lore_world');
    expect(result.output.intent).toBe('uncertain');
    expect(result.pipeline.retrieval.candidateCount).toBeGreaterThan(0);
    expect(result.pipeline.retrieval.selectedCount).toBeGreaterThan(0);
    expect(result.pipeline.retrieval.qualityReason).not.toBe('no_candidates');
  });

  it('does not false-abstain when a place name is carried by title and metadata instead of body prose', async () => {
    const loreDir = createTempLoreDir([
      {
        chunkId: 'lore.locations.towns.town.earendale#overview',
        pageId: 'lore.locations.towns.town.earendale',
        title: 'Earendale',
        sectionHeading: 'Overview',
        summary: 'A station-linked resort community.',
        content: 'Visitors arrive by train for a quiet stay.',
        tokens: ['station', 'linked', 'resort', 'community', 'visitors', 'arrive', 'train', 'quiet', 'stay'],
        canonLevel: 'hard',
        metadata: {
          id: 'lore.locations.towns.town.earendale',
          title: 'Earendale',
          canon_level: 'hard',
          entity_ids: [],
          location_ids: ['locations.earendale'],
          faction_ids: [],
          tags: ['earendale', 'town'],
          beat_ids: [],
          fact_ids: [],
        },
      },
    ]);
    const sessionId = makeSessionId('earendale-title-coverage');
    createdSessionIds.add(sessionId);
    const session = await createSugarAgentSession({
      npc: 'npc_rick',
      provider: 'local',
      runtime: 'mock',
      session: sessionId,
      useLore: true,
      loreDir,
    });

    const result = await session.runTurn('Do you know anything about Earendale?', {
      npcName: 'Rick Cheese Roll',
      npcProfile: {
        selfEntityId: 'npc.rick-roll',
        loreScopes: ['town.earendale'],
      },
    });

    expect(result.routing.intent).toBe('lore_world');
    expect(result.pipeline.retrieval.candidateCount).toBeGreaterThan(0);
    expect(result.pipeline.retrieval.qualityGatePassed).toBe(true);
    expect(result.pipeline.retrieval.qualityReason).toBe('sufficient');
    expect(result.output.intent).toBe('answer');
  });

  it('ignores social preamble when the actual knowledge clause asks about a known place', async () => {
    const loreDir = createTempLoreDir([
      {
        chunkId: 'lore.locations.towns.town.earendale#overview',
        pageId: 'lore.locations.towns.town.earendale',
        title: 'Earendale',
        sectionHeading: 'Overview',
        summary: 'Earendale is a resort town reached by a special train.',
        content: 'Earendale is a resort town reached by a special train.',
        tokens: ['earendale', 'resort', 'town', 'special', 'train'],
        canonLevel: 'hard',
        metadata: {
          id: 'lore.locations.towns.town.earendale',
          title: 'Earendale',
          canon_level: 'hard',
          entity_ids: [],
          location_ids: ['locations.earendale'],
          faction_ids: [],
          tags: ['earendale', 'town'],
          beat_ids: [],
          fact_ids: [],
        },
      },
    ]);
    const sessionId = makeSessionId('earendale-social-preamble');
    createdSessionIds.add(sessionId);
    const session = await createSugarAgentSession({
      npc: 'npc_rick',
      provider: 'local',
      runtime: 'mock',
      session: sessionId,
      useLore: true,
      loreDir,
    });

    const result = await session.runTurn("That's a great name! Do you know anything about Earendale?", {
      npcName: 'Rick Cheese Roll',
      npcProfile: {
        selfEntityId: 'npc.rick-roll',
        loreScopes: ['town.earendale'],
      },
    });

    expect(result.routing.intent).toBe('lore_world');
    expect(result.output.intent).toBe('answer');
    expect(result.output.utterance).toContain('Earendale');
  });

  it('says it does not know when the lore hit only covers the place and not the asked facet', async () => {
    const loreDir = createTempLoreDir([
      {
        chunkId: 'lore.locations.towns.town.earendale#overview',
        pageId: 'lore.locations.towns.town.earendale',
        title: 'Earendale',
        sectionHeading: 'Overview',
        summary: 'A station-linked resort community.',
        content: 'Visitors arrive by train for a quiet stay.',
        tokens: ['station', 'linked', 'resort', 'community', 'visitors', 'arrive', 'train', 'quiet', 'stay'],
        canonLevel: 'hard',
        metadata: {
          id: 'lore.locations.towns.town.earendale',
          title: 'Earendale',
          canon_level: 'hard',
          entity_ids: [],
          location_ids: ['locations.earendale'],
          faction_ids: [],
          tags: ['earendale', 'town'],
          beat_ids: [],
          fact_ids: [],
        },
      },
    ]);
    const sessionId = makeSessionId('earendale-pancakes-unknown');
    createdSessionIds.add(sessionId);
    const session = await createSugarAgentSession({
      npc: 'npc_rick',
      provider: 'local',
      runtime: 'mock',
      session: sessionId,
      useLore: true,
      loreDir,
    });

    const result = await session.runTurn('I want to know if they have good pancakes in Earendale?', {
      npcName: 'Rick Cheese Roll',
      npcProfile: {
        selfEntityId: 'npc.rick-roll',
        loreScopes: ['town.earendale'],
      },
    });

    expect(result.routing.intent).toBe('lore_world');
    expect(result.pipeline.retrieval.candidateCount).toBeGreaterThan(0);
    expect(result.output.utterance.toLowerCase()).toContain("don't know");
  });

  it('reuses a prior location referent across turns for follow-up lore questions', async () => {
    const loreDir = createTempLoreDir([
      {
        chunkId: 'lore.locations.towns.town.earendale#history',
        pageId: 'lore.locations.towns.town.earendale',
        title: 'Earendale',
        sectionHeading: 'History',
        summary: 'Earendale was founded by Tilda Voss after the rail line opened.',
        content: 'Earendale was founded by Tilda Voss after the rail line opened.',
        tokens: ['earendale', 'founded', 'tilda', 'voss', 'rail', 'line', 'opened'],
        canonLevel: 'hard',
        metadata: {
          id: 'lore.locations.towns.town.earendale',
          title: 'Earendale',
          canon_level: 'hard',
          entity_ids: [],
          location_ids: ['locations.earendale'],
          faction_ids: [],
          tags: ['earendale', 'town'],
          beat_ids: [],
          fact_ids: [],
        },
      },
    ]);
    const sessionId = makeSessionId('earendale-referent-followup');
    createdSessionIds.add(sessionId);
    const session = await createSugarAgentSession({
      npc: 'npc_rick',
      provider: 'local',
      runtime: 'mock',
      session: sessionId,
      useLore: true,
      loreDir,
    });

    const first = await session.runTurn('Tell me about Earendale.', {
      npcName: 'Rick Cheese Roll',
      npcProfile: {
        selfEntityId: 'npc.rick-roll',
        loreScopes: ['town.earendale'],
      },
    });
    expect(first.output.intent).toBe('answer');

    const second = await session.runTurn('Who founded it?', {
      npcName: 'Rick Cheese Roll',
      npcProfile: {
        selfEntityId: 'npc.rick-roll',
        loreScopes: ['town.earendale'],
      },
    });

    expect(second.routing.intent).toBe('lore_world');
    expect(second.pipeline.routing.interpretation?.referentCount).toBeGreaterThan(0);
    expect(second.pipeline.routing.interpretation?.topReferent?.toLowerCase()).toContain('earendale');
    expect(second.output.intent).toBe('answer');
    expect(second.output.utterance).toContain('Tilda Voss');
  });

  it('answers direct current-location questions from authoritative runtime scene evidence', async () => {
    const sessionId = makeSessionId('current-location');
    createdSessionIds.add(sessionId);
    const session = await createSugarAgentSession({
      npc: 'npc_rick',
      provider: 'local',
      runtime: 'mock',
      session: sessionId,
      useLore: false,
      turnContext: {
        regionName: 'Station',
        regionPath: 'regions.station',
      },
    });

    const result = await session.runTurn('Where are we right now?', {
      npcName: 'Rick Cheese Roll',
      npcProfile: {
        selfEntityId: 'npc.rick',
      },
    });

    expect(result.output.utterance).toContain('Station');
    expect(result.output.utterance.toLowerCase()).not.toContain('clarify');
    expect(result.output.utterance.toLowerCase()).not.toContain("don't know");
  });

  it('answers direct current-activity questions from authoritative runtime scene evidence', async () => {
    const sessionId = makeSessionId('current-activity');
    createdSessionIds.add(sessionId);
    const session = await createSugarAgentSession({
      npc: 'npc_rick',
      provider: 'local',
      runtime: 'mock',
      session: sessionId,
      useLore: false,
      turnContext: {
        regionName: 'Station',
        regionPath: 'regions.station',
        currentActivity: 'watching the station and minding the cheese stall',
      },
    });

    const result = await session.runTurn('What are you doing right now?', {
      npcName: 'Rick Cheese Roll',
      npcProfile: {
        selfEntityId: 'npc.rick',
      },
    });

    expect(result.output.utterance).toContain('watching the station');
    expect(result.output.utterance.toLowerCase()).not.toContain('clarify');
    expect(result.output.utterance.toLowerCase()).not.toContain("don't know");
  });

  it('answers self job questions from self-attributed npc lore', async () => {
    const loreDir = createTempLoreDir([
      {
        chunkId: 'lore.entities.npcs.rick-roll#overview',
        pageId: 'lore.entities.npcs.rick-roll',
        title: 'Rick Roll',
        sectionHeading: 'Overview',
        summary: 'Rick Roll owns a Cheese Shop in Wordlark Hollow Station.',
        content: 'Rick Roll owns a Cheese Shop in Wordlark Hollow Station. He loves cheese.',
        tokens: ['rick', 'roll', 'owns', 'cheese', 'shop', 'station'],
        canonLevel: 'hard',
        metadata: {
          id: 'lore.entities.npcs.rick-roll',
          title: 'Rick Roll',
          canon_level: 'hard',
          entity_ids: ['npc.rick-roll'],
          location_ids: [],
          faction_ids: [],
          tags: ['rick', 'cheese', 'shop'],
          beat_ids: [],
          fact_ids: [],
        },
      },
    ]);
    const sessionId = makeSessionId('self-job');
    createdSessionIds.add(sessionId);
    const session = await createSugarAgentSession({
      npc: 'npc_rick',
      provider: 'local',
      runtime: 'mock',
      session: sessionId,
      useLore: true,
      loreDir,
    });

    const result = await session.runTurn('What do you do for a job?', {
      npcName: 'Rick Roll',
      npcProfile: {
        selfEntityId: 'npc.rick-roll',
      },
    });

    expect(result.routing.intent).toBe('identity_self');
    expect(result.output.utterance).toContain('Cheese Shop');
    expect(result.output.utterance.toLowerCase()).not.toContain('clarify');
    expect(result.output.utterance.toLowerCase()).not.toContain("don't know");
  });

  it('answers short self job questions from self-attributed npc lore and exposes interpretation diagnostics', async () => {
    const loreDir = createTempLoreDir([
      {
        chunkId: 'lore.entities.npcs.rick-roll#overview',
        pageId: 'lore.entities.npcs.rick-roll',
        title: 'Rick Roll',
        sectionHeading: 'Overview',
        summary: 'Rick Roll owns a Cheese Shop in Wordlark Hollow Station.',
        content: 'Rick Roll owns a Cheese Shop in Wordlark Hollow Station. He loves cheese.',
        tokens: ['rick', 'roll', 'owns', 'cheese', 'shop', 'station'],
        canonLevel: 'hard',
        metadata: {
          id: 'lore.entities.npcs.rick-roll',
          title: 'Rick Roll',
          canon_level: 'hard',
          entity_ids: ['npc.rick-roll'],
          location_ids: [],
          faction_ids: [],
          tags: ['rick', 'cheese', 'shop'],
          beat_ids: [],
          fact_ids: [],
        },
      },
    ]);
    const sessionId = makeSessionId('self-job-short');
    createdSessionIds.add(sessionId);
    const session = await createSugarAgentSession({
      npc: 'npc_rick',
      provider: 'local',
      runtime: 'mock',
      session: sessionId,
      useLore: true,
      loreDir,
    });

    const result = await session.runTurn('What do you do?', {
      npcName: 'Rick Roll',
      npcProfile: {
        selfEntityId: 'npc.rick-roll',
      },
    });

    expect(result.routing.intent).toBe('identity_self');
    expect(result.pipeline.routing?.interpretation).toMatchObject({
      lane: 'knowledge',
      target: 'self',
      facet: 'occupation',
    });
    expect(result.output.utterance).toContain('Cheese Shop');
    expect(result.output.utterance.toLowerCase()).not.toContain("don't know");
  });

  it('answers self job questions when the npc only has an ambient place lore scope plus selfEntityId', async () => {
    const loreDir = createTempLoreDir([
      {
        chunkId: 'lore.entities.npcs.rick-roll#overview',
        pageId: 'lore.entities.npcs.rick-roll',
        title: 'Rick Roll',
        sectionHeading: 'Overview',
        summary: 'Rick Roll owns a Cheese Shop in Wordlark Hollow Station.',
        content: 'Rick Roll owns a Cheese Shop in Wordlark Hollow Station. He loves cheese.',
        tokens: ['rick', 'roll', 'owns', 'cheese', 'shop', 'station'],
        canonLevel: 'hard',
        metadata: {
          id: 'lore.entities.npcs.rick-roll',
          title: 'Rick Roll',
          canon_level: 'hard',
          entity_ids: ['npc.rick-roll'],
          location_ids: [],
          faction_ids: [],
          tags: ['earendale', 'rick', 'cheese', 'shop'],
          beat_ids: [],
          fact_ids: [],
        },
      },
      {
        chunkId: 'lore.locations.towns.town.earendale#overview',
        pageId: 'lore.locations.towns.town.earendale',
        title: 'Earendale',
        sectionHeading: 'Overview',
        summary: 'Earendale is a town on a floating chunk of land.',
        content: 'Earendale is a town on a floating chunk of land.',
        tokens: ['earendale', 'town', 'floating', 'land'],
        canonLevel: 'hard',
        metadata: {
          id: 'lore.locations.towns.town.earendale',
          title: 'Earendale',
          canon_level: 'hard',
          entity_ids: [],
          location_ids: ['locations.earendale'],
          faction_ids: [],
          tags: ['earendale', 'town'],
          beat_ids: [],
          fact_ids: [],
        },
      },
    ]);
    const sessionId = makeSessionId('self-job-ambient-scope');
    createdSessionIds.add(sessionId);
    const session = await createSugarAgentSession({
      npc: 'npc_rick',
      provider: 'local',
      runtime: 'mock',
      session: sessionId,
      useLore: true,
      loreDir,
    });

    const result = await session.runTurn('What do you do?', {
      npcName: 'Rick Roll',
      npcProfile: {
        selfEntityId: 'npc.rick-roll',
        loreScopes: ['town.earendale'],
      },
    });

    expect(result.routing.intent).toBe('identity_self');
    expect(result.pipeline.routing?.interpretation).toMatchObject({
      lane: 'knowledge',
      target: 'self',
      facet: 'occupation',
    });
    expect(result.output.utterance).toContain('Cheese Shop');
    expect(result.output.utterance.toLowerCase()).not.toContain("don't know");
  });
});
