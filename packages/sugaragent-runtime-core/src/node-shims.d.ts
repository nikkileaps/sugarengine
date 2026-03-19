declare const process: {
  env: Record<string, string | undefined>;
};

declare module 'node:fs' {
  const fs: any;
  export default fs;
}

declare module 'node:fs/promises' {
  const fsPromises: any;
  export default fsPromises;
}

declare module 'node:path' {
  const path: any;
  export default path;
}

declare module 'node:url' {
  export const fileURLToPath: any;
}

declare module 'node:crypto' {
  export const createHash: any;
}

declare module 'node:child_process' {
  export const execFile: any;
  export const spawnSync: any;
}

declare module 'node:util' {
  export const promisify: any;
}

declare module 'node:os' {
  const os: any;
  export default os;
}
