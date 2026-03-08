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
  retrieveLoreChunks,
} from '../lore/lore-lib';
import {
  DEFAULT_MODEL_PROFILE,
  getModelProfile,
} from '../runtime/model-profiles';
import {
  isKnowledgeSeekingQueryType,
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
  buildReplyPartsRepairPrompt,
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

function parseReplyPartsTurnFromText(text) {
  if (typeof text !== 'string' || text.trim().length === 0) return null;
  return parseReplyPartsResponseDetailed(text).turn;
}

function fallbackOutput(playerMessage) {
  return {
    utterance: `I heard you say "${playerMessage}". I need a moment, please try again.`,
    emotion: 'neutral',
    intent: 'conversation',
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
  const episodeId = normalizeOptionalString(turnContext.episodeId);
  const queryType = normalizeOptionalString(turnContext.queryType);
  const routingIntent = normalizeOptionalString(turnContext.routingIntent);
  const policyPath = normalizeOptionalString(turnContext.routingPolicyPath);
  const interactionMode = normalizeOptionalString(turnContext.interactionMode);
  const interactionPolicy = normalizeOptionalString(turnContext.interactionPolicy);
  if (gameId) lines.push(`- Game: ${sanitizePromptText(gameId)}`);
  if (regionPath) lines.push(`- Region: ${sanitizePromptText(regionPath)}`);
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
  const missingGameLoreBundle = input.missingGameLoreBundle === true;
  const retrievalAttempted = input.retrievalAttempted === true
    || (missingGameLoreBundle && isKnowledgeSeekingQueryType(queryType));
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
      candidateCount: retrievalAttempted ? loreMatchCount : 0,
      selectedCount: loreMatchCount,
      qualityPath: missingGameLoreBundle
        ? 'error'
        : retrievalAttempted ? (loreMatchCount > 0 ? 'single_pass' : 'abstain') : 'not_required',
      qualityReason: missingGameLoreBundle
        ? 'missing_game_lore_bundle'
        : retrievalAttempted ? (loreMatchCount > 0 ? 'lore-selected' : 'no-lore-selected') : 'not_required',
      correctiveAttempted: false,
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

function resolveLoreRetrieval(input) {
  const loreArtifacts = input.loreArtifacts;
  if (!loreArtifacts) {
    return {
      attempted: false,
      matches: [],
    };
  }

  const queryType = input.queryType;
  const shouldRetrieve = isKnowledgeSeekingQueryType(queryType) || routeIntentUsesLore(input.routing.intent);
  if (!shouldRetrieve) {
    return {
      attempted: false,
      matches: [],
    };
  }

  const loreScopes = normalizeStringArray(input.npcProfile?.loreScopes);
  const selfLoreScopes = normalizeStringArray(input.npcProfile?.selfLoreScopes);
  const relatedLoreScopes = normalizeStringArray(input.npcProfile?.relatedLoreScopes);
  const selfEntityId = normalizeOptionalString(input.npcProfile?.selfEntityId);
  const hasScopes = loreScopes.length > 0 || selfLoreScopes.length > 0 || relatedLoreScopes.length > 0;
  const requireScopes = input.requireLoreScopeForRetrieval === true;
  if (requireScopes && !hasScopes) {
    return {
      attempted: true,
      matches: [],
    };
  }

  const matches = retrieveLoreChunks(loreArtifacts, input.playerMessage, {
    queryType,
    loreScopes,
    selfLoreScopes,
    relatedLoreScopes,
    selfEntityId,
    maxResults: 4,
  });

  return {
    attempted: true,
    matches,
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

  const runtimeHealth = await runtime.health();
  if (!runtimeHealth.ok && runtimeMode === 'llama') {
    throw new Error(`Local runtime health check failed: ${runtimeHealth.detail ?? 'unknown error'}`);
  }

  let modelLoaded = false;
  const baseTurnContext = isRecord(args.turnContext) ? args.turnContext : {};

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
      const queryType = normalizeOptionalString(turnContext.queryType) ?? routeIntentToQueryType(routing.intent);
      turnContext.queryType = queryType;
      turnContext.routingIntent = routing.intent;
      turnContext.routingPolicyPath = routing.policyPath;
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
          routing,
          pipeline: defaultPipelineDiagnostics({
            routing,
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

      if (!modelLoaded) {
        await runtime.loadModel('chat-fast');
        modelLoaded = true;
      }

      const retrieval = resolveLoreRetrieval({
        loreArtifacts,
        playerMessage: message,
        queryType,
        routing,
        npcProfile,
        requireLoreScopeForRetrieval: args.requireLoreScopeForRetrieval,
      });
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
      });
      const supportSlots = filterSupportSlotsForQueryType({
        supportSlots: buildSupportSlotsFromGroundingEvidence({
          evidenceEntries: groundingEvidenceEntries,
          selfEntityId: npcProfile.selfEntityId,
          npcId: args.npc,
          maxSlots: 6,
        }),
        queryType,
      });

      const attempt = Number.isFinite(turnOptionsRecord.attempt)
        ? Math.max(1, Math.floor(turnOptionsRecord.attempt))
        : 1;
      const validationErrors = [];
      let usedFallback = false;
      let output = null;
      let attemptsUsed = 0;
      let validationDecision = 'accept';
      let requiresRepair = false;
      let unsupportedClaims = 0;
      let internalRepair = turnOptionsRecord.repair === true;
      let internalRepairReason = normalizeOptionalString(turnOptionsRecord.repairReason);

      while (!output) {
        attemptsUsed += 1;
        const modelAttempt = attempt + attemptsUsed - 1;
        resetGenerationDiagnosticsForAttempt(generationDiagnostics);
        generationDiagnostics.draft.attempted = true;
        generationDiagnostics.replyParts.attempted = true;
        generationDiagnostics.replyParts.allowedSupportSlots = supportSlots.map((slot) => slot.slotId);
        const generated = await runtime.generateStructured({
          npcName,
          playerMessage: message,
          history,
          memoryFacts,
          npcProfile,
          globalSafetyBounds,
          turnContext,
          supportSlots,
          attempt: modelAttempt,
          repair: internalRepair,
          repairReason: internalRepairReason,
        });

        const replyPartsSourceText = typeof generated.rawText === 'string' && generated.rawText.trim().length > 0
          ? generated.rawText
          : generated.jsonText;
        generationDiagnostics.replyParts.rawResponsePreview = sanitizePromptText(replyPartsSourceText).slice(0, 320);
        const parsed = parseReplyPartsTurnFromText(replyPartsSourceText);
        if (!parsed) {
          generationDiagnostics.draft.success = false;
          generationDiagnostics.draft.failureReason = `attempt ${modelAttempt}: invalid JSON`;
          generationDiagnostics.replyParts.success = false;
          generationDiagnostics.replyParts.failureReason = 'invalid_json';
          if (!internalRepair) {
            internalRepair = true;
            internalRepairReason = `attempt ${modelAttempt}: invalid JSON`;
            continue;
          }
          usedFallback = true;
          validationDecision = 'fallback';
          requiresRepair = true;
          validationErrors.push(`attempt ${modelAttempt}: invalid JSON`);
          output = isKnowledgeSeekingQueryType(queryType)
            ? {
              ...createGroundedUncertaintyReply(queryType),
            }
            : fallbackOutput(message);
          break;
        }

        const normalizedReplyParts = normalizeReplyPartsForValidation({
          turn: parsed,
          supportSlots,
          queryType,
        }) ?? parsed;
        generationDiagnostics.draft.success = true;
        generationDiagnostics.draft.failureReason = undefined;
        generationDiagnostics.replyParts.rawPartsPreview = normalizedReplyParts.parts.map((part) => ({
          kind: part.kind,
          text: part.text,
          support: Array.isArray(part.support) ? part.support : undefined,
        }));
        const replyPartsValidation = validateReplyPartsContract({
          parts: normalizedReplyParts.parts,
          supportSlots,
          queryType,
          intent: normalizedReplyParts.intent,
        });

        if (replyPartsValidation.valid) {
          generationDiagnostics.replyParts.success = true;
          generationDiagnostics.replyParts.failureReason = undefined;
          generationDiagnostics.replyParts.partCount = normalizedReplyParts.parts.length;
          generationDiagnostics.replyParts.groundedPartCount = normalizedReplyParts.parts.filter((part) => part.kind === 'grounded').length;
          output = materializeTurnOutputFromReplyParts({
            turn: {
              ...normalizedReplyParts,
              beatEvidence: isRecord(normalizedReplyParts.beatEvidence)
                ? normalizedReplyParts.beatEvidence
                : {
                  coveredFacts: [],
                  uncoveredFacts: [],
                  completionSignal: 'none',
                  confidence: 0,
                },
            },
            supportSlots,
          });
          validationDecision = 'accept';
          unsupportedClaims = 0;
          requiresRepair = false;
          break;
        }

        const replyPartsRepairReason = buildReplyPartsValidationRepairReason(replyPartsValidation);
        generationDiagnostics.replyParts.success = false;
        generationDiagnostics.replyParts.failureReason = replyPartsRepairReason;
        generationDiagnostics.replyParts.partCount = normalizedReplyParts.parts.length;
        generationDiagnostics.replyParts.groundedPartCount = normalizedReplyParts.parts.filter((part) => part.kind === 'grounded').length;

        if (!internalRepair) {
          internalRepair = true;
          internalRepairReason = replyPartsRepairReason;
          continue;
        }

        output = {
          ...createGroundedUncertaintyReply(queryType),
        };
        validationDecision = 'fallback';
        requiresRepair = true;
        unsupportedClaims = replyPartsValidation.summary.invalidGroundedParts || 1;
        validationErrors.push(`pipeline-v4 reply-parts validation fallback: ${replyPartsRepairReason}`);
      }

      applyTurnToSession(session, args.npc, message, output.utterance);

      const pipeline = defaultPipelineDiagnostics({
        routing,
        queryType,
        loreMatches: retrieval.matches,
        retrievalAttempted: retrieval.attempted,
        missingGameLoreBundle: args.missingGameLoreBundle === true,
        usedFallback,
        validationErrors,
        validationDecision,
        unsupportedClaims,
        requiresRepair,
        turnContext,
        generation: generationDiagnostics,
      });

      return {
        output,
        attempts: attemptsUsed,
        usedFallback,
        validationErrors,
        loreMatches: retrieval.matches,
        routing,
        pipeline,
        grounding: {
          summary: {
            decision: validationDecision,
            unsupportedCount: unsupportedClaims,
          },
        },
      };
    },
  };
}
