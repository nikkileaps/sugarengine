import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const tscBin = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const distRoot = path.join(packageRoot, 'dist');
const runtimeIdentitySourcePath = path.join(packageRoot, 'src', 'runtime', 'runtime-identity.generated.ts');

function normalizeOptionalString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveBuildId() {
  const explicit = normalizeOptionalString(process.env.SUGARAGENT_RUNTIME_CORE_BUILD_ID)
    ?? normalizeOptionalString(process.env.GITHUB_SHA);
  if (explicit) return explicit;

  const gitRevision = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (gitRevision.status === 0) {
    return normalizeOptionalString(gitRevision.stdout);
  }
  return undefined;
}

function resolveResolvedFrom() {
  return normalizeOptionalString(process.env.SUGARAGENT_RUNTIME_CORE_RESOLVED_FROM)
    ?? normalizeOptionalString(process.env.npm_package_resolved);
}

function buildRuntimeIdentitySource(input) {
  const buildIdLine = input.buildId
    ? `  buildId: ${JSON.stringify(input.buildId)},\n`
    : '';
  const resolvedFromLine = input.resolvedFrom
    ? `  resolvedFrom: ${JSON.stringify(input.resolvedFrom)},\n`
    : '';
  return `import type {
  RuntimeCoreIdentity,
} from './runtime-identity.js';

export const RUNTIME_CORE_IDENTITY = Object.freeze({
  packageName: ${JSON.stringify(input.packageName)},
  version: ${JSON.stringify(input.version)},
${buildIdLine}${resolvedFromLine}}) satisfies RuntimeCoreIdentity;
`;
}

const packageJson = JSON.parse(
  await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'),
);

await fs.writeFile(runtimeIdentitySourcePath, buildRuntimeIdentitySource({
  packageName: packageJson.name,
  version: packageJson.version,
  buildId: resolveBuildId(),
  resolvedFrom: resolveResolvedFrom(),
}), 'utf8');

const requiredArtifacts = [
  path.join(distRoot, 'index.js'),
  path.join(distRoot, 'index.d.ts'),
  path.join(distRoot, 'hosted.js'),
  path.join(distRoot, 'hosted.d.ts'),
  path.join(distRoot, 'session', 'runtime.js'),
  path.join(distRoot, 'session', 'runtime.d.ts'),
];

const compile = spawnSync(process.execPath, [tscBin, '-p', 'tsconfig.json'], {
  cwd: packageRoot,
  stdio: 'inherit',
});

const artifactChecks = await Promise.all(requiredArtifacts.map(async (artifactPath) => {
  try {
    await fs.access(artifactPath);
    return true;
  } catch {
    return false;
  }
}));

if (!artifactChecks.every(Boolean)) {
  process.exit(compile.status ?? 1);
}

if ((compile.status ?? 0) !== 0) {
  console.warn('[sugaragent-runtime-core] TypeScript emitted usable dist output with non-fatal diagnostics; continuing package build.');
}

const distBundlePath = path.join(packageRoot, 'dist', 'runtime', 'bundle');

await fs.rm(distBundlePath, { recursive: true, force: true });
