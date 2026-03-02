import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('sugaragent sim CLI (phase 1)', () => {
  it('runs one-shot mode with default echo provider', () => {
    const output = execFileSync(
      'node',
      ['scripts/sugaragent-sim.mjs', '--npc', 'baker', '--ask', 'hello there'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('Loaded SugarAgent sim for NPC "baker" (provider=echo)');
    expect(output).toContain('baker> Echo: hello there');
  });

  it('runs local provider mode with structured output', () => {
    const output = execFileSync(
      'node',
      ['scripts/sugaragent-sim.mjs', '--npc', 'baker', '--provider', 'local', '--runtime', 'mock', '--no-lore', '--ask', 'hola'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('Loaded SugarAgent sim for NPC "baker" (provider=local)');
    expect(output).toContain('using mock runtime');
    expect(output).toContain('local runtime health: ok');
    expect(output).toContain('baker> I heard you say: "hola".');
  });

  it('runs ADR-006 crowd-town cadence simulation ticks', () => {
    const output = execFileSync(
      'node',
      [
        'scripts/sugaragent-sim.mjs',
        '--scenario',
        'crowd-town',
        '--ticks',
        '300',
        '--tick-budget',
        '6',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('scenario=crowd-town');
    expect(output).toContain('cadence=crowd-town ticks=300 budget=6');
    expect(output).toContain('beat-guardrail farAutoCompletions=0');
  });

  it('loads authored beat contracts from bundle when requested', () => {
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-sugaragent-authoring-'));
    const bundlePath = path.join(tempDir, 'authoring.bundle.json');
    fs.writeFileSync(
      bundlePath,
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: '2026-03-01T00:00:00.000Z',
        source: { gameId: 'rackwick', name: 'Rackwick' },
        profiles: [
          {
            npcId: 'baker',
            persona: 'Warm baker',
            tone: 'friendly',
            constraints: [],
            loreScopes: [],
          },
        ],
        beatContracts: [
          {
            id: 'beat.baker.intro',
            questId: 'quest.baker.intro',
            npcId: 'baker',
            objective: 'Greet player and mention fresh bread.',
            requiredFacts: ['Fresh bread just came out of the oven.'],
            forbiddenFacts: [],
            completionRule: 'player_ack',
            maxTurns: 1,
          },
        ],
      }),
      'utf8',
    );

    const output = execFileSync(
      'node',
      [
        'scripts/sugaragent-sim.mjs',
        '--npc',
        'baker',
        '--provider',
        'local',
        '--runtime',
        'mock',
        '--no-lore',
        '--authoring-bundle',
        bundlePath,
        '--beat-contract',
        'beat.baker.intro',
        '--ask',
        'hey there',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('authoring loaded:');
    expect(output).toContain('scenario=authoring:beat.baker.intro');
    expect(output).toContain('beat-fallback=');
    expect(output).toContain('Fresh bread just came out of the oven');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('engages fallback when local provider keeps returning invalid payloads', () => {
    const output = execFileSync(
      'node',
      [
        'scripts/sugaragent-sim.mjs',
        '--npc',
        'baker',
        '--provider',
        'local',
        '--runtime',
        'mock',
        '--no-lore',
        '--simulate-invalid-json',
        'always',
        '--ask',
        'fallback please',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('validation=attempt 1: invalid JSON');
    expect(output).toContain('local provider fallback engaged');
    expect(output).toContain('baker> I lost my train of thought. Could you say that again?');
  });

  it('runs llama runtime mode and succeeds after repair retry', () => {
    const output = execFileSync(
      'node',
      [
        'scripts/sugaragent-sim.mjs',
        '--npc',
        'baker',
        '--provider',
        'local',
        '--runtime',
        'llama',
        '--llama-bin',
        'node',
        '--llama-bin-arg',
        'scripts/test-fixtures/fake-llama-cli.mjs',
        '--model-path',
        'scripts/test-fixtures/fake-model.gguf',
        '--no-lore',
        '--ask',
        'hola amiga',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('local runtime health: ok');
    expect(output).toContain('[mode=llama]');
    expect(output).toContain('validation=attempt 1: invalid JSON');
    expect(output).toContain('baker> Fake llama heard: hola amiga');
  });

  it('accepts valid llama JSON when trailing brace noise is present', () => {
    const output = execFileSync(
      'node',
      [
        'scripts/sugaragent-sim.mjs',
        '--npc',
        'baker',
        '--provider',
        'local',
        '--runtime',
        'llama',
        '--llama-bin',
        'node',
        '--llama-bin-arg',
        'scripts/test-fixtures/fake-llama-cli.mjs',
        '--model-path',
        'scripts/test-fixtures/fake-model.gguf',
        '--llama-arg',
        '--emit-trailing-noise',
        '--no-lore',
        '--ask',
        'hello there',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('[mode=llama]');
    expect(output).not.toContain('local provider fallback engaged');
    expect(output).toContain('baker> Fake llama heard: hello there');
  });

  it('falls back when llama runtime keeps returning invalid output', () => {
    const output = execFileSync(
      'node',
      [
        'scripts/sugaragent-sim.mjs',
        '--npc',
        'baker',
        '--provider',
        'local',
        '--runtime',
        'llama',
        '--llama-bin',
        'node',
        '--llama-bin-arg',
        'scripts/test-fixtures/fake-llama-cli.mjs',
        '--model-path',
        'scripts/test-fixtures/fake-model.gguf',
        '--llama-arg',
        '--always-invalid',
        '--no-lore',
        '--ask',
        'force fallback',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('[mode=llama]');
    expect(output).toContain('validation=attempt 1: invalid JSON');
    expect(output).toContain('local provider fallback engaged');
  });

  it('rejects verbatim memory-fact replay and falls back when llama keeps repeating it', () => {
    const sessionId = `memory-guardrail-${Date.now()}`;
    const sessionDir = path.join(process.cwd(), '.sugaragent-sim-sessions');
    const sessionPath = path.join(sessionDir, `${sessionId}.json`);
    const rememberedFact = 'my name is nikki and i love coffee and dogs';
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      sessionPath,
      `${JSON.stringify({
        schemaVersion: 1,
        sessionId,
        updatedAt: Date.now(),
        npcs: {
          baker: {
            facts: [rememberedFact],
            history: [],
            updatedAt: Date.now(),
          },
        },
      }, null, 2)}\n`,
      'utf8',
    );

    const output = execFileSync(
      'node',
      [
        'scripts/sugaragent-sim.mjs',
        '--npc',
        'baker',
        '--provider',
        'local',
        '--runtime',
        'llama',
        '--llama-bin',
        'node',
        '--llama-bin-arg',
        'scripts/test-fixtures/fake-llama-cli.mjs',
        '--model-path',
        'scripts/test-fixtures/fake-model.gguf',
        '--llama-arg',
        '--force-valid',
        '--llama-arg',
        '--force-utterance',
        '--llama-arg',
        rememberedFact,
        '--no-lore',
        '--session',
        sessionId,
        '--ask',
        'what did i mention before?',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('validation=attempt 1: utterance repeats remembered fact verbatim');
    expect(output).toContain('local provider fallback engaged');
    expect(output).toContain('baker> You mentioned that');
    expect(output).not.toContain('I lost my train of thought');

    fs.rmSync(sessionPath, { force: true });
  });

  it('persists session memory state between runs', () => {
    const sessionId = `memory-smoke-${Date.now()}`;
    const sessionPath = path.join(process.cwd(), '.sugaragent-sim-sessions', `${sessionId}.json`);

    const firstOutput = execFileSync(
      'node',
      [
        'scripts/sugaragent-sim.mjs',
        '--npc',
        'baker',
        '--provider',
        'local',
        '--runtime',
        'mock',
        '--no-lore',
        '--session',
        sessionId,
        '--ask',
        'my name is nikki',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    const secondOutput = execFileSync(
      'node',
      [
        'scripts/sugaragent-sim.mjs',
        '--npc',
        'baker',
        '--provider',
        'local',
        '--runtime',
        'mock',
        '--no-lore',
        '--session',
        sessionId,
        '--ask',
        'hello again',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(firstOutput).toContain('session created:');
    expect(secondOutput).toContain('session loaded:');
    expect(fs.existsSync(sessionPath)).toBe(true);

    const raw = fs.readFileSync(sessionPath, 'utf8');
    expect(raw).toContain('my name is nikki');

    fs.rmSync(sessionPath, { force: true });
  });

  it('resets an existing session via --reset-session', () => {
    const sessionId = `memory-reset-${Date.now()}`;
    const sessionPath = path.join(process.cwd(), '.sugaragent-sim-sessions', `${sessionId}.json`);
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(
      sessionPath,
      `${JSON.stringify({
        schemaVersion: 1,
        sessionId,
        updatedAt: Date.now(),
        npcs: {
          baker: {
            facts: ['my name is nikki and i love coffee and dogs'],
            history: [{ role: 'player', text: 'old history line', updatedAt: Date.now() }],
            updatedAt: Date.now(),
          },
        },
      }, null, 2)}\n`,
      'utf8',
    );

    const output = execFileSync(
      'node',
      [
        'scripts/sugaragent-sim.mjs',
        '--npc',
        'baker',
        '--provider',
        'local',
        '--runtime',
        'mock',
        '--no-lore',
        '--reset-session',
        sessionId,
        '--ask',
        'hello fresh start',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('session reset:');
    expect(output).toContain('session created:');
    expect(fs.existsSync(sessionPath)).toBe(true);
    const raw = fs.readFileSync(sessionPath, 'utf8');
    expect(raw).not.toContain('old history line');
    expect(raw).not.toContain('my name is nikki and i love coffee and dogs');

    fs.rmSync(sessionPath, { force: true });
  });

  it('runs beat-guard-alert scenario with intent gating and beat evidence', () => {
    const output = execFileSync(
      'node',
      [
        'scripts/sugaragent-sim.mjs',
        '--scenario',
        'beat-guard-alert',
        '--npc',
        'guard',
        '--provider',
        'local',
        '--runtime',
        'mock',
        '--no-lore',
        '--ask',
        'gate status',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('scenario=beat-guard-alert');
    expect(output).toContain('intent-executed=');
    expect(output).toContain('intent-rejected=');
    expect(output).toContain('beat-evidence=');
    expect(output).toContain('guard>');
  });

  it('fails fast on unknown options', () => {
    let output = '';
    try {
      execFileSync('node', ['scripts/sugaragent-sim.mjs', '--bad-flag'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const details = error as { stderr?: string; message?: string };
      output = details.stderr ?? details.message ?? String(error);
    }

    expect(output).toContain('Unknown option');
  });

  it('fails fast on unknown scenario id', () => {
    let output = '';
    try {
      execFileSync('node', ['scripts/sugaragent-sim.mjs', '--scenario', 'does-not-exist', '--ask', 'hello'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const details = error as { stderr?: string; message?: string };
      output = details.stderr ?? details.message ?? String(error);
    }

    expect(output).toContain('Unknown scenario');
    expect(output).toContain('beat-guard-alert');
  });
});
