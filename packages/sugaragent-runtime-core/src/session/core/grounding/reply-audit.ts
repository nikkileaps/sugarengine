/**
 * @fileoverview Structured audit contract for grounded reply-parts realization.
 *
 * Responsibilities:
 * - Define the JSON schema for grounded reply audit output.
 * - Parse audit responses from model text with wrapped/noisy JSON recovery.
 *
 * Boundaries:
 * - Owns: audit contract shape and parse helpers.
 * - Does not own: prompt construction, runtime policy, or provenance mapping.
 *
 * Public API:
 * - GROUNDED_REPLY_AUDIT_JSON_SCHEMA
 * - parseGroundedReplyAuditDetailed
 *
 * Side Effects:
 * - none
 */

export type AuditedReplyRole = 'social' | 'knowledge' | 'uncertain' | 'close' | 'unsupported';

export interface ReplyPartAudit {
  partIndex: number;
  role: AuditedReplyRole;
  claimOrdinals: number[];
  hedgeSufficient?: boolean;
  notes?: string;
}

export interface GroundedReplyAudit {
  partAudits: ReplyPartAudit[];
  unsupportedFacts: string[];
}

export interface GroundedReplyAuditParseResult {
  audit: GroundedReplyAudit | null;
  failureReason?: 'invalid_json' | 'invalid_shape' | 'invalid_part';
}

export const GROUNDED_REPLY_AUDIT_JSON_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    partAudits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          partIndex: { type: 'integer', minimum: 0 },
          role: {
            type: 'string',
            enum: ['social', 'knowledge', 'uncertain', 'close', 'unsupported'],
          },
          claimOrdinals: {
            type: 'array',
            items: { type: 'integer', minimum: 1 },
          },
          hedgeSufficient: {
            anyOf: [
              { type: 'boolean' },
              { type: 'null' },
            ],
          },
          notes: {
            anyOf: [
              { type: 'string' },
              { type: 'null' },
            ],
          },
        },
        required: ['partIndex', 'role', 'claimOrdinals', 'hedgeSufficient', 'notes'],
        additionalProperties: false,
      },
    },
    unsupportedFacts: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['partAudits', 'unsupportedFacts'],
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
  const output: string[] = [];
  for (const entry of value) {
    const normalized = normalizeOptionalString(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function normalizeOrdinalArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const output: number[] = [];
  for (const entry of value) {
    if (!Number.isFinite(entry)) continue;
    const normalized = Math.max(1, Math.floor(Number(entry)));
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
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

function parseReplyPartAudit(value: unknown): ReplyPartAudit | null {
  if (!isRecord(value)) return null;
  if (!Number.isFinite(value.partIndex)) return null;
  const partIndex = Math.max(0, Math.floor(Number(value.partIndex)));
  const role = normalizeOptionalString(value.role);
  if (
    role !== 'social'
    && role !== 'knowledge'
    && role !== 'uncertain'
    && role !== 'close'
    && role !== 'unsupported'
  ) {
    return null;
  }

  const audit: ReplyPartAudit = {
    partIndex,
    role,
    claimOrdinals: normalizeOrdinalArray(value.claimOrdinals),
  };
  if (typeof value.hedgeSufficient === 'boolean') {
    audit.hedgeSufficient = value.hedgeSufficient;
  }
  const notes = normalizeOptionalString(value.notes);
  if (notes) {
    audit.notes = notes;
  }
  return audit;
}

function parseGroundedReplyAuditCandidate(value: unknown): GroundedReplyAudit | null {
  if (!isRecord(value)) return null;
  const partAudits = Array.isArray(value.partAudits)
    ? value.partAudits
      .map((entry) => parseReplyPartAudit(entry))
      .filter((entry): entry is ReplyPartAudit => entry !== null)
      .sort((left, right) => left.partIndex - right.partIndex)
    : [];
  if (partAudits.length === 0) return null;
  return {
    partAudits,
    unsupportedFacts: normalizeStringArray(value.unsupportedFacts),
  };
}

export function parseGroundedReplyAuditDetailed(value: unknown): GroundedReplyAuditParseResult {
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
    const audit = parseGroundedReplyAuditCandidate(parsed);
    if (audit) return { audit };
  }

  return {
    audit: null,
    failureReason: !parsedAnyJson
      ? 'invalid_json'
      : sawObjectShape
        ? 'invalid_part'
        : 'invalid_shape',
  };
}
