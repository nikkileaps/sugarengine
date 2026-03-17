import { describe, expect, it } from 'vitest';
import {
  classifyTurnQueryType,
  collectLoreEntityRouteMatches,
  hasLikelyQuestionForm,
  refineRouteWithLoreEntityMentions,
  routeIntentToPolicyPath,
  routeIntentToQueryType,
  routeTurnIntent,
} from './routing';

describe('routing core', () => {
  it('detects question form by punctuation and interrogative starts', () => {
    expect(hasLikelyQuestionForm('What is this place')).toBe(true);
    expect(hasLikelyQuestionForm('tell me about your background')).toBe(false);
  });

  it('routes knowledge prompts to lore policy path', () => {
    const routed = routeTurnIntent('Do you know anything about the resort near here?', 'baker');
    expect(routed.intent).toBe('lore_world');
    expect(routed.policyPath).toBe('lore_knowledge');
  });

  it('keeps strong world-knowledge consensus even when facet-level interpretation stays ambiguous', () => {
    const routed = routeTurnIntent('What do you know about the resort near here?', 'baker');

    expect(routed.intent).toBe('lore_world');
    expect(routed.policyPath).toBe('lore_knowledge');
    expect(routed.interpretation).toMatchObject({
      lane: 'knowledge',
      target: 'world',
    });
  });

  it('classifies self-identity queries as self_query', () => {
    expect(classifyTurnQueryType('Tell me about your background', 'baker')).toBe('self_query');
    expect(classifyTurnQueryType('What do you do for a job?', 'rick')).toBe('self_query');
  });

  it('routes short self job questions through self knowledge instead of vague chat', () => {
    const routed = routeTurnIntent('What do you do?', 'rick');

    expect(routed.intent).toBe('identity_self');
    expect(routed.interpretation).toMatchObject({
      lane: 'knowledge',
      target: 'self',
      facet: 'occupation',
    });
  });

  it('still computes interpretation for small-talk turns instead of bypassing the semantic layer', () => {
    const routed = routeTurnIntent('hello', 'rick');

    expect(routed.intent).toBe('social_chat');
    expect(routed.interpretation).toMatchObject({
      lane: 'social',
    });
  });

  it('routes current-scene location questions as world knowledge when scene context is available', () => {
    const routed = routeTurnIntent('Where are we right now?', 'rick', {
      scene: {
        regionName: 'Station',
        regionPath: 'regions.station',
      },
    });

    expect(routed.intent).toBe('lore_world');
    expect(routed.interpretation).toMatchObject({
      target: 'world',
      facet: 'location',
    });
  });

  it('maps intents to policy/query types deterministically', () => {
    expect(routeIntentToPolicyPath('session_recall')).toBe('memory_first');
    expect(routeIntentToQueryType('lore_other')).toBe('other_query');
  });

  it('detects lore entity mentions and adds retrieval filters for place queries', () => {
    const baseRoute = routeTurnIntent('Do you know anything about Earendale?', 'rick');
    expect(baseRoute.intent).toBe('lore_world');
    expect(baseRoute.policyPath).toBe('lore_knowledge');

    const loreArtifacts = {
      chunks: [
        {
          pageId: 'lore.locations.towns.earendale',
          title: 'Earendale',
          metadata: {
            id: 'lore.locations.towns.earendale',
            location_ids: ['locations.earendale'],
            entity_ids: [],
            faction_ids: [],
          },
        },
      ],
    };

    const matches = collectLoreEntityRouteMatches('Do you know anything about Earendale?', loreArtifacts);
    expect(matches).toEqual([
      expect.objectContaining({
        entityId: 'locations.earendale',
        entityType: 'world',
        matchedText: 'earendale',
        filterKind: 'locationIds',
      }),
    ]);

    const refined = refineRouteWithLoreEntityMentions({
      route: baseRoute,
      playerMessage: 'Do you know anything about Earendale?',
      loreArtifacts,
    });

    expect(refined.route.intent).toBe('lore_world');
    expect(refined.route.policyPath).toBe('lore_knowledge');
    expect(refined.retrievalFilters.locationIds).toEqual(['locations.earendale']);
  });
});
