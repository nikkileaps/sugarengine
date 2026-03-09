import { defineConfig } from 'vite';
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { spawnSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import {
  readActiveGameSelection,
  readActiveGameSelectionSync,
  writeActiveGameSelection,
} from './scripts/lib/active-game.mjs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'sugarengine-active-game-sync',
      configureServer(server) {
        const projectRoot = process.cwd();
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
        const registeredGameRoots = new Map<string, string>();
        const loreResolutionWarnings = new Set<string>();

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

        const resolveAbsoluteInputPath = (value: string): string => {
          const trimmed = value.trim();
          if (!trimmed) return '';
          return normalize(isAbsolute(trimmed) ? trimmed : resolve(projectRoot, trimmed));
        };

        const resolveGameRootPaths = (rootPath: string) => {
          const normalizedRoot = resolveAbsoluteInputPath(rootPath);
          return {
            rootPath: normalizedRoot,
            projectFilePath: join(normalizedRoot, 'project.sgrgame'),
            assetsPath: join(normalizedRoot, 'assets'),
            pluginsPath: join(normalizedRoot, 'plugins'),
            runtimePath: join(normalizedRoot, 'runtime'),
            runtimeBinPath: join(normalizedRoot, 'runtime', 'bin'),
            runtimeModelsPath: join(normalizedRoot, 'runtime', 'models'),
            configPath: join(normalizedRoot, 'config'),
            gameConfigPath: join(normalizedRoot, 'config', 'game.config.json'),
            manifestsPath: join(normalizedRoot, 'manifests'),
            publishedAssetsManifestPath: join(normalizedRoot, 'manifests', 'published-assets.json'),
            exportsPath: join(normalizedRoot, 'exports'),
          };
        };

        const resolveProjectInputPath = (inputPath: string) => {
          const normalizedInput = resolveAbsoluteInputPath(inputPath);
          const projectFilePath = normalizedInput.toLowerCase().endsWith('/project.sgrgame')
            || normalizedInput.toLowerCase().endsWith('\\project.sgrgame')
            ? normalizedInput
            : join(normalizedInput, 'project.sgrgame');
          const rootPath = dirname(projectFilePath);
          return {
            rootPath,
            projectFilePath,
          };
        };

        const registerGameRoot = (gameId: string, rootPath: string) => {
          const slug = normalizeOptionalString(gameId);
          if (!slug || !isValidSlug(slug)) return;
          registeredGameRoots.set(slug, resolveAbsoluteInputPath(rootPath));
        };

        const seedRegisteredGameRootsFromActiveSelection = () => {
          const activeSelection = readActiveGameSelectionSync();
          if (activeSelection?.slug && activeSelection.rootPath) {
            registeredGameRoots.set(activeSelection.slug, resolveAbsoluteInputPath(activeSelection.rootPath));
          }
        };

        seedRegisteredGameRootsFromActiveSelection();

        const resolveRegisteredGameRoot = (gameId?: string): string | null => {
          const slug = normalizeOptionalString(gameId);
          if (!slug) return null;
          const registered = registeredGameRoots.get(slug);
          if (registered) return registered;
          const activeSelection = readActiveGameSelectionSync();
          if (activeSelection?.slug === slug && activeSelection.rootPath) {
            const activeRoot = resolveAbsoluteInputPath(activeSelection.rootPath);
            registeredGameRoots.set(slug, activeRoot);
            return activeRoot;
          }
          return null;
        };

        let gameRootModulePromise: Promise<{
          createStarterProjectDocument: (options: { gameId: string; name: string }) => Record<string, unknown>;
          normalizeLoadedProjectDocument: (raw: unknown, options?: { fallbackName?: string; fallbackGameId?: string }) => Record<string, unknown>;
          stringifyProjectDocument: (project: Record<string, unknown>) => string;
          createStarterGameConfig: (gameId: string) => Record<string, unknown>;
          createEmptyPublishedAssetsManifest: () => Record<string, unknown>;
        }> | null = null;

        const getGameRootModule = () => {
          if (!gameRootModulePromise) {
            gameRootModulePromise = server.ssrLoadModule('/src/editor/game-root/project-document.ts') as Promise<{
              createStarterProjectDocument: (options: { gameId: string; name: string }) => Record<string, unknown>;
              normalizeLoadedProjectDocument: (raw: unknown, options?: { fallbackName?: string; fallbackGameId?: string }) => Record<string, unknown>;
              stringifyProjectDocument: (project: Record<string, unknown>) => string;
              createStarterGameConfig: (gameId: string) => Record<string, unknown>;
              createEmptyPublishedAssetsManifest: () => Record<string, unknown>;
            }>;
          }
          return gameRootModulePromise;
        };

        const contentTypeForPath = (filePath: string): string => {
          switch (extname(filePath).toLowerCase()) {
            case '.json': return 'application/json';
            case '.glb': return 'model/gltf-binary';
            case '.gltf': return 'model/gltf+json';
            case '.bin': return 'application/octet-stream';
            case '.fbx': return 'application/octet-stream';
            case '.png': return 'image/png';
            case '.jpg':
            case '.jpeg': return 'image/jpeg';
            case '.webp': return 'image/webp';
            case '.gif': return 'image/gif';
            case '.ogg': return 'audio/ogg';
            case '.mp3': return 'audio/mpeg';
            case '.wav': return 'audio/wav';
            default: return 'application/octet-stream';
          }
        };

        const pickDirectoryPath = (): { cancelled: boolean; path?: string; error?: string } => {
          if (process.platform === 'darwin') {
            const result = spawnSync(
              'osascript',
              ['-e', 'POSIX path of (choose folder with prompt "Choose a game root directory")'],
              { encoding: 'utf8' },
            );
            if (result.status === 0) {
              const selectedPath = result.stdout.trim().replace(/[\\/]+$/, '');
              return selectedPath.length > 0
                ? { cancelled: false, path: normalize(selectedPath) }
                : { cancelled: true };
            }
            const stderr = `${result.stderr ?? ''}`.trim();
            if (stderr.includes('User canceled')) {
              return { cancelled: true };
            }
            return { cancelled: false, error: stderr || 'Directory picker failed.' };
          }

          if (process.platform === 'linux') {
            const result = spawnSync('zenity', ['--file-selection', '--directory', '--title=Choose a game root directory'], {
              encoding: 'utf8',
            });
            if (result.status === 0) {
              const selectedPath = result.stdout.trim().replace(/[\\/]+$/, '');
              return selectedPath.length > 0
                ? { cancelled: false, path: normalize(selectedPath) }
                : { cancelled: true };
            }
            return result.status === 1
              ? { cancelled: true }
              : { cancelled: false, error: `${result.stderr ?? ''}`.trim() || 'Directory picker failed.' };
          }

          if (process.platform === 'win32') {
            const script = [
              'Add-Type -AssemblyName System.Windows.Forms',
              '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
              '$dialog.Description = "Choose a game root directory"',
              '$dialog.UseDescriptionForTitle = $true',
              'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }',
            ].join('; ');
            const result = spawnSync(
              'powershell',
              ['-NoProfile', '-Command', script],
              { encoding: 'utf8' },
            );
            if (result.status === 0) {
              const selectedPath = result.stdout.trim().replace(/[\\/]+$/, '');
              return selectedPath.length > 0
                ? { cancelled: false, path: normalize(selectedPath) }
                : { cancelled: true };
            }
            return { cancelled: false, error: `${result.stderr ?? ''}`.trim() || 'Directory picker failed.' };
          }

          return { cancelled: false, error: `Directory picker is not implemented for platform ${process.platform}.` };
        };

        const pickGameProjectFilePath = (): { cancelled: boolean; path?: string; error?: string } => {
          if (process.platform === 'darwin') {
            const result = spawnSync(
              'osascript',
              ['-e', 'POSIX path of (choose file with prompt "Choose a project.sgrgame file" of type {"sgrgame"})'],
              { encoding: 'utf8' },
            );
            if (result.status === 0) {
              const selectedPath = result.stdout.trim();
              return selectedPath.length > 0
                ? { cancelled: false, path: normalize(selectedPath) }
                : { cancelled: true };
            }
            const stderr = `${result.stderr ?? ''}`.trim();
            if (stderr.includes('User canceled')) {
              return { cancelled: true };
            }
            return { cancelled: false, error: stderr || 'Project file picker failed.' };
          }

          if (process.platform === 'linux') {
            const result = spawnSync('zenity', ['--file-selection', '--title=Choose a project.sgrgame file', '--file-filter=*.sgrgame'], {
              encoding: 'utf8',
            });
            if (result.status === 0) {
              const selectedPath = result.stdout.trim();
              return selectedPath.length > 0
                ? { cancelled: false, path: normalize(selectedPath) }
                : { cancelled: true };
            }
            return result.status === 1
              ? { cancelled: true }
              : { cancelled: false, error: `${result.stderr ?? ''}`.trim() || 'Project file picker failed.' };
          }

          if (process.platform === 'win32') {
            const script = [
              'Add-Type -AssemblyName System.Windows.Forms',
              '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
              '$dialog.Title = "Choose a project.sgrgame file"',
              '$dialog.Filter = "Sugar Engine Game (*.sgrgame)|*.sgrgame"',
              'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.FileName }',
            ].join('; ');
            const result = spawnSync(
              'powershell',
              ['-NoProfile', '-Command', script],
              { encoding: 'utf8' },
            );
            if (result.status === 0) {
              const selectedPath = result.stdout.trim();
              return selectedPath.length > 0
                ? { cancelled: false, path: normalize(selectedPath) }
                : { cancelled: true };
            }
            return { cancelled: false, error: `${result.stderr ?? ''}`.trim() || 'Project file picker failed.' };
          }

          return { cancelled: false, error: `Project file picker is not implemented for platform ${process.platform}.` };
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
          const pipelineValidation = (typeof pipeline.validation === 'object' && pipeline.validation !== null)
            ? pipeline.validation as Record<string, unknown>
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
          const pipelineGeneration = (typeof pipeline.generation === 'object' && pipeline.generation !== null)
            ? pipeline.generation as Record<string, unknown>
            : {};
          const pipelineDraftGeneration = (typeof pipelineGeneration.draft === 'object' && pipelineGeneration.draft !== null)
            ? pipelineGeneration.draft as Record<string, unknown>
            : {};
          const pipelineReplyPartsGeneration = (typeof pipelineGeneration.replyParts === 'object' && pipelineGeneration.replyParts !== null)
            ? pipelineGeneration.replyParts as Record<string, unknown>
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
              source: normalizeOptionalString(pipelineValidation.source) ?? 'npc_output',
              npcOutputValidated: pipelineValidation.npcOutputValidated !== false,
              progressionGateEvaluated: pipelineValidation.progressionGateEvaluated === true,
            },
            generation: {
              draft: {
                attempted: pipelineDraftGeneration.attempted === true,
                success: pipelineDraftGeneration.success === true,
                failureReason: normalizeOptionalString(pipelineDraftGeneration.failureReason) ?? undefined,
                skippedReason: normalizeOptionalString(pipelineDraftGeneration.skippedReason) ?? undefined,
              },
              replyParts: {
                attempted: pipelineReplyPartsGeneration.attempted === true,
                success: pipelineReplyPartsGeneration.success === true,
                partCount: toFiniteNumber(pipelineReplyPartsGeneration.partCount) ?? 0,
                groundedPartCount: toFiniteNumber(pipelineReplyPartsGeneration.groundedPartCount) ?? 0,
                failureReason: normalizeOptionalString(pipelineReplyPartsGeneration.failureReason) ?? undefined,
                skippedReason: normalizeOptionalString(pipelineReplyPartsGeneration.skippedReason) ?? undefined,
                rawResponsePreview: normalizeOptionalString(pipelineReplyPartsGeneration.rawResponsePreview) ?? undefined,
                rawPartsPreview: Array.isArray(pipelineReplyPartsGeneration.rawPartsPreview)
                  ? pipelineReplyPartsGeneration.rawPartsPreview as Array<Record<string, unknown>>
                  : undefined,
                allowedSupportSlots: normalizeStringArray(pipelineReplyPartsGeneration.allowedSupportSlots),
              },
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

        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url ?? '/', 'http://localhost');
          if (!url.pathname.startsWith('/__sugarengine/game-assets/')) {
            next();
            return;
          }

          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.statusCode = 405;
            res.end('Method not allowed');
            return;
          }

          const remainder = decodeURIComponent(url.pathname.slice('/__sugarengine/game-assets/'.length));
          const firstSlashIndex = remainder.indexOf('/');
          if (firstSlashIndex <= 0) {
            res.statusCode = 400;
            res.end('Missing game id or asset path');
            return;
          }

          const gameId = remainder.slice(0, firstSlashIndex).trim();
          const assetPath = remainder.slice(firstSlashIndex + 1).trim();
          const gameRoot = resolveRegisteredGameRoot(gameId);
          if (!gameRoot) {
            res.statusCode = 404;
            res.end('Unknown game root');
            return;
          }

          const assetsRoot = join(gameRoot, 'assets');
          const filePath = resolve(assetsRoot, assetPath);
          const relativePath = relative(assetsRoot, filePath);
          if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
            res.statusCode = 403;
            res.end('Forbidden asset path');
            return;
          }

          if (!fsSync.existsSync(filePath) || fsSync.statSync(filePath).isDirectory()) {
            res.statusCode = 404;
            res.end('Asset not found');
            return;
          }

          try {
            const content = await fs.readFile(filePath);
            res.statusCode = 200;
            res.setHeader('Content-Type', contentTypeForPath(filePath));
            res.setHeader('Cache-Control', 'no-store');
            res.end(req.method === 'HEAD' ? undefined : content);
          } catch (error) {
            res.statusCode = 500;
            res.end(error instanceof Error ? error.message : String(error));
          }
        });

        server.middlewares.use('/__sugarengine/pick-directory', async (req, res) => {
          if (req.method !== 'POST') {
            writeJson(res, 405, { ok: false, error: 'Method not allowed' });
            return;
          }

          const selection = pickDirectoryPath();
          if (selection.cancelled) {
            writeJson(res, 200, { ok: true, cancelled: true, path: null });
            return;
          }
          if (selection.error) {
            writeJson(res, 500, { ok: false, error: selection.error });
            return;
          }
          writeJson(res, 200, { ok: true, cancelled: false, path: selection.path ?? null });
        });

        server.middlewares.use('/__sugarengine/pick-project-file', async (req, res) => {
          if (req.method !== 'POST') {
            writeJson(res, 405, { ok: false, error: 'Method not allowed' });
            return;
          }

          const selection = pickGameProjectFilePath();
          if (selection.cancelled) {
            writeJson(res, 200, { ok: true, cancelled: true, path: null });
            return;
          }
          if (selection.error) {
            writeJson(res, 500, { ok: false, error: selection.error });
            return;
          }
          writeJson(res, 200, { ok: true, cancelled: false, path: selection.path ?? null });
        });

        server.middlewares.use('/__sugarengine/game-root', async (req, res) => {
          if (req.method !== 'POST') {
            writeJson(res, 405, { ok: false, error: 'Method not allowed' });
            return;
          }

          try {
            const body = await readRequestBody(req);
            const op = normalizeOptionalString(body.op);
            const module = await getGameRootModule();

            if (op === 'register') {
              const gameId = normalizeOptionalString(body.gameId);
              const rootPath = normalizeOptionalString(body.rootPath);
              if (!gameId || !rootPath || !isValidSlug(gameId)) {
                writeJson(res, 400, { ok: false, error: 'Missing or invalid gameId/rootPath' });
                return;
              }
              registerGameRoot(gameId, rootPath);
              writeJson(res, 200, { ok: true, gameId, rootPath: resolveAbsoluteInputPath(rootPath) });
              return;
            }

            if (op === 'create') {
              const name = normalizeOptionalString(body.name);
              const slug = normalizeOptionalString(body.slug);
              const rootPathInput = normalizeOptionalString(body.rootPath);
              if (!name || !slug || !rootPathInput || !isValidSlug(slug)) {
                writeJson(res, 400, { ok: false, error: 'Missing required create-game fields' });
                return;
              }

              const paths = resolveGameRootPaths(rootPathInput);
              const conflictingFiles = [
                paths.projectFilePath,
                paths.gameConfigPath,
                paths.publishedAssetsManifestPath,
              ].filter((candidate) => fsSync.existsSync(candidate));
              if (conflictingFiles.length > 0) {
                writeJson(res, 409, {
                  ok: false,
                  error: `Refusing to scaffold over existing file: ${conflictingFiles[0]}`,
                });
                return;
              }

              const directories = [
                paths.rootPath,
                paths.assetsPath,
                join(paths.assetsPath, 'audio'),
                join(paths.assetsPath, 'items'),
                join(paths.assetsPath, 'models'),
                join(paths.assetsPath, 'regions'),
                join(paths.assetsPath, 'ui'),
                paths.pluginsPath,
                paths.runtimePath,
                paths.runtimeBinPath,
                paths.runtimeModelsPath,
                paths.configPath,
                paths.manifestsPath,
                paths.exportsPath,
              ];
              for (const directory of directories) {
                await fs.mkdir(directory, { recursive: true });
              }

              const project = module.createStarterProjectDocument({ gameId: slug, name });
              await fs.writeFile(paths.projectFilePath, module.stringifyProjectDocument(project), 'utf8');
              await fs.writeFile(
                paths.gameConfigPath,
                `${JSON.stringify(module.createStarterGameConfig(slug), null, 2)}\n`,
                'utf8',
              );
              await fs.writeFile(
                paths.publishedAssetsManifestPath,
                `${JSON.stringify(module.createEmptyPublishedAssetsManifest(), null, 2)}\n`,
                'utf8',
              );
              registerGameRoot(slug, paths.rootPath);
              writeJson(res, 200, {
                ok: true,
                rootPath: paths.rootPath,
                projectFilePath: paths.projectFilePath,
                project,
              });
              return;
            }

            if (op === 'open') {
              const inputPath = normalizeOptionalString(body.path);
              if (!inputPath) {
                writeJson(res, 400, { ok: false, error: 'Missing game path' });
                return;
              }

              const resolvedPaths = resolveProjectInputPath(inputPath);
              if (!fsSync.existsSync(resolvedPaths.projectFilePath)) {
                writeJson(res, 404, { ok: false, error: `No project.sgrgame found at ${resolvedPaths.projectFilePath}` });
                return;
              }

              const raw = await fs.readFile(resolvedPaths.projectFilePath, 'utf8');
              const project = module.normalizeLoadedProjectDocument(JSON.parse(raw), {
                fallbackName: resolvedPaths.rootPath,
              });
              const projectGameId = normalizeOptionalString((project as { meta?: { gameId?: string } }).meta?.gameId);
              if (projectGameId) {
                registerGameRoot(projectGameId, resolvedPaths.rootPath);
              }

              writeJson(res, 200, {
                ok: true,
                rootPath: resolvedPaths.rootPath,
                projectFilePath: resolvedPaths.projectFilePath,
                project,
              });
              return;
            }

            if (op === 'save') {
              const projectInput = (typeof body.project === 'object' && body.project !== null)
                ? body.project
                : null;
              const projectFilePathInput = normalizeOptionalString(body.projectFilePath);
              const rootPathInput = normalizeOptionalString(body.rootPath);
              if (!projectInput || !projectFilePathInput || !rootPathInput) {
                writeJson(res, 400, { ok: false, error: 'Missing save payload' });
                return;
              }

              const rootPath = resolveAbsoluteInputPath(rootPathInput);
              const projectFilePath = resolveAbsoluteInputPath(projectFilePathInput);
              await fs.mkdir(dirname(projectFilePath), { recursive: true });
              const project = module.normalizeLoadedProjectDocument(projectInput);
              await fs.writeFile(projectFilePath, module.stringifyProjectDocument(project), 'utf8');
              registerGameRoot((project as { meta: { gameId: string } }).meta.gameId, rootPath);
              writeJson(res, 200, {
                ok: true,
                rootPath,
                projectFilePath,
                project,
              });
              return;
            }

            writeJson(res, 400, { ok: false, error: 'Unknown game-root op' });
          } catch (error) {
            writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
          }
        });

        // ---------------------------------------------------------------
        // Plugin artifact I/O endpoint
        // Supports read/write/list/delete for plugin artifact files
        // under {gameRoot}/plugins/{pluginId}/...
        // ---------------------------------------------------------------
        server.middlewares.use('/__sugarengine/plugin-artifact', async (req, res) => {
          if (req.method !== 'POST') {
            writeJson(res, 405, { ok: false, error: 'Method not allowed' });
            return;
          }

          try {
            const body = await readRequestBody(req);
            const op = normalizeOptionalString(body.op);
            const gameId = normalizeOptionalString(body.gameId);
            const pluginId = normalizeOptionalString(body.pluginId);
            const artifactPath = normalizeOptionalString(body.artifactPath);

            if (!gameId || !pluginId) {
              writeJson(res, 400, { ok: false, error: 'Missing gameId or pluginId' });
              return;
            }

            // Validate pluginId contains no path traversal
            if (pluginId.includes('..') || pluginId.includes('/') || pluginId.includes('\\')) {
              writeJson(res, 400, { ok: false, error: 'Invalid pluginId' });
              return;
            }

            const gameRoot = resolveRegisteredGameRoot(gameId);
            if (!gameRoot) {
              writeJson(res, 404, { ok: false, error: 'Unknown game root' });
              return;
            }

            const pluginDir = resolve(gameRoot, 'plugins', pluginId);

            if (op === 'list') {
              // List all JSON files under the plugin directory recursively
              if (!fsSync.existsSync(pluginDir)) {
                writeJson(res, 200, { ok: true, files: [] });
                return;
              }
              const files: string[] = [];
              const walk = (dir: string) => {
                for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
                  if (entry.isDirectory()) {
                    walk(join(dir, entry.name));
                  } else if (entry.name.endsWith('.json')) {
                    files.push(relative(pluginDir, join(dir, entry.name)));
                  }
                }
              };
              walk(pluginDir);
              writeJson(res, 200, { ok: true, files });
              return;
            }

            if (!artifactPath) {
              writeJson(res, 400, { ok: false, error: 'Missing artifactPath' });
              return;
            }

            // Validate artifact path — no traversal
            const filePath = resolve(pluginDir, artifactPath);
            const relativePath = relative(pluginDir, filePath);
            if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
              writeJson(res, 403, { ok: false, error: 'Forbidden artifact path' });
              return;
            }

            if (op === 'read') {
              if (!fsSync.existsSync(filePath)) {
                writeJson(res, 404, { ok: false, error: 'Artifact not found' });
                return;
              }
              const content = await fs.readFile(filePath, 'utf8');
              writeJson(res, 200, { ok: true, content });
              return;
            }

            if (op === 'write') {
              const content = typeof body.content === 'string' ? body.content : null;
              if (!content) {
                writeJson(res, 400, { ok: false, error: 'Missing content' });
                return;
              }
              await fs.mkdir(dirname(filePath), { recursive: true });
              await fs.writeFile(filePath, content, 'utf8');
              writeJson(res, 200, { ok: true });
              return;
            }

            if (op === 'delete') {
              if (fsSync.existsSync(filePath)) {
                await fs.unlink(filePath);
              }
              writeJson(res, 200, { ok: true });
              return;
            }

            writeJson(res, 400, { ok: false, error: 'Unknown plugin-artifact op' });
          } catch (error) {
            writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
          }
        });

        const readActiveGameSlug = async (): Promise<string> => {
          const selection = await readActiveGameSelection();
          return selection?.slug ?? '';
        };

        const resolveRuntimeGameSlug = async (requestedGameId?: string): Promise<string> => {
          if (typeof requestedGameId === 'string') {
            const trimmed = requestedGameId.trim();
            if (isValidSlug(trimmed) && resolveRegisteredGameRoot(trimmed)) {
              return trimmed;
            }
          }
          return readActiveGameSlug();
        };

        const hasLoreArtifacts = (loreDir: string): boolean => {
          return fsSync.existsSync(resolve(loreDir, 'manifest.json'))
            && fsSync.existsSync(resolve(loreDir, 'chunks.json'));
        };

        const resolveSessionLoreConfig = (slug: string): {
          loreDir: string;
          useLore: boolean;
          missingGameLoreBundle?: boolean;
          errorMessage?: string;
        } => {
          if (!slug) {
            return {
              loreDir: defaultLoreDir,
              useLore: false,
            };
          }

          const registeredGameRoot = resolveRegisteredGameRoot(slug);
          const gameLoreDir = registeredGameRoot
            ? resolve(registeredGameRoot, 'plugins', 'sugaragent', 'lore', 'generated')
            : '';
          const matchedGameLore = [gameLoreDir]
            .filter((candidate) => candidate.length > 0)
            .find((candidate) => hasLoreArtifacts(candidate));
          if (matchedGameLore) {
            return {
              loreDir: matchedGameLore,
              useLore: true,
            };
          }

          const warningKey = `${slug}:missing-game-lore`;
          const errorMessage =
            `[sugaragent][lore][error] No game-specific lore bundle found for "${slug}".\n`
            + `Expected one of:\n`
            + `  - ${gameLoreDir}\n`
            + 'Re-ingest game lore to restore SugarAgent grounding for this game.';
          if (!loreResolutionWarnings.has(warningKey)) {
            loreResolutionWarnings.add(warningKey);
            console.error(errorMessage);
          }

          return {
            loreDir: gameLoreDir || defaultLoreDir,
            useLore: false,
            missingGameLoreBundle: true,
            errorMessage,
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
          const registeredGameRoot = resolveRegisteredGameRoot(slug);
          const gameBundle = registeredGameRoot
            ? resolve(registeredGameRoot, 'plugins', 'sugaragent', 'authoring.bundle.json')
            : '';
          if (fsSync.existsSync(gameBundle)) {
            return gameBundle;
          }
          return resolve(projectRoot, 'public', 'games', slug, 'plugins', 'sugaragent', 'authoring.bundle.json');
        };

        const resolveLoreLockPath = (slug: string): string | null => {
          const registeredGameRoot = slug ? resolveRegisteredGameRoot(slug) : null;
          const candidatePaths = [
            registeredGameRoot
              ? resolve(registeredGameRoot, 'plugins', 'sugaragent', 'lore', 'lore-source.lock.json')
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
          const registeredGameRoot = slug ? resolveRegisteredGameRoot(slug) : null;
          if (slug && !registeredGameRoot) {
            throw new Error(`No registered game root found for "${slug}". Open the game in SugarEngine first.`);
          }
          const outputDir = slug
            ? registeredGameRoot
              ? resolve(registeredGameRoot, 'plugins', 'sugaragent', 'lore', 'generated')
              : defaultLoreDir
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

          const {
            ingestLoreDirectory,
            writeLoreArtifacts,
          } = await server.ssrLoadModule('/src/plugins/sugaragent/lore/lore-lib.ts') as {
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
              const { createSugarAgentSession } = await server.ssrLoadModule('/src/plugins/sugaragent/session/runtime.ts') as {
                createSugarAgentSession: (options: Record<string, unknown>) => Promise<{
                  runTurn: (
                    playerMessage: string,
                    turnOptions?: {
                      npcName?: string;
                      npcProfileOverride?: Record<string, unknown>;
                      globalSafetyBoundsOverride?: string[];
                      context?: Record<string, unknown>;
                      attempt?: number;
                      repair?: boolean;
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
                missingGameLoreBundle: loreConfig.missingGameLoreBundle === true,
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

          const body = await readRequestBody(req);
          const slug = normalizeOptionalString(body.slug) ?? '';
          const rootPath = normalizeOptionalString(body.rootPath);
          const projectFilePath = normalizeOptionalString(body.projectFilePath);
          if (!isValidSlug(slug)) {
            res.statusCode = 400;
            res.end('Invalid game slug');
            return;
          }

          const resolvedRootPath = rootPath
            ? resolveAbsoluteInputPath(rootPath)
            : resolveRegisteredGameRoot(slug);
          if (!resolvedRootPath) {
            res.statusCode = 404;
            res.end('Missing game root for active game selection');
            return;
          }

          registerGameRoot(slug, resolvedRootPath);
          await writeActiveGameSelection({
            slug,
            rootPath: resolvedRootPath,
            projectFilePath: projectFilePath
              ? resolveAbsoluteInputPath(projectFilePath)
              : join(resolvedRootPath, 'project.sgrgame'),
          });

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
              const attempt = Number.isFinite(request.attempt)
                ? Math.max(1, Math.floor(Number(request.attempt)))
                : 1;
              const repair = request.repair === true;
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
                attempt,
                repair,
              });
              const diagnostics = buildTurnDiagnostics(result, requestContext);
              writeJson(res, 200, {
                ok: true,
                jsonText: JSON.stringify(result.output),
                attempts: result.attempts,
                usedFallback: result.usedFallback,
                validationErrors: result.validationErrors,
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
