import { describe, expect, it } from 'vitest';
import { SugarAgent } from '../command-api.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('SugarAgent command API facade', () => {
  it('creates a reusable turn session through the facade', async () => {
    const session = await SugarAgent.createAgentSession({
      npc: 'baker',
      provider: 'echo',
      useLore: false,
    });

    const turn = await session.runTurn('hello');
    expect(turn.output.utterance).toBe('Echo: hello');
  });

  it('runs scenario orchestration through the same facade session API', async () => {
    const session = await SugarAgent.createAgentSession({
      npc: 'guard',
      provider: 'local',
      runtime: 'mock',
      useLore: false,
      scenario: 'beat-guard-alert',
    });

    const turn = await session.runTurn('gate status');
    expect(turn.scenarioLogs.some((line: string) => line.startsWith('intent-executed='))).toBe(true);
    expect(turn.scenarioLogs.some((line: string) => line.startsWith('beat-evidence='))).toBe(true);
  });

  it('runs crowd-town cadence simulation through the same session API', async () => {
    const session = await SugarAgent.createAgentSession({
      npc: 'guard',
      provider: 'echo',
      scenario: 'crowd-town',
      tickBudget: 6,
    });

    const report = session.runTicks(300);
    expect(report.scenarioId).toBe('crowd-town');
    expect(report.maxUpdatesInTick).toBeLessThanOrEqual(6);
    expect(report.activeBeat.farAutoCompletions).toBe(0);
  });

  it('loads authored profile + beat contract bundle through the same session API', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-authoring-runtime-'));
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
            persona: 'Warm neighborhood baker.',
            tone: 'friendly',
            constraints: ['no spoilers about hidden quest rewards'],
            loreScopes: ['town.market'],
          },
        ],
        beatContracts: [
          {
            id: 'beat.baker.intro',
            questId: 'quest.baker.intro',
            npcId: 'baker',
            objective: 'Welcome the player and mention fresh bread.',
            requiredFacts: ['Fresh bread just came out of the oven.'],
            forbiddenFacts: [],
            completionRule: 'player_ack',
            maxTurns: 1,
          },
        ],
      }),
      'utf8',
    );

    const session = await SugarAgent.createAgentSession({
      npc: 'baker',
      provider: 'local',
      runtime: 'mock',
      useLore: false,
      authoringBundlePath: bundlePath,
      beatContractId: 'beat.baker.intro',
    });

    expect(session.startup.authoring.loaded).toBe(true);
    expect(session.startup.authoring.profileNpcId).toBe('baker');
    expect(session.startup.authoring.beatContractId).toBe('beat.baker.intro');
    expect(session.startup.scenario?.id).toBe('authoring:beat.baker.intro');

    const turn = await session.runTurn('hello');
    expect(turn.output.utterance).toContain('Fresh bread just came out of the oven');
    expect(turn.scenarioLogs.some((line: string) => line.startsWith('beat-fallback='))).toBe(true);
  });

  it('rejects ambiguous config when built-in scenario and beatContractId are combined', async () => {
    await expect(
      SugarAgent.createAgentSession({
        npc: 'guard',
        provider: 'local',
        runtime: 'mock',
        useLore: false,
        scenario: 'beat-guard-alert',
        beatContractId: 'beat.some.authoring.contract',
      }),
    ).rejects.toThrow('Do not combine beatContractId with a built-in scenario');
  });

  it('enforces learned reranker contract for llama runtime sessions', async () => {
    await expect(
      SugarAgent.createAgentSession({
        npc: 'baker',
        provider: 'local',
        runtime: 'llama',
        rerankerClass: 'heuristic',
      }),
    ).rejects.toThrow('runtime=llama requires rerankerClass=learned');
  });

  it('throws for unknown commands in programmatic mode', async () => {
    await expect(
      SugarAgent.execute({
        command: 'not-a-command',
        argv: [],
        mode: 'programmatic',
      }),
    ).rejects.toThrow('Unknown SugarAgent command');
  });

  it('accepts authoring:pack command through the same facade', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-pack-'));
    const projectPath = path.join(tempDir, 'project.sgrgame');
    fs.writeFileSync(
      projectPath,
      JSON.stringify({
        meta: { gameId: 'test', name: 'Test' },
        npcs: [],
        quests: [],
        dialogues: [],
      }),
      'utf8',
    );

    await expect(
      SugarAgent.execute({
        command: 'authoring:pack',
        argv: ['--project', projectPath, '--out', path.join(tempDir, 'authoring.bundle.json'), '--quiet'],
        mode: 'programmatic',
      }),
    ).resolves.toBeUndefined();
  });

  it('accepts eval command through the same facade', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-eval-cmd-'));
    await expect(
      SugarAgent.execute({
        command: 'eval',
        argv: ['--suite', 'smoke', '--output', tempDir, '--provider', 'local', '--runtime', 'mock', '--quiet'],
        mode: 'programmatic',
      }),
    ).resolves.toBeUndefined();

    expect(fs.existsSync(path.join(tempDir, 'report.json'))).toBe(true);
  });
});
