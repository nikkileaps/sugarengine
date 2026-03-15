/**
 * @fileoverview Local type shims for Node built-ins used by SugarAgent's Node-side runtime files.
 *
 * Responsibilities:
 * - Allow the browser app TypeScript project to parse SugarAgent Node-side modules
 *   without requiring global Node typings in the app tsconfig.
 *
 * Boundaries:
 * - Owns: module declarations only.
 * - Does not own: runtime behavior or build configuration.
 *
 * Public API:
 * - none
 *
 * Side Effects:
 * - TypeScript-only module resolution for `node:*` imports in this workspace.
 */

declare module 'node:fs' {
  const fs: any;
  export default fs;
}

declare module 'node:path' {
  const path: any;
  export default path;
}

declare module 'node:child_process' {
  export const execFile: any;
  export const execFileSync: any;
  export const spawnSync: any;
}

declare module 'node:util' {
  export const promisify: any;
}

declare module 'node:crypto' {
  export const createHash: any;
}

declare module 'node:os' {
  const os: any;
  export default os;
}

declare const process: {
  env: Record<string, string | undefined>;
};
