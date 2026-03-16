/**
 * @fileoverview Deterministic validation for reply-parts grounding output.
 *
 * Responsibilities:
 * - Validate support-slot references on grounded parts.
 * - Enforce knowledge-turn grounding or explicit uncertainty.
 * - Enforce self-query ownership constraints for grounded parts.
 *
 * Boundaries:
 * - Owns: reply-parts validation policy.
 * - Does not own: retrieval, model prompting, or final turn orchestration.
 *
 * Public API:
 * - validateReplyPartsContract
 * - buildReplyPartsValidationRepairReason
 *
 * Side Effects:
 * - none
 */

import type { SupportSlotEntry, ReplyPart } from './reply-parts';

type ReplyPartsValidationIssueCode =
  | 'knowledge_part_requires_support'
  | 'invalid_support_slot'
  | 'non_knowledge_part_has_support'
  | 'self_query_ownership'
  | 'knowledge_turn_requires_knowledge_or_uncertain';

interface ReplyPartsValidationIssue {
  partIndex: number;
  code: ReplyPartsValidationIssueCode;
  message: string;
  text?: string;
  support?: string[];
}

interface ReplyPartsValidationCheck {
  partIndex: number;
  kind: ReplyPart['kind'];
  text: string;
  valid: boolean;
  support: string[];
  matchedSlots: string[];
  issueCodes: ReplyPartsValidationIssueCode[];
}

export interface ReplyPartsValidationResult {
  valid: boolean;
  issues: ReplyPartsValidationIssue[];
  partChecks: ReplyPartsValidationCheck[];
  summary: {
    totalGroundedParts: number;
    validGroundedParts: number;
    invalidGroundedParts: number;
    invalidSupportRefs: number;
    ownershipViolations: number;
    decision: 'accept' | 'repair';
    contract: 'reply_parts';
  };
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

function isKnowledgeSeekingQueryType(queryType: string): boolean {
  return queryType === 'self_query'
    || queryType === 'other_query'
    || queryType === 'world_query'
    || queryType === 'mixed_query';
}

function isKnowledgeReplyPartKind(kind: ReplyPart['kind'] | undefined): boolean {
  return kind === 'grounded' || kind === 'inferred' || kind === 'rumor';
}

export function validateReplyPartsContract(input: {
  parts?: unknown;
  supportSlots?: unknown;
  queryType?: unknown;
  intent?: unknown;
}): ReplyPartsValidationResult {
  const parts = Array.isArray(input.parts) ? input.parts as ReplyPart[] : [];
  const supportSlots = Array.isArray(input.supportSlots)
    ? input.supportSlots.filter((entry): entry is SupportSlotEntry => typeof entry?.slotId === 'string' && typeof entry?.sourceId === 'string')
    : [];
  const supportBySlot = new Map(supportSlots.map((slot) => [slot.slotId, slot]));
  const normalizedQueryType = normalizeOptionalString(input.queryType) ?? 'conversation';
  const normalizedIntent = normalizeOptionalString(input.intent) ?? 'conversation';

  const issues: ReplyPartsValidationIssue[] = [];
  const partChecks: ReplyPartsValidationCheck[] = [];
  let totalKnowledgeParts = 0;

  parts.forEach((part, partIndex) => {
    const support = normalizeStringArray(part?.support);
    const issueCodes: ReplyPartsValidationIssueCode[] = [];
    const matchedSlots: string[] = [];
    const text = normalizeOptionalString(part?.text) ?? '';
    const kind = part?.kind;

    if (isKnowledgeReplyPartKind(kind)) {
      totalKnowledgeParts += 1;
      if (support.length === 0) {
        issueCodes.push('knowledge_part_requires_support');
        issues.push({
          partIndex,
          code: 'knowledge_part_requires_support',
          message: 'Knowledge-bearing reply part must include at least one support slot.',
          text,
        });
      }

      for (const slotId of support) {
        const slot = supportBySlot.get(slotId);
        if (!slot) {
          issueCodes.push('invalid_support_slot');
          issues.push({
            partIndex,
            code: 'invalid_support_slot',
            message: `Grounded reply part references unknown support slot: ${slotId}`,
            text,
            support: [slotId],
          });
          continue;
        }
        matchedSlots.push(slotId);
      }

      if (normalizedQueryType === 'self_query') {
        const hasOnlySelfOwnedSlots = matchedSlots.length > 0
          && matchedSlots.every((slotId) => {
            const slot = supportBySlot.get(slotId);
            return slot?.ownerType === 'npc' || slot?.ownerType === 'beat';
          });
        if (!hasOnlySelfOwnedSlots) {
          issueCodes.push('self_query_ownership');
          issues.push({
            partIndex,
            code: 'self_query_ownership',
            message: 'Self-query grounded part must use only self-owned support.',
            text,
            support,
          });
        }
      }
    } else if (support.length > 0) {
      issueCodes.push('non_knowledge_part_has_support');
      issues.push({
        partIndex,
        code: 'non_knowledge_part_has_support',
        message: 'Only knowledge-bearing reply parts may include support slots.',
        text,
        support,
      });
    }

    partChecks.push({
      partIndex,
      kind: kind === 'grounded' || kind === 'inferred' || kind === 'rumor' || kind === 'social' || kind === 'uncertain' || kind === 'close'
        ? kind
        : 'social',
      text,
      valid: issueCodes.length === 0,
      support,
      matchedSlots,
      issueCodes,
    });
  });

  const hasUncertainPart = parts.some((part) => part?.kind === 'uncertain');
  const validKnowledgeParts = partChecks.filter((entry) => isKnowledgeReplyPartKind(entry.kind) && entry.valid).length;
  const validGroundedParts = validKnowledgeParts;
  if (
    isKnowledgeSeekingQueryType(normalizedQueryType)
    && normalizedIntent !== 'uncertain'
    && validKnowledgeParts === 0
    && !hasUncertainPart
  ) {
    issues.push({
      partIndex: -1,
      code: 'knowledge_turn_requires_knowledge_or_uncertain',
      message: 'Knowledge turn must contain a supported knowledge part or explicit uncertainty.',
    });
  }

  const invalidSupportRefs = issues.filter((issue) => issue.code === 'invalid_support_slot' || issue.code === 'knowledge_part_requires_support').length;
  const ownershipViolations = issues.filter((issue) => issue.code === 'self_query_ownership').length;
  const invalidGroundedParts = Math.max(
    totalKnowledgeParts - validGroundedParts,
    issues.some((issue) => issue.code === 'knowledge_turn_requires_knowledge_or_uncertain') ? 1 : 0,
  );

  return {
    valid: issues.length === 0,
    issues,
    partChecks,
    summary: {
      totalGroundedParts: totalKnowledgeParts,
      validGroundedParts,
      invalidGroundedParts,
      invalidSupportRefs,
      ownershipViolations,
      decision: issues.length === 0 ? 'accept' : 'repair',
      contract: 'reply_parts',
    },
  };
}

export function buildReplyPartsValidationRepairReason(result: ReplyPartsValidationResult): string {
  if (result.valid) return 'reply-parts validation passed';

  const issueTexts = result.issues
    .slice(0, 4)
    .map((issue) => issue.text
      ? `${issue.code}: "${issue.text}"`
      : issue.code);
  return `reply-parts validation failed (${issueTexts.join('; ')})`;
}
