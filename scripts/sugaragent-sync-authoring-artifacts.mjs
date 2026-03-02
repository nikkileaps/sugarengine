#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const sourcePath = path.resolve('src/plugins/sugaragent/authoring/artifacts.ts');
const outputPath = path.resolve('src/plugins/sugaragent/authoring/artifacts.runtime.mjs');

const source = fs.readFileSync(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    removeComments: false,
  },
  fileName: sourcePath,
}).outputText;

const banner = [
  '// AUTO-GENERATED FILE. DO NOT EDIT.',
  '// Source of truth: src/plugins/sugaragent/authoring/artifacts.ts',
  '// Regenerate: node scripts/sugaragent-sync-authoring-artifacts.mjs',
  '',
].join('\n');

fs.writeFileSync(outputPath, `${banner}${transpiled}`, 'utf8');
console.log(`[sugaragent] wrote ${outputPath}`);
