import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'sugarengine-active-game-sync',
      configureServer(server) {
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

          const projectRoot = process.cwd();
          const gameDir = resolve(projectRoot, 'games', slug);
          if (!fsSync.existsSync(gameDir)) {
            res.statusCode = 404;
            res.end('Unknown game slug');
            return;
          }

          const activeGameFile = resolve(projectRoot, 'games', '.active-game');
          await fs.mkdir(resolve(projectRoot, 'games'), { recursive: true });
          await fs.writeFile(activeGameFile, `${slug}\n`, 'utf8');

          res.statusCode = 204;
          res.end();
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
