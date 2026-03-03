import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
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
        const sessionCache = new Map<string, Promise<{
          runTurn: (playerMessage: string) => Promise<{ output: Record<string, unknown>; usedFallback?: boolean }>;
          startup?: { runtime?: { health?: { detail?: string } } };
        }>>();

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

        const getSugarAgentSession = async (npcId: string) => {
          const slug = await readActiveGameSlug();
          const cacheKey = `${slug || 'default'}:${npcId}`;
          let pending = sessionCache.get(cacheKey);
          if (!pending) {
            pending = (async () => {
              const runtimeModulePath = pathToFileURL(
                resolve(projectRoot, 'src/plugins/sugaragent/session/runtime.mjs'),
              ).href;
              const { createSugarAgentSession } = await import(runtimeModulePath) as {
                createSugarAgentSession: (options: Record<string, unknown>) => Promise<{
                  runTurn: (playerMessage: string) => Promise<{ output: Record<string, unknown>; usedFallback?: boolean }>;
                  startup?: { runtime?: { health?: { detail?: string } } };
                }>;
              };

              const authoringBundlePath = slug
                ? resolve(projectRoot, 'public', 'games', slug, 'plugins', 'sugaragent', 'authoring.bundle.json')
                : resolve(projectRoot, 'public', 'plugins', 'sugaragent', 'authoring.bundle.json');

              const sessionId = `preview-${slug || 'default'}-${npcId}`
                .replace(/[^a-zA-Z0-9._-]+/g, '-')
                .slice(0, 64);

              return createSugarAgentSession({
                npc: npcId,
                provider: 'local',
                runtime: process.env.SUGARAGENT_RUNTIME ?? 'auto',
                simulateInvalidJson: process.env.SUGARAGENT_SIM_INVALID_JSON ?? 'never',
                authoringBundlePath,
                session: sessionId,
                useLore: process.env.SUGARAGENT_USE_LORE === 'false' ? false : true,
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
          if (!/^[a-z0-9-]+$/.test(slug)) {
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
              if (!playerMessage) {
                writeJson(res, 400, { ok: false, error: 'Missing playerMessage' });
                return;
              }

              const session = await getSugarAgentSession(npcId);
              const result = await session.runTurn(playerMessage);
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
