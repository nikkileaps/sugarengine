import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('sugaragent authoring pack CLI (ADR-008)', () => {
  it('writes bundle when plugin is enabled and authoring data is valid', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-authoring-'));
    const projectPath = path.join(tempDir, 'project.sgrgame');
    const outPath = path.join(tempDir, 'authoring.bundle.json');

    fs.writeFileSync(
      projectPath,
      JSON.stringify({
        meta: { gameId: 'rackwick', name: 'Rackwick' },
        plugins: ['sugaragent'],
        npcs: [
          {
            id: 'npc.guard',
            name: 'Guard',
            agentProfile: { persona: 'Guard captain' },
          },
        ],
        dialogues: [{ id: 'dlg.guard.alert.fallback' }],
        quests: [
          {
            id: 'quest.guard',
            stages: [{ id: 'stage.one', objectives: [{ id: 'obj.one' }] }],
            agentBeatContracts: [
              {
                id: 'beat.guard.alert',
                npcId: 'npc.guard',
                objective: 'Explain the alert.',
                requiredFacts: ['Gate is locked.'],
                completionRule: 'player_ack',
                fallbackScriptId: 'dlg.guard.alert.fallback',
                stageId: 'stage.one',
                objectiveId: 'obj.one',
              },
            ],
          },
        ],
      }),
      'utf8',
    );

    const output = execFileSync(
      'node',
      ['scripts/sugaragent-authoring-pack.mjs', '--project', projectPath, '--out', outPath],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('wrote');
    expect(fs.existsSync(outPath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(outPath, 'utf8')) as { beatContracts?: unknown[] };
    expect(Array.isArray(parsed.beatContracts)).toBe(true);
    expect(parsed.beatContracts?.length).toBe(1);
  });

  it('fails when plugin is enabled and contracts are invalid', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-authoring-invalid-'));
    const projectPath = path.join(tempDir, 'project.sgrgame');
    const outPath = path.join(tempDir, 'authoring.bundle.json');

    fs.writeFileSync(
      projectPath,
      JSON.stringify({
        plugins: ['sugaragent'],
        npcs: [{ id: 'npc.guard', name: 'Guard' }],
        dialogues: [],
        quests: [
          {
            id: 'quest.bad',
            stages: [{ id: 'stage.one', objectives: [] }],
            agentBeatContracts: [
              {
                id: 'beat.bad',
                npcId: 'npc.guard',
                objective: 'Missing required facts',
                requiredFacts: [],
                completionRule: 'player_ack',
              },
            ],
          },
        ],
      }),
      'utf8',
    );

    let errorOutput = '';
    try {
      execFileSync(
        'node',
        ['scripts/sugaragent-authoring-pack.mjs', '--project', projectPath, '--out', outPath],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    } catch (error) {
      const details = error as { stderr?: string; message?: string };
      errorOutput = details.stderr ?? details.message ?? String(error);
    }

    expect(errorOutput).toContain('validation failed');
  });
});
