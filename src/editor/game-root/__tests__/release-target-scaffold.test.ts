import { describe, expect, it } from 'vitest';

import { resolveGameRootPaths } from '../fs-paths';
import { buildWebReleaseTargetScaffold } from '../release-target-scaffold';

describe('release-target-scaffold', () => {
  it('builds the expected web release target file set', () => {
    const paths = resolveGameRootPaths('/Users/nikki/projects/wordlark');
    const scaffold = buildWebReleaseTargetScaffold(paths, {
      gameId: 'wordlark',
      gameName: 'Wordlark',
    });

    expect(scaffold.directories).toContain('/Users/nikki/projects/wordlark/release/targets/web/game-api');
    expect(scaffold.files.some((file) => file.path.endsWith('/release/targets/web/profile.staging.json'))).toBe(true);
    expect(scaffold.files.some((file) => file.path.endsWith('/release/targets/web/profile.production.json'))).toBe(true);
    expect(scaffold.files.some((file) => file.path.endsWith('/release/targets/web/game-api/package.json'))).toBe(true);
    expect(scaffold.files.some((file) => file.path.endsWith('/release/targets/web/game-api/src/app.ts'))).toBe(true);
    expect(scaffold.files.some((file) => file.path.endsWith('/release/targets/web/game-api/src/routes/health.ts'))).toBe(true);
    expect(scaffold.files.some((file) => file.path.endsWith('/release/targets/web/game-api/src/services/player/view.ts'))).toBe(true);
    expect(scaffold.files.some((file) => file.path.endsWith('/release/targets/web/game-api/src/services/auth/session.ts'))).toBe(true);
    expect(scaffold.files.some((file) => file.path.endsWith('/release/targets/web/game-api/src/services/auth/middleware.ts'))).toBe(true);
    expect(scaffold.files.some((file) => file.path.endsWith('/release/targets/web/game-api/src/services/sugaragent/runtime-services.ts'))).toBe(true);
    expect(scaffold.files.some((file) => file.path.endsWith('/release/targets/web/scripts/read-profile.mjs'))).toBe(true);
    expect(scaffold.files.some((file) => file.path.endsWith('/release/targets/web/scripts/write-release-metadata.mjs'))).toBe(true);
    expect(scaffold.files.some((file) => file.path.endsWith('/.github/workflows/deploy-web-staging.yml'))).toBe(true);
  });

  it('uses slugged service names in the scaffolded profiles', () => {
    const paths = resolveGameRootPaths('/Users/nikki/projects/wordlark');
    const scaffold = buildWebReleaseTargetScaffold(paths, {
      gameId: 'wordlark',
      gameName: 'Wordlark',
    });

    const productionProfile = scaffold.files.find((file) => file.path.endsWith('profile.production.json'));
    const stagingProfile = scaffold.files.find((file) => file.path.endsWith('profile.staging.json'));

    expect(productionProfile?.content).toContain('"serviceName": "wordlark-api"');
    expect(stagingProfile?.content).toContain('"serviceName": "wordlark-api-staging"');
    expect(productionProfile?.content).toContain('"publishDirectory": "exports/web/client"');
    expect(productionProfile?.content).toContain('"imageRepository": "us-central1-docker.pkg.dev/replace-me/wordlark-web/wordlark-api"');
    expect(stagingProfile?.content).toContain('"outputPath": "release/targets/web/.artifacts/release-metadata.staging.json"');
    expect(productionProfile?.content).toContain('"runtimeArchiveUrl": "https://github.com/ggml-org/llama.cpp/releases/download/b8182/llama-b8182-bin-ubuntu-x64.tar.gz"');
    expect(productionProfile?.content).toContain('"modelFileName": "qwen3-4b-instruct-2507-q4_k_m.gguf"');
  });

  it('scaffolds a bootable game-api skeleton with readiness and player bootstrap semantics', () => {
    const paths = resolveGameRootPaths('/Users/nikki/projects/wordlark');
    const scaffold = buildWebReleaseTargetScaffold(paths, {
      gameId: 'wordlark',
      gameName: 'Wordlark',
    });

    const indexFile = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/index.ts'));
    const appFile = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/app.ts'));
    const healthRoute = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/routes/health.ts'));
    const playerRoute = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/routes/player.ts'));
    const playerService = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/services/player/view.ts'));
    const saveService = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/services/save/index.ts'));
    const saveRoute = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/routes/save.ts'));

    expect(indexFile?.content).toContain("await app.listen({ port, host: '0.0.0.0' })");
    expect(appFile?.content).toContain("await app.register(registerHealthRoutes)");
    expect(healthRoute?.content).toContain("app.get('/healthz'");
    expect(healthRoute?.content).toContain("app.get('/readyz'");
    expect(playerRoute?.content).toContain("app.get('/me'");
    expect(playerService?.content).toContain("type: 'anonymous'");
    expect(saveRoute?.content).toContain('buildHostedSaveDisabledResponse');
    expect(saveService?.content).toContain('Hosted save persistence is not enabled for this game.');
  });

  it('scaffolds phase-4 auth, session, and abuse-control surfaces', () => {
    const paths = resolveGameRootPaths('/Users/nikki/projects/wordlark');
    const scaffold = buildWebReleaseTargetScaffold(paths, {
      gameId: 'wordlark',
      gameName: 'Wordlark',
    });

    const envExample = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/.env.example'));
    const packageJson = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/package.json'));
    const appFile = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/app.ts'));
    const authRoute = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/routes/auth.ts'));
    const saveRoute = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/routes/save.ts'));
    const sugaragentRoute = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/routes/sugaragent.ts'));
    const authSessionService = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/services/auth/session.ts'));
    const authCredentialsService = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/services/auth/credentials.ts'));
    const authMiddlewareService = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/services/auth/middleware.ts'));
    const authRateLimitService = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/services/auth/rate-limit.ts'));

    expect(packageJson?.content).toContain('"jose"');
    expect(envExample?.content).toContain('GAME_API_SHARED_ALPHA_USERNAME=alpha');
    expect(envExample?.content).toContain('GAME_API_SHARED_ALPHA_PASSWORD_HASH=sha256:replace-me');
    expect(envExample?.content).toContain('GAME_API_LOGIN_IP_MAX=10');
    expect(envExample?.content).toContain('GAME_API_SUGARAGENT_RUNTIME_MODE=llama');
    expect(envExample?.content).toContain('GAME_API_SUGARAGENT_LORE_DIR=../../../plugins/sugaragent/lore/generated');
    expect(envExample?.content).toContain('SUGARAGENT_RUNTIME_BUNDLE_DIR=');
    expect(envExample?.content).toContain('SUGARAGENT_EMBEDDING_MODEL_DIR=');
    expect(appFile?.content).toContain('app.addHook(\'onRequest\', attachOptionalSession)');
    expect(authRoute?.content).toContain('preHandler: enforceLoginIpRateLimit');
    expect(authRoute?.content).toContain('reply.setCookie');
    expect(authRoute?.content).toContain('invalid_credentials');
    expect(saveRoute?.content).toContain('requireSession');
    expect(sugaragentRoute?.content).toContain('enforceSugarAgentSessionRateLimit');
    expect(authSessionService?.content).toContain('new SignJWT');
    expect(authSessionService?.content).toContain('jwtVerify');
    expect(authCredentialsService?.content).toContain('hashPasswordSha256');
    expect(authMiddlewareService?.content).toContain('auth-login-ip');
    expect(authMiddlewareService?.content).toContain('protected-session');
    expect(authMiddlewareService?.content).toContain('sugaragent-session');
    expect(authRateLimitService?.content).toContain('const buckets = new Map<string, BucketState>()');
  });

  it('scaffolds phase-5 sugaragent route wiring against shared runtime-service contracts', () => {
    const paths = resolveGameRootPaths('/Users/nikki/projects/wordlark');
    const scaffold = buildWebReleaseTargetScaffold(paths, {
      gameId: 'wordlark',
      gameName: 'Wordlark',
    });

    const sugaragentRoute = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/routes/sugaragent.ts'));
    const sugaragentService = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/services/sugaragent/index.ts'));
    const sugaragentRuntimeServices = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/services/sugaragent/runtime-services.ts'));

    expect(sugaragentRoute?.content).toContain("from '@sugarengine/sugaragent-runtime-core'");
    expect(sugaragentRoute?.content).toContain('getSugarAgentRuntimeServices().health');
    expect(sugaragentRoute?.content).toContain('getSugarAgentRuntimeServices().generateStructured');
    expect(sugaragentRoute?.content).toContain('getSugarAgentRuntimeServices().embed');
    expect(sugaragentRoute?.content).toContain('sessionScopeId: request.authSession?.sessionId ?? \'anonymous\'');
    expect(sugaragentRoute?.content).toContain('gameId: app.gameApiConfig.gameId');
    expect(sugaragentService?.content).toContain('buildSugarAgentTransportError');
    expect(sugaragentRuntimeServices?.content).toContain('createHostedSugarAgentRuntimeServices');
    expect(sugaragentRuntimeServices?.content).toContain('initializeSugarAgentRuntimeServices');
    expect(sugaragentRuntimeServices?.content).toContain('config.sugaragent.runtimeMode');
    expect(sugaragentRuntimeServices?.content).not.toContain('not configured yet.');
  });

  it('initializes scaffolded hosted SugarAgent runtime services from backend config', () => {
    const paths = resolveGameRootPaths('/Users/nikki/projects/wordlark');
    const scaffold = buildWebReleaseTargetScaffold(paths, {
      gameId: 'wordlark',
      gameName: 'Wordlark',
    });

    const appFile = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/app.ts'));
    const configFile = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/config.ts'));
    const typesFile = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/src/types.ts'));

    expect(appFile?.content).toContain('initializeSugarAgentRuntimeServices(config)');
    expect(configFile?.content).toContain('GAME_API_SUGARAGENT_RUNTIME_MODE');
    expect(configFile?.content).toContain('path.resolve(process.cwd(), process.env.GAME_API_SUGARAGENT_LORE_DIR');
    expect(typesFile?.content).toContain("runtimeMode: 'llama' | 'auto' | 'mock'");
    expect(typesFile?.content).toContain("provider: 'local' | 'echo'");
  });

  it('scaffolds phase-7 deployment automation, release metadata helpers, and artifact-driven web deploy contract', () => {
    const paths = resolveGameRootPaths('/Users/nikki/projects/wordlark');
    const scaffold = buildWebReleaseTargetScaffold(paths, {
      gameId: 'wordlark',
      gameName: 'Wordlark',
    });

    const webReadme = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/README.md'));
    const webGitignore = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/.gitignore'));
    const dockerfile = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/game-api/Dockerfile'));
    const stagingWorkflow = scaffold.files.find((file) => file.path.endsWith('/.github/workflows/deploy-web-staging.yml'));
    const productionWorkflow = scaffold.files.find((file) => file.path.endsWith('/.github/workflows/deploy-web-production.yml'));
    const readProfileScript = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/scripts/read-profile.mjs'));
    const writeMetadataScript = scaffold.files.find((file) => file.path.endsWith('/release/targets/web/scripts/write-release-metadata.mjs'));

    expect(webReadme?.content).toContain('exports/web/client/');
    expect(webReadme?.content).toContain('code-only and does not carry native binaries or model payloads');
    expect(webGitignore?.content).toContain('.artifacts/*.json');
    expect(dockerfile?.content).toContain('FROM node:22-bookworm-slim AS build');
    expect(dockerfile?.content).toContain('FROM node:22-bookworm-slim AS sugaragent-assets');
    expect(dockerfile?.content).toContain('SUGARAGENT_RUNTIME_ARCHIVE_URL');
    expect(dockerfile?.content).toContain('SUGARAGENT_RUNTIME_BUNDLE_DIR=/opt/sugaragent/runtime');
    expect(dockerfile?.content).toContain('curl -fsSL "$SUGARAGENT_MODEL_URL"');
    expect(dockerfile?.content).toContain('npm install --omit=dev');

    expect(stagingWorkflow?.content).toContain('Resolve deployment profile');
    expect(stagingWorkflow?.content).toContain('google-github-actions/auth@v2');
    expect(stagingWorkflow?.content).toContain('gcloud run deploy');
    expect(stagingWorkflow?.content).toContain('npx netlify deploy');
    expect(stagingWorkflow?.content).toContain('write-release-metadata.mjs');
    expect(stagingWorkflow?.content).toContain('release/targets/web/profile.staging.json');
    expect(stagingWorkflow?.content).toContain('${{ steps.profile.outputs.backend_image }}:${{ github.sha }}');
    expect(stagingWorkflow?.content).toContain('SUGARAGENT_RUNTIME_ARCHIVE_URL="${{ steps.profile.outputs.sugaragent_runtime_archive_url }}"');
    expect(stagingWorkflow?.content).toContain('SUGARAGENT_EMBEDDING_TOKENIZER_URL="${{ steps.profile.outputs.sugaragent_embedding_tokenizer_url }}"');

    expect(productionWorkflow?.content).toContain('release/targets/web/profile.production.json');

    expect(readProfileScript?.content).toContain('frontend_publish_dir');
    expect(readProfileScript?.content).toContain('release_metadata_output_path');
    expect(readProfileScript?.content).toContain('sugaragent_runtime_archive_url');
    expect(readProfileScript?.content).toContain('sugaragent_embedding_tokenizer_url');
    expect(writeMetadataScript?.content).toContain('metadataVersion');
    expect(writeMetadataScript?.content).toContain('sugaragentRuntimeCoreVersion');
  });
});
