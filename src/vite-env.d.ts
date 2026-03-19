/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAME_SLUG?: string;
  readonly VITE_GAME_API_BASE_URL?: string;
  readonly VITE_GAME_API_REQUIRED?: string;
  readonly VITE_GAME_API_CREDENTIALS?: 'include' | 'same-origin' | 'omit';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
