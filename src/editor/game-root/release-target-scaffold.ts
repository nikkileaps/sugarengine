/**
 * @file release-target-scaffold.ts
 * @description Scaffold contract for generated release target structure in game repositories.
 */

import { joinFsPath, type GameRootPaths } from './fs-paths';

export interface ScaffoldFile {
  path: string;
  content: string;
  overwrite: 'never';
}

export interface ReleaseTargetScaffold {
  directories: string[];
  files: ScaffoldFile[];
}

function toPackageNameSlug(gameId: string): string {
  return gameId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function buildWebTargetReadme(gameId: string, gameName: string): string {
  return `# Web Release Target

This directory was scaffolded by SugarEngine for the \`web\` release target for "${gameName}".

## Ownership

- SugarEngine owns the target shape and may add missing scaffold files later.
- The game repository owns deployment configuration, workflow customization, and backend implementation details.
- Existing files should be treated as game-owned once edited; scaffold refreshes should only add missing files.

## Structure

- \`profile.staging.json\`
- \`profile.production.json\`
- \`game-api/\`

## Current Maturity

- Phase 2: target structure and deployment profiles
- Phase 3: bootable \`game-api\` skeleton with health, readiness, route modules, and anonymous \`player/me\`
- Phase 4: shared-alpha auth, signed session cookies, and in-memory abuse controls for protected routes
- Phase 5: hosted SugarAgent route wiring through shared runtime-service contracts and the production browser bridge
- Phase 6: published web client hosted-session bootstrap and hosted bridge selection
- Phase 7: automated deployment profiles, GitHub Actions workflows, Cloud Run container deployment, Netlify frontend deployment, and release metadata capture

## Service Naming

The default backend service naming rule is:

- \`${gameId}-api\`
- \`${gameId}-api-staging\`
- \`${gameId}-api-production\`

## Frontend Artifact Contract

The game repository's web workflows expect SugarEngine to publish the frontend export into:

- \`exports/web/client/\`

The web workflows deploy that exported artifact directly. They do not rebuild the SugarEngine editor app inside the game repository.

## SugarAgent Runtime Assets

- The published \`@nikkileaps/sugaragent-runtime-core\` package is code-only and does not carry native binaries or model payloads.
- Local preview resolves SugarAgent runtime assets from explicit environment variables first, then from the SugarEngine workspace when available.
- The scaffolded \`web\` target assembles Linux SugarAgent runtime assets during the \`game-api\` container build using URLs from the deployment profile.

`;
}

function buildProfileContent(gameId: string, environment: 'staging' | 'production'): string {
  const serviceName = environment === 'production'
    ? `${gameId}-api`
    : `${gameId}-api-${environment}`;
  const frontendHost = environment === 'production'
    ? `https://${gameId}.example.com`
    : `https://${environment}-${gameId}.example.com`;
  const apiBaseUrl = environment === 'production'
    ? `https://api.${gameId}.example.com`
    : `https://${environment}-api.${gameId}.example.com`;
  const artifactRegistryRepository = `${gameId}-web`;
  const artifactRegistryHost = 'us-central1-docker.pkg.dev';
  const cloudProjectId = 'replace-me';
  const frontendSiteId = `replace-me-${gameId}-${environment}`;
  const frontendSiteName = environment === 'production'
    ? `${gameId}`
    : `${gameId}-${environment}`;

  return `${JSON.stringify({
    profileVersion: 1,
    target: 'web',
    environment,
    gameSlug: gameId,
    frontend: {
      provider: 'netlify',
      host: frontendHost,
      publishDirectory: 'exports/web/client',
      siteId: frontendSiteId,
      siteName: frontendSiteName,
      gameApiBaseUrl: apiBaseUrl,
      backendRequired: true,
      credentials: 'include',
    },
    backend: {
      serviceName,
      sourcePath: 'release/targets/web/game-api',
      port: 8080,
      imageRepository: `${artifactRegistryHost}/${cloudProjectId}/${artifactRegistryRepository}/${serviceName}`,
    },
    artifactRegistry: {
      host: artifactRegistryHost,
      repository: artifactRegistryRepository,
      projectId: cloudProjectId,
    },
    cloudRun: {
      projectId: cloudProjectId,
      region: 'us-central1',
      cpu: '1',
      memory: '2Gi',
      minInstances: 1,
      maxInstances: 4,
      allowUnauthenticated: false,
    },
    auth: {
      enabled: true,
      mode: 'shared-alpha-session',
      cookieSecretName: `${serviceName}-cookie-secret`,
      sharedAlphaUsernameSecretName: `${serviceName}-shared-alpha-username`,
      sharedAlphaPasswordHashSecretName: `${serviceName}-shared-alpha-password-hash`,
    },
    sugaragent: {
      generation: {
        provider: 'selfHosted',
        selfHosted: {
          runtimeMode: 'llama',
        },
        openai: {
          model: 'gpt-5-mini',
          baseUrl: 'https://api.openai.com/v1',
        },
      },
      openAiApiKeySecretName: `${serviceName}-sugaragent-openai-api-key`,
    },
    sugaragentAssets: {
      runtimeArchiveUrl: 'https://github.com/ggml-org/llama.cpp/releases/download/b8182/llama-b8182-bin-ubuntu-x64.tar.gz',
      runtimeBinaryName: 'llama-completion',
      modelUrl: 'https://huggingface.co/WariHima/Qwen3-4B-Instruct-2507-Q4_K_M-GGUF/resolve/main/qwen3-4b-instruct-2507-q4_k_m.gguf',
      modelFileName: 'qwen3-4b-instruct-2507-q4_k_m.gguf',
      embeddingModelId: 'xenova/all-MiniLM-L6-v2',
      embeddingModelUrl: 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx',
      embeddingVocabUrl: 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/vocab.txt',
      embeddingConfigUrl: 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/config.json',
      embeddingTokenizerUrl: 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer.json',
    },
    save: {
      hostedPersistenceEnabled: false,
    },
    releaseMetadata: {
      outputPath: `release/targets/web/.artifacts/release-metadata.${environment}.json`,
    },
  }, null, 2)}\n`;
}

function buildGameApiPackageJson(gameId: string): string {
  return `${JSON.stringify({
    name: `@${toPackageNameSlug(gameId)}/game-api`,
    private: true,
    version: '0.0.1',
    type: 'module',
    scripts: {
      dev: 'tsx watch src/index.ts',
      build: 'tsc -p tsconfig.json',
      start: 'node dist/index.js',
      check: 'tsc -p tsconfig.json --noEmit',
    },
    dependencies: {
      fastify: '^5.6.1',
      '@fastify/cookie': '^11.0.2',
      jose: '^6.1.0',
      '@nikkileaps/sugaragent-runtime-core': '0.0.1',
    },
    devDependencies: {
      '@types/node': '^22.13.10',
      tsx: '^4.20.5',
      typescript: '^5.6.2',
    },
  }, null, 2)}\n`;
}

function buildGameApiTsconfig(): string {
  return `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      outDir: 'dist',
      rootDir: 'src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      resolveJsonModule: true,
    },
    include: ['src'],
  }, null, 2)}\n`;
}

function buildGameApiDockerfile(): string {
  return `FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:22-bookworm-slim AS sugaragent-assets

ARG SUGARAGENT_RUNTIME_ARCHIVE_URL
ARG SUGARAGENT_RUNTIME_BINARY_NAME=llama-completion
ARG SUGARAGENT_MODEL_URL
ARG SUGARAGENT_MODEL_FILE_NAME
ARG SUGARAGENT_EMBEDDING_MODEL_URL
ARG SUGARAGENT_EMBEDDING_VOCAB_URL
ARG SUGARAGENT_EMBEDDING_CONFIG_URL
ARG SUGARAGENT_EMBEDDING_TOKENIZER_URL

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl tar \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/sugaragent/runtime/bin \
  /opt/sugaragent/runtime/models \
  /opt/sugaragent/runtime/embeddings/all-MiniLM-L6-v2/onnx

RUN test -n "$SUGARAGENT_RUNTIME_ARCHIVE_URL" \
  && test -n "$SUGARAGENT_RUNTIME_BINARY_NAME" \
  && curl -fsSL "$SUGARAGENT_RUNTIME_ARCHIVE_URL" -o /tmp/llama-runtime.tar.gz \
  && mkdir -p /tmp/llama-runtime \
  && tar -xzf /tmp/llama-runtime.tar.gz -C /tmp/llama-runtime \
  && cp "$(find /tmp/llama-runtime -type f -name "$SUGARAGENT_RUNTIME_BINARY_NAME" | head -n 1)" /opt/sugaragent/runtime/bin/llama-completion \
  && chmod +x /opt/sugaragent/runtime/bin/llama-completion

RUN test -n "$SUGARAGENT_MODEL_URL" \
  && test -n "$SUGARAGENT_MODEL_FILE_NAME" \
  && curl -fsSL "$SUGARAGENT_MODEL_URL" -o "/opt/sugaragent/runtime/models/$SUGARAGENT_MODEL_FILE_NAME"

RUN test -n "$SUGARAGENT_EMBEDDING_MODEL_URL" \
  && test -n "$SUGARAGENT_EMBEDDING_VOCAB_URL" \
  && test -n "$SUGARAGENT_EMBEDDING_CONFIG_URL" \
  && test -n "$SUGARAGENT_EMBEDDING_TOKENIZER_URL" \
  && curl -fsSL "$SUGARAGENT_EMBEDDING_MODEL_URL" -o /opt/sugaragent/runtime/embeddings/all-MiniLM-L6-v2/onnx/model_quantized.onnx \
  && curl -fsSL "$SUGARAGENT_EMBEDDING_VOCAB_URL" -o /opt/sugaragent/runtime/embeddings/all-MiniLM-L6-v2/vocab.txt \
  && curl -fsSL "$SUGARAGENT_EMBEDDING_CONFIG_URL" -o /opt/sugaragent/runtime/embeddings/all-MiniLM-L6-v2/config.json \
  && curl -fsSL "$SUGARAGENT_EMBEDDING_TOKENIZER_URL" -o /opt/sugaragent/runtime/embeddings/all-MiniLM-L6-v2/tokenizer.json

FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV GAME_API_PORT=8080
ENV SUGARAGENT_RUNTIME_BUNDLE_DIR=/opt/sugaragent/runtime
ENV SUGARAGENT_EMBEDDING_MODEL_DIR=/opt/sugaragent/runtime/embeddings/all-MiniLM-L6-v2
ENV SUGARAGENT_LLAMA_BIN=/opt/sugaragent/runtime/bin/llama-completion
ENV SUGARAGENT_MODEL_PATH=/opt/sugaragent/runtime/models/$SUGARAGENT_MODEL_FILE_NAME

COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=sugaragent-assets /opt/sugaragent/runtime /opt/sugaragent/runtime

EXPOSE 8080

CMD ["npm", "run", "start"]
`;
}

function buildDockerIgnore(): string {
  return `node_modules
dist
npm-debug.log
.artifacts
`;
}

function buildWebTargetGitignore(): string {
  return `.artifacts/*.json
game-api/dist
`;
}

function buildEnvExample(): string {
  return `GAME_API_PORT=8080
GAME_API_ENV=development
GAME_API_GAME_ID=replace-me
GAME_API_COOKIE_SECRET=replace-me
GAME_API_COOKIE_NAME=game_api_session
GAME_API_SESSION_ISSUER=game-api
GAME_API_SESSION_AUDIENCE=game-web-client
GAME_API_SESSION_TTL_SECONDS=28800
GAME_API_SHARED_ALPHA_USERNAME=alpha
GAME_API_SHARED_ALPHA_PASSWORD_HASH=sha256:replace-me
GAME_API_HOSTED_SAVE_ENABLED=false
GAME_API_LOGIN_IP_WINDOW_MS=900000
GAME_API_LOGIN_IP_MAX=10
GAME_API_PROTECTED_SESSION_WINDOW_MS=60000
GAME_API_PROTECTED_SESSION_MAX=120
GAME_API_SUGARAGENT_SESSION_WINDOW_MS=60000
GAME_API_SUGARAGENT_SESSION_MAX=30
GAME_API_SUGARAGENT_RUNTIME_MODE=llama
GAME_API_SUGARAGENT_GENERATION_PROVIDER=selfHosted
GAME_API_SUGARAGENT_OPENAI_MODEL=gpt-5-mini
GAME_API_SUGARAGENT_OPENAI_BASE_URL=https://api.openai.com/v1
GAME_API_SUGARAGENT_OPENAI_API_KEY=
GAME_API_SUGARAGENT_USE_LORE=true
GAME_API_SUGARAGENT_LORE_DIR=../../../plugins/sugaragent/lore/generated
GAME_API_SUGARAGENT_MISSING_GAME_LORE_BUNDLE=false
GAME_API_SUGARAGENT_REQUIRE_LORE_SCOPE_FOR_RETRIEVAL=false
GAME_API_SUGARAGENT_LLAMA_BIN=
GAME_API_SUGARAGENT_MODEL_PATH=
GAME_API_SUGARAGENT_LLAMA_TIMEOUT_MS=120000
SUGARAGENT_RUNTIME_BUNDLE_DIR=
SUGARAGENT_EMBEDDING_MODEL_DIR=
`;
}

function buildGameApiTypes(): string {
  return `export interface RateLimitPolicy {
  windowMs: number;
  max: number;
}

export interface AuthConfig {
  cookieSecret: string;
  cookieName: string;
  sessionIssuer: string;
  sessionAudience: string;
  sessionTtlSeconds: number;
  sharedAlphaUsername: string;
  sharedAlphaPasswordHash: string;
  secureCookies: boolean;
  rateLimits: {
    loginPerIp: RateLimitPolicy;
    protectedPerSession: RateLimitPolicy;
    sugaragentPerSession: RateLimitPolicy;
  };
}

export interface AppConfig {
  port: number;
  environment: string;
  gameId: string;
  hostedSaveEnabled: boolean;
  auth: AuthConfig;
  sugaragent: {
    runtimeMode: 'llama' | 'auto' | 'mock';
    generation: {
      provider: 'selfHosted' | 'openai';
      selfHosted: {
        runtimeMode: 'llama' | 'auto' | 'mock';
      };
      openai: {
        model: string;
        baseUrl: string;
      };
    };
    useLore: boolean;
    loreDir: string;
    missingGameLoreBundle: boolean;
    requireLoreScopeForRetrieval: boolean;
    llamaBin: string | null;
    modelPath: string | null;
    llamaTimeoutMs: number;
  };
}

export interface AuthenticatedSession {
  subject: string;
  sessionId: string;
  scope: 'player';
  issuedAtEpochSeconds: number;
  expiresAtEpochSeconds: number;
}

export interface SessionPlayerView {
  authenticated: boolean;
  sessionId: string | null;
  player: {
    id: string;
    type: 'anonymous';
  };
  features: {
    hostedSaveEnabled: boolean;
  };
}
`;
}

function buildGameApiConfig(): string {
  return `import path from 'node:path';

import type { AppConfig, RateLimitPolicy } from './types.js';

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : fallback;
}

function parseOptionalString(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseRuntimeMode(value: string | undefined): AppConfig['sugaragent']['runtimeMode'] {
  return value === 'auto' || value === 'mock' || value === 'llama' ? value : 'llama';
}

function parseGenerationProvider(value: string | undefined): AppConfig['sugaragent']['generation']['provider'] {
  return value === 'openai' ? value : 'selfHosted';
}

function buildRateLimitPolicy(windowValue: string | undefined, maxValue: string | undefined, fallbackWindowMs: number, fallbackMax: number): RateLimitPolicy {
  return {
    windowMs: parsePositiveInteger(windowValue, fallbackWindowMs),
    max: parsePositiveInteger(maxValue, fallbackMax),
  };
}

export function loadConfig(): AppConfig {
  const environment = process.env.GAME_API_ENV ?? 'development';
  return {
    port: parsePositiveInteger(process.env.GAME_API_PORT, 8080),
    environment,
    gameId: process.env.GAME_API_GAME_ID ?? 'unknown-game',
    hostedSaveEnabled: parseBoolean(process.env.GAME_API_HOSTED_SAVE_ENABLED, false),
    auth: {
      cookieSecret: process.env.GAME_API_COOKIE_SECRET ?? 'replace-me',
      cookieName: process.env.GAME_API_COOKIE_NAME ?? 'game_api_session',
      sessionIssuer: process.env.GAME_API_SESSION_ISSUER ?? 'game-api',
      sessionAudience: process.env.GAME_API_SESSION_AUDIENCE ?? 'game-web-client',
      sessionTtlSeconds: parsePositiveInteger(process.env.GAME_API_SESSION_TTL_SECONDS, 8 * 60 * 60),
      sharedAlphaUsername: process.env.GAME_API_SHARED_ALPHA_USERNAME ?? 'alpha',
      sharedAlphaPasswordHash: process.env.GAME_API_SHARED_ALPHA_PASSWORD_HASH ?? 'sha256:replace-me',
      secureCookies: environment !== 'development',
      rateLimits: {
        loginPerIp: buildRateLimitPolicy(process.env.GAME_API_LOGIN_IP_WINDOW_MS, process.env.GAME_API_LOGIN_IP_MAX, 15 * 60 * 1000, 10),
        protectedPerSession: buildRateLimitPolicy(process.env.GAME_API_PROTECTED_SESSION_WINDOW_MS, process.env.GAME_API_PROTECTED_SESSION_MAX, 60 * 1000, 120),
        sugaragentPerSession: buildRateLimitPolicy(process.env.GAME_API_SUGARAGENT_SESSION_WINDOW_MS, process.env.GAME_API_SUGARAGENT_SESSION_MAX, 60 * 1000, 30),
      },
    },
    sugaragent: {
      runtimeMode: parseRuntimeMode(process.env.GAME_API_SUGARAGENT_RUNTIME_MODE),
      generation: {
        provider: parseGenerationProvider(process.env.GAME_API_SUGARAGENT_GENERATION_PROVIDER),
        selfHosted: {
          runtimeMode: parseRuntimeMode(process.env.GAME_API_SUGARAGENT_RUNTIME_MODE),
        },
        openai: {
          model: process.env.GAME_API_SUGARAGENT_OPENAI_MODEL ?? 'gpt-5-mini',
          baseUrl: (process.env.GAME_API_SUGARAGENT_OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
        },
      },
      useLore: parseBoolean(process.env.GAME_API_SUGARAGENT_USE_LORE, true),
      loreDir: path.resolve(process.cwd(), process.env.GAME_API_SUGARAGENT_LORE_DIR ?? '../../../plugins/sugaragent/lore/generated'),
      missingGameLoreBundle: parseBoolean(process.env.GAME_API_SUGARAGENT_MISSING_GAME_LORE_BUNDLE, false),
      requireLoreScopeForRetrieval: parseBoolean(process.env.GAME_API_SUGARAGENT_REQUIRE_LORE_SCOPE_FOR_RETRIEVAL, false),
      llamaBin: parseOptionalString(process.env.GAME_API_SUGARAGENT_LLAMA_BIN),
      modelPath: parseOptionalString(process.env.GAME_API_SUGARAGENT_MODEL_PATH),
      llamaTimeoutMs: parsePositiveInteger(process.env.GAME_API_SUGARAGENT_LLAMA_TIMEOUT_MS, 120000),
    },
  };
}
`;
}

function buildFastifyTypeAugmentation(): string {
  return `import 'fastify';
import type { AppConfig, AuthenticatedSession } from './types.js';

declare module 'fastify' {
  interface FastifyInstance {
    gameApiConfig: AppConfig;
  }

  interface FastifyRequest {
    authSession: AuthenticatedSession | null;
  }
}
`;
}

function buildGameApiApp(): string {
  return `import Fastify from 'fastify';
import cookie from '@fastify/cookie';

import { loadConfig } from './config.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerPlayerRoutes } from './routes/player.js';
import { registerSaveRoutes } from './routes/save.js';
import { registerSugarAgentRoutes } from './routes/sugaragent.js';
import { attachOptionalSession } from './services/auth/middleware.js';
import { initializeSugarAgentRuntimeServices } from './services/sugaragent/runtime-services.js';

export async function buildApp() {
  const config = loadConfig();
  const app = Fastify({
    logger: true,
  });

  app.decorate('gameApiConfig', config);

  initializeSugarAgentRuntimeServices(config);

  await app.register(cookie, {
    secret: config.auth.cookieSecret,
  });

  app.addHook('onRequest', attachOptionalSession);

  await app.register(registerHealthRoutes);
  await app.register(registerAuthRoutes, { prefix: '/auth' });
  await app.register(registerPlayerRoutes, { prefix: '/player' });
  await app.register(registerSaveRoutes, { prefix: '/save' });
  await app.register(registerSugarAgentRoutes, { prefix: '/sugaragent' });

  return app;
}
`;
}

function buildGameApiIndex(): string {
  return `import { buildApp } from './app.js';

const app = await buildApp();
const port = Number(app.gameApiConfig.port ?? 8080);

await app.listen({ port, host: '0.0.0.0' });
`;
}

function buildRouteModule(name: string, body: string, imports = ''): string {
  return `${imports}import type { FastifyInstance } from 'fastify';

export async function register${name}(app: FastifyInstance): Promise<void> {
${body}
}
`;
}

function buildHealthRoute(): string {
  return buildRouteModule('HealthRoutes', `  app.get('/healthz', async () => ({
    ok: true,
    service: 'game-api',
    environment: app.gameApiConfig.environment,
  }));

  app.get('/readyz', async () => ({
    ok: true,
    ready: true,
    environment: app.gameApiConfig.environment,
    authConfigured: app.gameApiConfig.auth.sharedAlphaPasswordHash !== 'sha256:replace-me',
    save: {
      hostedPersistenceEnabled: app.gameApiConfig.hostedSaveEnabled,
    },
  }));`);
}

function buildAuthRoute(): string {
  return buildRouteModule(
    'AuthRoutes',
    `  app.post('/login', { preHandler: enforceLoginIpRateLimit }, async (request, reply) => {
    const body = request.body as { username?: string; password?: string } | undefined;
    const username = typeof body?.username === 'string' ? body.username : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    const verified = verifySharedAlphaCredentials(
      {
        username,
        password,
      },
      app.gameApiConfig.auth,
    );

    if (!verified) {
      reply.code(401);
      return {
        ok: false,
        error: 'invalid_credentials',
      };
    }

    const issued = await issueSessionToken(app.gameApiConfig);
    reply.setCookie(app.gameApiConfig.auth.cookieName, issued.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: app.gameApiConfig.auth.secureCookies,
      path: '/',
      maxAge: app.gameApiConfig.auth.sessionTtlSeconds,
    });

    return {
      ok: true,
      authenticated: true,
      sessionId: issued.session.sessionId,
      expiresAtEpochSeconds: issued.session.expiresAtEpochSeconds,
    };
  });

  app.get('/session', async (request) => ({
    ok: true,
    authenticated: request.authSession !== null,
    sessionId: request.authSession?.sessionId ?? null,
  }));

  app.post('/logout', async (_request, reply) => {
    reply.clearCookie(app.gameApiConfig.auth.cookieName, {
      path: '/',
    });
    return { ok: true };
  });`,
    `import { verifySharedAlphaCredentials } from '../services/auth/credentials.js';
import { enforceLoginIpRateLimit, issueSessionToken } from '../services/auth/middleware.js';
`,
  );
}

function buildPlayerRoute(): string {
  return buildRouteModule(
    'PlayerRoutes',
    `  app.get('/me', async (request) => {
    return resolvePlayerView({
      hostedSaveEnabled: app.gameApiConfig.hostedSaveEnabled,
      authSession: request.authSession,
    });
  });`,
    `import { resolvePlayerView } from '../services/player/view.js';
`,
  );
}

function buildSaveRoute(): string {
  return buildRouteModule(
    'SaveRoutes',
    `  app.get('/', { preHandler: [requireSession, enforceProtectedSessionRateLimit] }, async (_request, reply) => {
    reply.code(501);
    return buildHostedSaveDisabledResponse();
  });

  app.put('/', { preHandler: [requireSession, enforceProtectedSessionRateLimit] }, async (_request, reply) => {
    reply.code(501);
    return buildHostedSaveDisabledResponse();
  });`,
    `import { requireSession, enforceProtectedSessionRateLimit } from '../services/auth/middleware.js';
import { buildHostedSaveDisabledResponse } from '../services/save/index.js';
`,
  );
}

function buildSugarAgentRoute(): string {
  return buildRouteModule(
    'SugarAgentRoutes',
    `  app.post('/health', { preHandler: [requireSession, enforceSugarAgentSessionRateLimit] }, async (request, reply) => {
    try {
      const body = request.body as { request?: RuntimeHealthRequest } | undefined;
      const result = await getSugarAgentRuntimeServices().health({
        ...body?.request,
        gameId: app.gameApiConfig.gameId,
      });
      return {
        ok: result.ok,
        detail: result.detail,
        sessionId: request.authSession?.sessionId ?? null,
      };
    } catch (error) {
      reply.code(503);
      return buildSugarAgentTransportError(error);
    }
  });

  app.post('/generateStructured', { preHandler: [requireSession, enforceSugarAgentSessionRateLimit] }, async (request, reply) => {
    try {
      const body = request.body as { request?: RuntimeGenerateStructuredRequest } | undefined;
      if (!body?.request) {
        reply.code(400);
        return {
          ok: false,
          error: 'missing_request',
        };
      }
      const hostedRequest = {
        ...body.request,
        context: {
          ...(body.request.context ?? {}),
          gameId: app.gameApiConfig.gameId,
          sessionScopeId: request.authSession?.sessionId ?? 'anonymous',
        },
      };
      const result = await getSugarAgentRuntimeServices().generateStructured(hostedRequest);
      return {
        ok: true,
        ...result,
      };
    } catch (error) {
      reply.code(503);
      return buildSugarAgentTransportError(error);
    }
  });

  app.post('/embed', { preHandler: [requireSession, enforceSugarAgentSessionRateLimit] }, async (request, reply) => {
    try {
      const body = request.body as { texts?: string[] } | undefined;
      const texts = Array.isArray(body?.texts)
        ? body.texts.filter((entry): entry is string => typeof entry === 'string')
        : [];
      const vectors = await getSugarAgentRuntimeServices().embed(texts);
      return {
        ok: true,
        vectors,
      };
    } catch (error) {
      reply.code(503);
      return buildSugarAgentTransportError(error);
    }
  });`,
    `import { requireSession, enforceSugarAgentSessionRateLimit } from '../services/auth/middleware.js';
import type { RuntimeGenerateStructuredRequest, RuntimeHealthRequest } from '@nikkileaps/sugaragent-runtime-core';
import { buildSugarAgentTransportError } from '../services/sugaragent/index.js';
import { getSugarAgentRuntimeServices } from '../services/sugaragent/runtime-services.js';
`,
  );
}

function buildAuthSessionService(): string {
  return `import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

import type { AppConfig, AuthenticatedSession } from '../../types.js';

function sessionSecret(config: AppConfig): Uint8Array {
  return new TextEncoder().encode(config.auth.cookieSecret);
}

export function readSessionToken(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function hashPasswordSha256(password: string): string {
  return \`sha256:\${createHash('sha256').update(password).digest('hex')}\`;
}

export function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export async function issueSessionToken(config: AppConfig): Promise<{ token: string; session: AuthenticatedSession }> {
  const now = Math.floor(Date.now() / 1000);
  const sessionId = randomUUID();
  const session: AuthenticatedSession = {
    subject: \`anon-\${sessionId.slice(0, 12)}\`,
    sessionId,
    scope: 'player',
    issuedAtEpochSeconds: now,
    expiresAtEpochSeconds: now + config.auth.sessionTtlSeconds,
  };

  const token = await new SignJWT({
    scope: session.scope,
    sid: session.sessionId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(session.issuedAtEpochSeconds)
    .setIssuer(config.auth.sessionIssuer)
    .setAudience(config.auth.sessionAudience)
    .setSubject(session.subject)
    .setExpirationTime(session.expiresAtEpochSeconds)
    .sign(sessionSecret(config));

  return { token, session };
}

export async function verifySessionToken(token: string, config: AppConfig): Promise<AuthenticatedSession | null> {
  try {
    const verified = await jwtVerify(token, sessionSecret(config), {
      issuer: config.auth.sessionIssuer,
      audience: config.auth.sessionAudience,
    });
    const issuedAt = typeof verified.payload.iat === 'number' ? verified.payload.iat : Math.floor(Date.now() / 1000);
    const expiresAt = typeof verified.payload.exp === 'number' ? verified.payload.exp : issuedAt + config.auth.sessionTtlSeconds;
    const sessionId = typeof verified.payload.sid === 'string' ? verified.payload.sid : null;
    const scope = verified.payload.scope === 'player' ? 'player' : null;
    const subject = typeof verified.payload.sub === 'string' ? verified.payload.sub : null;
    if (!sessionId || !scope || !subject) return null;

    return {
      subject,
      sessionId,
      scope,
      issuedAtEpochSeconds: issuedAt,
      expiresAtEpochSeconds: expiresAt,
    };
  } catch {
    return null;
  }
}
`;
}

function buildAuthCredentialsService(): string {
  return `import type { AuthConfig } from '../../types.js';
import { hashPasswordSha256, timingSafeStringEqual } from './session.js';

export function verifySharedAlphaCredentials(input: { username: string; password: string }, config: AuthConfig): boolean {
  const username = input.username.trim();
  if (!username || !input.password) return false;
  if (!timingSafeStringEqual(username, config.sharedAlphaUsername)) return false;

  const expectedHash = config.sharedAlphaPasswordHash.trim();
  if (!expectedHash || expectedHash === 'sha256:replace-me') return false;

  const computedHash = hashPasswordSha256(input.password);
  return timingSafeStringEqual(computedHash, expectedHash);
}
`;
}

function buildAuthRateLimitService(): string {
  return `import type { RateLimitPolicy } from '../../types.js';

interface BucketState {
  count: number;
  resetAtEpochMs: number;
}

const buckets = new Map<string, BucketState>();

export function applyRateLimit(input: { scope: string; key: string; policy: RateLimitPolicy; nowEpochMs?: number }) {
  const now = input.nowEpochMs ?? Date.now();
  const bucketKey = \`\${input.scope}:\${input.key}\`;
  const existing = buckets.get(bucketKey);

  if (!existing || existing.resetAtEpochMs <= now) {
    buckets.set(bucketKey, {
      count: 1,
      resetAtEpochMs: now + input.policy.windowMs,
    });
    return {
      allowed: true,
      remaining: Math.max(0, input.policy.max - 1),
      retryAfterSeconds: 0,
    };
  }

  if (existing.count >= input.policy.max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAtEpochMs - now) / 1000)),
    };
  }

  existing.count += 1;
  buckets.set(bucketKey, existing);
  return {
    allowed: true,
    remaining: Math.max(0, input.policy.max - existing.count),
    retryAfterSeconds: 0,
  };
}
`;
}

function buildAuthMiddlewareService(): string {
  return `import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AppConfig } from '../../types.js';
import { applyRateLimit } from './rate-limit.js';
import { issueSessionToken as issueToken, readSessionToken, verifySessionToken } from './session.js';

function clientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0]?.trim() ?? request.ip;
  }
  return request.ip;
}

export async function attachOptionalSession(request: FastifyRequest): Promise<void> {
  request.authSession = null;
  const token = readSessionToken(request.cookies[request.server.gameApiConfig.auth.cookieName]);
  if (!token) return;
  request.authSession = await verifySessionToken(token, request.server.gameApiConfig);
}

export async function issueSessionToken(config: AppConfig) {
  return issueToken(config);
}

export async function enforceLoginIpRateLimit(request: FastifyRequest, reply: FastifyReply) {
  const result = applyRateLimit({
    scope: 'auth-login-ip',
    key: clientIp(request),
    policy: request.server.gameApiConfig.auth.rateLimits.loginPerIp,
  });
  if (result.allowed) return;
  reply.code(429).send({
    ok: false,
    error: 'rate_limited',
    scope: 'login_ip',
    retryAfterSeconds: result.retryAfterSeconds,
  });
}

export async function requireSession(request: FastifyRequest, reply: FastifyReply) {
  if (request.authSession) return;
  reply.code(401).send({
    ok: false,
    error: 'auth_required',
  });
}

export async function enforceProtectedSessionRateLimit(request: FastifyRequest, reply: FastifyReply) {
  if (!request.authSession) return requireSession(request, reply);
  const result = applyRateLimit({
    scope: 'protected-session',
    key: request.authSession.sessionId,
    policy: request.server.gameApiConfig.auth.rateLimits.protectedPerSession,
  });
  if (result.allowed) return;
  reply.code(429).send({
    ok: false,
    error: 'rate_limited',
    scope: 'protected_session',
    retryAfterSeconds: result.retryAfterSeconds,
  });
}

export async function enforceSugarAgentSessionRateLimit(request: FastifyRequest, reply: FastifyReply) {
  if (!request.authSession) return requireSession(request, reply);
  const result = applyRateLimit({
    scope: 'sugaragent-session',
    key: request.authSession.sessionId,
    policy: request.server.gameApiConfig.auth.rateLimits.sugaragentPerSession,
  });
  if (result.allowed) return;
  reply.code(429).send({
    ok: false,
    error: 'rate_limited',
    scope: 'sugaragent_session',
    retryAfterSeconds: result.retryAfterSeconds,
  });
}
`;
}

function buildPlayerService(): string {
  return `import type { AuthenticatedSession, SessionPlayerView } from '../../types.js';

export function resolvePlayerView(input: {
  hostedSaveEnabled: boolean;
  authSession: AuthenticatedSession | null;
}): SessionPlayerView {
  const session = input.authSession;
  const anonymousId = session?.subject ?? 'anon-guest';

  return {
    authenticated: session !== null,
    sessionId: session?.sessionId ?? null,
    player: {
      id: anonymousId,
      type: 'anonymous',
    },
    features: {
      hostedSaveEnabled: input.hostedSaveEnabled,
    },
  };
}
`;
}

function buildSaveService(): string {
  return `export function buildHostedSaveDisabledResponse() {
  return {
    ok: false,
    error: 'Hosted save persistence is not enabled for this game.',
  };
}
`;
}

function buildSugarAgentService(): string {
  return `export function buildSugarAgentTransportError(error: unknown) {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
}
`;
}

function buildSugarAgentRuntimeServices(): string {
  return `import {
  createHostedSugarAgentRuntimeServices,
  type HostedSugarAgentRuntimeServices,
} from '@nikkileaps/sugaragent-runtime-core';

import type { AppConfig } from '../../types.js';

let runtimeServices: HostedSugarAgentRuntimeServices | null = null;

export function initializeSugarAgentRuntimeServices(config: AppConfig): HostedSugarAgentRuntimeServices {
  runtimeServices = createHostedSugarAgentRuntimeServices({
    gameId: config.gameId,
    runtimeMode: config.sugaragent.runtimeMode,
    generation: config.sugaragent.generation,
    loreDir: config.sugaragent.loreDir,
    useLore: config.sugaragent.useLore,
    missingGameLoreBundle: config.sugaragent.missingGameLoreBundle,
    requireLoreScopeForRetrieval: config.sugaragent.requireLoreScopeForRetrieval,
    llamaBin: config.sugaragent.llamaBin,
    modelPath: config.sugaragent.modelPath,
    llamaTimeoutMs: config.sugaragent.llamaTimeoutMs,
  });
  return runtimeServices;
}

export function getSugarAgentRuntimeServices(): HostedSugarAgentRuntimeServices {
  if (runtimeServices) return runtimeServices;
  throw new Error('SugarAgent runtime services have not been initialized.');
}
`;
}

function buildReadProfileScript(): string {
  return `#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const profilePath = process.argv[2];
  if (!profilePath) {
    throw new Error('Usage: node read-profile.mjs <profile-path>');
  }

  const raw = await fs.readFile(profilePath, 'utf8');
  const profile = JSON.parse(raw);
  const root = process.cwd();

  const values = {
    profile_path: profilePath,
    environment: profile.environment,
    game_slug: profile.gameSlug,
    frontend_host: profile.frontend.host,
    frontend_publish_dir: path.resolve(root, profile.frontend.publishDirectory),
    frontend_site_id: profile.frontend.siteId,
    frontend_site_name: profile.frontend.siteName,
    frontend_game_api_base_url: profile.frontend.gameApiBaseUrl,
    frontend_backend_required: String(profile.frontend.backendRequired === true),
    backend_service_name: profile.backend.serviceName,
    backend_source_path: path.resolve(root, profile.backend.sourcePath),
    backend_port: String(profile.backend.port ?? 8080),
    backend_image: profile.backend.imageRepository,
    artifact_registry_host: profile.artifactRegistry.host,
    artifact_registry_repository: profile.artifactRegistry.repository,
    cloud_project_id: profile.cloudRun.projectId,
    cloud_region: profile.cloudRun.region,
    cloud_run_cpu: String(profile.cloudRun.cpu ?? '1'),
    cloud_run_memory: String(profile.cloudRun.memory ?? '2Gi'),
    cloud_run_min_instances: String(profile.cloudRun.minInstances ?? 0),
    cloud_run_max_instances: String(profile.cloudRun.maxInstances ?? 1),
    hosted_save_enabled: String(profile.save.hostedPersistenceEnabled === true),
    auth_cookie_secret_name: profile.auth.cookieSecretName,
    auth_username_secret_name: profile.auth.sharedAlphaUsernameSecretName,
    auth_password_hash_secret_name: profile.auth.sharedAlphaPasswordHashSecretName,
    sugaragent_generation_provider: profile.sugaragent.generation.provider,
    sugaragent_runtime_mode: profile.sugaragent.generation.selfHosted?.runtimeMode ?? 'llama',
    sugaragent_openai_model: profile.sugaragent.generation.openai?.model ?? 'gpt-5-mini',
    sugaragent_openai_base_url: profile.sugaragent.generation.openai?.baseUrl ?? 'https://api.openai.com/v1',
    sugaragent_openai_api_key_secret_name: profile.sugaragent.openAiApiKeySecretName,
    release_metadata_output_path: path.resolve(root, profile.releaseMetadata.outputPath),
    sugaragent_runtime_archive_url: profile.sugaragentAssets.runtimeArchiveUrl,
    sugaragent_runtime_binary_name: profile.sugaragentAssets.runtimeBinaryName,
    sugaragent_model_url: profile.sugaragentAssets.modelUrl,
    sugaragent_model_file_name: profile.sugaragentAssets.modelFileName,
    sugaragent_embedding_model_url: profile.sugaragentAssets.embeddingModelUrl,
    sugaragent_embedding_vocab_url: profile.sugaragentAssets.embeddingVocabUrl,
    sugaragent_embedding_config_url: profile.sugaragentAssets.embeddingConfigUrl,
    sugaragent_embedding_tokenizer_url: profile.sugaragentAssets.embeddingTokenizerUrl,
  };

  for (const [key, value] of Object.entries(values)) {
    process.stdout.write(\`\${key}=\${value}\\n\`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
`;
}

function buildWriteReleaseMetadataScript(): string {
  return `#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Usage: node write-release-metadata.mjs --profile <path> --output <path> --git-sha <sha> --backend-image <image> --backend-service <service> --frontend-site-id <site-id> --frontend-host <host>');
    }
    result[key.slice(2)] = value;
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  const profilePath = args.profile;
  const outputPath = args.output;
  if (!profilePath || !outputPath) {
    throw new Error('Both --profile and --output are required.');
  }

  const profile = JSON.parse(await fs.readFile(profilePath, 'utf8'));
  const metadata = {
    metadataVersion: 1,
    target: profile.target,
    environment: profile.environment,
    gameSlug: profile.gameSlug,
    gitRevision: args['git-sha'] ?? 'unknown',
    frontend: {
      provider: profile.frontend.provider,
      host: args['frontend-host'] ?? profile.frontend.host,
      siteId: args['frontend-site-id'] ?? profile.frontend.siteId,
      publishDirectory: profile.frontend.publishDirectory,
      gameApiBaseUrl: profile.frontend.gameApiBaseUrl,
    },
    backend: {
      serviceName: args['backend-service'] ?? profile.backend.serviceName,
      image: args['backend-image'] ?? profile.backend.imageRepository,
      region: profile.cloudRun.region,
      projectId: profile.cloudRun.projectId,
    },
    sugaragentRuntimeCoreVersion: '0.0.1',
    generatedAtIso: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(metadata, null, 2) + '\\n', 'utf8');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
`;
}

function buildWorkflow(environment: 'staging' | 'production'): string {
  const branch = environment === 'production' ? 'main' : 'staging';
  const profilePath = `release/targets/web/profile.${environment}.json`;
  return `name: Deploy Web ${environment === 'production' ? 'Production' : 'Staging'}

on:
  workflow_dispatch:
  push:
    branches:
      - ${branch}

permissions:
  contents: read
  id-token: write

env:
  PROFILE_PATH: ${profilePath}

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Resolve deployment profile
        id: profile
        run: node release/targets/web/scripts/read-profile.mjs "$PROFILE_PATH" >> "$GITHUB_OUTPUT"

      - name: Verify frontend export artifact exists
        run: test -d "\${{ steps.profile.outputs.frontend_publish_dir }}"

      - name: Install backend dependencies
        working-directory: \${{ steps.profile.outputs.backend_source_path }}
        run: npm ci

      - name: Build backend
        working-directory: \${{ steps.profile.outputs.backend_source_path }}
        run: npm run build

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: \${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: \${{ secrets.GCP_SERVICE_ACCOUNT_EMAIL }}

      - name: Set up gcloud
        uses: google-github-actions/setup-gcloud@v2
        with:
          project_id: \${{ steps.profile.outputs.cloud_project_id }}

      - name: Configure Docker auth
        run: gcloud auth configure-docker "\${{ steps.profile.outputs.artifact_registry_host }}" --quiet

      - name: Build backend image
        run: |
          docker build \
            -f "\${{ steps.profile.outputs.backend_source_path }}/Dockerfile" \
            --build-arg SUGARAGENT_RUNTIME_ARCHIVE_URL="\${{ steps.profile.outputs.sugaragent_runtime_archive_url }}" \
            --build-arg SUGARAGENT_RUNTIME_BINARY_NAME="\${{ steps.profile.outputs.sugaragent_runtime_binary_name }}" \
            --build-arg SUGARAGENT_MODEL_URL="\${{ steps.profile.outputs.sugaragent_model_url }}" \
            --build-arg SUGARAGENT_MODEL_FILE_NAME="\${{ steps.profile.outputs.sugaragent_model_file_name }}" \
            --build-arg SUGARAGENT_EMBEDDING_MODEL_URL="\${{ steps.profile.outputs.sugaragent_embedding_model_url }}" \
            --build-arg SUGARAGENT_EMBEDDING_VOCAB_URL="\${{ steps.profile.outputs.sugaragent_embedding_vocab_url }}" \
            --build-arg SUGARAGENT_EMBEDDING_CONFIG_URL="\${{ steps.profile.outputs.sugaragent_embedding_config_url }}" \
            --build-arg SUGARAGENT_EMBEDDING_TOKENIZER_URL="\${{ steps.profile.outputs.sugaragent_embedding_tokenizer_url }}" \
            -t "\${{ steps.profile.outputs.backend_image }}:\${{ github.sha }}" \
            "\${{ steps.profile.outputs.backend_source_path }}"

      - name: Push backend image
        run: docker push "\${{ steps.profile.outputs.backend_image }}:\${{ github.sha }}"

      - name: Deploy game-api to Cloud Run
        run: >
          gcloud run deploy "\${{ steps.profile.outputs.backend_service_name }}"
          --project "\${{ steps.profile.outputs.cloud_project_id }}"
          --region "\${{ steps.profile.outputs.cloud_region }}"
          --platform managed
          --image "\${{ steps.profile.outputs.backend_image }}:\${{ github.sha }}"
          --port "\${{ steps.profile.outputs.backend_port }}"
          --min-instances "\${{ steps.profile.outputs.cloud_run_min_instances }}"
          --max-instances "\${{ steps.profile.outputs.cloud_run_max_instances }}"
          --cpu "\${{ steps.profile.outputs.cloud_run_cpu }}"
          --memory "\${{ steps.profile.outputs.cloud_run_memory }}"
          --no-allow-unauthenticated
          --set-env-vars "GAME_API_ENV=\${{ steps.profile.outputs.environment }},GAME_API_GAME_ID=\${{ steps.profile.outputs.game_slug }},GAME_API_PORT=\${{ steps.profile.outputs.backend_port }},GAME_API_HOSTED_SAVE_ENABLED=\${{ steps.profile.outputs.hosted_save_enabled }},GAME_API_SUGARAGENT_GENERATION_PROVIDER=\${{ steps.profile.outputs.sugaragent_generation_provider }},GAME_API_SUGARAGENT_RUNTIME_MODE=\${{ steps.profile.outputs.sugaragent_runtime_mode }},GAME_API_SUGARAGENT_OPENAI_MODEL=\${{ steps.profile.outputs.sugaragent_openai_model }},GAME_API_SUGARAGENT_OPENAI_BASE_URL=\${{ steps.profile.outputs.sugaragent_openai_base_url }}"
          --set-secrets "GAME_API_COOKIE_SECRET=\${{ steps.profile.outputs.auth_cookie_secret_name }}:latest,GAME_API_SHARED_ALPHA_USERNAME=\${{ steps.profile.outputs.auth_username_secret_name }}:latest,GAME_API_SHARED_ALPHA_PASSWORD_HASH=\${{ steps.profile.outputs.auth_password_hash_secret_name }}:latest,GAME_API_SUGARAGENT_OPENAI_API_KEY=\${{ steps.profile.outputs.sugaragent_openai_api_key_secret_name }}:latest"

      - name: Deploy frontend to Netlify
        env:
          NETLIFY_AUTH_TOKEN: \${{ secrets.NETLIFY_AUTH_TOKEN }}
        run: >
          npx netlify deploy
          --prod-if-unlocked
          --dir="\${{ steps.profile.outputs.frontend_publish_dir }}"
          --site="\${{ steps.profile.outputs.frontend_site_id }}"
          --message="Deploy ${environment} \${{ github.sha }}"

      - name: Write release metadata
        run: >
          node release/targets/web/scripts/write-release-metadata.mjs
          --profile "$PROFILE_PATH"
          --output "\${{ steps.profile.outputs.release_metadata_output_path }}"
          --git-sha "\${{ github.sha }}"
          --backend-image "\${{ steps.profile.outputs.backend_image }}:\${{ github.sha }}"
          --backend-service "\${{ steps.profile.outputs.backend_service_name }}"
          --frontend-site-id "\${{ steps.profile.outputs.frontend_site_id }}"
          --frontend-host "\${{ steps.profile.outputs.frontend_host }}"

      - name: Upload release metadata
        uses: actions/upload-artifact@v4
        with:
          name: web-release-metadata-${environment}
          path: \${{ steps.profile.outputs.release_metadata_output_path }}
`;
}

export function buildWebReleaseTargetScaffold(
  rootPaths: GameRootPaths,
  options: { gameId: string; gameName: string },
): ReleaseTargetScaffold {
  const webGameApiSrcPath = joinFsPath(rootPaths.webGameApiPath, 'src');
  const webGameApiRoutesPath = joinFsPath(webGameApiSrcPath, 'routes');
  const webGameApiServicesPath = joinFsPath(webGameApiSrcPath, 'services');
  const webGameApiAuthServicePath = joinFsPath(webGameApiServicesPath, 'auth');
  const webGameApiPlayerServicePath = joinFsPath(webGameApiServicesPath, 'player');
  const webGameApiSaveServicePath = joinFsPath(webGameApiServicesPath, 'save');
  const webGameApiSugarAgentServicePath = joinFsPath(webGameApiServicesPath, 'sugaragent');

  return {
    directories: [
      rootPaths.releasePath,
      rootPaths.releaseTargetsPath,
      rootPaths.webReleaseTargetPath,
      rootPaths.webTargetScriptsPath,
      rootPaths.webTargetArtifactsPath,
      rootPaths.webGameApiPath,
      webGameApiSrcPath,
      webGameApiRoutesPath,
      webGameApiServicesPath,
      webGameApiAuthServicePath,
      webGameApiPlayerServicePath,
      webGameApiSaveServicePath,
      webGameApiSugarAgentServicePath,
      rootPaths.githubPath,
      rootPaths.githubWorkflowsPath,
    ],
    files: [
      {
        path: rootPaths.webTargetReadmePath,
        content: buildWebTargetReadme(options.gameId, options.gameName),
        overwrite: 'never',
      },
      {
        path: rootPaths.webTargetGitignorePath,
        content: buildWebTargetGitignore(),
        overwrite: 'never',
      },
      {
        path: rootPaths.webProfileStagingPath,
        content: buildProfileContent(options.gameId, 'staging'),
        overwrite: 'never',
      },
      {
        path: rootPaths.webProfileProductionPath,
        content: buildProfileContent(options.gameId, 'production'),
        overwrite: 'never',
      },
      {
        path: joinFsPath(rootPaths.webGameApiPath, 'package.json'),
        content: buildGameApiPackageJson(options.gameId),
        overwrite: 'never',
      },
      {
        path: joinFsPath(rootPaths.webGameApiPath, 'tsconfig.json'),
        content: buildGameApiTsconfig(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(rootPaths.webGameApiPath, 'src', 'fastify.d.ts'),
        content: buildFastifyTypeAugmentation(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(rootPaths.webGameApiPath, 'Dockerfile'),
        content: buildGameApiDockerfile(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(rootPaths.webGameApiPath, '.dockerignore'),
        content: buildDockerIgnore(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(rootPaths.webGameApiPath, '.env.example'),
        content: buildEnvExample(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(webGameApiSrcPath, 'index.ts'),
        content: buildGameApiIndex(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(webGameApiSrcPath, 'app.ts'),
        content: buildGameApiApp(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(webGameApiSrcPath, 'config.ts'),
        content: buildGameApiConfig(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(webGameApiSrcPath, 'types.ts'),
        content: buildGameApiTypes(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(webGameApiRoutesPath, 'health.ts'),
        content: buildHealthRoute(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(webGameApiRoutesPath, 'auth.ts'),
        content: buildAuthRoute(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(webGameApiRoutesPath, 'player.ts'),
        content: buildPlayerRoute(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(webGameApiRoutesPath, 'save.ts'),
        content: buildSaveRoute(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(webGameApiRoutesPath, 'sugaragent.ts'),
        content: buildSugarAgentRoute(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(webGameApiAuthServicePath, 'session.ts'),
        content: buildAuthSessionService(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(webGameApiAuthServicePath, 'credentials.ts'),
        content: buildAuthCredentialsService(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(webGameApiAuthServicePath, 'rate-limit.ts'),
        content: buildAuthRateLimitService(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(webGameApiAuthServicePath, 'middleware.ts'),
        content: buildAuthMiddlewareService(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(webGameApiPlayerServicePath, 'view.ts'),
        content: buildPlayerService(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(webGameApiSaveServicePath, 'index.ts'),
        content: buildSaveService(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(webGameApiSugarAgentServicePath, 'index.ts'),
        content: buildSugarAgentService(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(webGameApiSugarAgentServicePath, 'runtime-services.ts'),
        content: buildSugarAgentRuntimeServices(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(rootPaths.githubWorkflowsPath, 'deploy-web-staging.yml'),
        content: buildWorkflow('staging'),
        overwrite: 'never',
      },
      {
        path: joinFsPath(rootPaths.githubWorkflowsPath, 'deploy-web-production.yml'),
        content: buildWorkflow('production'),
        overwrite: 'never',
      },
      {
        path: joinFsPath(rootPaths.webTargetScriptsPath, 'read-profile.mjs'),
        content: buildReadProfileScript(),
        overwrite: 'never',
      },
      {
        path: joinFsPath(rootPaths.webTargetScriptsPath, 'write-release-metadata.mjs'),
        content: buildWriteReleaseMetadataScript(),
        overwrite: 'never',
      },
    ],
  };
}
