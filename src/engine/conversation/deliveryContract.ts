export type DeliveryDetailLevel = 'minimal' | 'concise' | 'expanded';

/**
 * Generic NPC delivery budget and complexity targets.
 *
 * This is engine-owned and plugin-agnostic:
 * - Sugarlang may populate it from learner-band policy.
 * - SugarAgent may consume it to shape planning and realization.
 */
export interface DeliveryContract {
  detailLevel?: DeliveryDetailLevel;
  maxKnowledgeClaims?: number;
  maxKnowledgeParts?: number;
  maxSentences?: number;
  maxSentenceLength?: number;
  maxClauseDepth?: number;
  allowExactNumbers?: boolean;
  allowEnrichmentFacts?: boolean;
  preferConcreteFacts?: boolean;
  preferHighFrequencyLexicon?: boolean;
}
