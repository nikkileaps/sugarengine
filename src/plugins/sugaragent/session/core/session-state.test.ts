import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyTurnToSession,
  buildTurnTopicCoverageContext,
  countPlayerTurns,
  extractSalientFacts,
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
});
