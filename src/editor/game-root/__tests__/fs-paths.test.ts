import { describe, expect, it } from 'vitest';

import {
  basenameFsPath,
  dirnameFsPath,
  inferGameRootFromInputPath,
  isProjectFilePath,
  joinFsPath,
  resolveGameRootPaths,
} from '../fs-paths';

describe('fs-paths', () => {
  it('infers a game root from a project file path', () => {
    const resolved = inferGameRootFromInputPath('/Users/nikki/projects/wordlark/project.sgrgame');
    expect(resolved.rootPath).toBe('/Users/nikki/projects/wordlark');
    expect(resolved.projectFilePath).toBe('/Users/nikki/projects/wordlark/project.sgrgame');
  });

  it('infers a project file path from a root path', () => {
    const resolved = inferGameRootFromInputPath('games/wordlark');
    expect(resolved.rootPath).toBe('games/wordlark');
    expect(resolved.projectFilePath).toBe('games/wordlark/project.sgrgame');
  });

  it('handles windows separators without forcing posix normalization', () => {
    const paths = resolveGameRootPaths('C:\\Games\\Wordlark');
    expect(paths.projectFilePath).toBe('C:\\Games\\Wordlark\\project.sgrgame');
    expect(joinFsPath('C:\\Games\\Wordlark', 'assets', 'audio')).toBe('C:\\Games\\Wordlark\\assets\\audio');
    expect(dirnameFsPath('C:\\Games\\Wordlark\\project.sgrgame')).toBe('C:\\Games\\Wordlark');
    expect(basenameFsPath('C:\\Games\\Wordlark\\project.sgrgame')).toBe('project.sgrgame');
    expect(isProjectFilePath('C:\\Games\\Wordlark\\project.sgrgame')).toBe(true);
  });
});
