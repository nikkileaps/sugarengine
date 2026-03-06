// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { retrieveLoreChunks } from './lore-lib';

const artifacts = {
  chunks: [
    {
      chunkId: 'lore.history.events.creation_of_rackwick_city#creation',
      pageId: 'lore.history.events.creation_of_rackwick_city',
      sectionHeading: 'Creation',
      tokens: ['creation', 'rackwick', 'city', 'dragon'],
      metadata: {
        id: 'lore.history.events.creation_of_rackwick_city',
        tags: ['history', 'rackwick_city'],
        entity_ids: [],
        location_ids: ['locations.rackwick_city'],
        faction_ids: [],
        beat_ids: [],
      },
    },
    {
      chunkId: 'lore.wordlark.story.station_intro#overview',
      pageId: 'lore.wordlark.story.station_intro',
      sectionHeading: 'Overview',
      tokens: ['station', 'intro', 'wordlark'],
      metadata: {
        id: 'lore.wordlark.story.station_intro',
        tags: ['wordlark', 'station'],
        entity_ids: [],
        location_ids: ['locations.station'],
        faction_ids: [],
        beat_ids: [],
      },
    },
    {
      chunkId: 'lore.npcs.baker#background',
      pageId: 'lore.npcs.baker',
      sectionHeading: 'Background',
      tokens: ['baker', 'background', 'grew', 'rackwick'],
      metadata: {
        id: 'lore.npcs.baker',
        tags: ['baker', 'npc'],
        entity_ids: ['npc.baker'],
        location_ids: ['locations.rackwick_city'],
        faction_ids: [],
        beat_ids: [],
      },
    },
    {
      chunkId: 'lore.npcs.rowan#background',
      pageId: 'lore.npcs.rowan',
      sectionHeading: 'Background',
      tokens: ['baker', 'background', 'rowan', 'captain'],
      metadata: {
        id: 'lore.npcs.rowan',
        tags: ['rowan', 'captain'],
        entity_ids: ['npc.rowan'],
        location_ids: ['locations.rackwick_city'],
        faction_ids: [],
        beat_ids: [],
      },
    },
  ],
};

describe('retrieveLoreChunks scope filtering', () => {
  it('matches lore scopes with or without the lore. prefix', () => {
    const results = retrieveLoreChunks(artifacts, 'creation of rackwick city', {
      loreScopes: ['history.events.creation_of_rackwick_city'],
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.chunk.chunkId).toContain('creation_of_rackwick_city');
  });

  it('returns no lore results when scopes do not match', () => {
    const results = retrieveLoreChunks(artifacts, 'rackwick city history', {
      loreScopes: ['wordlark.story.station_intro'],
    });

    expect(results).toHaveLength(0);
  });

  it('keeps default retrieval behavior when no lore scopes are provided', () => {
    const results = retrieveLoreChunks(artifacts, 'rackwick city history');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.chunk.chunkId).toContain('creation_of_rackwick_city');
  });

  it('prefers self-entity evidence on self_query when identity is configured', () => {
    const results = retrieveLoreChunks(artifacts, 'tell me about your background', {
      queryType: 'self_query',
      selfEntityId: 'npc.baker',
      loreScopes: ['npcs.baker', 'npcs.rowan'],
      selfLoreScopes: ['npcs.baker'],
      relatedLoreScopes: ['npcs.rowan'],
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.chunk.chunkId).toContain('npcs.baker');
    expect(results[0]?.pool).toBe('self');
    expect(results[0]?.selfEntityMatch).toBe(true);
  });

  it('allows related pool boost for other_query lookups', () => {
    const results = retrieveLoreChunks(artifacts, 'what about rowan background', {
      queryType: 'other_query',
      loreScopes: ['npcs.baker', 'npcs.rowan'],
      selfLoreScopes: ['npcs.baker'],
      relatedLoreScopes: ['npcs.rowan'],
      selfEntityId: 'npc.baker',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.pool).toBe('related');
    expect(results[0]?.chunk.chunkId).toContain('npcs.rowan');
  });
});
