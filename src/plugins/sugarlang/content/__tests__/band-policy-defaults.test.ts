import { describe, expect, it } from 'vitest';
import {
  createDefaultBandPolicy,
  createDefaultBandPolicyPack,
  createDefaultDeliveryContract,
  resolveBandPolicyDefaults,
} from '../band-policy-defaults';

describe('band-policy-defaults', () => {
  it('creates the expected default delivery contract for B2', () => {
    expect(createDefaultDeliveryContract('B2')).toEqual({
      detailLevel: 'concise',
      maxKnowledgeClaims: 2,
      maxKnowledgeParts: 2,
      maxSentences: 3,
      maxSentenceLength: 12,
      maxClauseDepth: 2,
      allowExactNumbers: false,
      allowEnrichmentFacts: false,
      preferConcreteFacts: true,
      preferHighFrequencyLexicon: true,
    });
  });

  it('resolves missing delivery contract fields from defaults', () => {
    const partial = {
      ...createDefaultBandPolicy('B1'),
      deliveryContract: {
        detailLevel: 'minimal',
        maxKnowledgeClaims: 1,
      },
    } as any;

    const resolved = resolveBandPolicyDefaults(partial, 'B1');

    expect(resolved.filledDeliveryContract).toBe(true);
    expect(resolved.usedDefaultPolicy).toBe(false);
    expect(resolved.policy.deliveryContract).toMatchObject({
      detailLevel: 'minimal',
      maxKnowledgeClaims: 1,
      maxKnowledgeParts: 1,
      maxSentences: 2,
      maxSentenceLength: 10,
    });
    expect(resolved.warnings[0]).toContain('missing deliveryContract fields');
  });

  it('creates a full default pack for all learner bands', () => {
    const pack = createDefaultBandPolicyPack();
    expect(pack.policies.map((policy) => policy.bandId)).toEqual(['B0', 'B1', 'B2', 'B3', 'B4']);
  });
});
