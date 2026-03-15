/**
 * @file session/runtime.ts
 * @description SugarAgent preview-session runtime for Vite middleware.
 * @publicSurface createSugarAgentSession
 * @privateDetails Local llama invocation, prompt construction, lore retrieval, and persisted preview session state.
 * @see ../../docs/api/plugins/sugaragent/17-sugaragent-session-runtime.md
 */

// @ts-nocheck

import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import {
  loadLoreArtifacts,
} from '../lore/lore-lib';
import {
  DEFAULT_MODEL_PROFILE,
  getModelProfile,
} from '../runtime/model-profiles';
import {
  isKnowledgeSeekingQueryType,
  refineRouteWithLoreEntityMentions,
  routeIntentToQueryType,
  routeIntentUsesLore,
  routeTurnIntent,
} from './core/routing';
import {
  applyTurnToSession,
  buildTurnTopicCoverageContext,
  countPlayerTurns,
  getSessionFactsForNpc,
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
  buildSupportSlotsFromGroundingEvidence,
  filterSupportSlotsForQueryType,
  materializeTurnOutputFromReplyParts,
  normalizeReplyPartsForValidation,
  parseReplyPartsResponseDetailed,
} from './core/grounding/reply-parts';
import {
  buildReplyPartsValidationRepairReason,
  validateReplyPartsContract,
} from './core/grounding/reply-parts-validator';
import {
  createGroundedUncertaintyReply,
} from './core/turn-realization';
import {
  runEvidenceFirstPipeline,
  buildNpcStateSnapshot,
  enrichEvidencePackWithEpistemics,
  hasDirectAnswerableStateEvidence,
  isEvidenceItemRelevantForTurn,
} from './core/evidence-first-pipeline';
import {
  resolveLanguageAdaptationContext,
} from './core/language-adaptation';
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
  verifyRealizationAgainstPlan,
} from './core/semantic/verification';
import {
  extractDeclaredIdentityName,
  isLikelyGreetingOnlyMessage,
  validateTurnQuality,
} from './core/turn-quality';
import {
  checkSocialResponseForFactualLeakage,
} from './core/turn-path-routing';

const execFileAsync = promisify(execFile);
const BUNDLE_ROOT = path.resolve('src/plugins/sugaragent/runtime/bundle');
const BUNDLE_LOCK_PATH = path.join(BUNDLE_ROOT, 'bundle.lock.json');
const DEFAULT_BUNDLED_LLAMA_BIN = path.resolve('src/plugins/sugaragent/runtime/bundle/bin/llama-completion');
const LEGACY_BUNDLED_MODEL_PATH = path.join(BUNDLE_ROOT, 'models', 'qwen2.5-0.5b-instruct-q2_k.gguf');

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const items = [];
  for (const entry of value) {
    const normalized = normalizeOptionalString(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    items.push(normalized);
  }
  return items;
}

function dedupeMergeStringArrays(...sources) {
  return normalizeStringArray(sources.flatMap((entry) => (Array.isArray(entry) ? entry : [])));
}

function sanitizePromptText(text) {
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

function commandExists(command) {
  if (!command) return false;
  if (command.includes('/') || command.startsWith('.')) {
    return fs.existsSync(command);
  }
  const lookup = spawnSync('which', [command], { encoding: 'utf8' });
  return lookup.status === 0;
}

function sanitizeRuntimeOutput(text) {
  const source = text ?? '';
  const withoutAnsi = source
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001B\][^\u0007]*(\u0007|\u001B\\)/g, '');
  return withoutAnsi.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function computeEvidenceBackedRetrievalConfidence(input) {
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

function parseReplyPartsTurnFromText(text) {
  if (typeof text !== 'string' || text.trim().length === 0) return null;
  return parseReplyPartsResponseDetailed(text).turn;
}

function buildValidatedPlanSupportSlots(input) {
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

function buildPlanBoundReplyPartsPrompt(input) {
  const basePrompt = buildReplyPartsPrompt({
    npcName: input.npcName,
    playerMessage: input.playerMessage,
    queryType: input.queryType,
    routeIntent: input.routeIntent,
    supportSlots: input.supportSlots,
  });
  const plan = isRecord(input.plan) ? input.plan : {};
  const claims = Array.isArray(plan.claims) ? plan.claims : [];
  const planLines = [
    'Validated plan:',
    `- Speech act: ${sanitizePromptText(plan.speechAct || 'chat')}`,
    `- Route intent: ${sanitizePromptText(plan.routeIntent || input.routeIntent || 'unknown')}`,
  ];

  if (claims.length === 0) {
    planLines.push('- No factual claims are allowed in this reply.');
  } else {
    planLines.push('- Allowed factual claims:');
    claims.slice(0, 4).forEach((claim, index) => {
      const evidenceIds = Array.isArray(claim?.evidenceIds) ? claim.evidenceIds.join(', ') : '';
      const mode = sanitizePromptText(claim?.mode || 'grounded');
      const requiredHedge = sanitizePromptText(claim?.requiredHedge || 'none');
      const text = sanitizePromptText(claim?.text || '');
      planLines.push(`  ${index + 1}. [mode=${mode}; hedge=${requiredHedge}] ${text}${evidenceIds ? ` [evidence=${evidenceIds}]` : ''}`);
    });
  }

  planLines.push('You may paraphrase or combine the allowed claims, but you must not add new facts.');
  planLines.push('Preserve certainty level exactly:');
  planLines.push('- grounded: no hedge required');
  planLines.push('- inferred: use a soft hedge such as "I think" or "it seems"');
  planLines.push('- rumor: use a strong hedge such as "I heard" or "people say"');
  planLines.push('If the validated plan is uncertain, return an uncertain part instead of guessing.');

  return `${basePrompt}\n${planLines.join('\n')}`;
}

function buildSocialFastReplyPartsPrompt(input) {
  const npcName = input?.npcName;
  const playerMessage = input?.playerMessage;
  const turnContext = isRecord(input?.turnContext)
    ? {
      ...input.turnContext,
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
    'Keep the visible reply concise: 1 to 2 short sentences.',
    'Prefer exactly one social part unless a second social part helps the flow.',
    'Do not use grounded parts.',
    'Do not use uncertain parts.',
    'Do not invent world facts, quest facts, location facts, or private player facts.',
    'Do not dump biography or backstory unless the player directly asks.',
    'If the player greets you, greet them naturally.',
    'If the player introduces themselves, acknowledge that naturally.',
    'Avoid generic filler like "Tell me more", "What can I help with?", or "Could you clarify?" unless it is truly necessary.',
    buildGlobalSafetyBlock(input?.globalSafetyBounds),
    buildNpcProfileBlock(input?.npcProfile),
    buildTurnContextBlock(turnContext),
    buildMemoryFactBlock(input?.memoryFacts),
    buildHistoryBlock(input?.history),
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

async function realizeValidatedPlanWithReplyPartsTransport(input) {
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
  } = input;

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

  await ensureModelLoaded();
  generationDiagnostics.draft.attempted = true;
  generationDiagnostics.replyParts.attempted = true;
  generationDiagnostics.replyParts.allowedSupportSlots = allowedSupportSlots.map((slot) => slot.slotId);

  const prompt = buildPlanBoundReplyPartsPrompt({
    npcName,
    playerMessage,
    queryType,
    routeIntent,
    plan,
    supportSlots: allowedSupportSlots,
  });
  const generated = await runtime.generateJson({
    kind: 'validated-plan-realization',
    prompt,
    schemaText: REPLY_PARTS_JSON_SCHEMA,
    maxTokens: 180,
    attempt: 1,
    input: {
      npcName,
      playerMessage,
      supportSlots: allowedSupportSlots,
      turnContext: {
        queryType,
        routeIntent,
      },
    },
  });

  const replyPartsSourceText = typeof generated.rawText === 'string' && generated.rawText.trim().length > 0
    ? generated.rawText
    : generated.jsonText;
  generationDiagnostics.replyParts.rawResponsePreview = sanitizePromptText(replyPartsSourceText).slice(0, 320);

  const parsed = parseReplyPartsTurnFromText(replyPartsSourceText);
  if (!parsed) {
    generationDiagnostics.draft.success = false;
    generationDiagnostics.draft.failureReason = 'reply-parts-invalid-json';
    generationDiagnostics.replyParts.success = false;
    generationDiagnostics.replyParts.failureReason = 'invalid_json';
    return null;
  }

  const normalized = normalizeReplyPartsForValidation({
    turn: parsed,
    supportSlots: allowedSupportSlots,
    queryType,
  }) ?? parsed;
  generationDiagnostics.replyParts.rawPartsPreview = normalized.parts.map((part) => ({
    kind: part.kind,
    text: part.text,
    support: Array.isArray(part.support) ? part.support : undefined,
  }));

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

  if (!validation.valid) {
    generationDiagnostics.draft.success = false;
    generationDiagnostics.draft.failureReason = 'reply-parts-validation-failed';
    generationDiagnostics.replyParts.success = false;
    generationDiagnostics.replyParts.failureReason = buildReplyPartsValidationRepairReason(validation);
    return null;
  }

  const mustCarryKnowledge = planClaims.length > 0 && (speechAct === 'answer' || speechAct === 'recall');
  const realizedUncertainParts = normalized.parts.filter((part) => part.kind === 'uncertain').length;
  if (mustCarryKnowledge && realizedKnowledgeParts === 0 && realizedUncertainParts > 0) {
    generationDiagnostics.draft.success = false;
    generationDiagnostics.draft.failureReason = 'reply-parts-regressed-to-uncertain';
    generationDiagnostics.replyParts.success = false;
    generationDiagnostics.replyParts.failureReason = 'reply-parts-regressed-to-uncertain';
    return null;
  }

  generationDiagnostics.draft.success = true;
  generationDiagnostics.replyParts.success = true;
  generationDiagnostics.replyParts.failureReason = undefined;

  return materializeTurnOutputFromReplyParts({
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
}

function buildMockSocialReplyParts(requestInput) {
  const input = isRecord(requestInput) ? requestInput : {};
  const npcName = normalizeOptionalString(input.npcName) ?? 'NPC';
  const playerMessage = normalizeOptionalString(input.playerMessage) ?? '';
  const declaredName = extractDeclaredIdentityName(playerMessage);

  let text = `Hi. I'm ${npcName}.`;
  if (declaredName) {
    const safeName = declaredName.charAt(0).toUpperCase() + declaredName.slice(1);
    text = `Nice to meet you, ${safeName}. I'm ${npcName}.`;
  } else if (!isLikelyGreetingOnlyMessage(playerMessage) && playerMessage) {
    text = 'That makes sense.';
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

async function realizeSocialFastWithReplyPartsTransport(input) {
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
  } = input;

  await ensureModelLoaded();
  generationDiagnostics.draft.attempted = true;
  generationDiagnostics.replyParts.attempted = true;
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
      turnContext: {
        queryType: 'conversation',
        routingIntent: 'social_chat',
      },
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
  return materialized;
}

function toMode(interactionMode) {
  if (interactionMode === 'scripted') return 'narrative';
  if (interactionMode === 'hybrid') return 'hybrid';
  return 'character';
}

function buildHistoryBlock(history) {
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

function buildMemoryFactBlock(memoryFacts) {
  const facts = Array.isArray(memoryFacts) ? memoryFacts.slice(-24) : [];
  if (facts.length === 0) return 'Known player facts:\n- none';
  return `Known player facts:\n${facts.map((fact) => `- ${sanitizePromptText(fact).slice(0, 220)}`).join('\n')}`;
}

function buildNpcProfileBlock(npcProfile) {
  if (!isRecord(npcProfile)) return null;
  const lines = [];
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

function buildGlobalSafetyBlock(globalSafetyBounds) {
  const bounds = normalizeStringArray(globalSafetyBounds);
  if (bounds.length === 0) return null;
  return [
    'Global safety bounds:',
    ...bounds.map((entry) => `- ${sanitizePromptText(entry)}`),
  ].join('\n');
}

function tokenizeSnippetText(text) {
  return sanitizePromptText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s_-]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function scoreCitationSnippet(queryTokens, snippet) {
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

function resolveCitationSnippetForMatch(matchEntry, query, loreArtifacts) {
  const chunk = matchEntry?.chunk;
  if (!chunk) return '';

  const fallbackSummary = sanitizePromptText(chunk.summary ?? '');
  const queryTokens = tokenizeSnippetText(query);
  const candidates = [];

  if (fallbackSummary) {
    candidates.push(fallbackSummary);
  }

  const chunkFactIds = Array.isArray(chunk?.metadata?.fact_ids)
    ? chunk.metadata.fact_ids.filter((entry) => typeof entry === 'string')
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

function buildLoreCitationDefaults(loreMatches, query, loreArtifacts) {
  if (!Array.isArray(loreMatches) || loreMatches.length === 0) return [];
  const defaults = [];
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

function hydrateModelCitationsWithLore(modelCitations, loreMatches, query, loreArtifacts) {
  const defaults = buildLoreCitationDefaults(loreMatches, query, loreArtifacts);
  const defaultsBySourceId = new Map(defaults.map((entry) => [entry.sourceId, entry.snippet]));
  const hydrated = [];
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

function buildLoreEvidenceBlock(loreMatches, query, loreArtifacts) {
  const defaults = buildLoreCitationDefaults(loreMatches, query, loreArtifacts);
  if (defaults.length === 0) return null;
  const lines = defaults.map((entry) => `- ${entry.sourceId}: ${entry.snippet}`);
  return [
    'Lore evidence you may use (prefer these over guessing):',
    ...lines,
    'If you use lore evidence, include citations with sourceId from the list above and a short snippet.',
  ].join('\n');
}

function buildTurnContextBlock(turnContext) {
  if (!isRecord(turnContext)) return null;
  const lines = [];
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

function buildLlamaPrompt(input) {
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
  } = input;

  const blocks = [
    `You are ${npcName}, an NPC in a game.`,
    'Have a short, natural back-and-forth conversation with the player.',
    'Respond in the same language as the player message unless asked to switch languages.',
    'If the player message is English, respond in English.',
    'Never repeat the player message verbatim.',
    'Never repeat something you already said in the conversation history.',
    'Keep the total visible reply concise (1-2 sentences).',
    buildGlobalSafetyBlock(globalSafetyBounds),
    buildNpcProfileBlock(npcProfile),
    buildTurnContextBlock(turnContext),
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

function createGenerationDiagnostics() {
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
      partCount: 0,
      groundedPartCount: 0,
      failureReason: undefined,
      skippedReason: undefined,
      rawResponsePreview: undefined,
      rawPartsPreview: undefined,
      allowedSupportSlots: undefined,
    },
  };
}

function resetGenerationDiagnosticsForAttempt(generationDiagnostics) {
  generationDiagnostics.draft.attempted = false;
  generationDiagnostics.draft.success = false;
  generationDiagnostics.draft.failureReason = undefined;
  generationDiagnostics.draft.skippedReason = undefined;

  generationDiagnostics.replyParts.attempted = false;
  generationDiagnostics.replyParts.success = false;
  generationDiagnostics.replyParts.partCount = 0;
  generationDiagnostics.replyParts.groundedPartCount = 0;
  generationDiagnostics.replyParts.failureReason = undefined;
  generationDiagnostics.replyParts.skippedReason = undefined;
  generationDiagnostics.replyParts.rawResponsePreview = undefined;
  generationDiagnostics.replyParts.rawPartsPreview = undefined;
  generationDiagnostics.replyParts.allowedSupportSlots = undefined;
}

function normalizeRuntimeMode(runtime) {
  if (runtime === 'llama' || runtime === 'mock') return runtime;
  return 'auto';
}

function resolveRuntimeMode(args) {
  const requested = normalizeRuntimeMode(args.runtime);
  if (requested === 'llama' || requested === 'mock') return requested;
  const modelPath = normalizeOptionalString(args.modelPath) ?? normalizeOptionalString(process.env.SUGARAGENT_MODEL_PATH) ?? resolveBundledModelPath();
  const llamaBin = normalizeOptionalString(args.llamaBin) ?? normalizeOptionalString(process.env.SUGARAGENT_LLAMA_BIN) ?? resolveBundledLlamaBin();
  if (modelPath && llamaBin && commandExists(llamaBin) && fs.existsSync(modelPath)) {
    return 'llama';
  }
  return 'mock';
}

function resolveConfiguredModelPath(args) {
  const explicit = normalizeOptionalString(args.modelPath);
  if (explicit) return explicit;
  const envPath = normalizeOptionalString(process.env.SUGARAGENT_MODEL_PATH);
  if (envPath) return envPath;
  return resolveBundledModelPath();
}

function resolveConfiguredLlamaBin(args) {
  const explicit = normalizeOptionalString(args.llamaBin);
  if (explicit) return explicit;
  const envPath = normalizeOptionalString(process.env.SUGARAGENT_LLAMA_BIN);
  if (envPath) return envPath;
  return resolveBundledLlamaBin();
}

function createMockRuntime() {
  let loaded = false;

  function buildMockReplyParts(requestInput) {
    const input = isRecord(requestInput) ? requestInput : {};
    const npcName = normalizeOptionalString(input.npcName) ?? 'NPC';
    const playerMessage = normalizeOptionalString(input.playerMessage) ?? '';
    const queryType = normalizeOptionalString(input.turnContext?.queryType) ?? 'conversation';
    const supportSlots = Array.isArray(input.supportSlots)
      ? input.supportSlots.filter((entry) => isRecord(entry) && typeof entry.slotId === 'string' && typeof entry.snippet === 'string')
      : [];

    if (isKnowledgeSeekingQueryType(queryType)) {
      if (supportSlots.length > 0) {
        const selectedSupport = supportSlots[0];
        return {
          parts: [
            {
              kind: 'grounded',
              text: sanitizePromptText(selectedSupport.snippet),
              support: [selectedSupport.slotId],
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

      return {
        parts: [
          {
            kind: 'uncertain',
            text: createGroundedUncertaintyReply(queryType).utterance,
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

  async function generateJson(request) {
    if (!loaded) {
      throw new Error('Model must be loaded before generateStructured');
    }
    if (request?.kind === 'social-fast-realization') {
      return {
        jsonText: JSON.stringify(buildMockSocialReplyParts(request?.input ?? request)),
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
  };
}

function createLlamaRuntime(args) {
  const commandPath = resolveConfiguredLlamaBin(args);
  const modelPath = resolveConfiguredModelPath(args);
  const timeoutMs = Number.isFinite(args.llamaTimeoutMs) ? Math.max(1, Math.floor(args.llamaTimeoutMs)) : 120000;
  const llamaBinArgs = Array.isArray(args.llamaBinArgs) ? args.llamaBinArgs.map((entry) => String(entry)) : [];
  const llamaArgs = Array.isArray(args.llamaArgs) ? args.llamaArgs.map((entry) => String(entry)) : [];
  let loaded = false;

  async function generateJson(request) {
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
  };
}

function defaultPipelineDiagnostics(input) {
  const routeIntent = input.routing?.intent ?? 'unclear';
  const policyPath = input.routing?.policyPath ?? 'safe_chat';
  const queryType = input.queryType ?? routeIntentToQueryType(routeIntent);
  const loreMatchCount = Array.isArray(input.loreMatches) ? input.loreMatches.length : 0;
  const retrieval = isRecord(input.retrieval) ? input.retrieval : {};
  const missingGameLoreBundle = input.missingGameLoreBundle === true;
  const retrievalAttempted = input.retrievalAttempted === true
    || (missingGameLoreBundle && isKnowledgeSeekingQueryType(queryType));
  const retrievalCandidateCount = Number.isFinite(retrieval.candidateCount)
    ? Math.max(0, Math.floor(Number(retrieval.candidateCount)))
    : (retrievalAttempted ? loreMatchCount : 0);
  const retrievalSelectedCount = Number.isFinite(retrieval.selectedCount)
    ? Math.max(0, Math.floor(Number(retrieval.selectedCount)))
    : loreMatchCount;
  const validationErrors = Array.isArray(input.validationErrors) ? input.validationErrors : [];
  const validationDecision = normalizeOptionalString(input.validationDecision)
    ?? (input.usedFallback ? 'fallback' : (validationErrors.length > 0 ? 'repair' : 'accept'));
  const unsupportedClaims = Number.isFinite(input.unsupportedClaims)
    ? Math.max(0, Math.floor(input.unsupportedClaims))
    : 0;
  const requiresRepair = input.requiresRepair === true
    || validationDecision === 'repair'
    || validationDecision === 'fallback';

  return {
    version: 'v2',
    enabled: true,
    mode: toMode(input.turnContext?.interactionMode),
    routeIntent,
    policyPath,
    queryType,
    retrieval: {
      attempted: retrievalAttempted,
      candidateCount: retrievalCandidateCount,
      selectedCount: retrievalSelectedCount,
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
        topicCoverage: isRecord(input.turnContext?.topicCoverage) ? input.turnContext.topicCoverage : undefined,
      },
      bounds: {},
      goalStack: [],
    },
    groundingDecision: validationDecision,
    fallbackReason: input.usedFallback ? 'generation-fallback' : undefined,
    validation: {
      decision: validationDecision,
      errors: validationErrors,
      unsupportedClaims,
      requiresRepair,
      source: 'npc_output',
      npcOutputValidated: true,
      progressionGateEvaluated: false,
    },
    generation: isRecord(input.generation) ? input.generation : createGenerationDiagnostics(),
  };
}

function mergeTurnContext(base, override) {
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

const DEFAULT_SESSION_OPTIONS = {
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

function normalizeSessionOptions(options = {}) {
  const normalized = {
    ...DEFAULT_SESSION_OPTIONS,
    ...options,
  };
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

function createEchoReply(message) {
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

export async function createSugarAgentSession(options = {}) {
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
    async runTurn(playerMessage, turnOptions = {}) {
      const message = normalizeOptionalString(playerMessage);
      if (!message) {
        throw new Error('playerMessage must be a non-empty string');
      }

      const turnOptionsRecord = isRecord(turnOptions) ? turnOptions : {};
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
      const derivedContext = {
        isFirstMeeting: priorPlayerTurns === 0,
        turnIndexWithNpc: priorPlayerTurns + 1,
        ...(topicCoverageContext ? { topicCoverage: topicCoverageContext } : {}),
      };
      const turnContext = mergeTurnContext(
        mergeTurnContext(baseTurnContext, turnOptionsRecord.context),
        derivedContext,
      );

      const routing = routeTurnIntent(message, npcName);
      const routingRefinement = refineRouteWithLoreEntityMentions({
        route: routing,
        playerMessage: message,
        loreArtifacts,
      });
      const resolvedRouting = routingRefinement.route;
      const queryType = normalizeOptionalString(turnContext.queryType) ?? routeIntentToQueryType(resolvedRouting.intent);
      turnContext.queryType = queryType;
      turnContext.routingIntent = resolvedRouting.intent;
      turnContext.routingPolicyPath = resolvedRouting.policyPath;
      const generationDiagnostics = createGenerationDiagnostics();

      if (args.provider === 'echo') {
        const output = createEchoReply(message);
        generationDiagnostics.draft.skippedReason = 'echo_provider';
        generationDiagnostics.replyParts.skippedReason = 'echo_provider';
        applyTurnToSession(session, args.npc, message, output.utterance);
        return {
          output,
          attempts: 1,
          usedFallback: false,
          validationErrors: [],
          loreMatches: [],
          routing: resolvedRouting,
          pipeline: defaultPipelineDiagnostics({
            routing: resolvedRouting,
            queryType,
            loreMatches: [],
            retrievalAttempted: false,
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
        && (isKnowledgeSeekingQueryType(queryType) || routeIntentUsesLore(resolvedRouting.intent))
        && (!requireScopes || hasScopes);

      const governedRetrieval = runGovernedLoreRetrieval({
        loreArtifacts,
        canRetrieveLore,
        shouldAttemptLoreRetrieval,
        playerMessage: message,
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
        modelVersion: undefined,
        rerankerClass: 'lexical',
        retrievalFilters: routingRefinement.retrievalFilters,
      });
      const retrieval = {
        attempted: governedRetrieval.governance.attempted,
        matches: governedRetrieval.loreMatches,
        quality: governedRetrieval.retrievalQuality,
        governance: governedRetrieval.governance,
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
        normalizeForEchoCheck: (text) => sanitizePromptText(text).toLowerCase(),
        maxNovelty: 0.34,
      });
      const relevantEvidenceItems = evidencePackForPipeline.items.filter((item) => isEvidenceItemRelevantForTurn(item, {
        queryType,
        routeIntent: resolvedRouting.intent,
        selfEntityId: npcProfile.selfEntityId,
        npcId: args.npc,
      }));
      const hasDirectAnswerEvidence = hasDirectAnswerableStateEvidence(relevantEvidenceItems, message);

      const initiativePolicy = resolveInitiativePolicy({
        mode: resolvedMode,
        routingIntent: resolvedRouting.intent,
        queryType,
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

      // Resolve language adaptation context (context gathering only)
      const adaptationContext = await resolveLanguageAdaptationContext(null, null);
      snapshot.languageAdaptation = adaptationContext;

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
          generationDiagnostics,
        });

        if (realized) {
          const verification = verifyRealizationAgainstPlan(
            realized.utterance,
            validatedPlan,
            enrichedEvidencePack,
            snapshot,
          );
          efResult.diagnostics.semanticVerification = verification;
          if (verification.ok) {
            efOutput = realized;
            efResult.diagnostics.deterministicFallbackUsed = false;
          } else {
            efResult.diagnostics.deterministicFallbackUsed = true;
            validationErrors.push(...verification.errors);
          }
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

      const acceptedPlan = validatedPlan ?? {
        claims: [],
        memoryWrites: [],
      };
      const persistedMemoryWrites = [
        ...filterMemoryWrites({ plan: acceptedPlan }),
        ...extractNpcCommitments(efOutput.utterance, acceptedPlan),
      ];

      applyTurnToSession(session, args.npc, message, efOutput.utterance, {
        memoryWrites: persistedMemoryWrites,
      });

      validationErrors.sort();
      const dedupedValidationErrors = validationErrors.filter((entry, index, entries) => entries.indexOf(entry) === index);
      const usedFallback = efResult.diagnostics.deterministicFallbackUsed === true || efPlanAcceptable === false;

      const pipeline = defaultPipelineDiagnostics({
        routing: resolvedRouting,
        queryType,
        loreMatches: retrieval.matches,
        retrieval: {
          attempted: retrieval.attempted,
          candidateCount: retrieval.governance.candidateCount,
          selectedCount: retrieval.governance.selectedCount,
          qualityPath: retrieval.governance.qualityPath,
          qualityReason: retrieval.governance.qualityReason,
          qualityGatePassed: retrieval.governance.qualityGatePassed,
          correctiveAttempted: retrieval.governance.correctiveAttempted,
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
        attempts: generationDiagnostics.replyParts.attempted ? 1 : 0,
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
