import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

/**
 * Vite config for building the game-only bundle (no editor).
 * Used for publishing to Netlify.
 */
const isDeployBuild = process.env.DEPLOY_BUILD === 'true';

export default defineConfig({
  plugins: [react()],
  base: isDeployBuild ? '/game/' : '/',
  build: {
    outDir: 'dist-game',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: resolve(__dirname, 'game.html'),
    },
  },
});
