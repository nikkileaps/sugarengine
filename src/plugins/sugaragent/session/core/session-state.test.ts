import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyTurnToSession,
  buildRecentReferentPreview,
  buildTurnTopicCoverageContext,
  countPlayerTurns,
  extractConversationTopics,
  extractSalientFacts,
  getSessionReferentsForNpc,
  loadSessionState,
  resetSessionState,
  sanitizeSessionId,
} from './session-state';

describe('session-state', () => {
  it('sanitizes session ids', () => {
    expect(sanitizeSessionId('  weird/session id!!!  ')).toBe('weird-session-id');
  });

  it('extracts salient player facts deterministically', () => {
    const facts = extractSalientFacts('hello my name is nikki and i like coffee and dogs');
    expect(facts.some((entry) => entry.toLowerCase().includes('my name is'))).toBe(true);
    expect(facts.some((entry) => entry.toLowerCase().includes('i like'))).toBe(true);
    expect(extractSalientFacts('there is a fire in the mountains')).toEqual([]);
  });

  it('persists and reloads session memory state', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-session-state-'));
    try {
      const session = loadSessionState('slice-e', tempDir);
      expect(session.loaded).toBe(false);

      applyTurnToSession(
        session,
        'npc.baker',
        'my name is nikki and i like coffee',
        'I will keep that in mind.',
      );

      const reloaded = loadSessionState('slice-e', tempDir);
      expect(reloaded.loaded).toBe(true);
      expect(reloaded.state.npcs['npc.baker']?.facts.length ?? 0).toBeGreaterThan(0);

      const reset = resetSessionState('slice-e', tempDir);
      expect(reset.existed).toBe(true);
      expect(fs.existsSync(reset.pathToFile)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('builds topic coverage context and counts player turns', () => {
    const coverage = buildTurnTopicCoverageContext([
      {
        topic: 'coffee',
        mentions: 3,
        novelty: 0.2,
        exhausted: true,
        lastMentionAt: Date.now(),
      },
    ], 'tell me about coffee');
    expect(coverage?.activeTopic).toBe('coffee');
    expect(coverage?.exhausted).toBe(true);

    const playerTurns = countPlayerTurns([
      { role: 'npc', text: 'hello' },
      { role: 'player', text: 'hi' },
      { role: 'player', text: 'tell me more' },
    ]);
    expect(playerTurns).toBe(2);
  });

  it('filters discourse filler so focus topics stay on substantive words', () => {
    const topics = extractConversationTopics('Yeah, man, caviar wishes and cheese dreams.');
    expect(topics).not.toContain('yeah');
    expect(topics[0]).toBe('caviar');
    expect(topics).toEqual(expect.arrayContaining(['cheese', 'dreams']));
  });

  it('persists explicit memory writes without using heuristic fact extraction', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-session-state-'));
    try {
      const session = loadSessionState('memory-writes', tempDir);
      applyTurnToSession(
        session,
        'npc.baker',
        'there is a fire in the mountains',
        'I will come back tomorrow.',
        {
          memoryWrites: [
            {
              type: 'player_fact',
              ownerType: 'player',
              text: 'My name is Nikki',
              source: 'player_explicit',
              confidence: 0.95,
            },
            {
              type: 'npc_commitment',
              ownerType: 'npc',
              text: 'I will come back tomorrow',
              source: 'npc_verified_turn',
              confidence: 0.85,
            },
          ],
        },
      );

      const reloaded = loadSessionState('memory-writes', tempDir);
      const npc = reloaded.state.npcs['npc.baker'];
      expect(npc?.facts).toContain('My name is Nikki');
      expect(npc?.facts.some((fact) => fact.toLowerCase().includes('fire in the mountains'))).toBe(false);
      expect(npc?.events.some((event) => event.type === 'npc_commitment' && event.text.includes('come back tomorrow'))).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('persists referent candidates and reuses the strongest topic-aligned one on the next turn', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-session-state-'));
    try {
      const session = loadSessionState('referent-memory', tempDir);
      applyTurnToSession(
        session,
        'npc.baker',
        'Tell me about Earendale.',
        'Earendale was founded by Tilda Voss.',
        {
          referentCandidates: [
            {
              kind: 'location',
              text: 'Earendale',
              id: 'locations.earendale',
              confidence: 0.92,
              topic: 'earendale',
              sourceRole: 'lore',
            },
            {
              kind: 'location',
              text: 'Station',
              id: 'regions.station',
              confidence: 0.58,
              topic: 'station',
              sourceRole: 'scene',
            },
          ],
          activeTopic: 'earendale',
        },
      );

      const reloaded = loadSessionState('referent-memory', tempDir);
      const referents = getSessionReferentsForNpc(reloaded, 'npc.baker');
      expect(referents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'location',
            text: 'Earendale',
          }),
        ]),
      );

      const preview = buildRecentReferentPreview(referents, 'Who founded that town?', {
        activeTopic: 'earendale',
      });
      expect(preview[0]).toEqual(
        expect.objectContaining({
          kind: 'location',
          text: 'Earendale',
        }),
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
