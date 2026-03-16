import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTurnPath } from './turn-path-routing';
import type { RoutingResult } from './routing';
import type { QueryInterpretation } from './turn-contracts';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeSocialInterpretation(overrides: Partial<QueryInterpretation> = {}): QueryInterpretation {
  return {
    schemaVersion: 1,
    lane: 'social',
    target: 'unknown',
    facet: 'unknown',
    timeframe: 'unknown',
    focusText: 'How are you today?',
    normalizedText: 'how are you today',
    referents: [],
    discourse: {
      repair: false,
      filler: false,
      contrast: false,
      emphasis: false,
    },
    candidateScores: [
      {
        lane: 'social',
        target: 'unknown',
        facet: 'unknown',
        timeframe: 'unknown',
        score: 0.94,
      },
    ],
    confidence: 0.94,
    margin: 0.24,
    ambiguous: false,
    ...overrides,
  };
}

function makeRoute(overrides: Partial<RoutingResult> = {}): RoutingResult {
  return {
    intent: 'social_chat',
    confidence: 0.94,
    margin: 0.24,
    candidateScores: [{ intent: 'social_chat', score: 0.94 }],
    policyPath: 'chat',
    interpretation: makeSocialInterpretation(),
    ...overrides,
  };
}

describe('resolveTurnPath', () => {
  it('keeps high-confidence semantic social turns on the social fast path even when english wh regexes fire', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const decision = resolveTurnPath(
      makeRoute(),
      'How are you today?',
      {
        npcId: 'npc_rick',
        npcName: 'Rick',
        mode: 'character',
      },
      [],
    );

    expect(decision.path).toBe('social_fast');
    expect(decision.semanticSocialProtected).toBe(true);
    expect(decision.suppressedRiskSignals).toEqual(
      expect.arrayContaining(['knowledge_wh_cue', 'factual_clause_pattern']),
    );
    expect(decision.heuristicFallbackUsed).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when heuristic fallback forces a social turn onto the grounded path', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const decision = resolveTurnPath(
      makeRoute({
        confidence: 0.44,
        margin: 0.05,
        interpretation: makeSocialInterpretation({
          confidence: 0.44,
          margin: 0.05,
          ambiguous: true,
        }),
      }),
      'How are you today?',
      {
        npcId: 'npc_rick',
        npcName: 'Rick',
        mode: 'character',
      },
      [],
    );

    expect(decision.path).toBe('grounded');
    expect(decision.heuristicFallbackUsed).toBe(true);
    expect(decision.heuristicFallbackReason).toContain('knowledge_wh_cue');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
