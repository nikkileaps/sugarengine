import type { DeliveryContract } from '../../../../engine/conversation/deliveryContract';

export interface DeliveryClaimCandidate {
  claimOrdinal: number;
  mode: 'grounded' | 'inferred' | 'rumor';
  text: string;
  supportSlotIds: string[];
}

export interface NormalizedDeliveryContract extends DeliveryContract {
  detailLevel: 'minimal' | 'concise' | 'expanded';
}

export interface DeliveryClaimSelection {
  selectedClaims: DeliveryClaimCandidate[];
  omittedClaimOrdinals: number[];
}

export interface DeliveryContractCheckResult {
  ok: boolean;
  failureReason?: string;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizePositiveInteger(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(1, Math.floor(numeric));
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function containsExactNumber(text: string): boolean {
  return /\b\d[\d,.:/-]*\b/.test(text);
}

function looksAbstractDetail(text: string): boolean {
  return /\b(population|resident|residents|inhabitant|visitor|season|seasonal|increase|decrease|number of|during peak|peak season)\b/i.test(text);
}

function tokenizeQueryText(text: unknown): string[] {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !['the', 'and', 'for', 'are', 'you', 'about', 'what', 'know', 'where', 'right', 'now'].includes(token));
}

export function normalizeDeliveryContract(contract: DeliveryContract | null | undefined): NormalizedDeliveryContract | null {
  if (!contract || typeof contract !== 'object') return null;
  const detailLevel = contract.detailLevel === 'minimal'
    || contract.detailLevel === 'concise'
    || contract.detailLevel === 'expanded'
    ? contract.detailLevel
    : 'concise';

  return {
    detailLevel,
    maxKnowledgeClaims: normalizePositiveInteger(contract.maxKnowledgeClaims),
    maxKnowledgeParts: normalizePositiveInteger(contract.maxKnowledgeParts),
    maxSentences: normalizePositiveInteger(contract.maxSentences),
    maxSentenceLength: normalizePositiveInteger(contract.maxSentenceLength),
    maxClauseDepth: normalizePositiveInteger(contract.maxClauseDepth),
    allowExactNumbers: normalizeOptionalBoolean(contract.allowExactNumbers),
    allowEnrichmentFacts: normalizeOptionalBoolean(contract.allowEnrichmentFacts),
    preferConcreteFacts: normalizeOptionalBoolean(contract.preferConcreteFacts),
    preferHighFrequencyLexicon: normalizeOptionalBoolean(contract.preferHighFrequencyLexicon),
  };
}

export function buildDeliveryContractPromptLines(contract: DeliveryContract | null | undefined): string[] {
  const normalized = normalizeDeliveryContract(contract);
  if (!normalized) return [];

  const lines = ['Delivery contract for this reply:'];
  lines.push(`- Detail level: ${normalized.detailLevel}`);
  if (normalized.maxKnowledgeClaims) lines.push(`- Use at most ${normalized.maxKnowledgeClaims} knowledge claim(s).`);
  if (normalized.maxKnowledgeParts) lines.push(`- Use at most ${normalized.maxKnowledgeParts} knowledge part(s).`);
  if (normalized.maxSentences) lines.push(`- Use at most ${normalized.maxSentences} sentence(s).`);
  if (normalized.maxSentenceLength) lines.push(`- Keep each sentence to about ${normalized.maxSentenceLength} words or fewer.`);
  if (normalized.maxClauseDepth) lines.push(`- Keep clause nesting shallow (max depth ${normalized.maxClauseDepth}).`);
  if (normalized.allowExactNumbers === false) lines.push('- Avoid exact numeric details unless they are absolutely required.');
  if (normalized.allowEnrichmentFacts === false) lines.push('- Do not volunteer enrichment facts beyond the direct answer.');
  if (normalized.preferConcreteFacts) lines.push('- Prefer concrete, high-utility facts over abstract or statistical details.');
  if (normalized.preferHighFrequencyLexicon) lines.push('- Prefer high-frequency, learnable wording when natural.');
  return lines;
}

export function selectDeliveryClaims(input: {
  claims: DeliveryClaimCandidate[];
  deliveryContract?: DeliveryContract | null;
  playerMessage?: string;
}): DeliveryClaimSelection {
  const claims = Array.isArray(input.claims) ? input.claims : [];
  const normalized = normalizeDeliveryContract(input.deliveryContract);
  if (!normalized || claims.length === 0 || !normalized.maxKnowledgeClaims || claims.length <= normalized.maxKnowledgeClaims) {
    return {
      selectedClaims: [...claims],
      omittedClaimOrdinals: [],
    };
  }

  const queryTokens = new Set(tokenizeQueryText(input.playerMessage));
  const ranked = claims
    .map((claim) => {
      let score = 100 - claim.claimOrdinal;
      if (claim.mode === 'grounded') score += 30;
      if (claim.mode === 'inferred') score += 15;
      if (normalized.preferConcreteFacts && looksAbstractDetail(claim.text)) score -= 18;
      if (normalized.allowExactNumbers === false && containsExactNumber(claim.text)) score -= 50;
      if (normalized.allowEnrichmentFacts === false && claim.claimOrdinal > normalized.maxKnowledgeClaims!) score -= 8;

      const claimTokens = tokenizeQueryText(claim.text);
      const overlap = claimTokens.filter((token) => queryTokens.has(token)).length;
      score += overlap * 12;

      return { claim, score };
    })
    .sort((left, right) => right.score - left.score || left.claim.claimOrdinal - right.claim.claimOrdinal);

  const selectedClaimOrdinals = new Set(
    ranked
      .slice(0, normalized.maxKnowledgeClaims)
      .map((entry) => entry.claim.claimOrdinal),
  );

  const selectedClaims = claims.filter((claim) => selectedClaimOrdinals.has(claim.claimOrdinal));
  const omittedClaimOrdinals = claims
    .filter((claim) => !selectedClaimOrdinals.has(claim.claimOrdinal))
    .map((claim) => claim.claimOrdinal);

  return {
    selectedClaims,
    omittedClaimOrdinals,
  };
}

function countSentences(text: string): number {
  const matches = text.match(/[^.!?]+[.!?]?/g) ?? [];
  return matches.map((entry) => entry.trim()).filter(Boolean).length;
}

function estimateLongestSentenceWords(text: string): number {
  const sentences = text.match(/[^.!?]+[.!?]?/g) ?? [text];
  return sentences.reduce((longest, sentence) => {
    const count = sentence
      .trim()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .length;
    return Math.max(longest, count);
  }, 0);
}

export function validateReplyAgainstDeliveryContract(input: {
  deliveryContract?: DeliveryContract | null;
  utterance: string;
  acceptedClaimOrdinals: number[];
  knowledgePartCount: number;
}): DeliveryContractCheckResult {
  const normalized = normalizeDeliveryContract(input.deliveryContract);
  if (!normalized) return { ok: true };

  if (
    normalized.maxKnowledgeClaims
    && input.acceptedClaimOrdinals.length > normalized.maxKnowledgeClaims
  ) {
    return {
      ok: false,
      failureReason: `delivery_max_knowledge_claims:${input.acceptedClaimOrdinals.length}>${normalized.maxKnowledgeClaims}`,
    };
  }

  if (
    normalized.maxKnowledgeParts
    && input.knowledgePartCount > normalized.maxKnowledgeParts
  ) {
    return {
      ok: false,
      failureReason: `delivery_max_knowledge_parts:${input.knowledgePartCount}>${normalized.maxKnowledgeParts}`,
    };
  }

  if (
    normalized.maxSentences
    && countSentences(input.utterance) > normalized.maxSentences
  ) {
    return {
      ok: false,
      failureReason: `delivery_max_sentences:${countSentences(input.utterance)}>${normalized.maxSentences}`,
    };
  }

  if (
    normalized.maxSentenceLength
    && estimateLongestSentenceWords(input.utterance) > Math.ceil(normalized.maxSentenceLength * 1.35)
  ) {
    return {
      ok: false,
      failureReason: `delivery_max_sentence_length:${estimateLongestSentenceWords(input.utterance)}>${Math.ceil(normalized.maxSentenceLength * 1.35)}`,
    };
  }

  if (normalized.allowExactNumbers === false && containsExactNumber(input.utterance)) {
    return {
      ok: false,
      failureReason: 'delivery_disallows_exact_numbers',
    };
  }

  return { ok: true };
}

export function summarizeDeliveryContractForDiagnostics(contract: DeliveryContract | null | undefined): string | undefined {
  const normalized = normalizeDeliveryContract(contract);
  if (!normalized) return undefined;
  const fields = [
    `detail=${normalized.detailLevel}`,
    normalized.maxKnowledgeClaims ? `claims=${normalized.maxKnowledgeClaims}` : null,
    normalized.maxKnowledgeParts ? `parts=${normalized.maxKnowledgeParts}` : null,
    normalized.maxSentences ? `sentences=${normalized.maxSentences}` : null,
    normalized.maxSentenceLength ? `words=${normalized.maxSentenceLength}` : null,
    normalized.allowExactNumbers === false ? 'noExactNumbers' : null,
    normalized.allowEnrichmentFacts === false ? 'noEnrichment' : null,
  ].filter((entry): entry is string => Boolean(entry));
  return fields.join(' ');
}
