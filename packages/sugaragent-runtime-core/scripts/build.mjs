import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const tscBin = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const distRoot = path.join(packageRoot, 'dist');

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
