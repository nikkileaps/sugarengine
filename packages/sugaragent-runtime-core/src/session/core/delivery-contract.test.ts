import { describe, expect, it } from 'vitest';
import {
  normalizeDeliveryContract,
  selectDeliveryClaims,
  validateReplyAgainstDeliveryContract,
} from './delivery-contract.js';

describe('delivery-contract', () => {
  it('normalizes delivery contract budgets', () => {
    expect(normalizeDeliveryContract({
      detailLevel: 'concise',
      maxKnowledgeClaims: 2.9,
      maxKnowledgeParts: 2,
      maxSentences: 3,
      maxSentenceLength: 12,
      maxClauseDepth: 2,
      allowExactNumbers: false,
      allowEnrichmentFacts: false,
      preferConcreteFacts: true,
      preferHighFrequencyLexicon: true,
    })).toEqual({
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

  it('selects a concise delivery subset for general lore answers', () => {
    const result = selectDeliveryClaims({
      playerMessage: 'What do you know about Earendale?',
      deliveryContract: {
        detailLevel: 'concise',
        maxKnowledgeClaims: 2,
        allowExactNumbers: false,
        allowEnrichmentFacts: false,
        preferConcreteFacts: true,
      },
      claims: [
        {
          claimOrdinal: 1,
          mode: 'grounded',
          text: 'Earendale is a small town on a floating chunk of land that broke off from the ear of the Great Head.',
          supportSlotIds: ['E1'],
        },
        {
          claimOrdinal: 2,
          mode: 'grounded',
          text: 'The Wordlark Hollow Resort and Spa is located just outside the town.',
          supportSlotIds: ['E2'],
        },
        {
          claimOrdinal: 3,
          mode: 'grounded',
          text: 'During peak season, the number of visitors rises sharply.',
          supportSlotIds: ['E3'],
        },
        {
          claimOrdinal: 4,
          mode: 'grounded',
          text: 'The town has 57 permanent residents.',
          supportSlotIds: ['E4'],
        },
      ],
    });

    expect(result.selectedClaims.map((claim) => claim.claimOrdinal)).toEqual([1, 2]);
    expect(result.omittedClaimOrdinals).toEqual([3, 4]);
  });

  it('rejects replies that violate the delivery budget', () => {
    expect(validateReplyAgainstDeliveryContract({
      deliveryContract: {
        detailLevel: 'concise',
        maxKnowledgeClaims: 2,
        maxKnowledgeParts: 2,
        maxSentences: 2,
        maxSentenceLength: 12,
        allowExactNumbers: false,
      },
      utterance: 'Earendale es una ciudad pequena. El resort esta justo afuera. Tiene 57 residentes permanentes.',
      acceptedClaimOrdinals: [1, 2, 3],
      knowledgePartCount: 3,
    })).toEqual({
      ok: false,
      failureReason: 'delivery_max_knowledge_claims:3>2',
    });
  });
});
