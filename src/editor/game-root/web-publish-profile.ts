import type { GameRootPaths } from './fs-paths';
import type { SugarAgentGenerationConfig } from '../../../packages/sugaragent-runtime-core/src/runtime/generation-config';
import { resolveSugarAgentGenerationConfig } from '../../../packages/sugaragent-runtime-core/src/runtime/generation-config';

export type WebPublishTarget = 'web';
export type WebPublishEnvironment = 'staging' | 'production';
export type WebPublishCredentials = 'include' | 'same-origin' | 'omit';

export interface WebPublishFrontendConfig {
  gameApiBaseUrl: string;
  backendRequired: boolean;
  credentials: WebPublishCredentials;
}

export interface WebPublishProfile {
  target: WebPublishTarget;
  environment: WebPublishEnvironment;
  profilePath: string;
  frontend: WebPublishFrontendConfig;
  sugaragent: {
    generation: SugarAgentGenerationConfig;
  };
}

export function normalizeWebPublishSugarAgentGenerationConfig(
  generation: unknown,
): SugarAgentGenerationConfig {
  const resolvedGeneration = resolveSugarAgentGenerationConfig({
    generation: (typeof generation === 'object' && generation !== null)
      ? generation as SugarAgentGenerationConfig
      : undefined,
  });

  return {
    provider: resolvedGeneration.provider,
    selfHosted: {
      runtimeMode: resolvedGeneration.selfHosted.runtimeMode,
    },
    openai: {
      model: resolvedGeneration.openai.model,
      baseUrl: resolvedGeneration.openai.baseUrl,
    },
  };
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeGameApiBaseUrl(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.replace(/\/+$/, '') : undefined;
}

function parseBooleanFlag(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

export function normalizeWebPublishCredentials(
  value: unknown,
  fallback: WebPublishCredentials = 'include',
): WebPublishCredentials {
  if (value === 'include' || value === 'same-origin' || value === 'omit') {
    return value;
  }
  return fallback;
}

export function normalizeWebPublishEnvironment(value: unknown): WebPublishEnvironment | null {
  return value === 'staging' || value === 'production' ? value : null;
}

export function resolveWebPublishProfilePath(
  rootPaths: Pick<GameRootPaths, 'webProfileStagingPath' | 'webProfileProductionPath'>,
  environment: WebPublishEnvironment,
): string {
  return environment === 'production'
    ? rootPaths.webProfileProductionPath
    : rootPaths.webProfileStagingPath;
}

export function parseWebPublishProfile(
  rawProfile: unknown,
  profilePath: string,
  fallbackEnvironment: WebPublishEnvironment,
): WebPublishProfile {
  const profile = typeof rawProfile === 'object' && rawProfile !== null
    ? rawProfile as Record<string, unknown>
    : null;
  if (!profile) {
    throw new Error(`Invalid web publish profile at ${profilePath}.`);
  }

  const target = profile.target === 'web' ? 'web' : null;
  if (!target) {
    throw new Error(`Web publish profile ${profilePath} must declare target "web".`);
  }

  const environment = normalizeWebPublishEnvironment(profile.environment) ?? fallbackEnvironment;
  const rawFrontend = typeof profile.frontend === 'object' && profile.frontend !== null
    ? profile.frontend as Record<string, unknown>
    : null;
  const gameApiBaseUrl = normalizeGameApiBaseUrl(rawFrontend?.gameApiBaseUrl);
  if (!gameApiBaseUrl) {
    throw new Error(`Web publish profile ${profilePath} is missing frontend.gameApiBaseUrl.`);
  }
  const rawSugarAgent = typeof profile.sugaragent === 'object' && profile.sugaragent !== null
    ? profile.sugaragent as Record<string, unknown>
    : {};

  return {
    target,
    environment,
    profilePath,
    frontend: {
      gameApiBaseUrl,
      backendRequired: parseBooleanFlag(rawFrontend?.backendRequired, true),
      credentials: normalizeWebPublishCredentials(rawFrontend?.credentials, 'include'),
    },
    sugaragent: {
      generation: normalizeWebPublishSugarAgentGenerationConfig(rawSugarAgent.generation),
    },
  };
}

export function applyWebPublishProfileOverrides(
  profile: WebPublishProfile,
  overrides: Partial<WebPublishFrontendConfig> | null | undefined,
): WebPublishProfile {
  const gameApiBaseUrl = normalizeGameApiBaseUrl(overrides?.gameApiBaseUrl)
    ?? profile.frontend.gameApiBaseUrl;

  return {
    ...profile,
    frontend: {
      gameApiBaseUrl,
      backendRequired: typeof overrides?.backendRequired === 'boolean'
        ? overrides.backendRequired
        : profile.frontend.backendRequired,
      credentials: normalizeWebPublishCredentials(
        overrides?.credentials,
        profile.frontend.credentials,
      ),
    },
  };
}
