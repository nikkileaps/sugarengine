/**
 * @fileoverview Reply-parts grounding contract for runtime-owned grounded turns.
 *
 * Responsibilities:
 * - Define the JSON schema for structured reply-parts output.
 * - Build turn-local support-slot tables from grounding evidence.
 * - Build prompts for reply-parts generation and repair.
 * - Parse structured reply-parts responses from model text.
 *
 * Boundaries:
 * - Owns: reply-parts contract shape and prompt/parse helpers.
 * - Does not own: deterministic validation policy, retrieval, or turn orchestration.
 *
 * Public API:
 * - REPLY_PARTS_JSON_SCHEMA
 * - buildSupportSlotsFromGroundingEvidence
 * - buildReplyPartsPrompt
 * - buildReplyPartsRepairPrompt
 * - normalizeReplyPartsForValidation
 * - parseReplyPartsResponseDetailed
 * - materializeTurnOutputFromReplyParts
 *
 * Side Effects:
 * - none
 */

import type {
  SugarAgentBeatEvidence,
  SugarAgentCitation,
  SugarAgentTurnOutput,
} from '../../../contracts/turn';
import type { GroundingEvidenceEntry } from './evidence';
import { inferEvidenceOwnerType } from '../retrieval-governance';
import {
  lexicalOverlapScore,
  normalizeEvidenceTextForPlan,
} from '../retrieval-text';

export type ReplyPartKind = 'social' | 'grounded' | 'inferred' | 'rumor' | 'uncertain' | 'close';

export interface ReplyPart {
  kind: ReplyPartKind;
  text: string;
  support?: string[];
}

export interface ParsedReplyPartsTurn {
  parts: ReplyPart[];
  emotion: string;
  intent: string;
  proposedIntents: Array<Record<string, unknown>>;
  beatEvidence?: SugarAgentBeatEvidence;
}

export interface SupportSlotEntry {
  slotId: string;
  sourceId: string;
  snippet: string;
  sourceType: string;
  ownerType: 'npc' | 'player' | 'world' | 'beat' | 'unknown';
  selfAttributed: boolean;
  entityIds: string[];
}

export interface ReplyPartsParseResult {
  turn: ParsedReplyPartsTurn | null;
  failureReason?: 'invalid_json' | 'invalid_shape' | 'invalid_part';
}

export const REPLY_PARTS_JSON_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    parts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['social', 'grounded', 'inferred', 'rumor', 'uncertain', 'close'],
          },
          text: { type: 'string' },
          support: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['kind', 'text'],
        additionalProperties: false,
      },
    },
    emotion: { type: 'string' },
    intent: { type: 'string' },
    proposedIntents: { type: 'array', items: { type: 'object' } },
    beatEvidence: {
      type: 'object',
      properties: {
        beatId: { type: 'string' },
        coveredFacts: { type: 'array', items: { type: 'string' } },
        uncoveredFacts: { type: 'array', items: { type: 'string' } },
        completionSignal: {
          type: 'string',
          enum: ['none', 'player_ack', 'player_action', 'engine_flag'],
        },
        confidence: { type: 'number' },
      },
      required: ['coveredFacts', 'uncoveredFacts', 'completionSignal', 'confidence'],
      additionalProperties: false,
    },
  },
  required: ['parts', 'emotion', 'intent', 'proposedIntents'],
  additionalProperties: false,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const values: string[] = [];
  for (const entry of value) {
    const normalized = normalizeOptionalString(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
  }
  return values;
}

function sanitizePromptText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function extractJsonCandidates(text: string): string[] {
  const source = sanitizePromptText(text);
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('{') || !line.endsWith('}')) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    candidates.push(line);
  }

  for (let start = source.indexOf('{'); start >= 0; start = source.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const ch = source[index];
      if (!ch) continue;
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') {
        depth += 1;
        continue;
      }
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const candidate = source.slice(start, index + 1);
          if (!seen.has(candidate)) {
            seen.add(candidate);
            candidates.push(candidate);
          }
          break;
        }
      }
    }
  }

  return candidates;
}

function parseReplyPart(value: unknown): ReplyPart | null {
  if (!isRecord(value)) return null;
  const kind = normalizeOptionalString(value.kind);
  const text = normalizeOptionalString(value.text);
  if (!text) return null;
  if (
    kind !== 'social'
    && kind !== 'grounded'
    && kind !== 'inferred'
    && kind !== 'rumor'
    && kind !== 'uncertain'
    && kind !== 'close'
  ) {
    return null;
  }
  const support = normalizeStringArray(value.support);
  const part: ReplyPart = { kind, text };
  if (support.length > 0) {
    part.support = support;
  }
  return part;
}

function parseBeatEvidence(value: unknown): SugarAgentBeatEvidence | undefined {
  if (!isRecord(value)) return undefined;
  const coveredFacts = normalizeStringArray(value.coveredFacts);
  const uncoveredFacts = normalizeStringArray(value.uncoveredFacts);
  const completionSignal = normalizeOptionalString(value.completionSignal);
  const confidence = typeof value.confidence === 'number' && Number.isFinite(value.confidence)
    ? value.confidence
    : 0;
  if (
    completionSignal !== 'none'
    && completionSignal !== 'player_ack'
    && completionSignal !== 'player_action'
    && completionSignal !== 'engine_flag'
  ) {
    return undefined;
  }
  return {
    beatId: normalizeOptionalString(value.beatId),
    coveredFacts,
    uncoveredFacts,
    completionSignal,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

function parseReplyPartsTurnCandidate(value: unknown): ParsedReplyPartsTurn | null {
  if (!isRecord(value)) return null;
  const parts = Array.isArray(value.parts)
    ? value.parts.map((entry) => parseReplyPart(entry)).filter((entry): entry is ReplyPart => Boolean(entry))
    : [];
  if (parts.length === 0) return null;
  const emotion = normalizeOptionalString(value.emotion);
  const intent = normalizeOptionalString(value.intent);
  const proposedIntents = Array.isArray(value.proposedIntents)
    ? value.proposedIntents.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
  if (!emotion || !intent) return null;
  return {
    parts,
    emotion,
    intent,
    proposedIntents,
    beatEvidence: parseBeatEvidence(value.beatEvidence),
  };
}

export function buildSupportSlotsFromGroundingEvidence(input: {
  evidenceEntries?: unknown;
  selfEntityId?: unknown;
  npcId?: unknown;
  maxSlots?: unknown;
}): SupportSlotEntry[] {
  const evidenceEntries = Array.isArray(input.evidenceEntries)
    ? input.evidenceEntries.filter((entry): entry is GroundingEvidenceEntry => isRecord(entry) && typeof entry.sourceId === 'string' && typeof entry.text === 'string')
    : [];
  const maxSlots = typeof input.maxSlots === 'number' && Number.isFinite(input.maxSlots)
    ? Math.max(1, Math.floor(input.maxSlots))
    : 6;
  const slots: SupportSlotEntry[] = [];
  for (const entry of evidenceEntries.slice(0, maxSlots)) {
    const slotId = `E${slots.length + 1}`;
    slots.push({
      slotId,
      sourceId: entry.sourceId,
      snippet: sanitizePromptText(entry.text).slice(0, 320),
      sourceType: entry.sourceType,
      ownerType: inferEvidenceOwnerType(entry, input.selfEntityId, input.npcId),
      selfAttributed: entry.selfAttributed === true,
      entityIds: Array.isArray(entry.entityIds) ? entry.entityIds.filter((value): value is string => typeof value === 'string') : [],
    });
  }
  return slots;
}

export function filterSupportSlotsForQueryType(input: {
  supportSlots?: unknown;
  queryType?: unknown;
}): SupportSlotEntry[] {
  const supportSlots = Array.isArray(input.supportSlots)
    ? input.supportSlots.filter((entry): entry is SupportSlotEntry => isRecord(entry) && typeof entry.slotId === 'string')
    : [];
  const queryType = normalizeOptionalString(input.queryType) ?? 'conversation';

  if (queryType === 'self_query') {
    return supportSlots.filter((slot) => slot.ownerType === 'npc' || slot.ownerType === 'beat');
  }

  return supportSlots;
}

export function normalizeReplyPartsForValidation(input: {
  turn?: ParsedReplyPartsTurn | null;
  supportSlots?: unknown;
  queryType?: unknown;
}): ParsedReplyPartsTurn | null {
  const turn = input.turn ?? null;
  if (!turn) return null;
  const supportSlots = Array.isArray(input.supportSlots)
    ? input.supportSlots.filter((entry): entry is SupportSlotEntry => isRecord(entry) && typeof entry.slotId === 'string')
    : [];
  const queryType = normalizeOptionalString(input.queryType) ?? 'conversation';

  const inferSupportSlots = (partText: string): string[] => {
    const normalizedText = normalizeEvidenceTextForPlan(partText);
    if (!normalizedText) return [];

    if (
      queryType === 'self_query'
      && supportSlots.length === 1
      && (supportSlots[0]?.ownerType === 'npc' || supportSlots[0]?.ownerType === 'beat')
    ) {
      return [supportSlots[0].slotId];
    }

    const scored = supportSlots
      .map((slot) => {
        const normalizedSnippet = normalizeEvidenceTextForPlan(slot.snippet);
        if (!normalizedSnippet) return null;
        const forwardOverlap = lexicalOverlapScore(normalizedText, normalizedSnippet);
        const reverseOverlap = lexicalOverlapScore(normalizedSnippet, normalizedText);
        const normalizedTextLower = normalizedText.toLowerCase();
        const normalizedSnippetLower = normalizedSnippet.toLowerCase();
        const containsBoost = normalizedSnippetLower.includes(normalizedTextLower)
          || normalizedTextLower.includes(normalizedSnippetLower)
          ? 0.99
          : 0;
        const score = Math.max(forwardOverlap, reverseOverlap, containsBoost);
        return score > 0
          ? {
            slotId: slot.slotId,
            score: Number(score.toFixed(4)),
          }
          : null;
      })
      .filter((entry): entry is { slotId: string; score: number } => entry !== null)
      .sort((left, right) => right.score - left.score || left.slotId.localeCompare(right.slotId));

    if (scored.length === 0) return [];
    const topScore = scored[0]?.score ?? 0;
    if (topScore < 0.68) return [];
    const cutoff = Math.max(0.68, topScore - 0.08);
    return scored
      .filter((entry) => entry.score >= cutoff)
      .map((entry) => entry.slotId);
  };

  const isKnowledgePartKind = (kind: ReplyPartKind) => (
    kind === 'grounded' || kind === 'inferred' || kind === 'rumor'
  );

  return {
    ...turn,
    parts: turn.parts.map((part) => {
      if (!isKnowledgePartKind(part.kind)) return part;
      const support = normalizeStringArray(part.support);
      const validSupport = support.filter((slotId) => supportSlots.some((slot) => slot.slotId === slotId));
      if (validSupport.length > 0) {
        const nextPart: ReplyPart = validSupport.length === support.length
          ? { ...part }
          : {
            ...part,
            support: validSupport,
          };
        return nextPart;
      }
      const inferredSupport = inferSupportSlots(part.text);
      if (inferredSupport.length === 0) return part;
      const nextPart: ReplyPart = {
        ...part,
        support: inferredSupport,
      };
      return nextPart;
    }),
  };
}

export function buildReplyPartsPrompt(input: {
  npcName?: unknown;
  playerMessage?: unknown;
  queryType?: unknown;
  routeIntent?: unknown;
  supportSlots: SupportSlotEntry[];
}): string {
  const npcName = sanitizePromptText(input.npcName || 'NPC');
  const playerMessage = sanitizePromptText(input.playerMessage || '');
  const queryType = sanitizePromptText(input.queryType || 'conversation');
  const routeIntent = sanitizePromptText(input.routeIntent || 'unknown');
  const supportSlots = Array.isArray(input.supportSlots) ? input.supportSlots : [];

  const blocks = [
    `Return a short NPC reply for ${npcName} as ordered reply parts.`,
    'Return ONLY one JSON object. No markdown. No explanation.',
    'Use 1 to 3 parts total.',
    'Allowed part kinds: social, grounded, inferred, rumor, uncertain, close.',
    'social: greetings, empathy, clarifying chatter, acknowledgements. No support field.',
    'grounded: factual statement backed by support slot ids. Must include support with one or more slot ids.',
    'inferred: a bounded inference from support slots. Must include support and soft hedge wording such as "I think" or "it seems".',
    'rumor: hearsay from support slots. Must include support and strong hedge wording such as "I heard" or "people say".',
    'uncertain: explicit uncertainty when support is insufficient. No support field.',
    'close: graceful ending. No support field.',
    'Do not mention slot ids in the visible text.',
    'Do not invent facts that are not supported by the allowed slots.',
    'If the player asked for knowledge and support is insufficient, use an uncertain part instead of guessing.',
    'Output shape:',
    '{"parts":[{"kind":"social","text":"Sure."},{"kind":"grounded","text":"The resort is just outside Earendale.","support":["E1"]}],"emotion":"warm","intent":"answer","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}',
    '{"parts":[{"kind":"inferred","text":"I think the bridge is watched after dark.","support":["E1","E2"]}],"emotion":"guarded","intent":"answer","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}',
    '{"parts":[{"kind":"rumor","text":"I heard that smugglers use the old tunnel.","support":["E3"]}],"emotion":"uncertain","intent":"answer","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}',
    `Query type: ${queryType}`,
    `Route intent: ${routeIntent}`,
    `Player message: ${playerMessage || '(none)'}`,
  ];

  if (supportSlots.length === 0) {
    blocks.push('Allowed support slots: none.');
  } else {
    blocks.push('Allowed support slots:');
    for (const slot of supportSlots) {
      const ownerSuffix = slot.ownerType === 'unknown' ? '' : ` [owner=${slot.ownerType}]`;
      blocks.push(`- ${slot.slotId}${ownerSuffix}: ${slot.snippet}`);
    }
  }

  if (queryType === 'self_query') {
    blocks.push('This is a self-query about the NPC.');
    blocks.push('Use only self-owned support about this NPC.');
    if (supportSlots.length > 0) {
      const exampleSlotId = supportSlots[0]?.slotId ?? 'E1';
      blocks.push('If self-owned support is available, at least one part MUST be grounded.');
      blocks.push('Do not answer a self-query with only a social part.');
      blocks.push(`Self-query example: {"parts":[{"kind":"grounded","text":"I am ${npcName}.","support":["${exampleSlotId}"]}],"emotion":"warm","intent":"answer","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}`);
    } else {
      blocks.push('If self-owned support is insufficient, return one uncertain part instead of guessing.');
    }
  }

  return blocks.join('\n');
}

export function buildReplyPartsRepairPrompt(input: {
  npcName?: unknown;
  playerMessage?: unknown;
  queryType?: unknown;
  routeIntent?: unknown;
  supportSlots: SupportSlotEntry[];
  failureReason?: unknown;
}): string {
  const failureReason = sanitizePromptText(input.failureReason || 'invalid previous response');
  const queryType = sanitizePromptText(input.queryType || 'conversation');
  const supportSlots = Array.isArray(input.supportSlots) ? input.supportSlots : [];
  const blocks = [
    `Previous response failed: ${failureReason}.`,
    'Retry now with strict JSON only.',
    'Use only the allowed support slot ids.',
    'If support is insufficient, return an uncertain part.',
  ];

  if (queryType === 'self_query' && supportSlots.length > 0) {
    const exampleSlotId = typeof supportSlots[0]?.slotId === 'string' ? supportSlots[0].slotId : 'E1';
    blocks.push('This is a self-query and self support is available.');
    blocks.push('Your retry MUST include at least one grounded part.');
    blocks.push('Do not return only a social part.');
    blocks.push(`Retry example: {"parts":[{"kind":"grounded","text":"I am ${sanitizePromptText(input.npcName || 'the NPC')}.","support":["${exampleSlotId}"]}],"emotion":"warm","intent":"answer","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}`);
  }

  return blocks.join('\n');
}

export function parseReplyPartsResponseDetailed(value: unknown): ReplyPartsParseResult {
  const candidates: unknown[] = [];
  if (typeof value === 'string') {
    candidates.push(value);
    for (const candidate of extractJsonCandidates(value)) {
      candidates.push(candidate);
    }
  } else {
    candidates.push(value);
  }

  let parsedAnyJson = false;
  let sawObjectShape = false;
  for (const candidate of candidates) {
    let parsed: unknown = candidate;
    if (typeof candidate === 'string') {
      try {
        parsed = JSON.parse(candidate);
        parsedAnyJson = true;
      } catch {
        continue;
      }
    }
    if (isRecord(parsed)) {
      sawObjectShape = true;
    }
    const turn = parseReplyPartsTurnCandidate(parsed);
    if (turn) return { turn };
  }

  return {
    turn: null,
    failureReason: !parsedAnyJson
      ? 'invalid_json'
      : sawObjectShape
        ? 'invalid_part'
        : 'invalid_shape',
  };
}

export function materializeTurnOutputFromReplyParts(input: {
  turn: ParsedReplyPartsTurn;
  supportSlots: SupportSlotEntry[];
}): SugarAgentTurnOutput {
  const supportBySlot = new Map(input.supportSlots.map((slot) => [slot.slotId, slot]));
  const parts = Array.isArray(input.turn.parts) ? input.turn.parts : [];
  const utterance = parts
    .map((part) => sanitizePromptText(part.text))
    .filter((text) => text.length > 0)
    .join(' ')
    .trim();
  const citations: SugarAgentCitation[] = [];
  const seenSourceIds = new Set<string>();
  const isKnowledgePartKind = (kind: ReplyPartKind) => (
    kind === 'grounded' || kind === 'inferred' || kind === 'rumor'
  );

  for (const part of parts) {
    if (!isKnowledgePartKind(part.kind)) continue;
    const support = Array.isArray(part.support) ? part.support : [];
    for (const slotId of support) {
      const slot = supportBySlot.get(slotId);
      if (!slot || seenSourceIds.has(slot.sourceId)) continue;
      seenSourceIds.add(slot.sourceId);
      citations.push({
        sourceId: slot.sourceId,
        snippet: slot.snippet,
      });
    }
  }

  return {
    utterance,
    emotion: input.turn.emotion,
    intent: input.turn.intent,
    proposedIntents: input.turn.proposedIntents,
    citations,
    beatEvidence: input.turn.beatEvidence,
  };
}
