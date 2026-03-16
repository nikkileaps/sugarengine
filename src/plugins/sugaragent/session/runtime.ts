/**
 * @file session/runtime.ts
 * @description SugarAgent preview-session runtime for Vite middleware.
 * @publicSurface createSugarAgentSession
 * @privateDetails Local llama invocation, prompt construction, lore retrieval, and persisted preview session state.
 * @see ../../docs/api/plugins/sugaragent/17-sugaragent-session-runtime.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import {
  loadLoreArtifacts,
} from '../lore/lore-lib';
import {
  embedTexts as embedTextsWithLocalRuntime,
  LOCAL_EMBEDDING_MODEL_ID,
} from '../runtime/local-embedding-runtime';
import {
  DEFAULT_MODEL_PROFILE,
  getModelProfile,
} from '../runtime/model-profiles';
import {
  collectLoreEntityRouteMatches,
  isKnowledgeSeekingQueryType,
  refineRouteWithLoreEntityMentions,
  routeIntentToQueryType,
  routeTurnIntentFromInterpretation,
  routeIntentUsesLore,
  routeTurnIntent,
} from './core/routing';
import {
  applyTurnToSession,
  buildRecentReferentPreview,
  buildTurnTopicCoverageContext,
  countPlayerTurns,
  getSessionFactsForNpc,
  getSessionReferentsForNpc,
  getSessionTopicCoverageForNpc,
  loadSessionState,
  MAX_HISTORY_ENTRIES,
} from './core/session-state';
import {
  buildGroundingEvidenceEntries,
} from './core/grounding/evidence';
import {
  REPLY_PARTS_JSON_SCHEMA,
  buildReplyPartsPrompt,
  buildReplyPartsRepairPrompt,
  buildSupportSlotsFromGroundingEvidence,
  filterSupportSlotsForQueryType,
  materializeTurnOutputFromReplyParts,
  normalizeReplyPartsForValidation,
  parseReplyPartsResponseDetailed,
  type ParsedReplyPartsTurn,
  type ReplyPart,
  type ReplyPartKind,
} from './core/grounding/reply-parts';
import {
  GROUNDED_REPLY_AUDIT_JSON_SCHEMA,
  parseGroundedReplyAuditDetailed,
} from './core/grounding/reply-audit';
import {
  buildReplyPartsValidationRepairReason,
  validateReplyPartsContract,
} from './core/grounding/reply-parts-validator';
import {
  createGroundedUncertaintyReply,
} from './core/turn-realization';
import {
  localizeGroundedReplyExemplar,
  localizeSimpleSocialReply,
} from './core/language-stock';
import {
  runEvidenceFirstPipeline,
  buildNpcStateSnapshot,
  enrichEvidencePackWithEpistemics,
  hasDirectAnswerableStateEvidence,
  isEvidenceItemRelevantForTurn,
} from './core/evidence-first-pipeline';
import {
  buildSugarlangLanguageAdaptationContext,
  estimateTextLanguage,
  normalizeLanguageCode,
  resolveLanguageAdaptationContext,
} from './core/language-adaptation';
import {
  buildEvidencePreview,
  enhanceInterpretationWithFacetSimilarity,
} from './core/query-interpretation';
import {
  runGovernedLoreRetrieval,
} from './core/retrieval-pipeline';
import {
  buildEvidencePack,
  resolveConversationMode,
} from './core/retrieval-governance';
import {
  resolveInitiativePolicy,
} from './core/initiative';
import {
  hasLikelyQuestionForm,
} from './core/routing';
import {
  computeNoveltyState,
} from './core/turn-planning';
import {
  extractNpcCommitments,
  filterMemoryWrites,
} from './core/memory-provenance';
import {
  extractDeclaredIdentityName,
  isLikelyGreetingOnlyMessage,
  validateTurnQuality,
} from './core/turn-quality';
import {
  detectSocialAcknowledgement,
  isLikelyLightweightLocationPrompt,
} from './core/social-cues';
import {
  checkSocialResponseForFactualLeakage,
} from './core/turn-path-routing';
import type { SugarAgentTurnOutput } from '../contracts/turn';
import type { QueryType, RoutingResult } from './core/routing';
import type {
  EvidenceFirstPipelineDiagnostics,
  LanguageAdaptationContext,
  QueryInterpretation,
  ReferentPreviewCandidate,
} from './core/turn-contracts';
import type { PluginPedagogyContext } from '../../../engine/plugins/types';

type RecordLike = Record<string, any>;

function emitReplyLanguageDebugLog(input: {
  stage: string;
  turnContext: unknown;
  replyText: string;
  partKinds?: string[];
  npcId?: string;
  routeIntent?: string;
  queryType?: string;
  turnPath?: string;
}) {
  const pedagogyContext = getPedagogyContext(input.turnContext);
  const targetLanguage = normalizeLanguageCode(pedagogyContext?.targetLanguage);
  const supportLanguage = normalizeLanguageCode(pedagogyContext?.supportLanguage);
  if (!targetLanguage && !supportLanguage) return;

  const learnerBand = normalizeOptionalString(pedagogyContext?.learnerBand);
  const supportPolicy = normalizeOptionalString(pedagogyContext?.supportLanguagePolicy);
  const estimate = estimateTextLanguage(input.replyText, targetLanguage);

  console.debug('[sugaragent][language]', {
    stage: input.stage,
    npcId: input.npcId,
    routeIntent: input.routeIntent,
    queryType: input.queryType,
    turnPath: input.turnPath,
    targetLanguage,
    supportLanguage,
    learnerBand,
    supportPolicy,
    estimatedLanguage: estimate.estimatedLanguage,
    mismatchSuspected: estimate.mismatchSuspected,
    scoreByLanguage: estimate.scoreByLanguage,
    partKinds: input.partKinds ?? [],
    preview: sanitizePromptText(input.replyText).slice(0, 200),
  });
}

function emitPlanRealizationStatusLog(input: {
  stage: string;
  turnContext: unknown;
  npcId?: string;
  routeIntent?: string;
  queryType?: string;
  turnPath?: string;
  strategy?: string;
  attempt?: number;
  failureReason?: string;
  rawPreview?: string;
  estimatedLanguage?: string;
  mismatchSuspected?: boolean;
  allowedClaimOrdinals?: number[];
  acceptedClaimOrdinals?: number[];
  allowedSupportSlots?: string[];
  validationMode?: string;
  auditRawPreview?: string;
}) {
  const pedagogyContext = getPedagogyContext(input.turnContext);
  const targetLanguage = normalizeLanguageCode(pedagogyContext?.targetLanguage);
  const supportLanguage = normalizeLanguageCode(pedagogyContext?.supportLanguage);
  if (!targetLanguage && !supportLanguage) return;

  console.debug('[sugaragent][realization]', {
    stage: input.stage,
    npcId: input.npcId,
    routeIntent: input.routeIntent,
    queryType: input.queryType,
    turnPath: input.turnPath,
    strategy: input.strategy,
    attempt: input.attempt,
    targetLanguage,
    supportLanguage,
    learnerBand: normalizeOptionalString(pedagogyContext?.learnerBand),
    supportPolicy: normalizeOptionalString(pedagogyContext?.supportLanguagePolicy),
    estimatedLanguage: input.estimatedLanguage,
    mismatchSuspected: input.mismatchSuspected,
    validationMode: input.validationMode,
    allowedClaimOrdinals: input.allowedClaimOrdinals,
    acceptedClaimOrdinals: input.acceptedClaimOrdinals,
    allowedSupportSlots: input.allowedSupportSlots,
    failureReason: input.failureReason,
    rawPreview: input.rawPreview ? sanitizePromptText(input.rawPreview).slice(0, 240) : undefined,
    auditRawPreview: input.auditRawPreview ? sanitizePromptText(input.auditRawPreview).slice(0, 240) : undefined,
  });
}

interface SessionRuntime {
  name: 'mock' | 'llama';
  health(): Promise<{ ok: boolean; detail?: string }>;
  loadModel(modelName?: string): Promise<void>;
  generateJson(request: any): Promise<{ jsonText: string; rawText?: string }>;
  generateStructured(input: any): Promise<{ jsonText: string; rawText?: string }>;
  embed(texts: string[]): Promise<number[][]>;
}

interface GenerationDiagnostics {
  draft: {
    attempted: boolean;
    success: boolean;
    failureReason?: string;
    skippedReason?: string;
  };
  replyParts: {
    attempted: boolean;
    success: boolean;
    attemptCount: number;
    repairAttempted: boolean;
    partCount: number;
    groundedPartCount: number;
    failureReason?: string;
    skippedReason?: string;
    rawResponsePreview?: string;
    rawPartsPreview?: Array<Record<string, unknown>>;
    auditAttempted?: boolean;
    auditSuccess?: boolean;
    auditFailureReason?: string;
    auditRawResponsePreview?: string;
    auditPartsPreview?: Array<Record<string, unknown>>;
    allowedSupportSlots?: string[];
    allowedClaimOrdinals?: number[];
    acceptedClaimOrdinals?: number[];
    verificationMode?: 'generator_auditor';
    estimatedLanguage?: string;
    mismatchSuspected?: boolean;
  };
}

interface ValidatedPlanClaimSlot {
  claimOrdinal: number;
  claimId: string;
  mode: 'grounded' | 'inferred' | 'rumor';
  text: string;
  supportSlotIds: string[];
}

interface SessionOptions {
  npc: string;
  provider: 'local' | 'echo';
  runtime: 'llama' | 'mock' | 'auto';
  session: string | null;
  loreDir: string;
  useLore: boolean;
  missingGameLoreBundle: boolean;
  llamaBin: string | null;
  modelPath: string | null;
  llamaTimeoutMs: number;
  llamaBinArgs: string[];
  llamaArgs: string[];
  turnContext: RecordLike | null;
  requireLoreScopeForRetrieval: boolean;
}

const execFileAsync = promisify(execFile);
const BUNDLE_ROOT = path.resolve('src/plugins/sugaragent/runtime/bundle');
const BUNDLE_LOCK_PATH = path.join(BUNDLE_ROOT, 'bundle.lock.json');
const DEFAULT_BUNDLED_LLAMA_BIN = path.resolve('src/plugins/sugaragent/runtime/bundle/bin/llama-completion');
const LEGACY_BUNDLED_MODEL_PATH = path.join(BUNDLE_ROOT, 'models', 'qwen2.5-0.5b-instruct-q2_k.gguf');

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const items: string[] = [];
  for (const entry of value) {
    const normalized = normalizeOptionalString(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    items.push(normalized);
  }
  return items;
}

function dedupeMergeStringArrays(...sources: unknown[]): string[] {
  return normalizeStringArray(sources.flatMap((entry) => (Array.isArray(entry) ? entry : [])));
}

function sanitizePromptText(text: unknown): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function resolveBundledModelPath() {
  if (fs.existsSync(BUNDLE_LOCK_PATH)) {
    try {
      const raw = fs.readFileSync(BUNDLE_LOCK_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      const lockedPath = normalizeOptionalString(parsed?.model?.modelPath);
      if (lockedPath) {
        const resolved = path.resolve(lockedPath);
        if (fs.existsSync(resolved)) {
          return resolved;
        }
      }
    } catch {
      // ignore malformed lock file and continue
    }
  }

  const profile = getModelProfile(DEFAULT_MODEL_PROFILE);
  const profileModel = normalizeOptionalString(profile?.modelFileName);
  const profileFallback = normalizeOptionalString(profile?.fallbackModelFileName);
  const profileCandidates = [profileModel, profileFallback]
    .filter(Boolean)
    .map((fileName) => path.join(BUNDLE_ROOT, 'models', fileName));

  for (const candidate of profileCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  if (fs.existsSync(LEGACY_BUNDLED_MODEL_PATH)) return LEGACY_BUNDLED_MODEL_PATH;
  return null;
}

function resolveBundledLlamaBin() {
  if (fs.existsSync(BUNDLE_LOCK_PATH)) {
    try {
      const raw = fs.readFileSync(BUNDLE_LOCK_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      const lockedPath = normalizeOptionalString(parsed?.runtime?.binaryPath);
      if (lockedPath) {
        const resolved = path.resolve(lockedPath);
        if (fs.existsSync(resolved)) {
          return resolved;
        }
      }
    } catch {
      // ignore malformed lock file and continue
    }
  }
  if (fs.existsSync(DEFAULT_BUNDLED_LLAMA_BIN)) return DEFAULT_BUNDLED_LLAMA_BIN;
  return null;
}

function commandExists(command: string | null | undefined): boolean {
  if (!command) return false;
  if (command.includes('/') || command.startsWith('.')) {
    return fs.existsSync(command);
  }
  const lookup = spawnSync('which', [command], { encoding: 'utf8' });
  return lookup.status === 0;
}

function sanitizeRuntimeOutput(text: unknown): string {
  const source = String(text ?? '');
  const withoutAnsi = source
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001B\][^\u0007]*(\u0007|\u001B\\)/g, '');
  return withoutAnsi.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function buildTurnReferentCandidates(input: {
  playerMessage: string;
  targetLanguage?: string;
  npcName?: string;
  activeTopic?: string | null;
  sceneRegionName?: string;
  sceneRegionPath?: string;
  loreEntityHints?: Array<{
    entityId: string;
    entityType: 'world' | 'character' | 'faction' | 'unknown';
    matchedText: string;
  }>;
  interpretation?: QueryInterpretation;
}): ReferentPreviewCandidate[] {
  const candidates: ReferentPreviewCandidate[] = [];
  const activeTopic = normalizeOptionalString(input.activeTopic);
  const npcName = normalizeOptionalString(input.npcName)?.toLowerCase();
  const explicitNpcMention = npcName ? input.playerMessage.toLowerCase().includes(npcName) : false;

  for (const referent of input.interpretation?.referents ?? []) {
    if (referent.kind === 'npc' && !explicitNpcMention) continue;
    candidates.push({
      kind: referent.kind,
      text: referent.text,
      id: referent.id,
      confidence: referent.confidence,
      topic: activeTopic ?? referent.text,
      sourceRole: 'player',
    });
  }

  for (const hint of input.loreEntityHints ?? []) {
    if (hint.entityType === 'unknown') continue;
    candidates.push({
      kind: hint.entityType === 'world'
        ? 'location'
        : hint.entityType === 'faction'
          ? 'faction'
          : 'entity',
      text: hint.matchedText,
      id: hint.entityId,
      confidence: 0.72,
      topic: activeTopic ?? hint.matchedText,
      sourceRole: 'lore',
    });
  }

  if (activeTopic) {
    candidates.push({
      kind: 'topic',
      text: activeTopic,
      id: activeTopic,
      confidence: 0.56,
      topic: activeTopic,
      sourceRole: 'memory',
    });
  }

  if (isLikelyLightweightLocationPrompt(input.playerMessage, input.targetLanguage)) {
    const sceneLocation = normalizeOptionalString(input.sceneRegionName) ?? normalizeOptionalString(input.sceneRegionPath);
    if (sceneLocation) {
      candidates.push({
        kind: 'location',
        text: sceneLocation,
        id: sceneLocation,
        confidence: 0.68,
        topic: sceneLocation,
        sourceRole: 'scene',
      });
    }
  }

  const deduped = new Map<string, ReferentPreviewCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.id ?? candidate.text}`.toLowerCase();
    const existing = deduped.get(key);
    if (!existing || (candidate.confidence ?? 0) > (existing.confidence ?? 0)) {
      deduped.set(key, candidate);
    }
  }

  return [...deduped.values()].slice(0, 8);
}

function computeEvidenceBackedRetrievalConfidence(input: RecordLike | null | undefined): number {
  const queryType = input?.queryType;
  const routeIntent = input?.routeIntent;
  const retrievalMatches = Array.isArray(input?.retrievalMatches) ? input.retrievalMatches : [];
  const evidenceItems = Array.isArray(input?.evidenceItems) ? input.evidenceItems : [];

  if (retrievalMatches.length > 0) return 0.7;

  const npcEvidenceCount = evidenceItems.filter((item) => item?.ownerType === 'npc' || item?.ownerType === 'beat').length;
  if ((queryType === 'self_query' || routeIntent === 'identity_self') && npcEvidenceCount > 0) {
    return 0.76;
  }
  if (evidenceItems.length > 0) return 0.42;
  return 0.1;
}

function parseReplyPartsTurnFromText(text: unknown) {
  if (typeof text !== 'string' || text.trim().length === 0) return null;
  return parseReplyPartsResponseDetailed(text).turn;
}

function buildValidatedPlanSupportSlots(input: RecordLike | null | undefined) {
  const plan = isRecord(input?.plan) ? input.plan : {};
  const claims = Array.isArray(plan.claims) ? plan.claims : [];
  const evidenceIdToItem = input?.evidencePack?.evidenceIdToItem instanceof Map
    ? input.evidencePack.evidenceIdToItem
    : new Map();
  const allowedSourceIds = new Set();
  for (const claim of claims) {
    if (!isRecord(claim) || !Array.isArray(claim.evidenceIds)) continue;
    for (const evidenceId of claim.evidenceIds) {
      const item = evidenceIdToItem.get(evidenceId);
      const sourceId = normalizeOptionalString(item?.sourceId);
      if (sourceId) allowedSourceIds.add(sourceId);
    }
  }
  if (allowedSourceIds.size === 0) return [];

  const evidenceEntries = Array.isArray(input?.evidenceEntries) ? input.evidenceEntries : [];
  const filteredEvidenceEntries = evidenceEntries.filter((entry) => allowedSourceIds.has(entry.sourceId));
  return filterSupportSlotsForQueryType({
    supportSlots: buildSupportSlotsFromGroundingEvidence({
      evidenceEntries: filteredEvidenceEntries,
      selfEntityId: input?.selfEntityId,
      npcId: input?.npcId,
      maxSlots: 6,
    }),
    queryType: input?.queryType,
  });
}

function buildValidatedPlanClaimMetadata(input: RecordLike | null | undefined) {
  const plan = isRecord(input?.plan) ? input.plan : {};
  const claims = Array.isArray(plan.claims) ? plan.claims : [];
  const evidenceIdToItem = input?.evidencePack?.evidenceIdToItem instanceof Map
    ? input.evidencePack.evidenceIdToItem
    : new Map();
  const supportSlots = Array.isArray(input?.supportSlots) ? input.supportSlots : [];
  const slotIdsBySourceId = new Map<string, string[]>();
  for (const slot of supportSlots) {
    const sourceId = normalizeOptionalString(slot?.sourceId);
    const slotId = normalizeOptionalString(slot?.slotId);
    if (!sourceId || !slotId) continue;
    const existing = slotIdsBySourceId.get(sourceId) ?? [];
    if (!existing.includes(slotId)) existing.push(slotId);
    slotIdsBySourceId.set(sourceId, existing);
  }

  const planClaims = claims
    .map((claim, index) => {
      const claimId = normalizeOptionalString(claim?.claimId);
      const mode = normalizeOptionalString(claim?.mode);
      if (!claimId || (mode !== 'grounded' && mode !== 'inferred' && mode !== 'rumor')) {
        return null;
      }
      const supportSlotIds = Array.isArray(claim?.evidenceIds)
        ? Array.from(new Set(
          claim.evidenceIds.flatMap((evidenceId: unknown) => {
            const evidence = evidenceIdToItem.get(evidenceId);
            const sourceId = normalizeOptionalString(evidence?.sourceId);
            if (!sourceId) return [];
            return slotIdsBySourceId.get(sourceId) ?? [];
          }),
        ))
        : [];
      return {
        claimOrdinal: index + 1,
        claimId,
        mode,
        text: sanitizePromptText(claim?.text ?? ''),
        supportSlotIds,
      };
    })
    .filter((entry): entry is ValidatedPlanClaimSlot => entry !== null);

  const claimsByOrdinal = new Map(
    planClaims.map((claim) => [claim.claimOrdinal, claim] as const),
  );

  return {
    planClaims,
    allowedClaimOrdinals: planClaims.map((claim) => claim.claimOrdinal),
    claimsByOrdinal,
  };
}

function buildValidatedPlanInstructionLines(input: RecordLike | null | undefined): string[] {
  const safeInput = isRecord(input) ? input : {};
  const plan = isRecord(safeInput.plan) ? safeInput.plan : {};
  const targetLanguage = normalizeLanguageCode(getPedagogyContext(safeInput.turnContext)?.targetLanguage);
  const claims = Array.isArray(safeInput.planClaims)
    ? safeInput.planClaims
    : Array.isArray(plan.claims)
      ? plan.claims
      : [];
  const lines = [
    'Validated plan:',
    `- Speech act: ${sanitizePromptText(plan.speechAct || 'chat')}`,
    `- Route intent: ${sanitizePromptText(plan.routeIntent || safeInput.routeIntent || 'unknown')}`,
  ];

  if (claims.length === 0) {
    lines.push('- No factual claims are allowed in this reply.');
  } else {
    lines.push(
      targetLanguage !== 'default' && targetLanguage !== 'en'
        ? '- Source meaning notes (not canonical surface wording):'
        : '- Allowed factual claims:',
    );
    claims.slice(0, 6).forEach((claim, index) => {
      const mode = sanitizePromptText(claim?.mode || 'grounded');
      const text = sanitizePromptText(claim?.text || '');
      lines.push(`  ${index + 1}. [kind=${mode}] ${text}`);
    });
  }

  lines.push('Use only the factual content listed above. Do not add new facts outside that list.');
  lines.push(
    targetLanguage !== 'default' && targetLanguage !== 'en'
      ? 'Translate the factual relationship into the target language instead of mirroring the source wording.'
      : 'You may paraphrase the allowed claims, but you must not mention internal numbering.',
  );
  lines.push('Only include the claims that are actually relevant to the player message. You do not need to cover every allowed claim.');
  lines.push('Preserve certainty level exactly:');
  lines.push('- grounded claims must stay grounded');
  lines.push('- inferred claims must keep a soft hedge such as "I think" or "it seems"');
  lines.push('- rumor claims must keep a strong hedge such as "I heard" or "people say"');
  lines.push('If the validated plan is uncertain, return an uncertain part instead of guessing.');
  return lines;
}

function buildPlanBoundReplyPartsPrompt(input: RecordLike | null | undefined): string {
  const safeInput = isRecord(input) ? input : {};
  const turnContext = isRecord(safeInput.turnContext) ? safeInput.turnContext : null;

  return [
    ...buildLanguageInstructionLines(turnContext),
    buildPedagogyBlock(turnContext),
    ...buildGroundedTargetLanguageAnchorLines({
      turnContext,
      planClaims: Array.isArray(safeInput.planClaims) ? safeInput.planClaims : [],
    }),
    `Return a short NPC reply for ${sanitizePromptText(safeInput.npcName || 'NPC')} as ordered reply parts.`,
    'Return ONLY one JSON object. No markdown. No explanation.',
    'Use 1 to 3 parts total.',
    'Allowed part kinds: social, grounded, inferred, rumor, uncertain, close.',
    'For grounded turns, use social parts only for brief framing. Put factual content in grounded, inferred, or rumor parts.',
    'Do not include support ids, claim ids, evidence ids, or any internal bookkeeping in the JSON.',
    'Do not mention internal numbering in the visible text.',
    'Answer only what is relevant to the player message. Do not volunteer extra lore just because it is available.',
    `Query type: ${sanitizePromptText(safeInput.queryType || 'conversation')}`,
    `Route intent: ${sanitizePromptText(safeInput.routeIntent || 'unknown')}`,
    `Player message: ${sanitizePromptText(safeInput.playerMessage || '(none)')}`,
    buildValidatedPlanInstructionLines(safeInput).join('\n'),
  ].filter(Boolean).join('\n');
}

function buildPlanBoundReplyPartsRepairPrompt(input: RecordLike | null | undefined): string {
  const safeInput = isRecord(input) ? input : {};
  const turnContext = isRecord(safeInput.turnContext) ? safeInput.turnContext : null;
  return [
    ...buildLanguageInstructionLines(turnContext),
    buildPedagogyBlock(turnContext),
    ...buildGroundedTargetLanguageAnchorLines({
      turnContext,
      planClaims: Array.isArray(safeInput.planClaims) ? safeInput.planClaims : [],
    }),
    `Previous grounded realization failed: ${sanitizePromptText(safeInput.failureReason || 'invalid previous response')}.`,
    'Retry now with strict JSON only.',
    'Do not include support ids, claim ids, evidence ids, or any internal bookkeeping.',
    'Keep the reply natural and conversational, but use only the allowed factual content.',
    'If the factual content is not answerable without adding a new fact, return an uncertain part.',
    buildValidatedPlanInstructionLines(safeInput).join('\n'),
  ].filter(Boolean).join('\n');
}

function buildGroundedReplyAuditPrompt(input: {
  turnContext?: unknown;
  playerMessage?: unknown;
  queryType?: unknown;
  routeIntent?: unknown;
  generatedTurn: ParsedReplyPartsTurn;
  planClaims: ValidatedPlanClaimSlot[];
}): string {
  const safeInput = isRecord(input) ? input : {};
  const turnContext = safeInput.turnContext;
  const generatedTurn = safeInput.generatedTurn;
  const planClaims = Array.isArray(safeInput.planClaims) ? safeInput.planClaims : [];
  const candidateParts = Array.isArray(generatedTurn.parts) ? generatedTurn.parts : [];
  const expectedIndexes = candidateParts.map((_, index) => index);

  const claimLines = planClaims.length === 0
    ? ['- No factual claims are allowed in this reply.']
    : planClaims.map((claim) => `- Claim ${claim.claimOrdinal} [kind=${claim.mode}]: ${claim.text}`);

  const candidateReply = JSON.stringify({
    parts: generatedTurn.parts.map((part) => ({
      kind: part.kind,
      text: part.text,
    })),
    emotion: generatedTurn.emotion,
    intent: generatedTurn.intent,
  });

  const examplePartAudits = candidateParts.map((part, index) => {
    const kind = normalizeOptionalString(part?.kind);
    if (kind === 'social' || kind === 'close' || kind === 'uncertain') {
      return {
        partIndex: index,
        role: kind,
        claimOrdinals: [],
        hedgeSufficient: true,
        notes: `${kind} part`,
      };
    }
    return {
      partIndex: index,
      role: 'knowledge',
      claimOrdinals: planClaims.length > 0 ? [1] : [],
      hedgeSufficient: true,
      notes: 'states only the supported claim(s) in this part',
    };
  });
  const exampleOutput = JSON.stringify({
    partAudits: examplePartAudits,
    unsupportedFacts: [],
  });

  return [
    'You are auditing an NPC reply for supported factual coverage.',
    'Return ONLY one JSON object. No markdown. No explanation.',
    'Your job is classification, not rewriting.',
    'For each reply part, choose exactly one role: social, knowledge, uncertain, close, unsupported.',
    'Role meanings:',
    '- social = brief greeting, acknowledgement, or small-talk with no factual claim',
    '- knowledge = a factual statement that expresses one or more allowed claims',
    '- uncertain = an explicit statement of not knowing or being unsure',
    '- close = a conversational sign-off or wrap-up such as goodbye or "that is all", with no factual claim',
    '- unsupported = factual content that is outside the allowed claim table',
    'Important: close means closing the conversation. It does NOT mean "close enough" or "approximately related."',
    `The candidate reply has exactly ${candidateParts.length} parts.`,
    `You must return exactly ${candidateParts.length} partAudits, one for each partIndex in [${expectedIndexes.join(', ')}].`,
    'Do not invent extra part indexes. Do not omit any candidate part index.',
    'Use role=knowledge only when the part clearly states one or more allowed claims from the claim table.',
    'claimOrdinals must contain only the claim numbers actually stated by that part.',
    'If a part adds any factual content outside the allowed claim table, mark that part unsupported and leave claimOrdinals empty.',
    'Set hedgeSufficient=true only when the part preserves the required certainty for every matched claim.',
    'For grounded claims, hedgeSufficient should be true unless the part sounds weaker than the claim.',
    'For social, uncertain, close, or unsupported parts, claimOrdinals must be empty.',
    'Role constraints by generated part kind:',
    '- generated kind grounded/inferred/rumor -> audit role must be knowledge or unsupported',
    '- generated kind social -> audit role must be social or unsupported',
    '- generated kind uncertain -> audit role must be uncertain or unsupported',
    '- generated kind close -> audit role must be close or unsupported',
    'The allowed claim table may be written as source-language meaning notes, while the candidate reply may be written in the target language.',
    'Judge semantic meaning, not surface wording. A correct Spanish, French, German, Italian, or Portuguese rendering of an allowed English claim still counts as that claim.',
    'Do not downgrade a factual translated answer to close, social, or unsupported just because it is not in the same language as the claim table.',
    'Proper names may remain unchanged across languages. Translated surrounding grammar still matches the same claim.',
    'A generated grounded/inferred/rumor part that clearly expresses an allowed claim in another language should almost always audit as knowledge.',
    'Do not copy a generic example. Use only the actual candidate reply parts shown below.',
    `Query type: ${sanitizePromptText(input.queryType || 'conversation')}`,
    `Route intent: ${sanitizePromptText(input.routeIntent || 'unknown')}`,
    `Player message: ${sanitizePromptText(input.playerMessage || '(none)')}`,
    'Allowed claims:',
    ...claimLines,
    'Candidate reply JSON:',
    candidateReply,
    'Cross-language example:',
    '{"allowedClaim":"Earendale is a small town on a floating chunk of land.","candidatePart":{"kind":"grounded","text":"Earendale es un pueblo pequeno en un pedazo de tierra flotante."},"correctAudit":{"partIndex":0,"role":"knowledge","claimOrdinals":[1],"hedgeSufficient":true,"notes":"same claim in Spanish"}}',
    'Output shape:',
    exampleOutput,
  ].join('\n');
}

function materializeAuditedGroundedTurn(input: {
  generatedTurn: ParsedReplyPartsTurn;
  planClaims: ValidatedPlanClaimSlot[];
  unsupportedFacts?: string[];
  partAudits?: Array<{
    partIndex: number;
    role: 'social' | 'knowledge' | 'uncertain' | 'close' | 'unsupported';
    claimOrdinals: number[];
    hedgeSufficient?: boolean;
    notes?: string;
  }>;
}) {
  const generatedTurn = input.generatedTurn;
  const partAudits = Array.isArray(input.partAudits) ? input.partAudits : [];
  const normalizedPartAudits = partAudits
    .filter((entry) => Number.isFinite(entry?.partIndex))
    .filter((entry) => entry.partIndex >= 0 && entry.partIndex < generatedTurn.parts.length)
    .sort((left, right) => left.partIndex - right.partIndex);
  const auditByIndex = new Map<number, typeof normalizedPartAudits[number]>();
  for (const entry of normalizedPartAudits) {
    if (!auditByIndex.has(entry.partIndex)) {
      auditByIndex.set(entry.partIndex, entry);
    }
  }
  const claimsByOrdinal = new Map(input.planClaims.map((claim) => [claim.claimOrdinal, claim] as const));
  const unsupportedFacts = normalizeStringArray(input.unsupportedFacts);
  if (unsupportedFacts.length > 0) {
    return {
      failureReason: `audit_unsupported_facts:${unsupportedFacts.join(' | ')}`,
      auditedTurn: null,
      acceptedClaimOrdinals: [] as number[],
    };
  }
  if (auditByIndex.size !== generatedTurn.parts.length) {
    return {
      failureReason: `audit_part_count_mismatch:${auditByIndex.size}/${generatedTurn.parts.length}`,
      auditedTurn: null,
      acceptedClaimOrdinals: [] as number[],
    };
  }

  const acceptedClaimOrdinals = new Set<number>();
  const finalParts: ReplyPart[] = [];

  for (let index = 0; index < generatedTurn.parts.length; index += 1) {
    const part = generatedTurn.parts[index];
    const generatedKind = part?.kind;
    const generatedKnowledgeKind = generatedKind === 'grounded' || generatedKind === 'inferred' || generatedKind === 'rumor';
    const audit = auditByIndex.get(index);
    if (!audit) {
      return {
        failureReason: `audit_missing_part:${index}`,
        auditedTurn: null,
        acceptedClaimOrdinals: [] as number[],
      };
    }

    if (generatedKnowledgeKind && audit.role !== 'knowledge' && audit.role !== 'unsupported') {
      return {
        failureReason: `audit_invalid_role_transition:${index}:${generatedKind}->${audit.role}`,
        auditedTurn: null,
        acceptedClaimOrdinals: [] as number[],
      };
    }
    if (!generatedKnowledgeKind && generatedKind && audit.role !== generatedKind && audit.role !== 'unsupported') {
      return {
        failureReason: `audit_invalid_role_transition:${index}:${generatedKind}->${audit.role}`,
        auditedTurn: null,
        acceptedClaimOrdinals: [] as number[],
      };
    }

    if (audit.role === 'unsupported') {
      return {
        failureReason: `audit_unsupported_part:${index}`,
        auditedTurn: null,
        acceptedClaimOrdinals: [] as number[],
      };
    }

    if (audit.role === 'knowledge') {
      if (audit.claimOrdinals.length === 0) {
        return {
          failureReason: `audit_missing_claim_match:${index}`,
          auditedTurn: null,
          acceptedClaimOrdinals: [] as number[],
        };
      }
      const matchedClaims = audit.claimOrdinals
        .map((ordinal) => claimsByOrdinal.get(ordinal))
        .filter((claim): claim is ValidatedPlanClaimSlot => claim != null);
      if (matchedClaims.length !== audit.claimOrdinals.length) {
        return {
          failureReason: `audit_unknown_claim_ordinal:${index}`,
          auditedTurn: null,
          acceptedClaimOrdinals: [] as number[],
        };
      }
      const distinctModes = Array.from(new Set(matchedClaims.map((claim) => claim.mode)));
      if (distinctModes.length !== 1) {
        return {
          failureReason: `audit_mixed_claim_modes:${index}`,
          auditedTurn: null,
          acceptedClaimOrdinals: [] as number[],
        };
      }
      const resolvedKind = distinctModes[0] as ReplyPartKind;
      if (audit.hedgeSufficient === false || (resolvedKind !== 'grounded' && audit.hedgeSufficient !== true)) {
        return {
          failureReason: `audit_insufficient_hedge:${index}`,
          auditedTurn: null,
          acceptedClaimOrdinals: [] as number[],
        };
      }
      const support = Array.from(new Set(
        matchedClaims.flatMap((claim) => claim.supportSlotIds),
      ));
      if (support.length === 0) {
        return {
          failureReason: `audit_missing_support:${index}`,
          auditedTurn: null,
          acceptedClaimOrdinals: [] as number[],
        };
      }
      matchedClaims.forEach((claim) => acceptedClaimOrdinals.add(claim.claimOrdinal));
      finalParts.push({
        kind: resolvedKind,
        text: part.text,
        support,
      });
      continue;
    }

    if (audit.claimOrdinals.length > 0) {
      return {
        failureReason: `audit_nonknowledge_claim_match:${index}`,
        auditedTurn: null,
        acceptedClaimOrdinals: [] as number[],
      };
    }

    if (audit.role === 'social' || audit.role === 'uncertain' || audit.role === 'close') {
      finalParts.push({
        kind: audit.role,
        text: part.text,
      });
      continue;
    }

    return {
      failureReason: `audit_invalid_role:${index}`,
      auditedTurn: null,
      acceptedClaimOrdinals: [] as number[],
    };
  }

  return {
    failureReason: undefined,
    auditedTurn: {
      ...generatedTurn,
      parts: finalParts,
    },
    acceptedClaimOrdinals: [...acceptedClaimOrdinals].sort((left, right) => left - right),
  };
}

function buildSocialFastReplyPartsPrompt(input: RecordLike | null | undefined): string {
  const safeInput = isRecord(input) ? input : {};
  const npcName = safeInput.npcName;
  const playerMessage = safeInput.playerMessage;
  const turnContext = isRecord(safeInput.turnContext)
    ? {
      ...safeInput.turnContext,
      queryType: 'conversation',
      routingIntent: 'social_chat',
    }
    : {
      queryType: 'conversation',
      routingIntent: 'social_chat',
    };

  const blocks = [
    `You are ${sanitizePromptText(npcName || 'NPC')}, an NPC in a game.`,
    'This is a social fast-path turn. The player is not asking for grounded lore.',
    'Reply naturally and in character. Sound like a person in the world, not a generic assistant.',
    ...buildLanguageInstructionLines(turnContext),
    'Keep the visible reply concise: 1 to 2 short sentences.',
    'Prefer exactly one social part unless a second social part helps the flow.',
    'Do not use grounded parts.',
    'Do not use uncertain parts.',
    'Do not invent world facts, quest facts, location facts, or private player facts.',
    'Do not dump biography or backstory unless the player directly asks.',
    'If the player greets you, greet them naturally.',
    'If the player introduces themselves, acknowledge that naturally.',
    'Avoid generic filler like "Tell me more", "What can I help with?", or "Could you clarify?" unless it is truly necessary.',
    buildGlobalSafetyBlock(safeInput.globalSafetyBounds),
    buildNpcProfileBlock(safeInput.npcProfile),
    buildTurnContextBlock(turnContext),
    buildPedagogyBlock(turnContext),
    buildMemoryFactBlock(safeInput.memoryFacts),
    buildHistoryBlock(safeInput.history),
    buildReplyPartsPrompt({
      npcName,
      playerMessage,
      queryType: 'conversation',
      routeIntent: 'social_chat',
      supportSlots: [],
    }),
    'Style examples:',
    'Player: "hello"',
    'Assistant JSON: {"parts":[{"kind":"social","text":"Hi. I\'m the station keeper."}],"emotion":"warm","intent":"conversation","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}',
    'Player: "I\'m Mim."',
    'Assistant JSON: {"parts":[{"kind":"social","text":"Nice to meet you, Mim. I\'m the station keeper."}],"emotion":"warm","intent":"conversation","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}',
    'Player: "thanks"',
    'Assistant JSON: {"parts":[{"kind":"social","text":"You\'re welcome."}],"emotion":"warm","intent":"conversation","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}',
    'For this turn, every part must be kind "social" or "close".',
    `Current player message: ${sanitizePromptText(playerMessage)}`,
  ].filter(Boolean);

  return blocks.join('\n');
}

async function realizeValidatedPlanWithReplyPartsTransport(input: RecordLike | null | undefined) {
  const safeInput = isRecord(input) ? input : {};
  const {
    runtime,
    ensureModelLoaded,
    npcName,
    playerMessage,
    queryType,
    routeIntent,
    plan,
    evidencePack,
    evidenceEntries,
    selfEntityId,
    npcId,
    generationDiagnostics,
  } = safeInput;

  const planClaims = Array.isArray(plan?.claims) ? plan.claims : [];
  const speechAct = normalizeOptionalString(plan?.speechAct) ?? 'chat';
  if (planClaims.length === 0 && speechAct !== 'chat' && speechAct !== 'answer' && speechAct !== 'recall') {
    generationDiagnostics.replyParts.skippedReason = 'no-realization-needed';
    return null;
  }

  const allowedSupportSlots = buildValidatedPlanSupportSlots({
    plan,
    evidencePack,
    evidenceEntries,
    selfEntityId,
    npcId,
    queryType,
  });
  const claimMetadata = buildValidatedPlanClaimMetadata({
    plan,
    evidencePack,
    supportSlots: allowedSupportSlots,
  });

  await ensureModelLoaded();
  generationDiagnostics.draft.attempted = true;
  generationDiagnostics.replyParts.attempted = true;
  generationDiagnostics.replyParts.attemptCount = 0;
  generationDiagnostics.replyParts.repairAttempted = false;
  generationDiagnostics.replyParts.auditAttempted = false;
  generationDiagnostics.replyParts.auditSuccess = false;
  generationDiagnostics.replyParts.auditFailureReason = undefined;
  generationDiagnostics.replyParts.auditRawResponsePreview = undefined;
  generationDiagnostics.replyParts.auditPartsPreview = undefined;
  generationDiagnostics.replyParts.allowedSupportSlots = allowedSupportSlots.map((slot) => slot.slotId);
  generationDiagnostics.replyParts.allowedClaimOrdinals = claimMetadata.allowedClaimOrdinals;
  generationDiagnostics.replyParts.verificationMode = 'generator_auditor';

  let repairReason: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    generationDiagnostics.replyParts.attemptCount = attempt;
    generationDiagnostics.replyParts.repairAttempted = attempt > 1;
    generationDiagnostics.replyParts.failureReason = undefined;
    generationDiagnostics.replyParts.rawResponsePreview = undefined;
    generationDiagnostics.replyParts.rawPartsPreview = undefined;
    generationDiagnostics.replyParts.partCount = 0;
    generationDiagnostics.replyParts.groundedPartCount = 0;
    generationDiagnostics.replyParts.acceptedClaimOrdinals = undefined;
    generationDiagnostics.replyParts.auditAttempted = false;
    generationDiagnostics.replyParts.auditSuccess = false;
    generationDiagnostics.replyParts.auditFailureReason = undefined;
    generationDiagnostics.replyParts.auditRawResponsePreview = undefined;
    generationDiagnostics.replyParts.auditPartsPreview = undefined;

    const prompt = attempt === 1
      ? buildPlanBoundReplyPartsPrompt({
        npcName,
        playerMessage,
        queryType,
        routeIntent,
        plan,
        planClaims: claimMetadata.planClaims,
        turnContext: safeInput.turnContext,
        supportSlots: allowedSupportSlots,
      })
      : buildPlanBoundReplyPartsRepairPrompt({
        npcName,
        playerMessage,
        queryType,
        routeIntent,
        plan,
        planClaims: claimMetadata.planClaims,
        turnContext: safeInput.turnContext,
        supportSlots: allowedSupportSlots,
        failureReason: repairReason,
      });
    const generated = await runtime.generateJson({
      kind: 'validated-plan-realization',
      prompt,
      schemaText: REPLY_PARTS_JSON_SCHEMA,
      maxTokens: Math.min(420, 200 + (claimMetadata.planClaims.length * 60)),
      attempt,
      input: {
        npcName,
        playerMessage,
        turnContext: safeInput.turnContext,
        planClaims: claimMetadata.planClaims,
      },
    });

    const replyPartsSourceText = typeof generated.rawText === 'string' && generated.rawText.trim().length > 0
      ? generated.rawText
      : generated.jsonText;
    generationDiagnostics.replyParts.rawResponsePreview = sanitizePromptText(replyPartsSourceText).slice(0, 320);

    const parsedResult = parseReplyPartsResponseDetailed(replyPartsSourceText);
    if (!parsedResult.turn) {
      repairReason = parsedResult.failureReason ?? 'invalid_json';
      generationDiagnostics.draft.success = false;
      generationDiagnostics.draft.failureReason = `reply-parts-${repairReason}`;
      generationDiagnostics.replyParts.success = false;
      generationDiagnostics.replyParts.failureReason = repairReason;
      emitPlanRealizationStatusLog({
        stage: 'parse-failed',
        strategy: 'generator_auditor',
        attempt,
        turnContext: safeInput.turnContext,
        npcId: normalizeOptionalString(npcId) ?? undefined,
        routeIntent: normalizeOptionalString(routeIntent) ?? undefined,
        queryType: normalizeOptionalString(queryType) ?? undefined,
        turnPath: 'grounded',
        failureReason: repairReason,
        rawPreview: replyPartsSourceText,
        allowedClaimOrdinals: claimMetadata.allowedClaimOrdinals,
        allowedSupportSlots: allowedSupportSlots.map((slot) => slot.slotId),
        validationMode: 'generator_auditor',
      });
      continue;
    }

    generationDiagnostics.replyParts.rawPartsPreview = parsedResult.turn.parts.map((part) => ({
      kind: part.kind,
      text: part.text,
      support: Array.isArray(part.support) ? part.support : undefined,
    }));

    generationDiagnostics.replyParts.auditAttempted = true;
    const auditPrompt = buildGroundedReplyAuditPrompt({
      turnContext: safeInput.turnContext,
      playerMessage,
      queryType,
      routeIntent,
      generatedTurn: parsedResult.turn,
      planClaims: claimMetadata.planClaims,
    });
    const auditGenerated = await runtime.generateJson({
      kind: 'grounded-reply-audit',
      prompt: auditPrompt,
      schemaText: GROUNDED_REPLY_AUDIT_JSON_SCHEMA,
      maxTokens: Math.min(320, 180 + (parsedResult.turn.parts.length * 40)),
      attempt: 1,
      temperature: '0.15',
      input: {
        playerMessage,
        queryType,
        routeIntent,
        generatedTurn: parsedResult.turn,
        planClaims: claimMetadata.planClaims,
        turnContext: safeInput.turnContext,
      },
    });
    const auditSourceText = typeof auditGenerated.rawText === 'string' && auditGenerated.rawText.trim().length > 0
      ? auditGenerated.rawText
      : auditGenerated.jsonText;
    generationDiagnostics.replyParts.auditRawResponsePreview = sanitizePromptText(auditSourceText).slice(0, 320);
    const parsedAudit = parseGroundedReplyAuditDetailed(auditSourceText);
    if (!parsedAudit.audit) {
      repairReason = `audit_${parsedAudit.failureReason ?? 'invalid_json'}`;
      generationDiagnostics.draft.success = false;
      generationDiagnostics.draft.failureReason = repairReason;
      generationDiagnostics.replyParts.success = false;
      generationDiagnostics.replyParts.failureReason = repairReason;
      generationDiagnostics.replyParts.auditSuccess = false;
      generationDiagnostics.replyParts.auditFailureReason = repairReason;
      emitPlanRealizationStatusLog({
        stage: 'audit-parse-failed',
        strategy: 'generator_auditor',
        attempt,
        turnContext: safeInput.turnContext,
        npcId: normalizeOptionalString(npcId) ?? undefined,
        routeIntent: normalizeOptionalString(routeIntent) ?? undefined,
        queryType: normalizeOptionalString(queryType) ?? undefined,
        turnPath: 'grounded',
        failureReason: repairReason,
        rawPreview: replyPartsSourceText,
        auditRawPreview: auditSourceText,
        allowedClaimOrdinals: claimMetadata.allowedClaimOrdinals,
        allowedSupportSlots: allowedSupportSlots.map((slot) => slot.slotId),
        validationMode: 'generator_auditor',
      });
      continue;
    }

    generationDiagnostics.replyParts.auditPartsPreview = parsedAudit.audit.partAudits.map((part) => ({
      partIndex: part.partIndex,
      role: part.role,
      claimOrdinals: part.claimOrdinals,
      hedgeSufficient: part.hedgeSufficient,
      notes: part.notes,
    }));

    const auditedTurnResult = materializeAuditedGroundedTurn({
      generatedTurn: parsedResult.turn,
      planClaims: claimMetadata.planClaims,
      unsupportedFacts: parsedAudit.audit.unsupportedFacts,
      partAudits: parsedAudit.audit.partAudits,
    });
    generationDiagnostics.replyParts.acceptedClaimOrdinals = auditedTurnResult.acceptedClaimOrdinals;
    if (!auditedTurnResult.auditedTurn) {
      repairReason = auditedTurnResult.failureReason ?? 'audit_rejected';
      generationDiagnostics.draft.success = false;
      generationDiagnostics.draft.failureReason = repairReason;
      generationDiagnostics.replyParts.success = false;
      generationDiagnostics.replyParts.failureReason = repairReason;
      generationDiagnostics.replyParts.auditSuccess = false;
      generationDiagnostics.replyParts.auditFailureReason = repairReason;
      emitPlanRealizationStatusLog({
        stage: 'audit-rejected',
        strategy: 'generator_auditor',
        attempt,
        turnContext: safeInput.turnContext,
        npcId: normalizeOptionalString(npcId) ?? undefined,
        routeIntent: normalizeOptionalString(routeIntent) ?? undefined,
        queryType: normalizeOptionalString(queryType) ?? undefined,
        turnPath: 'grounded',
        failureReason: repairReason,
        rawPreview: replyPartsSourceText,
        auditRawPreview: auditSourceText,
        allowedClaimOrdinals: claimMetadata.allowedClaimOrdinals,
        acceptedClaimOrdinals: auditedTurnResult.acceptedClaimOrdinals,
        allowedSupportSlots: allowedSupportSlots.map((slot) => slot.slotId),
        validationMode: 'generator_auditor',
      });
      continue;
    }

    const normalized = normalizeReplyPartsForValidation({
      turn: auditedTurnResult.auditedTurn,
      supportSlots: allowedSupportSlots,
      queryType,
    }) ?? auditedTurnResult.auditedTurn;
    const validation = validateReplyPartsContract({
      parts: normalized.parts,
      supportSlots: allowedSupportSlots,
      queryType,
      intent: normalized.intent,
    });
    const realizedKnowledgeParts = normalized.parts.filter((part) => (
      part.kind === 'grounded' || part.kind === 'inferred' || part.kind === 'rumor'
    )).length;
    generationDiagnostics.replyParts.partCount = normalized.parts.length;
    generationDiagnostics.replyParts.groundedPartCount = realizedKnowledgeParts;
    generationDiagnostics.replyParts.auditSuccess = true;
    generationDiagnostics.replyParts.auditFailureReason = undefined;

    if (!validation.valid) {
      repairReason = buildReplyPartsValidationRepairReason(validation);
      generationDiagnostics.draft.success = false;
      generationDiagnostics.draft.failureReason = 'reply-parts-validation-failed';
      generationDiagnostics.replyParts.success = false;
      generationDiagnostics.replyParts.failureReason = repairReason;
      emitPlanRealizationStatusLog({
        stage: 'contract-rejected',
        strategy: 'generator_auditor',
        attempt,
        turnContext: safeInput.turnContext,
        npcId: normalizeOptionalString(npcId) ?? undefined,
        routeIntent: normalizeOptionalString(routeIntent) ?? undefined,
        queryType: normalizeOptionalString(queryType) ?? undefined,
        turnPath: 'grounded',
        failureReason: repairReason,
        rawPreview: replyPartsSourceText,
        auditRawPreview: auditSourceText,
        allowedClaimOrdinals: claimMetadata.allowedClaimOrdinals,
        acceptedClaimOrdinals: auditedTurnResult.acceptedClaimOrdinals,
        allowedSupportSlots: allowedSupportSlots.map((slot) => slot.slotId),
        validationMode: 'generator_auditor',
      });
      continue;
    }

    const materialized = materializeTurnOutputFromReplyParts({
      turn: {
        ...normalized,
        beatEvidence: isRecord(normalized.beatEvidence)
          ? normalized.beatEvidence
          : {
            coveredFacts: [],
            uncoveredFacts: [],
            completionSignal: 'none',
            confidence: 0,
          },
      },
      supportSlots: allowedSupportSlots,
    });

    emitReplyLanguageDebugLog({
      stage: 'validated-plan-realization-candidate',
      turnContext: safeInput.turnContext,
      npcId: normalizeOptionalString(npcId) ?? undefined,
      routeIntent: normalizeOptionalString(routeIntent) ?? undefined,
      queryType: normalizeOptionalString(queryType) ?? undefined,
      turnPath: 'grounded',
      replyText: materialized.utterance,
      partKinds: normalized.parts.map((part) => part.kind),
    });

    const languageEstimate = estimateTextLanguage(
      materialized.utterance,
      getPedagogyContext(safeInput.turnContext)?.targetLanguage,
    );
    generationDiagnostics.replyParts.estimatedLanguage = languageEstimate.estimatedLanguage;
    generationDiagnostics.replyParts.mismatchSuspected = languageEstimate.mismatchSuspected;
    if (languageEstimate.mismatchSuspected) {
      repairReason = `language_mismatch:${languageEstimate.estimatedLanguage}`;
      generationDiagnostics.draft.success = false;
      generationDiagnostics.draft.failureReason = repairReason;
      generationDiagnostics.replyParts.success = false;
      generationDiagnostics.replyParts.failureReason = repairReason;
      emitPlanRealizationStatusLog({
        stage: 'language-rejected',
        strategy: 'generator_auditor',
        attempt,
        turnContext: safeInput.turnContext,
        npcId: normalizeOptionalString(npcId) ?? undefined,
        routeIntent: normalizeOptionalString(routeIntent) ?? undefined,
        queryType: normalizeOptionalString(queryType) ?? undefined,
        turnPath: 'grounded',
        failureReason: repairReason,
        estimatedLanguage: languageEstimate.estimatedLanguage,
        mismatchSuspected: languageEstimate.mismatchSuspected,
        allowedClaimOrdinals: claimMetadata.allowedClaimOrdinals,
        acceptedClaimOrdinals: auditedTurnResult.acceptedClaimOrdinals,
        allowedSupportSlots: allowedSupportSlots.map((slot) => slot.slotId),
        validationMode: 'generator_auditor',
      });
      continue;
    }

    generationDiagnostics.draft.success = true;
    generationDiagnostics.replyParts.success = true;
    generationDiagnostics.replyParts.failureReason = undefined;
    emitPlanRealizationStatusLog({
      stage: 'accepted',
      strategy: 'generator_auditor',
      attempt,
      turnContext: safeInput.turnContext,
      npcId: normalizeOptionalString(npcId) ?? undefined,
      routeIntent: normalizeOptionalString(routeIntent) ?? undefined,
      queryType: normalizeOptionalString(queryType) ?? undefined,
      turnPath: 'grounded',
      estimatedLanguage: languageEstimate.estimatedLanguage,
      mismatchSuspected: languageEstimate.mismatchSuspected,
      allowedClaimOrdinals: claimMetadata.allowedClaimOrdinals,
      acceptedClaimOrdinals: auditedTurnResult.acceptedClaimOrdinals,
      allowedSupportSlots: allowedSupportSlots.map((slot) => slot.slotId),
      validationMode: 'generator_auditor',
    });
    return materialized;
  }

  emitPlanRealizationStatusLog({
    stage: 'exhausted',
    strategy: 'generator_auditor',
    attempt: generationDiagnostics.replyParts.attemptCount,
    turnContext: safeInput.turnContext,
    npcId: normalizeOptionalString(npcId) ?? undefined,
    routeIntent: normalizeOptionalString(routeIntent) ?? undefined,
    queryType: normalizeOptionalString(queryType) ?? undefined,
    turnPath: 'grounded',
    failureReason: generationDiagnostics.replyParts.failureReason,
    allowedClaimOrdinals: claimMetadata.allowedClaimOrdinals,
    allowedSupportSlots: allowedSupportSlots.map((slot) => slot.slotId),
    validationMode: 'generator_auditor',
  });
  return null;
}

function buildMockSocialReplyParts(requestInput: unknown) {
  const input = isRecord(requestInput) ? requestInput : {};
  const npcName = normalizeOptionalString(input.npcName) ?? 'NPC';
  const playerMessage = normalizeOptionalString(input.playerMessage) ?? '';
  const targetLanguage = normalizeOptionalString(getPedagogyContext(input.turnContext)?.targetLanguage);
  const declaredName = extractDeclaredIdentityName(playerMessage, targetLanguage);
  const acknowledgement = detectSocialAcknowledgement(playerMessage, targetLanguage);

  let text = localizeSimpleSocialReply('hi_im_npc', targetLanguage, { npcName });
  if (declaredName) {
    const safeName = declaredName.charAt(0).toUpperCase() + declaredName.slice(1);
    text = localizeSimpleSocialReply('nice_to_meet_you', targetLanguage, {
      npcName,
      playerName: safeName,
    });
  } else if (acknowledgement === 'gratitude') {
    text = localizeSimpleSocialReply('any_time', targetLanguage);
  } else if (acknowledgement === 'shared_preference') {
    text = /\bcheese\b/i.test(playerMessage)
      ? localizeSimpleSocialReply('shared_preference_cheese', targetLanguage)
      : localizeSimpleSocialReply('shared_preference', targetLanguage);
  } else if (acknowledgement) {
    text = localizeSimpleSocialReply('agreement', targetLanguage);
  } else if (!isLikelyGreetingOnlyMessage(playerMessage, targetLanguage) && playerMessage) {
    text = localizeSimpleSocialReply('agreement', targetLanguage);
  }

  return {
    parts: [
      {
        kind: 'social',
        text,
      },
    ],
    emotion: 'warm',
    intent: 'conversation',
    proposedIntents: [],
    beatEvidence: {
      coveredFacts: [],
      uncoveredFacts: [],
      completionSignal: 'none',
      confidence: 0,
    },
  };
}

async function realizeSocialFastWithReplyPartsTransport(input: RecordLike | null | undefined) {
  const safeInput = isRecord(input) ? input : {};
  const {
    runtime,
    ensureModelLoaded,
    npcName,
    playerMessage,
    history,
    memoryFacts,
    npcProfile,
    globalSafetyBounds,
    turnContext,
    isFirstMeeting,
    generationDiagnostics,
  } = safeInput;

  await ensureModelLoaded();
  generationDiagnostics.draft.attempted = true;
  generationDiagnostics.replyParts.attempted = true;
  generationDiagnostics.replyParts.attemptCount = 1;
  generationDiagnostics.replyParts.repairAttempted = false;
  generationDiagnostics.replyParts.allowedSupportSlots = [];

  const prompt = buildSocialFastReplyPartsPrompt({
    npcName,
    playerMessage,
    history,
    memoryFacts,
    npcProfile,
    globalSafetyBounds,
    turnContext,
  });

  const generated = await runtime.generateJson({
    kind: 'social-fast-realization',
    prompt,
    schemaText: REPLY_PARTS_JSON_SCHEMA,
    maxTokens: 140,
    attempt: 1,
    temperature: '0.72',
    input: {
      npcName,
      playerMessage,
      turnContext,
      supportSlots: [],
    },
  });

  const replyPartsSourceText = typeof generated.rawText === 'string' && generated.rawText.trim().length > 0
    ? generated.rawText
    : generated.jsonText;
  generationDiagnostics.replyParts.rawResponsePreview = sanitizePromptText(replyPartsSourceText).slice(0, 320);

  const parsed = parseReplyPartsTurnFromText(replyPartsSourceText);
  if (!parsed) {
    generationDiagnostics.draft.success = false;
    generationDiagnostics.draft.failureReason = 'social-fast-invalid-json';
    generationDiagnostics.replyParts.success = false;
    generationDiagnostics.replyParts.failureReason = 'invalid_json';
    return null;
  }

  const normalized = normalizeReplyPartsForValidation({
    turn: parsed,
    supportSlots: [],
    queryType: 'conversation',
  }) ?? parsed;
  generationDiagnostics.replyParts.rawPartsPreview = normalized.parts.map((part) => ({
    kind: part.kind,
    text: part.text,
  }));

  const validation = validateReplyPartsContract({
    parts: normalized.parts,
    supportSlots: [],
    queryType: 'conversation',
    intent: normalized.intent,
  });
  generationDiagnostics.replyParts.partCount = normalized.parts.length;
  generationDiagnostics.replyParts.groundedPartCount = normalized.parts.filter((part) => part.kind === 'grounded').length;

  if (!validation.valid) {
    generationDiagnostics.draft.success = false;
    generationDiagnostics.draft.failureReason = 'social-fast-reply-parts-validation-failed';
    generationDiagnostics.replyParts.success = false;
    generationDiagnostics.replyParts.failureReason = buildReplyPartsValidationRepairReason(validation);
    return null;
  }

  if (normalized.parts.some((part) => part.kind !== 'social' && part.kind !== 'close')) {
    generationDiagnostics.draft.success = false;
    generationDiagnostics.draft.failureReason = 'social-fast-non-social-part';
    generationDiagnostics.replyParts.success = false;
    generationDiagnostics.replyParts.failureReason = 'social_fast_requires_social_parts';
    return null;
  }

  const materialized = materializeTurnOutputFromReplyParts({
    turn: {
      ...normalized,
      beatEvidence: isRecord(normalized.beatEvidence)
        ? normalized.beatEvidence
        : {
          coveredFacts: [],
          uncoveredFacts: [],
          completionSignal: 'none',
          confidence: 0,
        },
    },
    supportSlots: [],
  });
  const languageEstimate = estimateTextLanguage(
    materialized.utterance,
    getPedagogyContext(turnContext)?.targetLanguage,
  );
  generationDiagnostics.replyParts.estimatedLanguage = languageEstimate.estimatedLanguage;
  generationDiagnostics.replyParts.mismatchSuspected = languageEstimate.mismatchSuspected;
  if (languageEstimate.mismatchSuspected) {
    generationDiagnostics.draft.success = false;
    generationDiagnostics.draft.failureReason = 'social-fast-language-mismatch';
    generationDiagnostics.replyParts.success = false;
    generationDiagnostics.replyParts.failureReason = 'social_fast_language_mismatch';
    emitPlanRealizationStatusLog({
      stage: 'language-rejected',
      strategy: 'social_fast_reply_parts',
      attempt: 1,
      turnContext,
      routeIntent: 'social_chat',
      queryType: 'conversation',
      turnPath: 'social_fast',
      estimatedLanguage: languageEstimate.estimatedLanguage,
      mismatchSuspected: languageEstimate.mismatchSuspected,
      failureReason: 'social_fast_language_mismatch',
      validationMode: 'social_reply_parts',
    });
    return null;
  }

  const quality = validateTurnQuality(
    materialized,
    playerMessage,
    history,
    memoryFacts,
    {
      initiativeAction: 'player_respond',
      npcName,
      isFirstMeeting,
      routingIntent: 'social_chat',
      queryType: 'conversation',
      regionPath: turnContext?.regionPath,
      regionName: turnContext?.regionName,
    },
  );
  if (!quality.valid) {
    generationDiagnostics.draft.success = false;
    generationDiagnostics.draft.failureReason = `social-fast-turn-quality:${quality.reason}`;
    generationDiagnostics.replyParts.success = false;
    generationDiagnostics.replyParts.failureReason = quality.reason;
    return null;
  }

  if (checkSocialResponseForFactualLeakage(materialized.utterance)) {
    generationDiagnostics.draft.success = false;
    generationDiagnostics.draft.failureReason = 'social-fast-factual-leakage';
    generationDiagnostics.replyParts.success = false;
    generationDiagnostics.replyParts.failureReason = 'social_fast_factual_leakage';
    return null;
  }

  generationDiagnostics.draft.success = true;
  generationDiagnostics.replyParts.success = true;
  generationDiagnostics.replyParts.failureReason = undefined;
  emitReplyLanguageDebugLog({
    stage: 'social-fast-realization-candidate',
    turnContext,
    turnPath: 'social_fast',
    replyText: normalized.parts.map((part) => part.text).join(' '),
    partKinds: normalized.parts.map((part) => part.kind),
  });
  return materialized;
}

function toMode(interactionMode: unknown): 'character' | 'narrative' | 'hybrid' {
  if (interactionMode === 'scripted') return 'narrative';
  if (interactionMode === 'hybrid') return 'hybrid';
  return 'character';
}

function buildHistoryBlock(history: unknown): string {
  const entries = Array.isArray(history) ? history.slice(-MAX_HISTORY_ENTRIES) : [];
  if (entries.length === 0) {
    return 'Recent conversation:\n- none';
  }
  const lines = entries.map((entry) => {
    const role = entry?.role === 'npc' ? 'npc' : 'player';
    const text = sanitizePromptText(entry?.text ?? '').slice(0, 260);
    return `- ${role}: ${text}`;
  });
  return `Recent conversation:\n${lines.join('\n')}`;
}

function buildMemoryFactBlock(memoryFacts: unknown): string {
  const facts = Array.isArray(memoryFacts) ? memoryFacts.slice(-24) : [];
  if (facts.length === 0) return 'Known player facts:\n- none';
  return `Known player facts:\n${facts.map((fact) => `- ${sanitizePromptText(fact).slice(0, 220)}`).join('\n')}`;
}

function buildNpcProfileBlock(npcProfile: unknown): string | null {
  if (!isRecord(npcProfile)) return null;
  const lines: string[] = [];
  const persona = normalizeOptionalString(npcProfile.persona);
  const tone = normalizeOptionalString(npcProfile.tone);
  const constraints = normalizeStringArray(npcProfile.constraints);
  if (persona) lines.push(`- Persona: ${sanitizePromptText(persona).slice(0, 280)}`);
  if (tone) lines.push(`- Tone: ${sanitizePromptText(tone).slice(0, 120)}`);
  if (constraints.length > 0) {
    lines.push(`- Constraints: ${constraints.map((entry) => sanitizePromptText(entry)).join(' | ')}`);
  }
  if (lines.length === 0) return null;
  return ['NPC authored profile:', ...lines].join('\n');
}

function buildGlobalSafetyBlock(globalSafetyBounds: unknown): string | null {
  const bounds = normalizeStringArray(globalSafetyBounds);
  if (bounds.length === 0) return null;
  return [
    'Global safety bounds:',
    ...bounds.map((entry) => `- ${sanitizePromptText(entry)}`),
  ].join('\n');
}

function getPedagogyContext(turnContext: unknown): PluginPedagogyContext | null {
  if (!isRecord(turnContext) || !isRecord(turnContext.pedagogyContext)) return null;
  return turnContext.pedagogyContext as PluginPedagogyContext;
}

function buildPedagogyVocabularyList(pedagogyContext: PluginPedagogyContext): string[] {
  const groundingScope = Array.isArray(pedagogyContext.groundingScope)
    ? pedagogyContext.groundingScope
    : [];
  const focusIds = new Set(pedagogyContext.teachingSubset?.focusLexicalEntryIds ?? []);
  const preferredEntries = focusIds.size > 0
    ? groundingScope.filter((entry) => focusIds.has(entry.lexicalEntryId))
    : groundingScope;

  return Array.from(new Set(
    preferredEntries
      .map((entry) => normalizeOptionalString(entry.targetForm))
      .filter((entry): entry is string => Boolean(entry)),
  )).slice(0, 8);
}

function buildLanguageInstructionLines(turnContext: unknown): string[] {
  const pedagogyContext = getPedagogyContext(turnContext);
  const targetLanguage = normalizeOptionalString(pedagogyContext?.targetLanguage);
  const supportLanguage = normalizeOptionalString(pedagogyContext?.supportLanguage);
  const learnerBand = normalizeOptionalString(pedagogyContext?.learnerBand);
  const supportPolicy = normalizeOptionalString(pedagogyContext?.supportLanguagePolicy);

  if (!targetLanguage) {
    return [
      'Respond in the same language as the player message unless asked to switch languages.',
      'If the player message is English, respond in English.',
    ];
  }

  const lines = [
    `Sugarlang target language is ${targetLanguage}. Keep the visible reply in ${targetLanguage}.`,
    learnerBand
      ? `Match the learner's current Sugarlang band (${learnerBand}). Prefer simple, high-frequency wording for that band.`
      : 'Prefer simple, learnable target-language wording.',
    'Do not switch back to the player language just because the player wrote in it.',
  ];

  if (supportPolicy === 'target_only') {
    lines.push('Do not include support-language words or translations in the visible reply.');
  } else if (supportPolicy === 'target_dominant') {
    lines.push(
      `Keep the reply overwhelmingly in ${targetLanguage}.` +
      `${supportLanguage ? ` Use ${supportLanguage} only for a tiny clarification if absolutely necessary.` : ''}`,
    );
  } else if (supportPolicy === 'light_support' || supportPolicy === 'heavy_support' || supportPolicy === 'full_support') {
    lines.push(
      `${supportLanguage ? `If a gloss is necessary, keep it short and in ${supportLanguage}.` : 'If a gloss is necessary, keep it very short.'}` +
      ' The target-language reply should still lead.',
    );
  }

  return lines;
}

function buildPedagogyBlock(turnContext: unknown): string | null {
  const pedagogyContext = getPedagogyContext(turnContext);
  if (!pedagogyContext) return null;

  const lines: string[] = [];
  const targetLanguage = normalizeOptionalString(pedagogyContext.targetLanguage);
  const supportLanguage = normalizeOptionalString(pedagogyContext.supportLanguage);
  const learnerBand = normalizeOptionalString(pedagogyContext.learnerBand);
  const supportPolicy = normalizeOptionalString(pedagogyContext.supportLanguagePolicy);
  const correctionPosture = normalizeOptionalString(pedagogyContext.correctionPosture);
  const trackedPoolSize = Array.isArray(pedagogyContext.availableTrackedLexicalEntryIds)
    ? pedagogyContext.availableTrackedLexicalEntryIds.length
    : 0;
  const focusVocabulary = buildPedagogyVocabularyList(pedagogyContext);

  if (targetLanguage) lines.push(`- Target language: ${sanitizePromptText(targetLanguage)}`);
  if (supportLanguage) lines.push(`- Support language: ${sanitizePromptText(supportLanguage)}`);
  if (learnerBand) lines.push(`- Learner band: ${sanitizePromptText(learnerBand)}`);
  if (supportPolicy) lines.push(`- Support policy: ${sanitizePromptText(supportPolicy)}`);
  if (correctionPosture) lines.push(`- Correction posture: ${sanitizePromptText(correctionPosture)}`);
  if (trackedPoolSize > 0) lines.push(`- Tracked vocabulary pool: ${trackedPoolSize} items`);
  if (focusVocabulary.length > 0) {
    lines.push(`- Prefer this target-language vocabulary when natural: ${focusVocabulary.join(', ')}`);
  }
  if (pedagogyContext.ambientHaloAllowance) {
    const halo = pedagogyContext.ambientHaloAllowance;
    lines.push(
      '- Ambient vocabulary allowance:' +
      ` trackedLookahead=${halo.maxTrackedLookahead ?? 0}` +
      ` untrackedPhrases=${halo.maxUntrackedPhrases ?? 0}` +
      ` higherBand=${halo.allowHigherBandTracked ? 'yes' : 'no'}` +
      ` flavor=${halo.allowUntrackedFlavor ? 'yes' : 'no'}`,
    );
  }

  if (lines.length === 0) return null;
  return ['Sugarlang pedagogy context:', ...lines].join('\n');
}

function buildLearnerBandStyleLines(turnContext: unknown): string[] {
  const learnerBand = normalizeOptionalString(getPedagogyContext(turnContext)?.learnerBand)?.toUpperCase();
  if (!learnerBand) return [];

  if (learnerBand === 'B0') {
    return [
      'For factual parts, prefer one very short sentence per part.',
      'At this learner band, use at most 2 grounded factual parts and only the most important facts.',
      'Use simple present-tense wording and avoid subordinate clauses.',
      'Prefer high-frequency everyday words over ornate phrasing.',
    ];
  }

  if (learnerBand === 'B1') {
    return [
      'Keep factual parts short and easy to parse.',
      'Prefer at most 2 grounded factual parts unless a second fact is essential.',
      'Prefer direct wording and only one small hedge when a hedge is required.',
    ];
  }

  if (learnerBand === 'B2') {
    return [
      'Use clear natural phrasing, but do not get elaborate.',
    ];
  }

  return [
    'Keep the reply natural, but still easy to follow.',
  ];
}

function extractProperNameAnchorsFromClaims(planClaims: Array<{ text?: string }>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const claim of planClaims) {
    const text = sanitizePromptText(claim?.text ?? '');
    if (!text) continue;
    const matches = text.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3}\b/g) ?? [];
    for (const match of matches) {
      const normalized = match.trim();
      if (
        normalized.length < 3
        || normalized === 'I'
        || normalized === 'The'
        || seen.has(normalized)
      ) {
        continue;
      }
      seen.add(normalized);
      output.push(normalized);
      if (output.length >= 8) return output;
    }
  }
  return output;
}

function buildGroundedTargetLanguageAnchorLines(input: {
  turnContext?: unknown;
  planClaims?: Array<{ text?: string }>;
}): string[] {
  const pedagogyContext = getPedagogyContext(input.turnContext);
  const targetLanguage = normalizeOptionalString(pedagogyContext?.targetLanguage);
  if (!targetLanguage || normalizeLanguageCode(targetLanguage) === 'en') return [];

  const focusVocabulary = pedagogyContext ? buildPedagogyVocabularyList(pedagogyContext) : [];
  const properNames = extractProperNameAnchorsFromClaims(
    Array.isArray(input.planClaims) ? input.planClaims : [],
  );

  const groundedExample = localizeGroundedReplyExemplar('grounded', targetLanguage);
  const inferredExample = localizeGroundedReplyExemplar('inferred', targetLanguage);
  const rumorExample = localizeGroundedReplyExemplar('rumor', targetLanguage);
  const uncertainExample = localizeGroundedReplyExemplar('uncertain', targetLanguage);

  const lines = [
    `Important: when the target language is ${targetLanguage}, the factual claim notes below are source-language meaning notes only.`,
    `Write the visible factual reply directly in ${targetLanguage}. Do not mirror English relation words from the source notes.`,
    'Proper names may stay as names, but the surrounding grammar and relation words must be in the target language.',
  ];

  if (properNames.length > 0) {
    lines.push(`Proper names you may keep as-is: ${properNames.join(', ')}`);
  }
  if (focusVocabulary.length > 0) {
    lines.push(`Prefer these target-language anchor words when natural: ${focusVocabulary.join(', ')}`);
  }

  lines.push(...buildLearnerBandStyleLines(input.turnContext));
  lines.push('Target-language factual style examples (imitate the language and simplicity, not the facts):');
  lines.push(`{"parts":[{"kind":"grounded","text":"${groundedExample}"}],"emotion":"grounded","intent":"answer","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}`);
  lines.push(`{"parts":[{"kind":"inferred","text":"${inferredExample}"}],"emotion":"guarded","intent":"answer","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}`);
  lines.push(`{"parts":[{"kind":"rumor","text":"${rumorExample}"}],"emotion":"uncertain","intent":"answer","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}`);
  lines.push(`{"parts":[{"kind":"uncertain","text":"${uncertainExample}"}],"emotion":"uncertain","intent":"uncertain","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}`);
  return lines;
}

function tokenizeSnippetText(text: unknown): string[] {
  return sanitizePromptText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s_-]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function scoreCitationSnippet(queryTokens: string[], snippet: unknown): number {
  const snippetTokens = tokenizeSnippetText(snippet);
  if (snippetTokens.length === 0) return 0;
  if (queryTokens.length === 0) return 0.1;
  const snippetSet = new Set(snippetTokens);
  let overlap = 0;
  for (const token of queryTokens) {
    if (snippetSet.has(token)) overlap += 1;
  }
  return overlap / Math.max(1, Math.min(queryTokens.length, 5));
}

function resolveCitationSnippetForMatch(matchEntry: any, query: unknown, loreArtifacts: any): string {
  const chunk = matchEntry?.chunk;
  if (!chunk) return '';

  const fallbackSummary = sanitizePromptText(chunk.summary ?? '');
  const queryTokens = tokenizeSnippetText(query);
  const candidates: string[] = [];

  if (fallbackSummary) {
    candidates.push(fallbackSummary);
  }

  const chunkFactIds = Array.isArray(chunk?.metadata?.fact_ids)
    ? chunk.metadata.fact_ids.filter((entry: unknown): entry is string => typeof entry === 'string')
    : [];
  if (chunkFactIds.length > 0 && isRecord(loreArtifacts?.factById)) {
    for (const factId of chunkFactIds) {
      const fact = loreArtifacts.factById[factId];
      const statement = normalizeOptionalString(fact?.statement);
      if (statement) candidates.push(statement);
    }
  }

  const chunkId = normalizeOptionalString(chunk?.chunkId);
  if (chunkId && isRecord(loreArtifacts?.factsByChunkId)) {
    const factsForChunk = Array.isArray(loreArtifacts.factsByChunkId[chunkId])
      ? loreArtifacts.factsByChunkId[chunkId]
      : [];
    for (const fact of factsForChunk) {
      const statement = normalizeOptionalString(fact?.statement);
      if (statement) candidates.push(statement);
    }
  }

  let bestSnippet = fallbackSummary;
  let bestScore = scoreCitationSnippet(queryTokens, fallbackSummary);
  for (const candidate of candidates) {
    const score = scoreCitationSnippet(queryTokens, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestSnippet = candidate;
    }
  }

  const finalSnippet = normalizeOptionalString(bestSnippet)
    ?? normalizeOptionalString(fallbackSummary)
    ?? `${normalizeOptionalString(chunk.sourceFile) ?? 'lore'}#${normalizeOptionalString(chunk.sectionHeading) ?? 'section'}`;
  return sanitizePromptText(finalSnippet).slice(0, 360);
}

function buildLoreCitationDefaults(loreMatches: unknown, query: unknown, loreArtifacts: any) {
  if (!Array.isArray(loreMatches) || loreMatches.length === 0) return [];
  const defaults: Array<{ sourceId: string; snippet: string }> = [];
  const seenSourceIds = new Set();
  for (const entry of loreMatches.slice(0, 4)) {
    const sourceId = normalizeOptionalString(entry?.chunk?.chunkId);
    if (!sourceId || seenSourceIds.has(sourceId)) continue;
    seenSourceIds.add(sourceId);
    defaults.push({
      sourceId,
      snippet: resolveCitationSnippetForMatch(entry, query, loreArtifacts),
    });
  }
  return defaults;
}

function hydrateModelCitationsWithLore(modelCitations: unknown, loreMatches: unknown, query: unknown, loreArtifacts: any) {
  const defaults = buildLoreCitationDefaults(loreMatches, query, loreArtifacts);
  const defaultsBySourceId = new Map(defaults.map((entry) => [entry.sourceId, entry.snippet]));
  const hydrated: Array<{ sourceId: string; snippet?: string }> = [];
  const seenSourceIds = new Set();
  const source = Array.isArray(modelCitations) ? modelCitations : [];

  for (const rawCitation of source) {
    if (!isRecord(rawCitation)) continue;
    const sourceId = normalizeOptionalString(rawCitation.sourceId);
    if (!sourceId || seenSourceIds.has(sourceId)) continue;
    const snippet = normalizeOptionalString(rawCitation.snippet) ?? defaultsBySourceId.get(sourceId);
    hydrated.push(snippet ? { sourceId, snippet } : { sourceId });
    seenSourceIds.add(sourceId);
  }

  for (const fallbackCitation of defaults) {
    if (seenSourceIds.has(fallbackCitation.sourceId)) continue;
    hydrated.push(fallbackCitation);
    seenSourceIds.add(fallbackCitation.sourceId);
  }

  return hydrated;
}

function buildLoreEvidenceBlock(loreMatches: unknown, query: unknown, loreArtifacts: any): string | null {
  const defaults = buildLoreCitationDefaults(loreMatches, query, loreArtifacts);
  if (defaults.length === 0) return null;
  const lines = defaults.map((entry) => `- ${entry.sourceId}: ${entry.snippet}`);
  return [
    'Lore evidence you may use (prefer these over guessing):',
    ...lines,
    'If you use lore evidence, include citations with sourceId from the list above and a short snippet.',
  ].join('\n');
}

function buildTurnContextBlock(turnContext: unknown): string | null {
  if (!isRecord(turnContext)) return null;
  const lines: string[] = [];
  const gameId = normalizeOptionalString(turnContext.gameId);
  const regionPath = normalizeOptionalString(turnContext.regionPath);
  const regionName = normalizeOptionalString(turnContext.regionName);
  const episodeId = normalizeOptionalString(turnContext.episodeId);
  const queryType = normalizeOptionalString(turnContext.queryType);
  const routingIntent = normalizeOptionalString(turnContext.routingIntent);
  const policyPath = normalizeOptionalString(turnContext.routingPolicyPath);
  const interactionMode = normalizeOptionalString(turnContext.interactionMode);
  const interactionPolicy = normalizeOptionalString(turnContext.interactionPolicy);
  if (gameId) lines.push(`- Game: ${sanitizePromptText(gameId)}`);
  if (regionName) {
    lines.push(`- Current location (authoritative): ${sanitizePromptText(regionName)}`);
  } else if (regionPath) {
    lines.push(`- Current region (authoritative): ${sanitizePromptText(regionPath)}`);
  }
  if (regionPath && regionPath !== regionName) {
    lines.push(`- Region path: ${sanitizePromptText(regionPath)}`);
  }
  if (regionName || regionPath) {
    lines.push('- Treat the current location above as authoritative. A destination the player mentions is not the current location.');
  }
  if (episodeId) lines.push(`- Episode: ${sanitizePromptText(episodeId)}`);
  if (interactionMode) lines.push(`- Interaction mode: ${sanitizePromptText(interactionMode)}`);
  if (interactionPolicy) lines.push(`- Interaction policy: ${sanitizePromptText(interactionPolicy)}`);
  if (queryType) lines.push(`- Query type: ${sanitizePromptText(queryType)}`);
  if (routingIntent) lines.push(`- Routing intent: ${sanitizePromptText(routingIntent)}`);
  if (policyPath) lines.push(`- Routing policy path: ${sanitizePromptText(policyPath)}`);

  const topicCoverage = isRecord(turnContext.topicCoverage) ? turnContext.topicCoverage : null;
  if (topicCoverage) {
    const activeTopic = normalizeOptionalString(topicCoverage.activeTopic);
    const exhausted = topicCoverage.exhausted === true;
    if (activeTopic) {
      lines.push(`- Active topic: ${sanitizePromptText(activeTopic)}`);
    }
    if (exhausted) {
      lines.push('- Active topic appears exhausted; gracefully wrap up and suggest a new topic.');
    }
  }
  const isFirstMeeting = turnContext.isFirstMeeting === true;
  const turnIndex = Number.isFinite(turnContext.turnIndexWithNpc) ? turnContext.turnIndexWithNpc : undefined;
  if (turnIndex != null) {
    lines.push(`- Turn ${turnIndex} with this player${isFirstMeeting ? ' (first meeting)' : ''}`);
  }
  if (!isFirstMeeting) {
    lines.push('- You already know this player. Do NOT re-introduce yourself or repeat your name unless asked.');
  }

  if (lines.length === 0) return null;
  return ['Turn context:', ...lines].join('\n');
}

function buildLlamaPrompt(input: RecordLike | null | undefined): string {
  const safeInput = isRecord(input) ? input : {};
  const {
    npcName,
    playerMessage,
    history,
    memoryFacts,
    npcProfile,
    globalSafetyBounds,
    turnContext,
    supportSlots,
    attempt,
    repair,
    repairReason,
  } = safeInput;

  const blocks = [
    `You are ${npcName}, an NPC in a game.`,
    'Have a short, natural back-and-forth conversation with the player.',
    ...buildLanguageInstructionLines(turnContext),
    'Never repeat the player message verbatim.',
    'Never repeat something you already said in the conversation history.',
    'Keep the total visible reply concise (1-2 sentences).',
    buildGlobalSafetyBlock(globalSafetyBounds),
    buildNpcProfileBlock(npcProfile),
    buildTurnContextBlock(turnContext),
    buildPedagogyBlock(turnContext),
    buildMemoryFactBlock(memoryFacts),
    buildHistoryBlock(history),
    buildReplyPartsPrompt({
      npcName,
      playerMessage,
      queryType: turnContext?.queryType,
      routeIntent: turnContext?.routingIntent,
      supportSlots,
    }),
  ].filter(Boolean);

  if (repair) {
    blocks.push(buildReplyPartsRepairPrompt({
      npcName,
      playerMessage,
      queryType: turnContext?.queryType,
      routeIntent: turnContext?.routingIntent,
      supportSlots,
      failureReason: repairReason,
    }));
  }

  blocks.push(`attempt=${Number.isFinite(attempt) ? attempt : 1}`);
  blocks.push(`Current player message: ${sanitizePromptText(playerMessage)}`);
  return blocks.join('\n');
}

function createGenerationDiagnostics(): GenerationDiagnostics {
  return {
    draft: {
      attempted: false,
      success: false,
      failureReason: undefined,
      skippedReason: undefined,
    },
    replyParts: {
      attempted: false,
      success: false,
      attemptCount: 0,
      repairAttempted: false,
      partCount: 0,
      groundedPartCount: 0,
      failureReason: undefined,
      skippedReason: undefined,
      rawResponsePreview: undefined,
      rawPartsPreview: undefined,
      auditAttempted: undefined,
      auditSuccess: undefined,
      auditFailureReason: undefined,
      auditRawResponsePreview: undefined,
      auditPartsPreview: undefined,
      allowedSupportSlots: undefined,
      allowedClaimOrdinals: undefined,
      acceptedClaimOrdinals: undefined,
      verificationMode: undefined,
      estimatedLanguage: undefined,
      mismatchSuspected: undefined,
    },
  };
}

function resetGenerationDiagnosticsForAttempt(generationDiagnostics: GenerationDiagnostics): void {
  generationDiagnostics.draft.attempted = false;
  generationDiagnostics.draft.success = false;
  generationDiagnostics.draft.failureReason = undefined;
  generationDiagnostics.draft.skippedReason = undefined;

  generationDiagnostics.replyParts.attempted = false;
  generationDiagnostics.replyParts.success = false;
  generationDiagnostics.replyParts.attemptCount = 0;
  generationDiagnostics.replyParts.repairAttempted = false;
  generationDiagnostics.replyParts.partCount = 0;
  generationDiagnostics.replyParts.groundedPartCount = 0;
  generationDiagnostics.replyParts.failureReason = undefined;
  generationDiagnostics.replyParts.skippedReason = undefined;
  generationDiagnostics.replyParts.rawResponsePreview = undefined;
  generationDiagnostics.replyParts.rawPartsPreview = undefined;
  generationDiagnostics.replyParts.auditAttempted = undefined;
  generationDiagnostics.replyParts.auditSuccess = undefined;
  generationDiagnostics.replyParts.auditFailureReason = undefined;
  generationDiagnostics.replyParts.auditRawResponsePreview = undefined;
  generationDiagnostics.replyParts.auditPartsPreview = undefined;
  generationDiagnostics.replyParts.allowedSupportSlots = undefined;
  generationDiagnostics.replyParts.allowedClaimOrdinals = undefined;
  generationDiagnostics.replyParts.acceptedClaimOrdinals = undefined;
  generationDiagnostics.replyParts.verificationMode = undefined;
  generationDiagnostics.replyParts.estimatedLanguage = undefined;
  generationDiagnostics.replyParts.mismatchSuspected = undefined;
}

function normalizeRuntimeMode(runtime: unknown): 'llama' | 'mock' | 'auto' {
  if (runtime === 'llama' || runtime === 'mock') return runtime;
  return 'auto';
}

function resolveRuntimeMode(args: SessionOptions): 'llama' | 'mock' {
  const requested = normalizeRuntimeMode(args.runtime);
  if (requested === 'llama' || requested === 'mock') return requested;
  const modelPath = normalizeOptionalString(args.modelPath) ?? normalizeOptionalString(process.env.SUGARAGENT_MODEL_PATH) ?? resolveBundledModelPath();
  const llamaBin = normalizeOptionalString(args.llamaBin) ?? normalizeOptionalString(process.env.SUGARAGENT_LLAMA_BIN) ?? resolveBundledLlamaBin();
  if (modelPath && llamaBin && commandExists(llamaBin) && fs.existsSync(modelPath)) {
    return 'llama';
  }
  return 'mock';
}

function resolveConfiguredModelPath(args: SessionOptions): string | null {
  const explicit = normalizeOptionalString(args.modelPath);
  if (explicit) return explicit;
  const envPath = normalizeOptionalString(process.env.SUGARAGENT_MODEL_PATH);
  if (envPath) return envPath;
  return resolveBundledModelPath();
}

function resolveConfiguredLlamaBin(args: SessionOptions): string | null {
  const explicit = normalizeOptionalString(args.llamaBin);
  if (explicit) return explicit;
  const envPath = normalizeOptionalString(process.env.SUGARAGENT_LLAMA_BIN);
  if (envPath) return envPath;
  return resolveBundledLlamaBin();
}

function dedupeMockLocalizedSentences(text: string): string {
  const parts = text.match(/[^.!?]+[.!?]?/g) ?? [text];
  const deduped: string[] = [];
  for (const part of parts.map((entry) => entry.trim()).filter(Boolean)) {
    const normalized = part.toLowerCase();
    if (normalized === deduped[deduped.length - 1]?.toLowerCase()) continue;
    deduped.push(part);
  }
  return deduped.join(' ').trim();
}

function localizeMockKnowledgeText(
  originalText: string,
  targetLanguage: string | null,
): string {
  if (!originalText || !targetLanguage) return originalText;

  if (targetLanguage === 'es') {
    return dedupeMockLocalizedSentences(
      originalText
        .replace(/(^|[.!?]\s+)The\s+(?=[A-Z])/g, '$1')
        .replace(/\bWe are at\s+(.+?)\s+right now\.?$/i, 'Estamos en $1 ahora.')
        .replace(/\bI remember that\b/gi, 'Recuerdo que')
        .replace(/\bCould you clarify what you want to know\??/gi, 'Puedes decirlo de forma mas simple?')
        .replace(/\bI think that is enough for now\. Goodbye\./gi, 'Creo que ya basta por ahora. Adios.')
        .replace(/\bGot it\. Tell me a little more and I'?ll help where I can\./gi, 'Entiendo. Dime un poco mas y ayudo si puedo.')
        .replace(/\bA town\b/gi, 'Un pueblo')
        .replace(/\blocated on\b/gi, 'ubicado en')
        .replace(/\bfloating chunk of land\b/gi, 'trozo flotante de tierra')
        .replace(/\bthat broke off from\b/gi, 'que se desprendio de')
        .replace(/\bthe ear of the Great Head\b/gi, 'la oreja de la Gran Cabeza')
        .replace(/\bis located just outside of\b/gi, 'esta justo fuera de')
        .replace(/\bis located just outside\b/gi, 'esta justo fuera de')
        .replace(/\blocated just outside of\b/gi, 'justo fuera de')
        .replace(/\blocated just outside\b/gi, 'justo fuera de')
        .replace(/\bthe town\b/gi, 'el pueblo')
        .replace(/\bde el\b/gi, 'del'),
    );
  }

  if (targetLanguage === 'fr') {
    return originalText.replace(/\bWe are at\s+(.+?)\s+right now\.?$/i, 'Nous sommes a $1 maintenant.');
  }
  if (targetLanguage === 'de') {
    return originalText.replace(/\bWe are at\s+(.+?)\s+right now\.?$/i, 'Wir sind jetzt in $1.');
  }
  if (targetLanguage === 'it') {
    return originalText.replace(/\bWe are at\s+(.+?)\s+right now\.?$/i, 'Siamo a $1 adesso.');
  }
  if (targetLanguage === 'pt') {
    return originalText.replace(/\bWe are at\s+(.+?)\s+right now\.?$/i, 'Estamos em $1 agora.');
  }

  return originalText;
}

function createMockRuntime(): SessionRuntime {
  let loaded = false;

  function buildMockReplyParts(requestInput: unknown) {
    const input = isRecord(requestInput) ? requestInput : {};
    const npcName = normalizeOptionalString(input.npcName) ?? 'NPC';
    const playerMessage = normalizeOptionalString(input.playerMessage) ?? '';
    const queryType = normalizeOptionalString(input.turnContext?.queryType) ?? 'conversation';
    const targetLanguage = normalizeOptionalString(getPedagogyContext(input.turnContext)?.targetLanguage);
    const planClaims = Array.isArray(input.planClaims)
      ? input.planClaims.filter((entry: unknown) => isRecord(entry) && typeof entry.claimOrdinal === 'number')
      : [];

    if (planClaims.length > 0) {
      const selectedClaim = isRecord(planClaims[0]) ? planClaims[0] : null;
      const claimMode = normalizeOptionalString(selectedClaim?.mode);
      const knowledgeKind = claimMode === 'inferred' || claimMode === 'rumor' ? claimMode : 'grounded';
      const baseText = normalizeOptionalString(selectedClaim?.text)
        ?? `${npcName} knows about that.`;
      return {
        parts: [
          {
            kind: knowledgeKind,
            text: localizeMockKnowledgeText(baseText, targetLanguage),
          },
        ],
        emotion: queryType === 'self_query' ? 'warm' : 'grounded',
        intent: 'answer',
        proposedIntents: [],
        beatEvidence: {
          coveredFacts: [],
          uncoveredFacts: [],
          completionSignal: 'none',
          confidence: 0,
        },
      };
    }

    if (isKnowledgeSeekingQueryType(queryType)) {
      return {
        parts: [
          {
            kind: 'uncertain',
            text: createGroundedUncertaintyReply(
              queryType,
              normalizeOptionalString(getPedagogyContext(input?.turnContext)?.targetLanguage),
            ).utterance,
          },
        ],
        emotion: 'uncertain',
        intent: 'uncertain',
        proposedIntents: [],
        beatEvidence: {
          coveredFacts: [],
          uncoveredFacts: [],
          completionSignal: 'none',
          confidence: 0,
        },
      };
    }

    return {
      parts: [
        {
          kind: 'social',
          text: playerMessage
            ? `I heard you say: "${playerMessage}".`
            : `Hello, I am ${npcName}.`,
        },
      ],
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      beatEvidence: {
        coveredFacts: [],
        uncoveredFacts: [],
        completionSignal: 'none',
        confidence: 0,
      },
    };
  }

  function buildMockReplyAudit(requestInput: unknown) {
    const input = isRecord(requestInput) ? requestInput : {};
    const generatedTurn = isRecord(input.generatedTurn) ? input.generatedTurn : {};
    const parts = Array.isArray(generatedTurn.parts) ? generatedTurn.parts : [];
    const planClaims = Array.isArray(input.planClaims)
      ? input.planClaims.filter((entry: unknown) => isRecord(entry) && typeof entry.claimOrdinal === 'number')
      : [];
    const firstClaimOrdinal = Number.isFinite(planClaims[0]?.claimOrdinal)
      ? Math.max(1, Math.floor(Number(planClaims[0].claimOrdinal)))
      : 1;
    const partAudits = parts.map((part, index) => {
      const kind = normalizeOptionalString(part?.kind);
      if (kind === 'social' || kind === 'close' || kind === 'uncertain') {
        return {
          partIndex: index,
          role: kind,
          claimOrdinals: [],
          hedgeSufficient: true,
          notes: 'mock non-knowledge part',
        };
      }
      return {
        partIndex: index,
        role: 'knowledge',
        claimOrdinals: planClaims.length > 0 ? [firstClaimOrdinal] : [],
        hedgeSufficient: true,
        notes: 'mock matched first claim',
      };
    });
    return {
      partAudits,
      unsupportedFacts: [],
    };
  }

  async function generateJson(request: any) {
    if (!loaded) {
      throw new Error('Model must be loaded before generateStructured');
    }
    if (request?.kind === 'social-fast-realization') {
      return {
        jsonText: JSON.stringify(buildMockSocialReplyParts(request?.input ?? request)),
      };
    }
    if (request?.kind === 'grounded-reply-audit') {
      return {
        jsonText: JSON.stringify(buildMockReplyAudit(request?.input ?? request)),
      };
    }
    return {
      jsonText: JSON.stringify(buildMockReplyParts(request?.input ?? request)),
    };
  }
  return {
    name: 'mock',
    async health() {
      return { ok: true, detail: 'mock-runtime-ready' };
    },
    async loadModel() {
      loaded = true;
    },
    async generateJson(request) {
      return generateJson(request);
    },
    async generateStructured(input) {
      return generateJson({
        kind: 'draft-turn',
        input,
      });
    },
    async embed(texts) {
      return embedTextsWithLocalRuntime(Array.isArray(texts) ? texts : []);
    },
  };
}

function createLlamaRuntime(args: SessionOptions): SessionRuntime {
  const commandPath = resolveConfiguredLlamaBin(args);
  const modelPath = resolveConfiguredModelPath(args);
  const timeoutMs = Number.isFinite(args.llamaTimeoutMs) ? Math.max(1, Math.floor(args.llamaTimeoutMs)) : 120000;
  const llamaBinArgs = Array.isArray(args.llamaBinArgs) ? args.llamaBinArgs.map((entry) => String(entry)) : [];
  const llamaArgs = Array.isArray(args.llamaArgs) ? args.llamaArgs.map((entry) => String(entry)) : [];
  let loaded = false;

  async function generateJson(request: any) {
    if (!loaded) {
      throw new Error('Model must be loaded before generateStructured');
    }
    const prompt = typeof request?.prompt === 'string'
      ? request.prompt.trim()
      : '';
    if (!prompt) {
      throw new Error('Prompt must be a non-empty string');
    }

    const commandName = path.basename(commandPath);
    const isCompletionBinary = commandName === 'llama-completion';
    const attempt = Number.isFinite(request?.attempt) ? Math.max(1, Math.floor(request.attempt)) : 1;
    const temperature = normalizeOptionalString(request?.temperature)
      ?? (attempt >= 3 ? '0.95' : attempt === 2 ? '0.75' : '0.55');
    const schemaText = normalizeOptionalString(request?.schemaText) ?? REPLY_PARTS_JSON_SCHEMA;
    const maxTokens = Number.isFinite(request?.maxTokens) ? Math.max(32, Math.floor(request.maxTokens)) : 180;

    const argsForExec = [
      ...llamaBinArgs,
      '-m',
      modelPath,
      '--device',
      'none',
      '--single-turn',
      ...(isCompletionBinary ? ['--no-conversation'] : []),
      '--no-display-prompt',
      '--color',
      'off',
      '--json-schema',
      schemaText,
      '-n',
      String(maxTokens),
      '--ctx-size',
      '4096',
      '--temp',
      temperature,
      '--top-k',
      '60',
      '--top-p',
      '0.92',
      '--repeat-penalty',
      '1.15',
      '--presence-penalty',
      '0.3',
      '--frequency-penalty',
      '0.25',
      '--no-warmup',
      '-p',
      prompt,
      ...llamaArgs,
    ];

    const { stdout = '', stderr = '' } = await execFileAsync(commandPath, argsForExec, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    const combined = `${stdout}\n${stderr}`;
    const rawText = sanitizeRuntimeOutput(combined).trim();
    // Reply-parts parsing owns candidate selection. Preselecting here can
    // collapse a valid top-level reply object down to a nested JSON fragment.
    return { jsonText: rawText, rawText };
  }

  return {
    name: 'llama',
    async health() {
      if (!commandPath || !commandExists(commandPath)) {
        return { ok: false, detail: `llama binary not found: ${commandPath ?? '(missing)'}` };
      }
      if (!modelPath || !fs.existsSync(modelPath)) {
        return { ok: false, detail: `model file not found: ${modelPath ?? '(missing)'}` };
      }
      return { ok: true, detail: 'llama-runtime-ready' };
    },
    async loadModel() {
      if (!modelPath || !fs.existsSync(modelPath)) {
        throw new Error(`Model file not found: ${modelPath ?? '(missing)'}`);
      }
      loaded = true;
    },
    async generateJson(request) {
      return generateJson(request);
    },
    async generateStructured(input) {
      return generateJson({
        kind: 'draft-turn',
        prompt: buildLlamaPrompt(input),
        schemaText: REPLY_PARTS_JSON_SCHEMA,
        maxTokens: 180,
        attempt: input.attempt,
      });
    },
    async embed(texts) {
      return embedTextsWithLocalRuntime(Array.isArray(texts) ? texts : []);
    },
  };
}

function defaultPipelineDiagnostics(input: RecordLike | null | undefined): RecordLike {
  const safeInput = isRecord(input) ? input : {};
  const routeIntent = safeInput.routing?.intent ?? 'unclear';
  const policyPath = safeInput.routing?.policyPath ?? 'safe_chat';
  const queryType = safeInput.queryType ?? routeIntentToQueryType(routeIntent);
  const interpretation = isRecord(safeInput.routing?.interpretation) ? safeInput.routing.interpretation : null;
  const semantic = isRecord(safeInput.routing?.semantic) ? safeInput.routing.semantic : {};
  const loreMatchCount = Array.isArray(safeInput.loreMatches) ? safeInput.loreMatches.length : 0;
  const retrieval = isRecord(safeInput.retrieval) ? safeInput.retrieval : {};
  const missingGameLoreBundle = safeInput.missingGameLoreBundle === true;
  const retrievalAttempted = safeInput.retrievalAttempted === true
    || (missingGameLoreBundle && isKnowledgeSeekingQueryType(queryType));
  const retrievalCandidateCount = Number.isFinite(retrieval.candidateCount)
    ? Math.max(0, Math.floor(Number(retrieval.candidateCount)))
    : (retrievalAttempted ? loreMatchCount : 0);
  const retrievalSelectedCount = Number.isFinite(retrieval.selectedCount)
    ? Math.max(0, Math.floor(Number(retrieval.selectedCount)))
    : loreMatchCount;
  const validationErrors = Array.isArray(safeInput.validationErrors) ? safeInput.validationErrors : [];
  const validationDecision = normalizeOptionalString(safeInput.validationDecision)
    ?? (safeInput.usedFallback ? 'fallback' : (validationErrors.length > 0 ? 'repair' : 'accept'));
  const unsupportedClaims = Number.isFinite(safeInput.unsupportedClaims)
    ? Math.max(0, Math.floor(safeInput.unsupportedClaims))
    : 0;
  const requiresRepair = safeInput.requiresRepair === true
    || validationDecision === 'repair'
    || validationDecision === 'fallback';

  return {
    version: 'v2',
    enabled: true,
    mode: toMode(safeInput.turnContext?.interactionMode),
    routeIntent,
    policyPath,
    queryType,
    routing: {
      routeIntent,
      queryType,
      policyPath,
      interpretation: interpretation
        ? {
            lane: normalizeOptionalString(interpretation.lane),
            target: normalizeOptionalString(interpretation.target),
            facet: normalizeOptionalString(interpretation.facet),
            timeframe: normalizeOptionalString(interpretation.timeframe),
            focusText: normalizeOptionalString(interpretation.focusText),
            confidence: Number.isFinite(interpretation.confidence) ? Number(interpretation.confidence) : undefined,
            margin: Number.isFinite(interpretation.margin) ? Number(interpretation.margin) : undefined,
            ambiguous: interpretation.ambiguous === true,
            referentCount: Array.isArray(interpretation.referents) ? interpretation.referents.length : 0,
            topReferent: Array.isArray(interpretation.referents) && interpretation.referents[0]
              ? `${String(interpretation.referents[0].kind)}:${String(interpretation.referents[0].text)}`
              : undefined,
          }
        : undefined,
      semantic: {
        exemplarEnabled: semantic.exemplarEnabled === true,
        exemplarAttempted: semantic.exemplarAttempted === true,
        exemplarChanged: semantic.exemplarChanged === true,
        degradedReason: normalizeOptionalString(semantic.degradedReason),
      },
    },
    retrieval: {
      attempted: retrievalAttempted,
      candidateCount: retrievalCandidateCount,
      selectedCount: retrievalSelectedCount,
      lexicalCandidateCount: Number.isFinite(retrieval.lexicalCandidateCount)
        ? Math.max(0, Math.floor(Number(retrieval.lexicalCandidateCount)))
        : undefined,
      vectorCandidateCount: Number.isFinite(retrieval.vectorCandidateCount)
        ? Math.max(0, Math.floor(Number(retrieval.vectorCandidateCount)))
        : undefined,
      mergedCandidateCount: Number.isFinite(retrieval.mergedCandidateCount)
        ? Math.max(0, Math.floor(Number(retrieval.mergedCandidateCount)))
        : undefined,
      qualityPath: missingGameLoreBundle
        ? 'error'
        : normalizeOptionalString(retrieval.qualityPath)
          ?? (retrievalAttempted ? (retrievalSelectedCount > 0 ? 'single_pass' : 'abstain') : 'not_required'),
      qualityReason: missingGameLoreBundle
        ? 'missing_game_lore_bundle'
        : normalizeOptionalString(retrieval.qualityReason)
          ?? (retrievalAttempted ? (retrievalSelectedCount > 0 ? 'lore-selected' : 'no-lore-selected') : 'not_required'),
      qualityGatePassed: retrieval.qualityGatePassed === true,
      correctiveAttempted: retrieval.correctiveAttempted === true,
      embeddingAvailable: retrieval.embeddingAvailable === true,
      degradedReason: normalizeOptionalString(retrieval.degradedReason),
      vectorModelId: normalizeOptionalString(retrieval.vectorModelId),
    },
    initiative: {
      decision: {
        initiator: 'npc',
        action: 'player_respond',
        primaryGoal: routeIntent === 'social_chat' ? 'social_goal' : 'character_goal',
        secondaryGoals: [policyPath],
        expectedPlayerResponseType: 'free_text',
        reason: `route:${routeIntent}`,
        policyBounded: true,
      },
      inputs: {
        topicCoverage: isRecord(safeInput.turnContext?.topicCoverage) ? safeInput.turnContext.topicCoverage : undefined,
      },
      bounds: {},
      goalStack: [],
    },
    groundingDecision: validationDecision,
    fallbackReason: safeInput.usedFallback ? 'generation-fallback' : undefined,
    validation: {
      decision: validationDecision,
      errors: validationErrors,
      unsupportedClaims,
      requiresRepair,
      source: 'npc_output',
      npcOutputValidated: true,
      progressionGateEvaluated: false,
    },
    generation: isRecord(safeInput.generation) ? safeInput.generation : createGenerationDiagnostics(),
  };
}

function mergeTurnContext(base: unknown, override: unknown): RecordLike {
  const left = isRecord(base) ? base : {};
  const right = isRecord(override) ? override : {};
  const merged = {
    ...left,
    ...right,
  };
  if (isRecord(left.topicCoverage) || isRecord(right.topicCoverage)) {
    merged.topicCoverage = {
      ...(isRecord(left.topicCoverage) ? left.topicCoverage : {}),
      ...(isRecord(right.topicCoverage) ? right.topicCoverage : {}),
    };
  }
  return merged;
}

const DEFAULT_SESSION_OPTIONS: SessionOptions = {
  npc: 'baker',
  provider: 'local',
  runtime: 'llama',
  session: null,
  loreDir: 'src/plugins/sugaragent/lore/generated',
  useLore: true,
  missingGameLoreBundle: false,
  llamaBin: null,
  modelPath: null,
  llamaTimeoutMs: 120000,
  llamaBinArgs: [],
  llamaArgs: [],
  turnContext: null,
  requireLoreScopeForRetrieval: false,
};

function normalizeSessionOptions(options: RecordLike = {}): SessionOptions {
  const normalized = {
    ...DEFAULT_SESSION_OPTIONS,
    ...options,
  } as SessionOptions;
  // The session runtime does not currently load packed SugarAgent authoring artifacts.
  // Preview callers must pass resolved npcProfile/globalSafetyBounds from the host/plugin layer.
  if (typeof normalized.npc !== 'string' || normalized.npc.trim().length === 0) {
    throw new Error('Invalid npc value.');
  }
  if (normalized.provider !== 'local' && normalized.provider !== 'echo') {
    throw new Error('Invalid provider. Use "local" or "echo".');
  }
  normalized.npc = normalized.npc.trim();
  normalized.useLore = normalized.useLore !== false;
  normalized.llamaTimeoutMs = Number.isFinite(normalized.llamaTimeoutMs)
    ? Math.max(1, Math.floor(normalized.llamaTimeoutMs))
    : 120000;
  normalized.llamaBinArgs = Array.isArray(normalized.llamaBinArgs) ? normalized.llamaBinArgs : [];
  normalized.llamaArgs = Array.isArray(normalized.llamaArgs) ? normalized.llamaArgs : [];
  return normalized;
}

function createEchoReply(message: string): SugarAgentTurnOutput {
  return {
    utterance: `Echo: ${message}`,
    emotion: 'neutral',
    intent: 'echo',
    proposedIntents: [],
    citations: [],
    beatEvidence: {
      coveredFacts: [],
      uncoveredFacts: [],
      completionSignal: 'none',
      confidence: 0,
    },
  };
}

function didSemanticInterpretationChange(
  baseRouting: RoutingResult,
  enhancedRouting: RoutingResult,
): boolean {
  const baseInterpretation = isRecord(baseRouting?.interpretation) ? baseRouting.interpretation : null;
  const enhancedInterpretation = isRecord(enhancedRouting?.interpretation) ? enhancedRouting.interpretation : null;
  if ((baseRouting?.intent ?? 'unclear') !== (enhancedRouting?.intent ?? 'unclear')) {
    return true;
  }
  if (!baseInterpretation || !enhancedInterpretation) {
    return false;
  }
  return (
    normalizeOptionalString(baseInterpretation.lane) !== normalizeOptionalString(enhancedInterpretation.lane)
    || normalizeOptionalString(baseInterpretation.target) !== normalizeOptionalString(enhancedInterpretation.target)
    || normalizeOptionalString(baseInterpretation.facet) !== normalizeOptionalString(enhancedInterpretation.facet)
    || normalizeOptionalString(baseInterpretation.timeframe) !== normalizeOptionalString(enhancedInterpretation.timeframe)
  );
}

export async function createSugarAgentSession(options: RecordLike = {}) {
  const args = normalizeSessionOptions(options);
  const runtimeMode = resolveRuntimeMode(args);
  const sessionId = normalizeOptionalString(args.session) ?? `preview-default-${args.npc}`;
  const session = loadSessionState(sessionId);
  const loreArtifacts = args.useLore ? loadLoreArtifacts(args.loreDir) : null;
  const runtime = runtimeMode === 'llama'
    ? createLlamaRuntime(args)
    : createMockRuntime();
  let modelLoaded = false;

  const runtimeHealth = await runtime.health();
  if (!runtimeHealth.ok && runtimeMode === 'llama') {
    throw new Error(`Local runtime health check failed: ${runtimeHealth.detail ?? 'unknown error'}`);
  }

  const baseTurnContext = isRecord(args.turnContext) ? args.turnContext : {};

  async function ensureModelLoaded() {
    if (modelLoaded) return;
    await runtime.loadModel('chat-fast');
    modelLoaded = true;
  }

  return {
    startup: {
      runtime: {
        mode: runtimeMode,
        health: runtimeHealth,
      },
      session: {
        id: sessionId,
        loaded: session.loaded,
        pathToFile: session.pathToFile,
      },
      lore: {
        loaded: Boolean(loreArtifacts),
        chunkCount: Array.isArray(loreArtifacts?.chunks) ? loreArtifacts.chunks.length : 0,
        dir: path.resolve(args.loreDir),
      },
    },
    async runTurn(playerMessage: unknown, turnOptions: RecordLike = {}) {
      const message = normalizeOptionalString(playerMessage);
      if (!message) {
        throw new Error('playerMessage must be a non-empty string');
      }

      const turnOptionsRecord: RecordLike = isRecord(turnOptions) ? turnOptions : {};
      const npcName = normalizeOptionalString(turnOptionsRecord.npcName) ?? args.npc;
      const npcProfile = isRecord(turnOptionsRecord.npcProfileOverride ?? turnOptionsRecord.npcProfile)
        ? (turnOptionsRecord.npcProfileOverride ?? turnOptionsRecord.npcProfile)
        : {};
      const globalSafetyBounds = dedupeMergeStringArrays(
        turnOptionsRecord.globalSafetyBoundsOverride,
        turnOptionsRecord.globalSafetyBounds,
      );

      const npcSessionState = session.state.npcs[args.npc];
      const history = Array.isArray(npcSessionState?.history) ? npcSessionState.history.slice(-MAX_HISTORY_ENTRIES) : [];
      const memoryFacts = getSessionFactsForNpc(session, args.npc);
      const priorPlayerTurns = countPlayerTurns(history);
      const topicCoverageContext = buildTurnTopicCoverageContext(
        getSessionTopicCoverageForNpc(session, args.npc),
        message,
      ) ?? undefined;
      const recentReferentPreview = buildRecentReferentPreview(
        getSessionReferentsForNpc(session, args.npc),
        message,
        {
          activeTopic: topicCoverageContext?.activeTopic ?? null,
        },
      );
      const derivedContext = {
        isFirstMeeting: priorPlayerTurns === 0,
        turnIndexWithNpc: priorPlayerTurns + 1,
        ...(topicCoverageContext ? { topicCoverage: topicCoverageContext } : {}),
      };
      const turnContext = mergeTurnContext(
        mergeTurnContext(baseTurnContext, turnOptionsRecord.context),
        derivedContext,
      );
      const targetLanguage = normalizeOptionalString(getPedagogyContext(turnContext)?.targetLanguage);

      const loreEntityHints = collectLoreEntityRouteMatches(message, loreArtifacts);
      let semanticDiagnostics = {
        exemplarEnabled: true,
        exemplarAttempted: false,
        exemplarChanged: false,
        degradedReason: undefined as string | undefined,
      };
      const interpretationPreview = buildEvidencePreview({
        selfEntityId: npcProfile?.selfEntityId,
        regionName: normalizeOptionalString(turnContext?.regionName),
        regionPath: normalizeOptionalString(turnContext?.regionPath),
        currentActivity: normalizeOptionalString(turnContext?.currentActivity),
        currentGoal: normalizeOptionalString(turnContext?.currentGoal),
        activeTopic: topicCoverageContext?.activeTopic ?? undefined,
        recentReferents: recentReferentPreview,
        loreScopes: normalizeStringArray(npcProfile?.loreScopes),
        selfLoreScopes: normalizeStringArray(npcProfile?.selfLoreScopes),
        relatedLoreScopes: normalizeStringArray(npcProfile?.relatedLoreScopes),
        entityIds: loreEntityHints
          .filter((entry) => entry.filterKind === 'entityIds')
          .map((entry) => entry.entityId),
        locationIds: loreEntityHints
          .filter((entry) => entry.filterKind === 'locationIds')
          .map((entry) => entry.entityId),
        tagHints: loreEntityHints.map((entry) => entry.matchedText),
      });
      const baseRouting = routeTurnIntent(message, npcName, {
        targetLanguage,
        history,
        scene: {
          regionName: normalizeOptionalString(turnContext?.regionName),
          regionPath: normalizeOptionalString(turnContext?.regionPath),
          currentActivity: normalizeOptionalString(turnContext?.currentActivity),
          currentGoal: normalizeOptionalString(turnContext?.currentGoal),
        },
        loreEntityHints,
        evidencePreview: interpretationPreview,
      });
      let embeddingDegradedReason: string | null = null;
      let interpretedRouting = baseRouting;
      // Phase B closed with exemplar-assisted interpretation as the default
      // semantic path. Degraded lexical-only scoring is fallback behavior only
      // when embeddings fail or are unavailable; it is not an alternate main
      // path and should stay observable in logs/diagnostics.
      if (baseRouting.interpretation) {
        semanticDiagnostics.exemplarAttempted = true;
        try {
          const enhancedRouting = routeTurnIntentFromInterpretation(
            message,
            await enhanceInterpretationWithFacetSimilarity({
              interpretation: baseRouting.interpretation,
              embedTexts: (texts) => runtime.embed(texts),
            }),
            {
              targetLanguage,
              explicitLoreMatchCount: loreEntityHints.length,
            },
          );
          semanticDiagnostics.exemplarChanged = didSemanticInterpretationChange(baseRouting, enhancedRouting);
          interpretedRouting = enhancedRouting;
        } catch (error) {
          embeddingDegradedReason = error instanceof Error ? error.message : String(error);
          semanticDiagnostics.degradedReason = embeddingDegradedReason;
        }
      }
      const routingRefinement = refineRouteWithLoreEntityMentions({
        route: interpretedRouting,
        playerMessage: message,
        loreArtifacts,
      });
      const resolvedRouting = routingRefinement.route;
      const queryType: QueryType = (() => {
        const explicit = normalizeOptionalString(turnContext.queryType);
        return explicit === 'conversation'
          || explicit === 'self_query'
          || explicit === 'other_query'
          || explicit === 'world_query'
          || explicit === 'mixed_query'
          ? explicit
          : routeIntentToQueryType(resolvedRouting.intent);
      })();
      turnContext.queryType = queryType;
      turnContext.routingIntent = resolvedRouting.intent;
      turnContext.routingPolicyPath = resolvedRouting.policyPath;
      const generationDiagnostics = createGenerationDiagnostics();

      if (args.provider === 'echo') {
        const output = createEchoReply(message);
        generationDiagnostics.draft.skippedReason = 'echo_provider';
        generationDiagnostics.replyParts.skippedReason = 'echo_provider';
        applyTurnToSession(session, args.npc, message, output.utterance, {
          referentCandidates: buildTurnReferentCandidates({
            playerMessage: message,
            targetLanguage,
            npcName,
            activeTopic: topicCoverageContext?.activeTopic ?? null,
            sceneRegionName: normalizeOptionalString(turnContext?.regionName),
            sceneRegionPath: normalizeOptionalString(turnContext?.regionPath),
            loreEntityHints,
            interpretation: resolvedRouting.interpretation,
          }),
          activeTopic: topicCoverageContext?.activeTopic ?? null,
        });
        return {
          output,
          attempts: 1,
          usedFallback: false,
          validationErrors: [],
          loreMatches: [],
          routing: resolvedRouting,
          pipeline: defaultPipelineDiagnostics({
            routing: {
              ...resolvedRouting,
              semantic: semanticDiagnostics,
            },
            queryType,
            loreMatches: [],
            retrievalAttempted: false,
            retrieval: embeddingDegradedReason
              ? {
                  embeddingAvailable: false,
                  degradedReason: embeddingDegradedReason,
                  vectorModelId: LOCAL_EMBEDDING_MODEL_ID,
                }
              : undefined,
            missingGameLoreBundle: args.missingGameLoreBundle === true,
            usedFallback: false,
            validationErrors: [],
            turnContext,
            generation: generationDiagnostics,
          }),
          grounding: {
            summary: {
              decision: 'accept',
              unsupportedCount: 0,
            },
          },
        };
      }

      const loreScopes = normalizeStringArray(npcProfile?.loreScopes);
      const selfLoreScopes = normalizeStringArray(npcProfile?.selfLoreScopes);
      const relatedLoreScopes = normalizeStringArray(npcProfile?.relatedLoreScopes);
      const hasScopes = loreScopes.length > 0 || selfLoreScopes.length > 0 || relatedLoreScopes.length > 0;
      const requireScopes = args.requireLoreScopeForRetrieval === true;
      const canRetrieveLore = Boolean(loreArtifacts);
      const shouldAttemptLoreRetrieval = canRetrieveLore
        && (
          isKnowledgeSeekingQueryType(queryType)
          || routeIntentUsesLore(resolvedRouting.intent)
          || resolvedRouting.interpretation?.lane === 'knowledge'
        )
        && (!requireScopes || hasScopes);

      const governedRetrieval = await runGovernedLoreRetrieval({
        loreArtifacts,
        canRetrieveLore,
        shouldAttemptLoreRetrieval,
        playerMessage: message,
        interpretation: resolvedRouting.interpretation,
        mode: toMode(turnContext?.interactionMode),
        routingIntent: resolvedRouting.intent,
        queryType,
        activeBeatId: normalizeOptionalString(turnOptionsRecord.beatContract?.beatId),
        loreScopes,
        selfLoreScopes,
        relatedLoreScopes,
        selfEntityId: npcProfile.selfEntityId,
        hasBeatContract: Boolean(turnOptionsRecord.beatContract),
        rerankCache: undefined,
        artifactVersion: undefined,
        modelVersion: LOCAL_EMBEDDING_MODEL_ID,
        rerankerClass: 'lexical',
        retrievalFilters: routingRefinement.retrievalFilters,
        embedTexts: (texts) => runtime.embed(texts),
      });
      const retrieval = {
        attempted: governedRetrieval.governance.attempted,
        matches: governedRetrieval.loreMatches,
        quality: governedRetrieval.retrievalQuality,
        governance: governedRetrieval.governance,
        embeddingDegradedReason,
      };
      const groundingEvidenceEntries = buildGroundingEvidenceEntries({
        loreMatches: retrieval.matches,
        loreArtifacts,
        npcId: args.npc,
        npcName,
        npcProfile,
        selfEntityId: npcProfile.selfEntityId,
        memoryFacts,
        playerMessage: message,
        history,
        regionPath: turnContext?.regionPath,
        regionName: turnContext?.regionName,
        currentActivity: turnContext?.currentActivity,
        currentGoal: turnContext?.currentGoal,
      });
      // ---------------------------------------------------------------
      // Evidence-first pipeline (ADR-SA-025)
      // Knowledge turns create and validate a plan before any LLM call.
      // The LLM generation loop below is used as the realization transport
      // for already-validated plans, or as fallback for social turns.
      // ---------------------------------------------------------------
      const mode = toMode(turnContext?.interactionMode);
      const hasBeatContract = Boolean(turnOptionsRecord.beatContract);
      const resolvedMode = resolveConversationMode(turnContext, hasBeatContract);
      const evidencePackForPipeline = buildEvidencePack({
        evidenceEntries: groundingEvidenceEntries,
        loreMatches: retrieval.matches,
        mode: resolvedMode,
        playerMessage: message,
        queryType,
        routing: resolvedRouting,
        selfEntityId: npcProfile.selfEntityId,
        npcId: args.npc,
      });
      const enrichedEvidencePack = enrichEvidencePackWithEpistemics(
        evidencePackForPipeline,
        turnOptionsRecord.beatContract,
      );
      const snapshot = buildNpcStateSnapshot({
        npcId: args.npc,
        npcName,
        selfEntityId: npcProfile.selfEntityId,
        mode: resolvedMode,
        locationId: normalizeOptionalString(turnContext?.regionName)
          ?? normalizeOptionalString(turnContext?.regionPath),
        currentActivity: normalizeOptionalString(turnContext?.currentActivity),
        currentGoal: normalizeOptionalString(turnContext?.currentGoal),
        activeBeatId: normalizeOptionalString(turnOptionsRecord.beatContract?.beatId),
      });

      // Resolve initiative policy
      const playerHasQuestion = hasLikelyQuestionForm(message);
      const turnIndexWithNpc = derivedContext.turnIndexWithNpc;
      const noveltyState = computeNoveltyState({
        history,
        turnIndexWithNpc,
        routingIntent: resolvedRouting.intent,
        topicCoverage: topicCoverageContext,
        playerMessage: message,
        normalizeForEchoCheck: (text: string) => sanitizePromptText(text).toLowerCase(),
        maxNovelty: 0.34,
      });
      const relevantEvidenceItems = enrichedEvidencePack.items.filter((item) => isEvidenceItemRelevantForTurn(item, {
        queryType,
        routeIntent: resolvedRouting.intent,
        selfEntityId: npcProfile.selfEntityId,
        npcId: args.npc,
      }));
      const hasDirectAnswerEvidence = hasDirectAnswerableStateEvidence(
        relevantEvidenceItems,
        resolvedRouting.interpretation ?? message,
      );

      const initiativePolicy = resolveInitiativePolicy({
        mode: resolvedMode,
        routingIntent: resolvedRouting.intent,
        queryType,
        interpretation: resolvedRouting.interpretation,
        playerMessage: message,
        playerHasQuestion,
        turnIndexWithNpc,
        noveltyState,
        beatContract: turnOptionsRecord.beatContract,
        hasEvidence: relevantEvidenceItems.length > 0,
        hasDirectAnswerEvidence,
        retrievalConfidence: computeEvidenceBackedRetrievalConfidence({
          queryType,
          routeIntent: resolvedRouting.intent,
          retrievalMatches: retrieval.matches,
          evidenceItems: relevantEvidenceItems,
        }),
        isFirstMeeting: derivedContext.isFirstMeeting,
      });

      // Resolve delivery-language context from Sugarlang pedagogy first,
      // then fall back to any SugarAgent-local language model if present.
      const adaptationContext = buildSugarlangLanguageAdaptationContext(getPedagogyContext(turnContext))
        ?? await resolveLanguageAdaptationContext(null, null);
      snapshot.deliveryLanguageContext = adaptationContext;

      // Run the evidence-first pipeline
      const efResult = await runEvidenceFirstPipeline({
        playerMessage: message,
        routing: resolvedRouting,
        snapshot,
        evidencePack: evidencePackForPipeline,
        initiativePolicy,
        beatContract: turnOptionsRecord.beatContract,
        adaptationContext,
        loreEntityIds: routingRefinement.loreEntityIds,
      });

      let efOutput = efResult.output;
      let efPlanAcceptable = efResult.validatedPlan?.acceptable !== false;
      const validationErrors = Array.isArray(efResult.validatedPlan?.errors)
        ? [...efResult.validatedPlan.errors]
        : [];
      const validatedPlan = efResult.validatedPlan?.plan ?? efResult.plan;
      const groundedTurn = efResult.turnRouting?.path === 'grounded';
      const socialFastTurn = efResult.turnRouting?.path === 'social_fast';
      const canUseModelRealization = groundedTurn
        && efPlanAcceptable
        && validatedPlan
        && (
          validatedPlan.speechAct === 'answer'
          || validatedPlan.speechAct === 'recall'
          || validatedPlan.speechAct === 'chat'
        );

      if (canUseModelRealization) {
        const realized = await realizeValidatedPlanWithReplyPartsTransport({
          runtime,
          ensureModelLoaded,
          npcName,
          playerMessage: message,
          queryType,
          routeIntent: resolvedRouting.intent,
          plan: validatedPlan,
          evidencePack: enrichedEvidencePack,
          evidenceEntries: groundingEvidenceEntries,
          selfEntityId: npcProfile.selfEntityId,
          npcId: args.npc,
          turnContext,
          generationDiagnostics,
        });

        if (realized) {
          efOutput = realized;
          efResult.diagnostics.semanticVerification = undefined;
          efResult.diagnostics.deterministicFallbackUsed = false;
        } else {
          efResult.diagnostics.deterministicFallbackUsed = true;
          const replyPartsFailureReason = normalizeOptionalString(generationDiagnostics.replyParts.failureReason);
          if (replyPartsFailureReason) {
            validationErrors.push(replyPartsFailureReason);
          }
        }
      } else if (socialFastTurn) {
        const realized = await realizeSocialFastWithReplyPartsTransport({
          runtime,
          ensureModelLoaded,
          npcName,
          playerMessage: message,
          history,
          memoryFacts,
          npcProfile,
          globalSafetyBounds,
          turnContext,
          isFirstMeeting: derivedContext.isFirstMeeting,
          generationDiagnostics,
        });
        if (realized) {
          efOutput = realized;
          efResult.diagnostics.deterministicFallbackUsed = false;
        } else {
          efResult.diagnostics.deterministicFallbackUsed = true;
          const replyPartsFailureReason = normalizeOptionalString(generationDiagnostics.replyParts.failureReason);
          if (replyPartsFailureReason) {
            validationErrors.push(replyPartsFailureReason);
          }
        }
      } else {
        generationDiagnostics.replyParts.skippedReason = generationDiagnostics.replyParts.skippedReason ?? 'deterministic-plan';
      }
      const enforcedTargetLanguage = normalizeLanguageCode(adaptationContext?.targetLanguage);
      if (
        groundedTurn
        && enforcedTargetLanguage
        && enforcedTargetLanguage !== 'en'
      ) {
        const deliveryEstimate = estimateTextLanguage(efOutput.utterance, enforcedTargetLanguage);
        if (deliveryEstimate.mismatchSuspected) {
          const mismatchReason = `delivery-language-mismatch:${deliveryEstimate.estimatedLanguage}`;
          validationErrors.push(mismatchReason);
          generationDiagnostics.replyParts.failureReason = generationDiagnostics.replyParts.failureReason ?? mismatchReason;
          efOutput = createGroundedUncertaintyReply(queryType, adaptationContext?.targetLanguage);
          efResult.diagnostics.deterministicFallbackUsed = true;
          emitPlanRealizationStatusLog({
            stage: 'fallback-enforced',
            strategy: 'target_language_guardrail',
            attempt: generationDiagnostics.replyParts.attemptCount,
            turnContext,
            npcId: args.npc,
            routeIntent: resolvedRouting.intent,
            queryType,
            turnPath: efResult.turnRouting?.path,
            estimatedLanguage: deliveryEstimate.estimatedLanguage,
            mismatchSuspected: deliveryEstimate.mismatchSuspected,
            failureReason: mismatchReason,
            allowedClaimOrdinals: generationDiagnostics.replyParts.allowedClaimOrdinals,
            acceptedClaimOrdinals: generationDiagnostics.replyParts.acceptedClaimOrdinals,
            allowedSupportSlots: generationDiagnostics.replyParts.allowedSupportSlots,
            validationMode: generationDiagnostics.replyParts.verificationMode,
          });
        }
      }
      efResult.diagnostics.deliveryLanguageContextApplied = (adaptationContext ?? null) != null;

      const acceptedPlan = validatedPlan ?? {
        claims: [],
        memoryWrites: [],
      };
      const persistedMemoryWrites = [
        ...filterMemoryWrites({ plan: acceptedPlan }),
        ...extractNpcCommitments(efOutput.utterance, acceptedPlan),
      ];
      emitReplyLanguageDebugLog({
        stage: 'delivered-turn',
        turnContext,
        npcId: args.npc,
        routeIntent: resolvedRouting.intent,
        queryType,
        turnPath: efResult.turnRouting?.path,
        replyText: efOutput.utterance,
      });
      const persistedReferentCandidates = buildTurnReferentCandidates({
        playerMessage: message,
        targetLanguage,
        npcName,
        activeTopic: topicCoverageContext?.activeTopic ?? null,
        sceneRegionName: normalizeOptionalString(turnContext?.regionName),
        sceneRegionPath: normalizeOptionalString(turnContext?.regionPath),
        loreEntityHints,
        interpretation: resolvedRouting.interpretation,
      });

      applyTurnToSession(session, args.npc, message, efOutput.utterance, {
        memoryWrites: persistedMemoryWrites,
        referentCandidates: persistedReferentCandidates,
        activeTopic: topicCoverageContext?.activeTopic ?? null,
      });

      validationErrors.sort();
      const dedupedValidationErrors = validationErrors.filter((entry, index, entries) => entries.indexOf(entry) === index);
      const usedFallback = efResult.diagnostics.deterministicFallbackUsed === true || efPlanAcceptable === false;

      const pipeline = defaultPipelineDiagnostics({
        routing: {
          ...resolvedRouting,
          semantic: semanticDiagnostics,
        },
        queryType,
        loreMatches: retrieval.matches,
        retrieval: {
          attempted: retrieval.attempted,
          candidateCount: retrieval.governance.candidateCount,
          selectedCount: retrieval.governance.selectedCount,
          lexicalCandidateCount: retrieval.governance.lexicalCandidateCount,
          vectorCandidateCount: retrieval.governance.vectorCandidateCount,
          mergedCandidateCount: retrieval.governance.mergedCandidateCount,
          qualityPath: retrieval.governance.qualityPath,
          qualityReason: retrieval.governance.qualityReason,
          qualityGatePassed: retrieval.governance.qualityGatePassed,
          correctiveAttempted: retrieval.governance.correctiveAttempted,
          embeddingAvailable: retrieval.governance.embeddingAvailable,
          degradedReason: retrieval.governance.degradedReason ?? retrieval.embeddingDegradedReason ?? undefined,
          vectorModelId: LOCAL_EMBEDDING_MODEL_ID,
        },
        retrievalAttempted: retrieval.attempted,
        missingGameLoreBundle: args.missingGameLoreBundle === true,
        usedFallback,
        validationErrors: dedupedValidationErrors,
        validationDecision: usedFallback ? 'fallback' : (efPlanAcceptable ? 'accept' : 'repair'),
        unsupportedClaims: efResult.validatedPlan?.droppedClaims?.length ?? 0,
        requiresRepair: usedFallback || !efPlanAcceptable,
        turnContext,
        generation: generationDiagnostics,
      });
      pipeline.retrievalQuality = retrieval.quality;
      pipeline.evidenceFirst = efResult.diagnostics;
      pipeline.evidenceFirst.retrievalGovernance = retrieval.governance;
      pipeline.version = 'evidence_first_v1';

      return {
        output: efOutput,
        attempts: generationDiagnostics.replyParts.attemptCount,
        usedFallback,
        fallbackKind: usedFallback ? 'deterministic_runtime' : undefined,
        validationErrors: dedupedValidationErrors,
        loreMatches: retrieval.matches,
        routing: resolvedRouting,
        pipeline,
        grounding: {
          summary: {
            decision: usedFallback ? 'fallback' : (efPlanAcceptable ? 'accept' : 'repair'),
            unsupportedCount: efResult.validatedPlan?.droppedClaims?.length ?? 0,
          },
        },
      };
    },
  };
}
