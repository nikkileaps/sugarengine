#!/usr/bin/env node

import { SugarAgent } from '../src/plugins/sugaragent/command-api.mjs';

await SugarAgent.execute({
  command: 'eval',
  argv: process.argv.slice(2),
  mode: 'process',
});
