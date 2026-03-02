#!/usr/bin/env node

function getArgValue(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

function hasArg(args, flag) {
  return args.includes(flag);
}

function buildOutput({ prompt, alwaysInvalid, forceValid, forcedUtterance }) {
  if (alwaysInvalid) {
    return '{"utterance": ';
  }

  const repairMode = /repair_mode=yes/.test(prompt);
  if (!forceValid && !repairMode) {
    return '{"utterance": ';
  }

  if (typeof forcedUtterance === 'string' && forcedUtterance.trim().length > 0) {
    return JSON.stringify({
      utterance: forcedUtterance.trim(),
      emotion: 'curious',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
    });
  }

  const messageMatch = prompt.match(/(?:current\s+)?player message:\s*(.+)/i);
  const playerMessage = messageMatch ? messageMatch[1].trim() : 'unknown';
  return JSON.stringify({
    utterance: `Fake llama heard: ${playerMessage}`,
    emotion: 'curious',
    intent: 'conversation',
    proposedIntents: [],
    citations: [],
  });
}

function main() {
  const args = process.argv.slice(2);
  const prompt = getArgValue(args, '-p') ?? getArgValue(args, '--prompt') ?? '';
  const alwaysInvalid = hasArg(args, '--always-invalid');
  const forceValid = hasArg(args, '--force-valid');
  const forcedUtterance = getArgValue(args, '--force-utterance');
  const emitTrailingNoise = hasArg(args, '--emit-trailing-noise');
  const output = buildOutput({ prompt, alwaysInvalid, forceValid, forcedUtterance });
  const trailingNoise = emitTrailingNoise ? '\ntrace: {{ bad-template }}\n' : '\n';

  process.stdout.write(`model loaded\n${output}${trailingNoise}`);
}

main();
