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
    expect(routed.intent).toBe('lore_other');
    expect(routed.policyPath).toBe('lore_knowledge');
  });

  it('classifies self-identity queries as self_query', () => {
    expect(classifyTurnQueryType('Tell me about your background', 'baker')).toBe('self_query');
    expect(classifyTurnQueryType('What do you do for a job?', 'rick')).toBe('self_query');
  });

  it('maps intents to policy/query types deterministically', () => {
    expect(routeIntentToPolicyPath('session_recall')).toBe('memory_first');
    expect(routeIntentToQueryType('lore_other')).toBe('other_query');
  });

  it('detects lore entity mentions and upgrades place queries to lore_world', () => {
    const baseRoute = routeTurnIntent('Do you know anything about Earendale?', 'rick');
    expect(baseRoute.intent).toBe('lore_other');

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
