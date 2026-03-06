/**
 * @fileoverview Builds normalized grounding-evidence entries for session turn validation and diagnostics.
 *
 * Responsibilities:
 * - Convert lore/profile/beat/session/player sources into unified grounding evidence entries.
 * - Deduplicate and normalize evidence payloads before claim-validation flow.
 *
 * Boundaries:
 * - Owns: Evidence entry assembly and source normalization for grounding.
 * - Does not own: Retrieval ranking, claim validation policy, or final turn orchestration.
 *
 * Public API:
 * - GroundingEvidenceEntry: Normalized evidence item contract.
 * - buildGroundingEvidenceEntries: Produces evidence entries from turn inputs and context.
 *
 * Side Effects:
 * - none
 *
 * Invariants:
 * - Evidence entries are deduplicated by `sourceType + text` and contain non-empty `text`.
 *
 * @see ../../../../../../docs/api/plugins/sugaragent/17-sugaragent-session-runtime.md#grounding-plain-language
 */
import {
  extractSalientFacts,
  MAX_SESSION_FACTS_PER_NPC,
  normalizeFact,
} from '../session-state';
import {
  hasLikelyQuestionForm,
} from '../routing';

interface RecordLike {
  [key: string]: unknown;
}

interface LoreFactVerification {
  status?: unknown;
}

interface LoreFactEntry {
  statement?: unknown;
  chunkId?: unknown;
  verification?: LoreFactVerification;
  provenance?: unknown;
}

interface LoreChunkMetadata {
  entity_ids?: unknown;
  fact_ids?: unknown;
}

interface LoreChunkEntry {
  chunkId?: unknown;
  metadata?: unknown;
  summary?: unknown;
  content?: unknown;
}

interface LoreMatchEntry {
  selfEntityMatch?: unknown;
  pool?: unknown;
  chunk?: unknown;
}

interface NpcProfileLike {
  persona?: unknown;
}

interface BeatContractLike {
  beatId?: unknown;
  id?: unknown;
  npcId?: unknown;
  requiredFacts?: unknown;
}

interface LoreArtifactsLike {
  factById?: unknown;
}

export interface GroundingEvidenceEntry {
  sourceId: string;
  sourceType: string;
  text: string;
  selfAttributed: boolean;
  chunkId?: string;
  factId?: string;
  verificationStatus?: string;
  provenance?: RecordLike;
  entityIds: string[];
}

interface BuildGroundingEvidenceInput {
  loreMatches?: unknown;
  loreArtifacts?: LoreArtifactsLike | null;
  npcId?: unknown;
  npcProfile?: NpcProfileLike | null;
  selfEntityId?: unknown;
  beatContract?: BeatContractLike | null;
  memoryFacts?: unknown;
  playerMessage?: unknown;
  history?: unknown;
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function isSelfEvidenceMatch(matchEntry: unknown, selfEntityId: string | undefined): boolean {
  if (!isRecord(matchEntry)) return false;
  if (matchEntry.selfEntityMatch === true) return true;
  if (matchEntry.pool === 'self') return true;
  if (!selfEntityId) return false;
  const normalizedSelfEntityId = selfEntityId.trim().toLowerCase();
  if (!normalizedSelfEntityId) return false;
  const chunk = isRecord(matchEntry.chunk) ? matchEntry.chunk : null;
  const metadata = chunk && isRecord(chunk.metadata) ? chunk.metadata : null;
  const entityIds = toStringArray(metadata?.entity_ids).map((entry) => entry.toLowerCase());
  return entityIds.includes(normalizedSelfEntityId);
}

function collectPlayerEvidenceFacts(playerMessage: unknown, history: unknown): string[] {
  const facts: string[] = [];
  const seen = new Set<string>();

  const pushFact = (rawFact: unknown) => {
    const normalized = normalizeFact(String(rawFact ?? ''));
    if (!normalized || normalized.length < 6) return;
    const canonical = normalized.toLowerCase();
    if (seen.has(canonical)) return;
    seen.add(canonical);
    facts.push(normalized);
  };

  const pushFactsFromMessage = (rawMessage: unknown) => {
    const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
    if (!message) return;
    for (const fact of extractSalientFacts(message)) {
      pushFact(fact);
    }
    if (message.length <= 220 && !hasLikelyQuestionForm(message)) {
      pushFact(message);
    }
  };

  pushFactsFromMessage(playerMessage);
  const recentPlayerMessages = (Array.isArray(history) ? history : [])
    .filter((entry) => isRecord(entry) && entry.role === 'player' && typeof entry.text === 'string')
    .slice(-4)
    .map((entry) => String((entry as RecordLike).text));
  for (const message of recentPlayerMessages) {
    pushFactsFromMessage(message);
  }

  return facts.slice(-MAX_SESSION_FACTS_PER_NPC);
}

export function buildGroundingEvidenceEntries({
  loreMatches,
  loreArtifacts,
  npcId,
  npcProfile,
  selfEntityId,
  beatContract,
  memoryFacts,
  playerMessage,
  history,
}: BuildGroundingEvidenceInput): GroundingEvidenceEntry[] {
  const entries: GroundingEvidenceEntry[] = [];
  const seen = new Set<string>();

  const pushEntry = (entry: RecordLike) => {
    if (!isRecord(entry)) return;
    if (typeof entry.text !== 'string') return;
    const text = entry.text.trim();
    if (!text) return;
    const sourceType = typeof entry.sourceType === 'string' ? entry.sourceType : 'unknown';
    const sourceId = typeof entry.sourceId === 'string' && entry.sourceId.trim().length > 0
      ? entry.sourceId.trim()
      : `${sourceType}:${entries.length + 1}`;
    const dedupeKey = `${sourceType}:${text.toLowerCase()}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    entries.push({
      sourceId,
      sourceType,
      text,
      selfAttributed: entry.selfAttributed === true,
      chunkId: typeof entry.chunkId === 'string' ? entry.chunkId : undefined,
      factId: typeof entry.factId === 'string' ? entry.factId : undefined,
      verificationStatus: typeof entry.verificationStatus === 'string' ? entry.verificationStatus : undefined,
      provenance: isRecord(entry.provenance) ? entry.provenance : undefined,
      entityIds: toStringArray(entry.entityIds),
    });
  };

  const normalizedSelfEntityId = normalizeOptionalString(selfEntityId);
  const factById = isRecord(loreArtifacts?.factById)
    ? loreArtifacts.factById
    : {};
  for (const matchEntry of Array.isArray(loreMatches) ? loreMatches : []) {
    if (!isRecord(matchEntry) || !isRecord(matchEntry.chunk)) continue;
    const chunk = matchEntry.chunk as LoreChunkEntry;
    const chunkId = normalizeOptionalString(chunk.chunkId);
    const chunkMetadata = isRecord(chunk.metadata) ? chunk.metadata as LoreChunkMetadata : null;
    const entityIds = toStringArray(chunkMetadata?.entity_ids);
    const chunkFactIds = toStringArray(chunkMetadata?.fact_ids);
    let usedFactEntries = 0;
    for (const factId of chunkFactIds.slice(0, 4)) {
      const fact = isRecord((factById as RecordLike)[factId])
        ? ((factById as RecordLike)[factId] as LoreFactEntry)
        : null;
      if (!fact) continue;
      const statement = normalizeOptionalString(fact.statement);
      if (!statement) continue;
      const verificationStatus = normalizeOptionalString(fact?.verification?.status) ?? 'available';
      if (verificationStatus === 'verification_unavailable') continue;
      usedFactEntries += 1;
      pushEntry({
        sourceId: factId,
        sourceType: 'lore_chunk',
        text: statement,
        factId,
        chunkId: normalizeOptionalString(chunkId ?? fact.chunkId),
        verificationStatus,
        provenance: isRecord(fact.provenance) ? fact.provenance : undefined,
        selfAttributed: isSelfEvidenceMatch(matchEntry as LoreMatchEntry, normalizedSelfEntityId),
        entityIds,
      });
    }
    if (usedFactEntries > 0) {
      continue;
    }
    const chunkSummary = normalizeOptionalString(chunk.summary);
    const chunkContent = normalizeOptionalString(chunk.content);
    const combinedText = [chunkSummary, chunkContent]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .trim();
    if (!combinedText) continue;
    pushEntry({
      sourceId: chunkId ?? `lore:${entries.length + 1}`,
      sourceType: 'lore_chunk',
      text: combinedText,
      chunkId: chunkId ?? undefined,
      selfAttributed: isSelfEvidenceMatch(matchEntry as LoreMatchEntry, normalizedSelfEntityId),
      entityIds,
    });
  }

  const profileEvidenceParts: string[] = [];
  if (normalizedSelfEntityId) {
    profileEvidenceParts.push(`Identity entity: ${normalizedSelfEntityId}.`);
  }
  if (typeof npcProfile?.persona === 'string' && npcProfile.persona.trim().length > 0) {
    profileEvidenceParts.push(`Persona: ${npcProfile.persona.trim()}.`);
  }
  if (profileEvidenceParts.length > 0) {
    pushEntry({
      sourceId: `self:${normalizedSelfEntityId ?? normalizeOptionalString(npcId) ?? 'profile'}`,
      sourceType: 'self_profile',
      text: profileEvidenceParts.join(' '),
      selfAttributed: true,
      entityIds: normalizedSelfEntityId ? [normalizedSelfEntityId] : [],
    });
  }

  const beatId = normalizeOptionalString(beatContract?.beatId ?? beatContract?.id);
  const beatNpcId = normalizeOptionalString(beatContract?.npcId);
  const beatFacts = toStringArray(beatContract?.requiredFacts);
  beatFacts.forEach((fact, index) => {
    pushEntry({
      sourceId: `${beatId ?? 'beat'}:${index + 1}`,
      sourceType: 'beat_fact',
      text: fact,
      selfAttributed: Boolean(beatNpcId && normalizeOptionalString(npcId) === beatNpcId),
      entityIds: beatNpcId ? [beatNpcId] : [],
    });
  });

  toStringArray(memoryFacts)
    .forEach((fact, index) => {
      pushEntry({
        sourceId: `session:${index + 1}`,
        sourceType: 'session_fact',
        text: fact,
      });
    });

  const playerFacts = collectPlayerEvidenceFacts(playerMessage, history);
  playerFacts.forEach((fact, index) => {
    pushEntry({
      sourceId: `player:${index + 1}`,
      sourceType: 'player_fact',
      text: fact,
    });
  });

  return entries;
}
