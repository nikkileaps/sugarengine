import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

/**
 * Vite config for building the game-only bundle (no editor).
 * Used for publishing to Netlify.
 */
const isDeployBuild = process.env.DEPLOY_BUILD === 'true';

function normalizeDeployBasePath(input?: string): string {
  const value = (input ?? '').trim();
  if (!value || value === '/') {
    return '/';
  }
  const withoutLeading = value.startsWith('/') ? value.slice(1) : value;
  const withoutTrailing = withoutLeading.endsWith('/')
    ? withoutLeading.slice(0, -1)
    : withoutLeading;
  return `/${withoutTrailing}/`;
}

const deployBasePath = normalizeDeployBasePath(process.env.DEPLOY_BASE_PATH);

export default defineConfig({
  plugins: [react()],
  base: isDeployBuild ? deployBasePath : '/',
  build: {
    outDir: 'dist-game',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: resolve(__dirname, 'game.html'),
    },
  },
});
