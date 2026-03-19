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
  MAX_SESSION_FACTS_PER_NPC,
  normalizeFact,
} from '../session-state.js';
import {
  hasLikelyQuestionForm,
} from '../routing.js';
import {
  extractExplicitPlayerFacts,
} from '../memory-provenance.js';

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
  id?: unknown;
  title?: unknown;
  entity_ids?: unknown;
  location_ids?: unknown;
  faction_ids?: unknown;
  beat_ids?: unknown;
  tags?: unknown;
  fact_ids?: unknown;
}

interface LoreChunkEntry {
  chunkId?: unknown;
  pageId?: unknown;
  title?: unknown;
  sectionHeading?: unknown;
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
  anchorTerms?: string[];
}

interface BuildGroundingEvidenceInput {
  loreMatches?: unknown;
  loreArtifacts?: LoreArtifactsLike | null;
  npcId?: unknown;
  npcName?: unknown;
  npcProfile?: NpcProfileLike | null;
  selfEntityId?: unknown;
  beatContract?: BeatContractLike | null;
  memoryFacts?: unknown;
  playerMessage?: unknown;
  history?: unknown;
  regionPath?: unknown;
  regionName?: unknown;
  currentActivity?: unknown;
  currentGoal?: unknown;
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

function collectLoreAnchorTerms(chunk: LoreChunkEntry, metadata: LoreChunkMetadata | null): string[] {
  const rawTerms = [
    normalizeOptionalString(chunk?.title),
    normalizeOptionalString(chunk?.sectionHeading),
    normalizeOptionalString(chunk?.pageId),
    normalizeOptionalString(chunk?.chunkId),
    normalizeOptionalString(metadata?.id),
    normalizeOptionalString(metadata?.title),
    ...toStringArray(metadata?.tags),
    ...toStringArray(metadata?.entity_ids),
    ...toStringArray(metadata?.location_ids),
    ...toStringArray(metadata?.faction_ids),
    ...toStringArray(metadata?.beat_ids),
  ];
  return rawTerms.filter((entry, index, source): entry is string => Boolean(entry) && source.indexOf(entry) === index);
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
    for (const fact of extractExplicitPlayerFacts(message)) {
      pushFact(fact.text);
    }
  };

  pushFactsFromMessage(playerMessage);
  const recentPlayerMessages = (Array.isArray(history) ? history : [])
    .filter((entry) => isRecord(entry) && entry.role === 'player' && typeof entry.text === 'string')
    .slice(-4)
    .map((entry) => String((entry as RecordLike).text));
  for (const message of recentPlayerMessages) {
    if (!hasLikelyQuestionForm(message)) {
      pushFactsFromMessage(message);
    }
  }

  return facts.slice(-MAX_SESSION_FACTS_PER_NPC);
}

function formatRegionLabel(regionName: unknown, regionPath: unknown): string {
  const explicitName = normalizeOptionalString(regionName);
  if (explicitName) return explicitName;
  const explicitPath = normalizeOptionalString(regionPath);
  if (!explicitPath) return '';
  const lastSegment = explicitPath.split(/[./]/).filter(Boolean).pop() ?? explicitPath;
  return lastSegment
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function buildGroundingEvidenceEntries({
  loreMatches,
  loreArtifacts,
  npcId,
  npcName,
  npcProfile,
  selfEntityId,
  beatContract,
  memoryFacts,
  playerMessage,
  history,
  regionPath,
  regionName,
  currentActivity,
  currentGoal,
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
      anchorTerms: toStringArray(entry.anchorTerms),
    });
  };

  const regionLabel = formatRegionLabel(regionName, regionPath);
  const normalizedRegionPath = normalizeOptionalString(regionPath);
  const normalizedSelfEntityId = normalizeOptionalString(selfEntityId);
  if (regionLabel || normalizedRegionPath) {
    pushEntry({
      sourceId: normalizedRegionPath ? `runtime:current_location:${normalizedRegionPath}` : 'runtime:current_location',
      sourceType: 'routine_state',
      text: regionLabel
        ? `We are at ${regionLabel} right now.`
        : `We are in ${normalizedRegionPath} right now.`,
      provenance: {
        kind: 'current_location',
        regionPath: normalizedRegionPath,
        regionName: regionLabel || undefined,
      },
      entityIds: normalizedRegionPath ? [normalizedRegionPath] : [],
      anchorTerms: [
        regionLabel,
        normalizedRegionPath,
        'current location',
        'current region',
        'current place',
        'where are we',
        'where are we now',
        'where am i',
        'where is this',
        'what region',
        'what place',
        'right now',
        'here',
      ].filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0),
      selfAttributed: false,
    });
  }

  const normalizedCurrentActivity = normalizeOptionalString(currentActivity);
  if (normalizedCurrentActivity) {
    pushEntry({
      sourceId: 'runtime:current_activity',
      sourceType: 'routine_state',
      text: `Right now I am ${normalizedCurrentActivity}.`,
      provenance: {
        kind: 'current_activity',
        activity: normalizedCurrentActivity,
      },
      entityIds: normalizedSelfEntityId ? [normalizedSelfEntityId] : [],
      anchorTerms: [
        normalizedCurrentActivity,
        'current activity',
        'what are you doing',
        'what are you up to',
        'doing right now',
        'up to right now',
        'right now',
      ].filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0),
      selfAttributed: Boolean(normalizedSelfEntityId),
    });
  }

  const normalizedCurrentGoal = normalizeOptionalString(currentGoal);
  if (normalizedCurrentGoal) {
    pushEntry({
      sourceId: 'runtime:current_goal',
      sourceType: 'routine_state',
      text: `My current goal is ${normalizedCurrentGoal}.`,
      provenance: {
        kind: 'current_goal',
        goal: normalizedCurrentGoal,
      },
      entityIds: normalizedSelfEntityId ? [normalizedSelfEntityId] : [],
      anchorTerms: [
        normalizedCurrentGoal,
        'current goal',
        'what are you trying to do',
        'what is your goal',
        'what are you aiming for',
      ].filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0),
      selfAttributed: Boolean(normalizedSelfEntityId),
    });
  }
  const factById = isRecord(loreArtifacts?.factById)
    ? loreArtifacts.factById
    : {};
  for (const matchEntry of Array.isArray(loreMatches) ? loreMatches : []) {
    if (!isRecord(matchEntry) || !isRecord(matchEntry.chunk)) continue;
    const chunk = matchEntry.chunk as LoreChunkEntry;
    const chunkId = normalizeOptionalString(chunk.chunkId);
    const chunkMetadata = isRecord(chunk.metadata) ? chunk.metadata as LoreChunkMetadata : null;
    const entityIds = toStringArray(chunkMetadata?.entity_ids);
    const anchorTerms = collectLoreAnchorTerms(chunk, chunkMetadata);
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
        anchorTerms,
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
      anchorTerms,
    });
  }

  const profileEvidenceParts: string[] = [];
  const normalizedNpcName = normalizeOptionalString(npcName);
  if (normalizedNpcName) {
    profileEvidenceParts.push(`NPC name: ${normalizedNpcName}.`);
  }
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
