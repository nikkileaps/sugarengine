import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'url';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'sugarengine-active-game-sync',
      configureServer(server) {
        const projectRoot = process.cwd();
        const gamesRoot = resolve(projectRoot, 'games');
        const activeGameFile = resolve(gamesRoot, '.active-game');
        const defaultAuthoringBundlePath = resolve(projectRoot, 'public', 'plugins', 'sugaragent', 'authoring.bundle.json');
        const defaultLoreDir = resolve(projectRoot, 'src', 'plugins', 'sugaragent', 'lore', 'generated');
        const sessionCache = new Map<string, Promise<{
          runTurn: (
            playerMessage: string,
            turnOptions?: {
              npcName?: string;
              npcProfileOverride?: Record<string, unknown>;
              globalSafetyBoundsOverride?: string[];
              context?: Record<string, unknown>;
            },
          ) => Promise<{
            output: Record<string, unknown>;
            usedFallback?: boolean;
            validationErrors?: string[];
            routing?: Record<string, unknown>;
            pipeline?: Record<string, unknown>;
            grounding?: Record<string, unknown>;
            loreMatches?: Array<Record<string, unknown>>;
          }>;
          startup?: { runtime?: { health?: { detail?: string } } };
        }>>();

        const isValidSlug = (value: string): boolean => /^[a-z0-9-]+$/.test(value);

        const normalizeStringArray = (value: unknown): string[] => {
          if (!Array.isArray(value)) return [];
          return value
            .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
            .filter((entry) => entry.length > 0);
        };

        const normalizeOptionalString = (value: unknown): string | undefined => {
          if (typeof value !== 'string') return undefined;
          const trimmed = value.trim();
          return trimmed.length > 0 ? trimmed : undefined;
        };

        const toFiniteNumber = (value: unknown): number | undefined => {
          if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
          return value;
        };

        const normalizeRuntimeMode = (value: unknown): 'llama' | 'auto' | 'mock' => {
          if (value === 'auto' || value === 'mock' || value === 'llama') {
            return value;
          }
          return 'llama';
        };

        const mapSpeechActToInitiativeAction = (speechAct: string | undefined): 'npc_initiate' | 'player_respond' | 'clarify' | 'abstain' | 'close' | 'unknown' => {
          if (!speechAct) return 'unknown';
          if (speechAct === 'ask' || speechAct === 'clarify') return 'clarify';
          if (speechAct === 'uncertain') return 'abstain';
          if (speechAct === 'close') return 'close';
          if (speechAct === 'answer' || speechAct === 'chat' || speechAct === 'recall') return 'player_respond';
          return 'unknown';
        };

        const buildTurnDiagnostics = (
          result: {
            usedFallback?: boolean;
            validationErrors?: string[];
            routing?: Record<string, unknown>;
            pipeline?: Record<string, unknown>;
            grounding?: Record<string, unknown>;
            loreMatches?: Array<Record<string, unknown>>;
          },
          requestContext: Record<string, unknown>,
        ): Record<string, unknown> => {
          const interactionMode = normalizeOptionalString(requestContext.interactionMode);
          const interactionPolicy = normalizeOptionalString(requestContext.interactionPolicy);
          const pipeline = (typeof result.pipeline === 'object' && result.pipeline !== null)
            ? result.pipeline as Record<string, unknown>
            : {} as Record<string, unknown>;
          const pipelineMode = normalizeOptionalString(pipeline.mode);
          const mode = pipelineMode === 'hybrid'
            || pipelineMode === 'narrative'
            || pipelineMode === 'character'
            ? pipelineMode
            : interactionMode === 'hybrid'
              ? 'hybrid'
              : interactionMode === 'agent'
                ? 'character'
                : 'character';
          const modeReason = `context-interaction-mode:${interactionMode ?? 'missing'};policy=${interactionPolicy ?? 'unknown'}`;
          const planner = (typeof pipeline.planner === 'object' && pipeline.planner !== null)
            ? pipeline.planner as Record<string, unknown>
            : {};
          const pipelineInitiative = (typeof pipeline.initiative === 'object' && pipeline.initiative !== null)
            ? pipeline.initiative as Record<string, unknown>
            : {};
          const initiativeDecision = (typeof pipelineInitiative.decision === 'object' && pipelineInitiative.decision !== null)
            ? pipelineInitiative.decision as Record<string, unknown>
            : {};
          const evidence = (typeof pipeline.evidence === 'object' && pipeline.evidence !== null)
            ? pipeline.evidence as Record<string, unknown>
            : {};
          const pipelineEvidenceBudget = (typeof pipeline.evidenceBudget === 'object' && pipeline.evidenceBudget !== null)
            ? pipeline.evidenceBudget as Record<string, unknown>
            : {};
          const pipelineEvidenceBudgetLimits = (typeof pipelineEvidenceBudget.limits === 'object' && pipelineEvidenceBudget.limits !== null)
            ? pipelineEvidenceBudget.limits as Record<string, unknown>
            : {};
          const pipelineEvidenceBudgetUsage = (typeof pipelineEvidenceBudget.usage === 'object' && pipelineEvidenceBudget.usage !== null)
            ? pipelineEvidenceBudget.usage as Record<string, unknown>
            : {};
          const pipelineRetrieval = (typeof pipeline.retrieval === 'object' && pipeline.retrieval !== null)
            ? pipeline.retrieval as Record<string, unknown>
            : {};
          const retrievalQuality = (typeof pipeline.retrievalQuality === 'object' && pipeline.retrievalQuality !== null)
            ? pipeline.retrievalQuality as Record<string, unknown>
            : {};
          const sourceTypes = (typeof evidence.sourceTypes === 'object' && evidence.sourceTypes !== null)
            ? evidence.sourceTypes as Record<string, unknown>
            : {};
          const routing = (typeof result.routing === 'object' && result.routing !== null)
            ? result.routing as Record<string, unknown>
            : {} as Record<string, unknown>;
          const grounding = (typeof result.grounding === 'object' && result.grounding !== null)
            ? result.grounding as Record<string, unknown>
            : {} as Record<string, unknown>;
          const groundingSummary = (typeof grounding.summary === 'object' && grounding.summary !== null)
            ? grounding.summary as Record<string, unknown>
            : {};
          const validationErrors = Array.isArray(result.validationErrors)
            ? result.validationErrors.filter((entry): entry is string => typeof entry === 'string')
            : [];

          const speechAct = normalizeOptionalString(planner.speechAct);
          const initiativeAction = normalizeOptionalString(initiativeDecision.action)
            ?? mapSpeechActToInitiativeAction(speechAct);
          const initiativeInitiator = normalizeOptionalString(initiativeDecision.initiator)
            ?? (initiativeAction === 'player_respond' ? 'player' : 'npc');
          const initiativePrimaryGoal = normalizeOptionalString(initiativeDecision.primaryGoal);
          const initiativeSecondaryGoals = Array.isArray(initiativeDecision.secondaryGoals)
            ? initiativeDecision.secondaryGoals
              .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            : [];
          const expectedPlayerResponseType = normalizeOptionalString(initiativeDecision.expectedPlayerResponseType);
          const initiativeReason = normalizeOptionalString(initiativeDecision.reason);
          const initiativePolicyBounded = initiativeDecision.policyBounded === true;
          const initiativeInputs = (typeof pipelineInitiative.inputs === 'object' && pipelineInitiative.inputs !== null)
            ? pipelineInitiative.inputs as Record<string, unknown>
            : {};
          const topicCoverageInput = (typeof initiativeInputs.topicCoverage === 'object' && initiativeInputs.topicCoverage !== null)
            ? initiativeInputs.topicCoverage as Record<string, unknown>
            : {};
          const topicCoverageActiveTopic = normalizeOptionalString(topicCoverageInput.activeTopic);
          const topicCoverageActiveTopicNovelty = toFiniteNumber(topicCoverageInput.activeTopicNovelty);
          const topicCoverageExhaustedTopics = normalizeStringArray(topicCoverageInput.exhaustedTopics).slice(0, 8);
          const topicCoverageTrackedCount = toFiniteNumber(topicCoverageInput.trackedTopicCount);
          const topicCoverageExhausted = topicCoverageInput.topicExhausted === true || topicCoverageInput.exhausted === true;
          const routeIntent = normalizeOptionalString(pipeline.routeIntent) ?? normalizeOptionalString(routing.intent);
          const policyPath = normalizeOptionalString(pipeline.policyPath) ?? normalizeOptionalString(routing.policyPath);

          const evidenceFacts = toFiniteNumber(pipelineEvidenceBudgetUsage.facts)
            ?? toFiniteNumber(evidence.count)
            ?? 0;
          const memoryItems = toFiniteNumber(pipelineEvidenceBudgetUsage.memoryItems)
            ?? ((toFiniteNumber(sourceTypes.session_fact) ?? 0) + (toFiniteNumber(sourceTypes.player_fact) ?? 0));
          const beatFacts = toFiniteNumber(pipelineEvidenceBudgetUsage.beatFacts)
            ?? (toFiniteNumber(sourceTypes.beat_fact) ?? 0);
          const spansUsed = toFiniteNumber(pipelineEvidenceBudgetUsage.spans) ?? evidenceFacts;
          const contextTokensUsed = toFiniteNumber(pipelineEvidenceBudgetUsage.contextTokens) ?? 0;
          const factsBudget = toFiniteNumber(pipelineEvidenceBudgetLimits.facts) ?? 16;
          const spansBudget = toFiniteNumber(pipelineEvidenceBudgetLimits.spans) ?? 16;
          const contextTokenBudget = toFiniteNumber(pipelineEvidenceBudgetLimits.contextTokens) ?? 2048;
          const memoryBudget = toFiniteNumber(pipelineEvidenceBudgetLimits.memoryItems) ?? 24;
          const beatFactsBudget = toFiniteNumber(pipelineEvidenceBudgetLimits.beatFacts) ?? 8;
          const withinBudgetFromPipeline = typeof pipelineEvidenceBudget.withinBudget === 'boolean'
            ? pipelineEvidenceBudget.withinBudget
            : undefined;

          const loreMatchCount = Array.isArray(result.loreMatches) ? result.loreMatches.length : 0;
          const retrievalAttempted = typeof pipelineRetrieval.attempted === 'boolean'
            ? pipelineRetrieval.attempted
            : routeIntent === 'identity_self'
            || routeIntent === 'lore_world'
            || routeIntent === 'lore_other'
            || routeIntent === 'mixed_knowledge';
          const fallbackReason = normalizeOptionalString(pipeline.fallbackReason);
          const retrievalQualityReason = normalizeOptionalString(retrievalQuality.reason);
          const retrievalQualityPath = normalizeOptionalString(pipelineRetrieval.qualityPath) ?? (!retrievalAttempted
            ? 'not_required'
            : result.usedFallback
              ? 'fallback'
              : loreMatchCount > 0
                ? 'single_pass'
                : 'abstain');
          const validationDecision = normalizeOptionalString(groundingSummary.decision)
            ?? (result.usedFallback ? 'fallback' : (validationErrors.length > 0 ? 'repair' : 'accept'));

          return {
            mode,
            modeReason,
            modeResolution: {
              interactionMode: interactionMode ?? 'unknown',
              interactionPolicy: interactionPolicy ?? 'unknown',
              hasBeatContract: mode === 'narrative' || mode === 'hybrid',
            },
            modeTransition: {
              from: null,
              to: mode,
              changed: false,
              reason: `mode-initialized:${mode}`,
            },
            initiative: {
              initiator: initiativeInitiator === 'player' || initiativeInitiator === 'system'
                ? initiativeInitiator
                : 'npc',
              action: initiativeAction,
              primaryGoal: initiativePrimaryGoal ?? (routeIntent === 'social_chat'
                ? 'social_goal'
                : routeIntent === 'session_recall'
                  ? 'repair_goal'
                  : routeIntent
                    ? 'character_goal'
                    : undefined),
              secondaryGoals: initiativeSecondaryGoals.length > 0
                ? initiativeSecondaryGoals
                : (policyPath ? [policyPath] : []),
              expectedPlayerResponseType: expectedPlayerResponseType ?? undefined,
              reason: initiativeReason ?? undefined,
              policyBounded: initiativePolicyBounded,
            },
            conversation: {
              topicCoverage: {
                activeTopic: topicCoverageActiveTopic ?? undefined,
                activeTopicNovelty: topicCoverageActiveTopicNovelty ?? undefined,
                exhaustedTopics: topicCoverageExhaustedTopics,
                trackedTopicCount: topicCoverageTrackedCount ?? undefined,
                exhausted: topicCoverageExhausted,
              },
            },
            evidenceBudget: {
              usage: {
                facts: evidenceFacts,
                spans: spansUsed,
                contextTokens: contextTokensUsed,
                memoryItems,
                beatFacts,
              },
              budget: {
                facts: factsBudget,
                spans: spansBudget,
                contextTokens: contextTokenBudget,
                memoryItems: memoryBudget,
                beatFacts: beatFactsBudget,
              },
              withinBudget: withinBudgetFromPipeline ?? (
                evidenceFacts <= factsBudget
                && spansUsed <= spansBudget
                && contextTokensUsed <= contextTokenBudget
                && memoryItems <= memoryBudget
                && beatFacts <= beatFactsBudget
              ),
            },
            retrieval: {
              attempted: retrievalAttempted,
              candidateCount: toFiniteNumber(pipelineRetrieval.candidateCount) ?? loreMatchCount,
              selectedCount: toFiniteNumber(pipelineRetrieval.selectedCount) ?? loreMatchCount,
              qualityPath: retrievalQualityPath,
              qualityReason: fallbackReason
                ?? normalizeOptionalString(pipelineRetrieval.qualityReason)
                ?? retrievalQualityReason
                ?? (retrievalAttempted ? (loreMatchCount > 0 ? 'lore-selected' : 'no-lore-selected') : 'not-required'),
              correctiveAttempted: pipelineRetrieval.correctiveAttempted === true,
            },
            validation: {
              decision: validationDecision,
              errors: validationErrors,
              unsupportedClaims: toFiniteNumber(groundingSummary.unsupportedCount) ?? 0,
              requiresRepair: validationDecision === 'repair' || validationDecision === 'fallback',
            },
            pipelineVersion: normalizeOptionalString(pipeline.version) ?? 'v2',
            timestampMs: Date.now(),
          };
        };

        const sanitizeSessionId = (value: string): string => {
          return value
            .replace(/[^a-zA-Z0-9._-]+/g, '-')
            .slice(0, 64);
        };

        const buildPreviewSessionId = (slug: string, npcId: string): string => {
          return sanitizeSessionId(`preview-${slug || 'default'}-${npcId}`);
        };

        const writeJson = (
          res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (chunk?: string) => void },
          statusCode: number,
          payload: Record<string, unknown>,
        ) => {
          res.statusCode = statusCode;
          res.setHeader('Content-Type', 'application/json');
          res.end(`${JSON.stringify(payload)}\n`);
        };

        const readRequestBody = async (
          req: { on: (event: string, listener: (...args: unknown[]) => void) => void },
        ): Promise<Record<string, unknown>> => {
          let raw = '';
          await new Promise<void>((resolveBody, rejectBody) => {
            req.on('data', (chunk: Buffer | string) => {
              raw += chunk.toString();
            });
            req.on('end', () => resolveBody());
            req.on('error', (error: unknown) => rejectBody(error));
          });
          if (!raw.trim()) return {};
          try {
            const parsed = JSON.parse(raw);
            return typeof parsed === 'object' && parsed !== null
              ? parsed as Record<string, unknown>
              : {};
          } catch {
            return {};
          }
        };

        const readActiveGameSlug = async (): Promise<string> => {
          if (!fsSync.existsSync(activeGameFile)) return '';
          const raw = await fs.readFile(activeGameFile, 'utf8');
          return raw.trim();
        };

        const resolveRuntimeGameSlug = async (requestedGameId?: string): Promise<string> => {
          if (typeof requestedGameId === 'string') {
            const trimmed = requestedGameId.trim();
            if (isValidSlug(trimmed)) {
              const requestedGameDir = resolve(projectRoot, 'games', trimmed);
              if (fsSync.existsSync(requestedGameDir)) {
                return trimmed;
              }
            }
          }
          return readActiveGameSlug();
        };

        const hasLoreArtifacts = (loreDir: string): boolean => {
          return fsSync.existsSync(resolve(loreDir, 'manifest.json'))
            && fsSync.existsSync(resolve(loreDir, 'chunks.json'));
        };

        const readLoreGeneratedAtMs = (loreDir: string): number => {
          const manifestPath = resolve(loreDir, 'manifest.json');
          if (!fsSync.existsSync(manifestPath)) return 0;
          try {
            const raw = fsSync.readFileSync(manifestPath, 'utf8');
            const parsed = JSON.parse(raw) as { generatedAt?: unknown };
            if (typeof parsed.generatedAt !== 'string') return 0;
            const parsedMs = Date.parse(parsed.generatedAt);
            return Number.isFinite(parsedMs) ? parsedMs : 0;
          } catch {
            return 0;
          }
        };

        const resolveSessionLoreConfig = (slug: string): { loreDir: string; useLore: boolean } => {
          if (!slug) {
            return {
              loreDir: defaultLoreDir,
              useLore: hasLoreArtifacts(defaultLoreDir),
            };
          }

          const candidateLoreDirs = [
            resolve(projectRoot, 'games', slug, 'plugins', 'sugaragent', 'lore', 'generated'),
            resolve(projectRoot, 'public', 'games', slug, 'plugins', 'sugaragent', 'lore', 'generated'),
            defaultLoreDir,
          ];
          const available = candidateLoreDirs
            .map((candidate, index) => ({
              candidate,
              index,
              available: hasLoreArtifacts(candidate),
              generatedAtMs: readLoreGeneratedAtMs(candidate),
            }))
            .filter((entry) => entry.available);
          const matched = available
            .sort((a, b) => {
              if (b.generatedAtMs !== a.generatedAtMs) {
                return b.generatedAtMs - a.generatedAtMs;
              }
              return a.index - b.index;
            })[0]?.candidate;
          return {
            loreDir: matched ?? candidateLoreDirs[0] ?? defaultLoreDir,
            useLore: Boolean(matched),
          };
        };

        const clearSessionForNpc = async (npcId: string, requestedGameId?: string) => {
          const slug = await resolveRuntimeGameSlug(requestedGameId);
          const cachePrefix = `${slug || 'default'}:`;
          let removedCacheEntries = 0;
          for (const key of [...sessionCache.keys()]) {
            if (key === `${cachePrefix}${npcId}:llama` || key === `${cachePrefix}${npcId}:auto` || key === `${cachePrefix}${npcId}:mock`) {
              sessionCache.delete(key);
              removedCacheEntries += 1;
            }
          }
          const sessionId = buildPreviewSessionId(slug, npcId);
          const sessionFile = resolve(projectRoot, '.sugaragent-sim-sessions', `${sessionId}.json`);
          let removedFile = false;
          if (fsSync.existsSync(sessionFile)) {
            await fs.unlink(sessionFile);
            removedFile = true;
          }
          return {
            slug,
            npcId,
            sessionId,
            removedCache: removedCacheEntries > 0,
            removedFile,
          };
        };

        const clearSessionsForGame = async (requestedGameId?: string) => {
          const slug = await resolveRuntimeGameSlug(requestedGameId);
          const cacheKeyPrefix = `${slug || 'default'}:`;
          let removedCacheEntries = 0;
          for (const key of [...sessionCache.keys()]) {
            if (key.startsWith(cacheKeyPrefix)) {
              sessionCache.delete(key);
              removedCacheEntries += 1;
            }
          }

          const sessionDir = resolve(projectRoot, '.sugaragent-sim-sessions');
          const filePrefix = `preview-${slug || 'default'}-`;
          const removedFiles: string[] = [];
          if (fsSync.existsSync(sessionDir)) {
            const entries = await fs.readdir(sessionDir, { withFileTypes: true });
            for (const entry of entries) {
              if (!entry.isFile()) continue;
              if (!entry.name.startsWith(filePrefix) || !entry.name.endsWith('.json')) continue;
              await fs.unlink(resolve(sessionDir, entry.name));
              removedFiles.push(entry.name);
            }
          }

          return {
            slug,
            removedCacheEntries,
            removedFiles,
          };
        };

        const resolveSessionAuthoringBundlePath = (slug: string): string => {
          if (!slug) {
            return defaultAuthoringBundlePath;
          }
          const gameBundle = resolve(projectRoot, 'games', slug, 'plugins', 'sugaragent', 'authoring.bundle.json');
          if (fsSync.existsSync(gameBundle)) {
            return gameBundle;
          }
          return resolve(projectRoot, 'public', 'games', slug, 'plugins', 'sugaragent', 'authoring.bundle.json');
        };

        const resolveLoreLockPath = (slug: string): string | null => {
          const candidatePaths = [
            slug
              ? resolve(projectRoot, 'games', slug, 'plugins', 'sugaragent', 'lore', 'lore-source.lock.json')
              : '',
            resolve(projectRoot, 'src', 'plugins', 'sugaragent', 'lore', 'lore-source.lock.json'),
          ].filter(Boolean);
          for (const candidate of candidatePaths) {
            if (fsSync.existsSync(candidate)) {
              return candidate;
            }
          }
          return null;
        };

        const readLoreLockValues = async (
          lockPath: string | null,
        ): Promise<{ source?: string; commit?: string; repo?: string; ref?: string }> => {
          if (!lockPath || !fsSync.existsSync(lockPath)) return {};
          try {
            const raw = await fs.readFile(lockPath, 'utf8');
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            return {
              source: normalizeOptionalString(parsed.source),
              commit: normalizeOptionalString(parsed.commit),
              repo: normalizeOptionalString(parsed.repo),
              ref: normalizeOptionalString(parsed.ref),
            };
          } catch {
            return {};
          }
        };

        const resolveGitHeadCommit = (sourceDir: string): string | null => {
          const git = spawnSync('git', ['-C', sourceDir, 'rev-parse', 'HEAD'], {
            encoding: 'utf8',
          });
          if (git.status !== 0) return null;
          const head = git.stdout.trim();
          return head.length > 0 ? head : null;
        };

        const reingestLoreForGame = async (requestedGameId?: string, overrides: Record<string, unknown> = {}) => {
          const slug = await resolveRuntimeGameSlug(requestedGameId);
          const outputDir = slug
            ? resolve(projectRoot, 'games', slug, 'plugins', 'sugaragent', 'lore', 'generated')
            : defaultLoreDir;
          const lockPath = resolveLoreLockPath(slug);
          const lockValues = await readLoreLockValues(lockPath);

          const sourceDir = normalizeOptionalString(overrides.source) ?? lockValues.source;
          if (!sourceDir) {
            throw new Error('Lore source path is missing. Set source in lore-source.lock.json or send source in request.');
          }

          const commitFromGit = resolveGitHeadCommit(sourceDir);
          const commit = normalizeOptionalString(overrides.commit)
            ?? commitFromGit
            ?? lockValues.commit
            ?? `local-wip-${Date.now()}`;
          const repo = normalizeOptionalString(overrides.repo) ?? lockValues.repo ?? 'local';
          const ref = normalizeOptionalString(overrides.ref) ?? lockValues.ref;

          const loreModulePath = pathToFileURL(
            resolve(projectRoot, 'src/plugins/sugaragent/lore/lore-lib.mjs'),
          ).href;
          const {
            ingestLoreDirectory,
            writeLoreArtifacts,
          } = await import(loreModulePath) as {
            ingestLoreDirectory: (options: {
              sourceDir: string;
              commit: string;
              repo?: string;
              ref?: string;
            }) => {
              manifest: { counts: { chunks: number; files: number; issues: number } };
              issues: string[];
            };
            writeLoreArtifacts: (outputDir: string, artifacts: unknown) => {
              manifestPath: string;
              chunksPath: string;
            };
          };

          const artifacts = ingestLoreDirectory({
            sourceDir,
            commit,
            repo,
            ref: ref ?? undefined,
          });
          const written = writeLoreArtifacts(outputDir, artifacts);
          sessionCache.clear();

          return {
            slug,
            sourceDir: resolve(sourceDir),
            outputDir: resolve(outputDir),
            commit,
            repo,
            ref: ref ?? undefined,
            counts: artifacts.manifest.counts,
            issues: artifacts.issues,
            written,
          };
        };

        const getSugarAgentSession = async (
          npcId: string,
          requestedGameId?: string,
          runtimeModeInput?: unknown,
        ) => {
          const slug = await resolveRuntimeGameSlug(requestedGameId);
          const runtimeMode = normalizeRuntimeMode(runtimeModeInput);
          const cacheKey = `${slug || 'default'}:${npcId}:${runtimeMode}`;
          let pending = sessionCache.get(cacheKey);
          if (!pending) {
            pending = (async () => {
              const loreConfig = resolveSessionLoreConfig(slug);
              const runtimeModulePath = pathToFileURL(
                resolve(projectRoot, 'src/plugins/sugaragent/session/runtime.mjs'),
              ).href;
              const { createSugarAgentSession } = await import(runtimeModulePath) as {
                createSugarAgentSession: (options: Record<string, unknown>) => Promise<{
                  runTurn: (
                    playerMessage: string,
                    turnOptions?: {
                      npcName?: string;
                      npcProfileOverride?: Record<string, unknown>;
                      globalSafetyBoundsOverride?: string[];
                      context?: Record<string, unknown>;
                    },
                  ) => Promise<{
                    output: Record<string, unknown>;
                    usedFallback?: boolean;
                    validationErrors?: string[];
                    routing?: Record<string, unknown>;
                    pipeline?: Record<string, unknown>;
                    grounding?: Record<string, unknown>;
                    loreMatches?: Array<Record<string, unknown>>;
                  }>;
                  startup?: { runtime?: { health?: { detail?: string } } };
                }>;
              };

              const authoringBundlePath = resolveSessionAuthoringBundlePath(slug);

              const sessionId = buildPreviewSessionId(slug, npcId);

              return createSugarAgentSession({
                npc: npcId,
                provider: 'local',
                runtime: runtimeMode,
                rerankerClass: 'learned',
                simulateInvalidJson: process.env.SUGARAGENT_SIM_INVALID_JSON ?? 'never',
                authoringBundlePath,
                session: sessionId,
                loreDir: loreConfig.loreDir,
                useLore: process.env.SUGARAGENT_USE_LORE === 'false'
                  ? false
                  : loreConfig.useLore,
                requireLoreScopeForRetrieval: false,
              });
            })();
            sessionCache.set(cacheKey, pending);
          }
          return pending;
        };

        server.middlewares.use('/__sugarengine/active-game', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method not allowed');
            return;
          }

          const url = new URL(req.url ?? '', 'http://localhost');
          const slug = (url.searchParams.get('slug') ?? '').trim();
          if (!isValidSlug(slug)) {
            res.statusCode = 400;
            res.end('Invalid game slug');
            return;
          }

          const gameDir = resolve(projectRoot, 'games', slug);
          if (!fsSync.existsSync(gameDir)) {
            res.statusCode = 404;
            res.end('Unknown game slug');
            return;
          }

          await fs.mkdir(gamesRoot, { recursive: true });
          await fs.writeFile(activeGameFile, `${slug}\n`, 'utf8');

          res.statusCode = 204;
          res.end();
        });

        server.middlewares.use('/__sugaragent/runtime', async (req, res) => {
          if (req.method !== 'POST') {
            writeJson(res, 405, { ok: false, error: 'Method not allowed' });
            return;
          }

          try {
            const body = await readRequestBody(req);
            const op = typeof body.op === 'string' ? body.op : '';
            const request = (typeof body.request === 'object' && body.request !== null)
              ? body.request as Record<string, unknown>
              : {};

            if (op === 'health') {
              try {
                const requestedGameId = normalizeOptionalString(body.gameId);
                const runtimeMode = normalizeRuntimeMode(body.runtimeMode);
                const session = await getSugarAgentSession('health-check', requestedGameId, runtimeMode);
                writeJson(res, 200, {
                  ok: true,
                  detail: session.startup?.runtime?.health?.detail ?? 'local-runtime-ready',
                });
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                writeJson(res, 200, { ok: false, detail: message });
              }
              return;
            }

            if (op === 'loadModel') {
              writeJson(res, 200, { ok: true, detail: 'loadModel acknowledged' });
              return;
            }

            if (op === 'generateStructured') {
              const npcId = typeof request.npcId === 'string' && request.npcId.trim().length > 0
                ? request.npcId.trim()
                : 'unknown-npc';
              const npcName = typeof request.npcName === 'string' && request.npcName.trim().length > 0
                ? request.npcName.trim()
                : undefined;
              const playerMessage = typeof request.playerMessage === 'string'
                ? request.playerMessage.trim()
                : '';
              const requestContext = (typeof request.context === 'object' && request.context !== null)
                ? request.context as Record<string, unknown>
                : {};
              const requestedGameId = typeof requestContext.gameId === 'string'
                ? requestContext.gameId.trim()
                : undefined;
              const runtimeMode = normalizeRuntimeMode(requestContext.runtimeMode);
              const npcProfile = (typeof request.npcProfile === 'object' && request.npcProfile !== null)
                ? request.npcProfile as Record<string, unknown>
                : undefined;
              const globalSafetyBounds = normalizeStringArray(request.globalSafetyBounds);
              if (!playerMessage) {
                writeJson(res, 400, { ok: false, error: 'Missing playerMessage' });
                return;
              }

              const session = await getSugarAgentSession(npcId, requestedGameId, runtimeMode);
              const result = await session.runTurn(playerMessage, {
                npcName,
                npcProfileOverride: npcProfile,
                globalSafetyBoundsOverride: globalSafetyBounds,
                context: requestContext,
              });
              const diagnostics = buildTurnDiagnostics(result, requestContext);
              writeJson(res, 200, {
                ok: true,
                jsonText: JSON.stringify(result.output),
                detail: result.usedFallback ? 'provider-fallback' : 'provider-ok',
                diagnostics,
              });
              return;
            }

            if (op === 'embed') {
              const texts = Array.isArray(body.texts)
                ? body.texts.filter((entry) => typeof entry === 'string')
                : [];
              writeJson(res, 200, {
                ok: true,
                vectors: texts.map(() => [0, 0, 0]),
              });
              return;
            }

            if (op === 'unloadModel') {
              sessionCache.clear();
              writeJson(res, 200, { ok: true, detail: 'runtime cache cleared' });
              return;
            }

            if (op === 'reingestLore') {
              const requestedGameId = normalizeOptionalString(body.gameId);
              const result = await reingestLoreForGame(requestedGameId, body);
              writeJson(res, 200, {
                ok: true,
                detail: `lore re-ingested for ${result.slug || 'default'} and runtime cache cleared`,
                gameId: result.slug,
                source: result.sourceDir,
                output: result.outputDir,
                commit: result.commit,
                repo: result.repo,
                ref: result.ref,
                counts: result.counts,
                issues: result.issues,
              });
              return;
            }

            if (op === 'clearSession') {
              const npcId = normalizeOptionalString(body.npcId);
              if (!npcId) {
                writeJson(res, 400, { ok: false, error: 'Missing npcId' });
                return;
              }
              const requestedGameId = normalizeOptionalString(body.gameId);
              const result = await clearSessionForNpc(npcId, requestedGameId);
              writeJson(res, 200, {
                ok: true,
                detail: `session cleared for ${result.npcId}`,
                gameId: result.slug,
                npcId: result.npcId,
                sessionId: result.sessionId,
                removedCache: result.removedCache,
                removedFile: result.removedFile,
              });
              return;
            }

            if (op === 'clearSessionsForGame') {
              const requestedGameId = normalizeOptionalString(body.gameId);
              const result = await clearSessionsForGame(requestedGameId);
              writeJson(res, 200, {
                ok: true,
                detail: `cleared ${result.removedFiles.length} persisted sessions for ${result.slug || 'default'}`,
                gameId: result.slug,
                removedCacheEntries: result.removedCacheEntries,
                removedFiles: result.removedFiles,
              });
              return;
            }

            writeJson(res, 400, { ok: false, error: 'Unknown op' });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            writeJson(res, 500, { ok: false, error: message });
          }
        });
      },
      configurePreviewServer(server) {
        // Mirror dev middleware in `vite preview` so in-game SugarAgent calls
        // do not silently degrade to deterministic fallback when testing builds.
        const plugin = server.config.plugins.find((entry) => entry.name === 'sugarengine-active-game-sync');
        const configureServer = plugin && 'configureServer' in plugin
          ? (plugin.configureServer as ((runtimeServer: typeof server) => void) | undefined)
          : undefined;
        configureServer?.(server);
      },
    },
  ],
  clearScreen: false,
  server: {
    port: 7777,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'esnext',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      // Externalize Tauri modules - they're only available at runtime in Tauri context
      external: ['@tauri-apps/api/path', '@tauri-apps/plugin-fs'],
      input: {
        main: resolve(__dirname, 'index.html'),
        preview: resolve(__dirname, 'preview.html'),
      },
    },
  },
});
