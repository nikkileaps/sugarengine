export type PublishedWebRuntimeTarget = 'local_preview' | 'hosted_web';

export interface LocalPreviewWebRuntimeConfig {
  target: 'local_preview';
  backendRequired: false;
  credentials: 'same-origin';
}

export interface HostedWebRuntimeConfig {
  target: 'hosted_web';
  gameApiBaseUrl: string;
  backendRequired: boolean;
  credentials: RequestCredentials;
}

export type PublishedWebRuntimeConfig =
  | LocalPreviewWebRuntimeConfig
  | HostedWebRuntimeConfig;

interface RuntimeEnvShape {
  VITE_GAME_API_BASE_URL?: string;
  VITE_GAME_API_REQUIRED?: string;
  VITE_GAME_API_CREDENTIALS?: string;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : undefined;
}

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function normalizeCredentials(value: string | undefined): RequestCredentials {
  if (value === 'omit' || value === 'same-origin' || value === 'include') {
    return value;
  }
  return 'include';
}

export function resolvePublishedWebRuntimeConfig(
  env: RuntimeEnvShape = import.meta.env,
): PublishedWebRuntimeConfig {
  const gameApiBaseUrl = normalizeOptionalString(env.VITE_GAME_API_BASE_URL);
  if (!gameApiBaseUrl) {
    return {
      target: 'local_preview',
      backendRequired: false,
      credentials: 'same-origin',
    };
  }

  return {
    target: 'hosted_web',
    gameApiBaseUrl: gameApiBaseUrl.replace(/\/+$/, ''),
    backendRequired: parseBooleanFlag(env.VITE_GAME_API_REQUIRED, true),
    credentials: normalizeCredentials(env.VITE_GAME_API_CREDENTIALS),
  };
}

export function isHostedWebRuntimeConfig(
  config: PublishedWebRuntimeConfig,
): config is HostedWebRuntimeConfig {
  return config.target === 'hosted_web';
}

let nextBrowserTraceId = 1;

export function createBrowserTraceId(prefix = 'web'): string {
  return `trace_${prefix}_${nextBrowserTraceId++}_${Date.now()}`;
}
