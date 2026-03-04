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
              npcProfileOverride?: Record<string, unknown>;
              globalSafetyBoundsOverride?: string[];
              context?: Record<string, unknown>;
            },
          ) => Promise<{ output: Record<string, unknown>; usedFallback?: boolean }>;
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
          ];
          const matched = candidateLoreDirs.find((candidate) => hasLoreArtifacts(candidate));
          return {
            loreDir: matched ?? candidateLoreDirs[0] ?? defaultLoreDir,
            useLore: Boolean(matched),
          };
        };

        const clearSessionForNpc = async (npcId: string, requestedGameId?: string) => {
          const slug = await resolveRuntimeGameSlug(requestedGameId);
          const cacheKey = `${slug || 'default'}:${npcId}`;
          const sessionId = buildPreviewSessionId(slug, npcId);
          const sessionFile = resolve(projectRoot, '.sugaragent-sim-sessions', `${sessionId}.json`);
          const removedCache = sessionCache.delete(cacheKey);
          let removedFile = false;
          if (fsSync.existsSync(sessionFile)) {
            await fs.unlink(sessionFile);
            removedFile = true;
          }
          return {
            slug,
            npcId,
            sessionId,
            removedCache,
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

        const getSugarAgentSession = async (npcId: string, requestedGameId?: string) => {
          const slug = await resolveRuntimeGameSlug(requestedGameId);
          const cacheKey = `${slug || 'default'}:${npcId}`;
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
                      npcProfileOverride?: Record<string, unknown>;
                      globalSafetyBoundsOverride?: string[];
                      context?: Record<string, unknown>;
                    },
                  ) => Promise<{ output: Record<string, unknown>; usedFallback?: boolean }>;
                  startup?: { runtime?: { health?: { detail?: string } } };
                }>;
              };

              const authoringBundlePath = resolveSessionAuthoringBundlePath(slug);

              const sessionId = buildPreviewSessionId(slug, npcId);

              return createSugarAgentSession({
                npc: npcId,
                provider: 'local',
                runtime: process.env.SUGARAGENT_RUNTIME ?? 'auto',
                simulateInvalidJson: process.env.SUGARAGENT_SIM_INVALID_JSON ?? 'never',
                authoringBundlePath,
                session: sessionId,
                loreDir: loreConfig.loreDir,
                useLore: process.env.SUGARAGENT_USE_LORE === 'false'
                  ? false
                  : loreConfig.useLore,
                requireLoreScopeForRetrieval: true,
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
                const session = await getSugarAgentSession('health-check');
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
              const playerMessage = typeof request.playerMessage === 'string'
                ? request.playerMessage.trim()
                : '';
              const requestContext = (typeof request.context === 'object' && request.context !== null)
                ? request.context as Record<string, unknown>
                : {};
              const requestedGameId = typeof requestContext.gameId === 'string'
                ? requestContext.gameId.trim()
                : undefined;
              const npcProfile = (typeof request.npcProfile === 'object' && request.npcProfile !== null)
                ? request.npcProfile as Record<string, unknown>
                : undefined;
              const globalSafetyBounds = normalizeStringArray(request.globalSafetyBounds);
              if (!playerMessage) {
                writeJson(res, 400, { ok: false, error: 'Missing playerMessage' });
                return;
              }

              const session = await getSugarAgentSession(npcId, requestedGameId);
              const result = await session.runTurn(playerMessage, {
                npcProfileOverride: npcProfile,
                globalSafetyBoundsOverride: globalSafetyBounds,
                context: requestContext,
              });
              writeJson(res, 200, {
                ok: true,
                jsonText: JSON.stringify(result.output),
                detail: result.usedFallback ? 'provider-fallback' : 'provider-ok',
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
