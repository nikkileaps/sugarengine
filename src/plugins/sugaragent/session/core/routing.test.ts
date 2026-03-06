import { describe, expect, it } from 'vitest';
import {
  classifyTurnQueryType,
  hasLikelyQuestionForm,
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
  });

  it('maps intents to policy/query types deterministically', () => {
    expect(routeIntentToPolicyPath('session_recall')).toBe('memory_first');
    expect(routeIntentToQueryType('lore_other')).toBe('other_query');
  });
});
