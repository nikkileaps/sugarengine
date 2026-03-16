import type { DeliveryContract } from '../../../engine/conversation/deliveryContract';
import type { BandPolicy, BandPolicyPack, LearnerBandId } from '../types';

export const DEFAULT_BAND_ORDER: LearnerBandId[] = ['B0', 'B1', 'B2', 'B3', 'B4'];

export interface ResolvedBandPolicyResult {
  policy: BandPolicy;
  usedDefaultPolicy: boolean;
  filledDeliveryContract: boolean;
  warnings: string[];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createDefaultDeliveryContract(bandId: LearnerBandId): DeliveryContract {
  switch (bandId) {
    case 'B0':
      return {
        detailLevel: 'minimal',
        maxKnowledgeClaims: 1,
        maxKnowledgeParts: 1,
        maxSentences: 1,
        maxSentenceLength: 8,
        maxClauseDepth: 1,
        allowExactNumbers: false,
        allowEnrichmentFacts: false,
        preferConcreteFacts: true,
        preferHighFrequencyLexicon: true,
      };
    case 'B1':
      return {
        detailLevel: 'minimal',
        maxKnowledgeClaims: 1,
        maxKnowledgeParts: 1,
        maxSentences: 2,
        maxSentenceLength: 10,
        maxClauseDepth: 1,
        allowExactNumbers: false,
        allowEnrichmentFacts: false,
        preferConcreteFacts: true,
        preferHighFrequencyLexicon: true,
      };
    case 'B2':
      return {
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
      };
    case 'B3':
      return {
        detailLevel: 'concise',
        maxKnowledgeClaims: 3,
        maxKnowledgeParts: 3,
        maxSentences: 4,
        maxSentenceLength: 16,
        maxClauseDepth: 2,
        allowExactNumbers: true,
        allowEnrichmentFacts: true,
        preferConcreteFacts: true,
        preferHighFrequencyLexicon: false,
      };
    case 'B4':
    default:
      return {
        detailLevel: 'expanded',
        maxKnowledgeClaims: 5,
        maxKnowledgeParts: 4,
        maxSentences: 5,
        maxSentenceLength: 22,
        maxClauseDepth: 3,
        allowExactNumbers: true,
        allowEnrichmentFacts: true,
        preferConcreteFacts: false,
        preferHighFrequencyLexicon: false,
      };
  }
}

export function createDefaultBandPolicy(bandId: LearnerBandId): BandPolicy {
  return {
    bandId,
    supportLanguagePolicy: {
      mixingLevel: bandId === 'B0'
        ? 'full_support'
        : bandId === 'B1'
          ? 'heavy_support'
          : bandId === 'B2'
            ? 'light_support'
            : bandId === 'B3'
              ? 'target_dominant'
              : 'target_only',
      showSupportStrip: false,
      showGlosses: bandId === 'B2',
    },
    groundingIntensity: bandId === 'B0'
      ? 'always'
      : bandId === 'B1'
        ? 'on_first_encounter'
        : bandId === 'B4'
          ? 'none'
          : 'on_request',
    allowedResponseModes: bandId === 'B0'
      ? ['chip_composition', 'object_selection']
      : bandId === 'B1'
        ? ['single_blank', 'blank_fill', 'phrase_assembly', 'word_bank', 'object_selection']
        : bandId === 'B2'
          ? ['short_text']
          : bandId === 'B3'
            ? ['short_text', 'open_text']
            : ['open_text', 'free_form'],
    correctionPosture: bandId === 'B0' || bandId === 'B1'
      ? 'immediate'
      : bandId === 'B2'
        ? 'delayed'
        : bandId === 'B3'
          ? 'on_request'
          : 'none',
    deliveryContract: createDefaultDeliveryContract(bandId),
  };
}

export function createDefaultBandPolicyPack(
  bands: readonly LearnerBandId[] = DEFAULT_BAND_ORDER,
): BandPolicyPack {
  return {
    policies: bands.map((bandId) => createDefaultBandPolicy(bandId)),
  };
}

export function resolveBandPolicyDefaults(
  policy: BandPolicy | undefined,
  bandId: LearnerBandId,
): ResolvedBandPolicyResult {
  const defaultPolicy = createDefaultBandPolicy(bandId);
  if (!policy) {
    return {
      policy: defaultPolicy,
      usedDefaultPolicy: true,
      filledDeliveryContract: true,
      warnings: [`missing band policy for ${bandId}; using Sugarlang defaults`],
    };
  }

  const rawContract = isObjectRecord(policy.deliveryContract) ? policy.deliveryContract : null;
  const resolvedContract = {
    ...defaultPolicy.deliveryContract,
    ...(rawContract ?? {}),
  };
  const defaultKeys = Object.keys(defaultPolicy.deliveryContract);
  const filledDeliveryContract = rawContract === null
    || defaultKeys.some((key) => rawContract[key] === undefined);

  return {
    policy: filledDeliveryContract
      ? { ...policy, deliveryContract: resolvedContract }
      : policy,
    usedDefaultPolicy: false,
    filledDeliveryContract,
    warnings: filledDeliveryContract
      ? [`band policy ${bandId} is missing deliveryContract fields; using Sugarlang defaults`]
      : [],
  };
}
