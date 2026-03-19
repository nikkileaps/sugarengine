import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const sourceBundlePath = path.join(packageRoot, 'src', 'runtime', 'bundle');
const distBundlePath = path.join(packageRoot, 'dist', 'runtime', 'bundle');

await fs.rm(distBundlePath, { recursive: true, force: true });
await fs.mkdir(path.dirname(distBundlePath), { recursive: true });
await fs.cp(sourceBundlePath, distBundlePath, { recursive: true });
