#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const sourcePath = path.resolve('src/plugins/sugaragent/dialogue/scenario-orchestration.ts');
const outputPath = path.resolve('src/plugins/sugaragent/dialogue/scenario-orchestration.runtime.mjs');

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
  '// Source of truth: src/plugins/sugaragent/dialogue/scenario-orchestration.ts',
  '// Regenerate: node scripts/sugaragent-sync-scenario-orchestration.mjs',
  '',
].join('\n');

fs.writeFileSync(outputPath, `${banner}${transpiled}`, 'utf8');
console.log(`[sugaragent] wrote ${outputPath}`);
