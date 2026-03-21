import { cosineSimilarity } from './semantic-vectors.js';
import type {
  QueryInterpretation,
  ReferentPreviewCandidate,
  ResolvedPrimaryReferent,
  ResolvedReferent,
  SubjectRelationDistance,
  SubjectRelationPolicy,
  SubjectRelevanceAnnotation,
  SubjectReferentKind,
} from './turn-contracts.js';

interface RouteMatchLike {
  entityId?: string;
  entityType?: 'world' | 'character' | 'faction' | 'unknown';
  matchedText?: string;
  filterKind?: 'entityIds' | 'locationIds' | 'factionIds' | null;
}

interface ResolvePrimaryReferentInput {
  interpretation: QueryInterpretation;
  playerMessage: string;
  routeMatches?: RouteMatchLike[] | null;
  recentReferents?: ReferentPreviewCandidate[] | null;
  selfEntityId?: string | null;
  embedTexts?: ((texts: string[]) => Promise<number[][]>) | null;
}

interface AttachSubjectSelectionInput extends ResolvePrimaryReferentInput {}

interface SubjectCandidate {
  id?: string;
  text: string;
  kind: SubjectReferentKind;
  confidence: number;
  sourceBoost: number;
  salience: number;
  aliases: string[];
}

interface EvidenceSubjectShape {
  sourceType?: string;
  sourceId?: string;
  ownerType?: string;
  text?: string;
  entityIds?: string[];
  locationIds?: string[];
  factionIds?: string[];
  pageId?: string;
  pageTitle?: string;
  sectionHeading?: string;
  anchorTerms?: string[];
  tags?: string[];
  provenance?: Record<string, unknown>;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeLookupText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\u00c0-\u024f\s.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function tokenize(value: unknown): string[] {
  const normalized = normalizeLookupText(value);
  return normalized.length > 0 ? normalized.split(' ') : [];
}

function dedupeStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const normalized = normalizeLookupText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

function overlapRatio(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  let matched = 0;
  for (const token of left) {
    if (rightSet.has(token)) matched += 1;
  }
  return Number((matched / Math.max(1, left.length)).toFixed(4));
}

function inferKindFromId(id: string | undefined): SubjectReferentKind {
  const normalized = normalizeLookupText(id);
  if (!normalized) return 'unknown';
  if (normalized.startsWith('locations.')) return 'location';
  if (normalized.startsWith('factions.')) return 'faction';
  if (
    normalized.startsWith('npc.')
    || normalized.startsWith('characters.')
    || normalized.startsWith('entities.npcs.')
  ) {
    return 'npc';
  }
  return 'unknown';
}

function mapReferentKind(kind: ResolvedReferent['kind'], id?: string): SubjectReferentKind {
  if (kind === 'location') return 'location';
  if (kind === 'faction') return 'faction';
  if (kind === 'npc') return 'npc';
  if (kind === 'entity') return inferKindFromId(id);
  return 'unknown';
}

function aliasesFromId(id: string | undefined): string[] {
  if (!id) return [];
  const tail = id.split('.').filter(Boolean).pop() ?? id;
  return dedupeStrings([id, tail, tail.replace(/[._-]+/g, ' ')]);
}

function buildCandidateKey(candidate: { id?: string; text: string; kind: SubjectReferentKind }): string {
  return `${candidate.kind}:${normalizeLookupText(candidate.id ?? candidate.text)}`;
}

function pushCandidate(
  target: Map<string, SubjectCandidate>,
  candidate: SubjectCandidate,
) {
  const key = buildCandidateKey(candidate);
  const existing = target.get(key);
  if (!existing) {
    target.set(key, candidate);
    return;
  }
  target.set(key, {
    ...existing,
    confidence: Math.max(existing.confidence, candidate.confidence),
    sourceBoost: Math.max(existing.sourceBoost, candidate.sourceBoost),
    salience: Math.max(existing.salience, candidate.salience),
    aliases: dedupeStrings([...existing.aliases, ...candidate.aliases]),
  });
}

function buildCandidatePool(input: ResolvePrimaryReferentInput): SubjectCandidate[] {
  const pool = new Map<string, SubjectCandidate>();

  for (const referent of Array.isArray(input.interpretation.referents) ? input.interpretation.referents : []) {
    if (!referent || typeof referent.text !== 'string') continue;
    const kind = mapReferentKind(referent.kind, referent.id);
    pushCandidate(pool, {
      id: normalizeOptionalString(referent.id),
      text: referent.text,
      kind,
      confidence: typeof referent.confidence === 'number' ? Math.max(0, Math.min(1, referent.confidence)) : 0.5,
      sourceBoost: 0.24,
      salience: 0,
      aliases: dedupeStrings([referent.text, ...(aliasesFromId(normalizeOptionalString(referent.id)))]),
    });
  }

  for (const match of Array.isArray(input.routeMatches) ? input.routeMatches : []) {
    const id = normalizeOptionalString(match?.entityId);
    const matchedText = normalizeOptionalString(match?.matchedText);
    if (!id && !matchedText) continue;
    const kind = match?.entityType === 'character'
      ? 'npc'
      : match?.entityType === 'faction'
        ? 'faction'
        : match?.entityType === 'world'
          ? 'location'
          : inferKindFromId(id);
    pushCandidate(pool, {
      id,
      text: matchedText ?? id ?? 'unknown',
      kind,
      confidence: 0.96,
      sourceBoost: 0.52,
      salience: 0,
      aliases: dedupeStrings([matchedText, ...(aliasesFromId(id))]),
    });
  }

  for (const referent of Array.isArray(input.recentReferents) ? input.recentReferents : []) {
    const text = normalizeOptionalString(referent?.text);
    if (!text) continue;
    const id = normalizeOptionalString(referent?.id);
    const kind = mapReferentKind(referent.kind === 'entity' ? 'entity' : referent.kind, id);
    pushCandidate(pool, {
      id,
      text,
      kind,
      confidence: typeof referent.confidence === 'number' ? Math.max(0, Math.min(1, referent.confidence)) : 0.42,
      sourceBoost: 0.08,
      salience: typeof referent.salience === 'number' ? Math.max(0, Math.min(1, referent.salience)) : 0.18,
      aliases: dedupeStrings([text, ...(aliasesFromId(id))]),
    });
  }

  return [...pool.values()];
}

function computeTargetCompatibility(
  interpretation: QueryInterpretation,
  candidate: SubjectCandidate,
  selfEntityId: string | undefined,
): number {
  if (interpretation.target === 'self') {
    if (candidate.id && selfEntityId && normalizeLookupText(candidate.id) === normalizeLookupText(selfEntityId)) return 1;
    if (candidate.kind === 'npc') return 0.7;
    return 0.12;
  }
  if (interpretation.target === 'world') {
    if (candidate.kind === 'location') return 1;
    if (candidate.kind === 'faction') return 0.68;
    if (candidate.kind === 'unknown') return 0.4;
    return 0.12;
  }
  if (interpretation.target === 'other') {
    if (candidate.kind === 'npc') return 1;
    if (candidate.kind === 'faction') return 0.52;
    if (candidate.kind === 'unknown') return 0.38;
    return 0.18;
  }
  if (interpretation.target === 'mixed') {
    if (candidate.kind === 'npc' || candidate.kind === 'location') return 0.74;
    return 0.42;
  }
  return 0.4;
}

function computeFacetCompatibility(interpretation: QueryInterpretation, candidate: SubjectCandidate): number {
  if (interpretation.facet === 'location') {
    return candidate.kind === 'location' ? 1 : candidate.kind === 'unknown' ? 0.38 : 0.14;
  }
  if (interpretation.facet === 'relationship') {
    return candidate.kind === 'npc' || candidate.kind === 'faction' ? 0.86 : 0.22;
  }
  if (interpretation.facet === 'identity') {
    return candidate.kind === 'npc' ? 0.82 : candidate.kind === 'unknown' ? 0.3 : 0.16;
  }
  if (interpretation.facet === 'general_lore' || interpretation.facet === 'background') {
    return candidate.kind === 'location' || candidate.kind === 'faction' ? 0.72 : candidate.kind === 'unknown' ? 0.42 : 0.28;
  }
  return 0.34;
}

function computeLexicalFit(focusTokens: string[], candidate: SubjectCandidate): number {
  let best = 0;
  const normalizedFocus = focusTokens.join(' ');
  for (const alias of candidate.aliases) {
    const aliasTokens = tokenize(alias);
    if (aliasTokens.length === 0) continue;
    const exact = normalizedFocus === alias ? 1 : 0;
    const contained = normalizedFocus.includes(alias) ? 0.92 : 0;
    const overlap = overlapRatio(aliasTokens, focusTokens);
    best = Math.max(best, exact, contained, overlap);
  }
  return Number(best.toFixed(4));
}

function isRelationSeekingMessage(value: string): boolean {
  const normalized = normalizeLookupText(value);
  return /\b(who lives|who works|who runs|who owns|who founded|who is near|who is in|what is near|what happened at|connected to|works with|lives in|grew up in)\b/.test(normalized);
}

export function deriveSubjectRelationPolicy(
  playerMessage: string,
  interpretation: QueryInterpretation,
): SubjectRelationPolicy {
  const relationSeeking = isRelationSeekingMessage(playerMessage) || interpretation.facet === 'relationship';
  return {
    facet: interpretation.facet,
    preferredRelationDistances: relationSeeking ? ['associated', 'primary'] : ['primary', 'associated'],
    incidentalAllowed: false,
    associatedFallbackAllowed: true,
    evidenceBudget: relationSeeking
      ? { maxPrimary: 1, maxAssociated: 2 }
      : { maxPrimary: 2, maxAssociated: 1 },
  };
}

export async function resolvePrimaryReferent(
  input: ResolvePrimaryReferentInput,
): Promise<ResolvedPrimaryReferent | null> {
  const candidates = buildCandidatePool(input);
  if (candidates.length === 0) return null;

  const focusTokens = tokenize(input.interpretation.focusText || input.playerMessage);
  const selfEntityId = normalizeOptionalString(input.selfEntityId ?? undefined);
  const semanticScores = new Map<string, number>();

  if (input.embedTexts && candidates.length > 1 && focusTokens.length > 0) {
    const embedTexts = [
      input.interpretation.focusText || input.playerMessage,
      ...candidates.map((candidate) => candidate.text),
    ];
    try {
      const vectors = await input.embedTexts(embedTexts);
      const queryVector = vectors[0];
      for (let index = 0; index < candidates.length; index += 1) {
      const vector = vectors[index + 1];
      const candidate = candidates[index];
      if (!candidate) continue;
      semanticScores.set(
          buildCandidateKey(candidate),
          Math.max(0, cosineSimilarity(queryVector, vector)),
        );
      }
    } catch {
      // Keep deterministic resolution robust when embeddings are unavailable.
    }
  }

  const ranked = candidates
    .map((candidate) => {
      const lexicalFit = computeLexicalFit(focusTokens, candidate);
      const targetCompatibility = computeTargetCompatibility(input.interpretation, candidate, selfEntityId);
      const facetCompatibility = computeFacetCompatibility(input.interpretation, candidate);
      const semanticFit = semanticScores.get(buildCandidateKey(candidate)) ?? 0;
      const score = (
        (candidate.confidence * 1.35)
        + (lexicalFit * 1.8)
        + (targetCompatibility * 0.9)
        + (facetCompatibility * 0.45)
        + (candidate.sourceBoost * 0.5)
        + (candidate.salience * 0.28)
        + (semanticFit * 0.35)
      );
      return {
        candidate,
        score: Number(score.toFixed(4)),
        lexicalFit,
        targetCompatibility,
      };
    })
    .sort((left, right) => (
      right.score - left.score
      || right.lexicalFit - left.lexicalFit
      || right.targetCompatibility - left.targetCompatibility
      || right.candidate.confidence - left.candidate.confidence
    ));

  const top = ranked[0];
  const second = ranked[1];
  if (!top) return null;
  const margin = top.score - (second?.score ?? 0);
  const decisiveLexicalFit = top.lexicalFit >= 0.9 && top.targetCompatibility >= 0.4;
  if (!decisiveLexicalFit && (top.score < 1.2 || margin < 0.16)) {
    return null;
  }

  return {
    id: top.candidate.id,
    text: top.candidate.text,
    kind: top.candidate.kind,
    confidence: Number(Math.max(0.1, Math.min(1, top.score / 3.2)).toFixed(4)),
  };
}

export async function attachSubjectSelectionToInterpretation(
  input: AttachSubjectSelectionInput,
): Promise<QueryInterpretation> {
  const relationPolicy = deriveSubjectRelationPolicy(input.playerMessage, input.interpretation);
  const primaryReferent = await resolvePrimaryReferent(input);
  return {
    ...input.interpretation,
    primaryReferent: primaryReferent ?? undefined,
    relationPolicy,
  };
}

function isPrimaryIdMatch(shape: EvidenceSubjectShape, primary: ResolvedPrimaryReferent): boolean {
  if (!primary.id) return false;
  const inferred = inferEvidenceSubject(shape, primary);
  return Boolean(
    inferred.subjectId
    && normalizeLookupText(inferred.subjectId) === normalizeLookupText(primary.id),
  );
}

function buildPageIdentityTerms(shape: EvidenceSubjectShape): string[] {
  return dedupeStrings([
    shape.pageId,
    shape.pageTitle,
    shape.sectionHeading,
  ]);
}

function inferEvidenceSubject(shape: EvidenceSubjectShape, primary?: ResolvedPrimaryReferent | null): {
  subjectId?: string;
  subjectKind?: SubjectReferentKind;
} {
  const entityId = normalizeStringArray(shape.entityIds)[0];
  if (entityId) {
    return {
      subjectId: entityId,
      subjectKind: inferKindFromId(entityId) === 'unknown' ? 'npc' : inferKindFromId(entityId),
    };
  }
  const locationId = normalizeStringArray(shape.locationIds)[0];
  if (locationId) {
    return {
      subjectId: locationId,
      subjectKind: 'location',
    };
  }
  const factionId = normalizeStringArray(shape.factionIds)[0];
  if (factionId) {
    return {
      subjectId: factionId,
      subjectKind: 'faction',
    };
  }
  if (primary) {
    const pageTerms = buildPageIdentityTerms(shape);
    const primaryTerms = dedupeStrings([primary.text, ...(aliasesFromId(primary.id))]);
    if (pageTerms.some((term) => primaryTerms.includes(term))) {
      return {
        subjectId: primary.id,
        subjectKind: primary.kind,
      };
    }
  }
  return {};
}

export function annotateEvidenceSubjectRelevance(
  shape: EvidenceSubjectShape,
  interpretation?: QueryInterpretation | null,
): SubjectRelevanceAnnotation | undefined {
  const primary = interpretation?.primaryReferent;
  if (!primary) return undefined;

  const pageTerms = buildPageIdentityTerms(shape);
  const primaryTerms = dedupeStrings([primary.text, ...(aliasesFromId(primary.id))]);
  const { subjectId, subjectKind } = inferEvidenceSubject(shape, primary);

  if (isPrimaryIdMatch(shape, primary)) {
    return {
      subjectId: primary.id,
      subjectKind: primary.kind,
      relationDistance: 'primary',
      relationStrength: 1,
      reason: 'direct_id_match',
    };
  }

  const provenanceRegion = normalizeOptionalString(shape.provenance?.regionPath);
  if (
    primary.kind === 'location'
    && shape.sourceType === 'routine_state'
    && shape.provenance?.kind === 'current_location'
    && (
      (primary.id && provenanceRegion?.toLowerCase() === primary.id.toLowerCase())
      || pageTerms.some((term) => primaryTerms.includes(term))
      || normalizeLookupText(shape.text).includes(normalizeLookupText(primary.text))
    )
  ) {
    return {
      subjectId: primary.id,
      subjectKind: primary.kind,
      relationDistance: 'primary',
      relationStrength: 0.96,
      reason: 'direct_location_match',
    };
  }

  if (pageTerms.some((term) => primaryTerms.includes(term))) {
    return {
      subjectId: primary.id,
      subjectKind: primary.kind,
      relationDistance: 'primary',
      relationStrength: 0.92,
      reason: 'direct_page_match',
    };
  }

  if (
    primary.kind === 'location'
    && primary.id
    && normalizeStringArray(shape.locationIds).some((entry) => entry.toLowerCase() === primary.id?.toLowerCase())
  ) {
    return {
      subjectId,
      subjectKind: subjectKind ?? 'unknown',
      relationDistance: 'associated',
      relationStrength: 0.78,
      reason: 'associated_location_relation',
    };
  }

  if (
    primary.kind === 'faction'
    && primary.id
    && normalizeStringArray(shape.factionIds).some((entry) => entry.toLowerCase() === primary.id?.toLowerCase())
  ) {
    return {
      subjectId,
      subjectKind: subjectKind ?? 'unknown',
      relationDistance: 'associated',
      relationStrength: 0.76,
      reason: 'associated_entity_relation',
    };
  }

  const normalizedText = normalizeLookupText(shape.text);
  if (primaryTerms.some((term) => term.length >= 4 && normalizedText.includes(term))) {
    return {
      subjectId,
      subjectKind: subjectKind ?? 'unknown',
      relationDistance: 'incidental',
      relationStrength: 0.3,
      reason: 'mention_only',
    };
  }

  const normalizedTags = dedupeStrings(Array.isArray(shape.tags) ? shape.tags : []);
  if (primaryTerms.some((term) => normalizedTags.includes(term))) {
    return {
      subjectId,
      subjectKind: subjectKind ?? 'unknown',
      relationDistance: 'incidental',
      relationStrength: 0.18,
      reason: 'tag_only',
    };
  }

  return {
    subjectId,
    subjectKind: subjectKind ?? 'unknown',
    relationDistance: 'incidental',
    relationStrength: 0,
    reason: 'unknown',
  };
}

export function isRelationDistanceAdmissible(
  relationDistance: SubjectRelationDistance | undefined,
  relationPolicy: SubjectRelationPolicy | undefined,
): boolean {
  if (!relationDistance || !relationPolicy) return true;
  if (relationDistance === 'incidental') return relationPolicy.incidentalAllowed;
  return relationPolicy.preferredRelationDistances.includes(relationDistance);
}

export function relationDistanceWeight(
  relationDistance: SubjectRelationDistance | undefined,
  relationPolicy: SubjectRelationPolicy | undefined,
): number {
  if (!relationDistance || !relationPolicy) return 1;
  const firstPreference = relationPolicy.preferredRelationDistances[0] ?? 'primary';
  if (relationDistance === firstPreference) return 1.12;
  if (relationDistance === 'primary') return 1.05;
  if (relationDistance === 'associated') return 0.88;
  return relationPolicy.incidentalAllowed ? 0.4 : 0.1;
}
