import { describe, expect, it, vi, afterEach } from 'vitest';
import { createSugarlangMiddleware } from './middleware';
import { createDefaultBandPolicy } from './content/band-policy-defaults';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSugarlangMiddleware', () => {
  it('fills a missing delivery contract from band defaults and warns once', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const middleware = createSugarlangMiddleware({
      contentBundle: {
        scenarios: new Map(),
        groundingMaps: new Map(),
        lexicons: new Map(),
        bandPolicies: {
          policies: [
            {
              ...createDefaultBandPolicy('B1'),
              deliveryContract: undefined as any,
            },
          ],
        },
        sceneLanguagePacks: new Map(),
        questBindings: new Map(),
      },
      getScenarioForNpc: () => undefined,
    });

    const session = {
      npcId: 'npc.rick-roll',
      middlewareState: {},
      learnerBandOverride: 'B1',
    } as any;
    const constraints = {
      sessionId: 'sess-1',
      turnId: 'turn-1',
      hardConstraints: {},
      advisoryPreferences: {},
    } as any;

    middleware.beforeProvider?.(session, constraints, 'learner_policy');
    middleware.beforeProvider?.(session, constraints, 'pre_provider');

    expect(constraints.supportLanguagePolicy).toBe('heavy_support');
    expect(constraints.deliveryContract).toMatchObject({
      detailLevel: 'minimal',
      maxKnowledgeClaims: 1,
      maxKnowledgeParts: 1,
      maxSentences: 2,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('missing deliveryContract fields');
  });

  it('falls back to a full default band policy when the band is absent', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const middleware = createSugarlangMiddleware({
      contentBundle: {
        scenarios: new Map(),
        groundingMaps: new Map(),
        lexicons: new Map(),
        bandPolicies: { policies: [] },
        sceneLanguagePacks: new Map(),
        questBindings: new Map(),
      },
      getScenarioForNpc: () => undefined,
    });

    const session = {
      npcId: 'npc.rick-roll',
      middlewareState: {},
      learnerBandOverride: 'B2',
    } as any;
    const constraints = {
      sessionId: 'sess-2',
      turnId: 'turn-2',
      hardConstraints: {},
      advisoryPreferences: {},
    } as any;

    middleware.beforeProvider?.(session, constraints, 'learner_policy');
    middleware.beforeProvider?.(session, constraints, 'pre_provider');

    expect(constraints.supportLanguagePolicy).toBe('light_support');
    expect(constraints.deliveryContract).toMatchObject({
      detailLevel: 'concise',
      maxKnowledgeClaims: 2,
    });
    expect(warnSpy.mock.calls[0]?.[0]).toContain('missing band policy for B2');
  });
});
