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
    expect(output).toContain("baker> Hi, I'm baker. What can I help with today?");
  });

  it('performs one bounded corrective retrieval attempt before abstaining on weak evidence', () => {
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
        '--ask',
        'do you know anything about zqxptown?',
        '--debug-structured',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('"qualityPath":"corrective_fail"');
    expect(output).toContain('"correctiveAttempted":true');
    expect(output).toContain("baker> I am not sure. I do not have reliable records about that right now.");
  });

  it('uses single-pass retrieval when evidence quality is sufficient', () => {
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
        '--ask',
        'what do you know about rackwick city creation?',
        '--debug-structured',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('"qualityPath":"single_pass"');
    expect(output).toContain('"correctiveAttempted":false');
    expect(output).toContain('baker>');
  });

  it('does not fail retrieval quality for filler-heavy resort questions', () => {
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-sugaragent-retrieval-filler-'));
    const loreDir = path.join(tempDir, 'lore');
    fs.mkdirSync(loreDir, { recursive: true });

    fs.writeFileSync(
      path.join(loreDir, 'manifest.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        source: { repo: 'local', commit: 'filler-1' },
        generatedAt: new Date().toISOString(),
        toolVersion: 'test',
        counts: { files: 1, chunks: 1, issues: 0 },
      }, null, 2)}\n`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(loreDir, 'chunks.json'),
      `${JSON.stringify([
        {
          chunkId: 'lore.locations.towns.town.earendale#overview',
          pageId: 'lore.locations.towns.town.earendale',
          title: 'Earendale',
          sectionHeading: 'Overview',
          sourceFile: 'locations/towns/town.earendale.md',
          sourceCommit: 'filler-1',
          sourceRepo: 'local',
          summary: 'The Wordlark Hollow Resort and Spa is located just outside Earendale.',
          content: 'The Wordlark Hollow Resort and Spa is located just outside Earendale.',
          tokens: ['wordlark', 'hollow', 'resort', 'spa', 'earendale'],
          metadata: {
            id: 'lore.locations.towns.town.earendale',
            tags: ['earendale', 'resort'],
            entity_ids: [],
            location_ids: ['locations.earendale'],
            faction_ids: [],
            beat_ids: [],
          },
        },
      ], null, 2)}\n`,
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
        '--lore-dir',
        loreDir,
        '--ask',
        'do you know anything about the resort near here?',
        '--debug-structured',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('"qualityPath":"single_pass"');
    expect(output).toContain('Wordlark Hollow Resort and Spa');
    expect(output).not.toContain('I am not sure. I do not have reliable records about that right now.');

    fs.rmSync(tempDir, { recursive: true, force: true });
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

  it('uses deterministic chat path even when invalid-json simulation is enabled', () => {
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

    expect(output).toContain("baker> Got it. Tell me a little more and I'll help where I can.");
    expect(output).not.toContain('local provider fallback engaged');
  });

  it('runs llama runtime mode with deterministic pipeline responses', () => {
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
    expect(output).toContain("baker> Got it. Tell me a little more and I'll help where I can.");
    expect(output).not.toContain('validation=attempt 1: invalid JSON');
  });

  it('returns grounded uncertainty for identity-self prompts with no self evidence', () => {
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
        '--force-utterance-initial',
        '--llama-arg',
        'Captain Rowan trained with the city watch before joining command.',
        '--llama-arg',
        '--force-utterance-repair',
        '--llama-arg',
        'I am not sure yet. I do not have reliable records about my own background.',
        '--no-lore',
        '--ask',
        'tell me about your background',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('baker> I am not sure yet. I do not want to guess about my own background without records.');
    expect(output).not.toContain('Captain Rowan trained');
    expect(output).not.toContain('local provider fallback engaged');
  });

  it('ignores forced llama utterance when answering identity-self prompts', () => {
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
        'Captain Rowan trained with the city watch before joining command.',
        '--no-lore',
        '--ask',
        'tell me about your background',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('baker> I am not sure yet. I do not want to guess about my own background without records.');
    expect(output).not.toContain('Captain Rowan trained with the city watch');
    expect(output).not.toContain('local provider fallback engaged');
  });

  it('routes session recall prompts away from lore override and self-uncertainty forcing', () => {
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
        "I don't remember yet, but I'm glad to chat with you.",
        '--ask',
        'do you remember me?',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('routing intent=session_recall');
    expect(output).toContain('policy=memory_first');
    expect(output).toContain("baker> I don't remember any details yet. Tell me something about yourself and I'll keep it in mind.");
    expect(output).not.toContain('I am not sure yet. I do not want to guess about my own background without records.');
  });

  it('rejects ungrounded player-attribution lore during session recall and falls back safely', () => {
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
        "Mim? Oh, I remember now - your photo collection has always been fascinating.",
        '--ask',
        'do you remember me?',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('routing intent=session_recall');
    expect(output).toContain('local provider fallback engaged');
    expect(output).toContain("baker> I don't remember any details yet. Tell me something about yourself and I'll keep it in mind.");
    expect(output).not.toContain('your photo collection has always been fascinating');
  });

  it('uses evidence-first pipeline v2 for recall turns and ignores forced hallucinated ownership text', () => {
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
        "Mim? I remember now - your photo collection is fascinating.",
        '--ask',
        'do you remember me?',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('pipeline version=v2 enabled=true');
    expect(output).toContain('routing intent=session_recall');
    expect(output).toContain("baker> I don't remember any details yet. Tell me something about yourself and I'll keep it in mind.");
    expect(output).not.toContain('your photo collection is fascinating');
  });

  it('does not enforce claim-repair retries for plain conversation turns', () => {
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
        "The old sky bridge was built by moonwrights.",
        '--no-lore',
        '--ask',
        'hello there',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain("baker> Hi, I'm baker. What can I help with today?");
    expect(output).not.toContain('local provider fallback engaged');
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
    expect(output).toContain("baker> Hi, I'm baker. What can I help with today?");
  });

  it('does not depend on llama generation validity for deterministic chat', () => {
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
    expect(output).toContain("baker> Got it. Tell me a little more and I'll help where I can.");
    expect(output).not.toContain('local provider fallback engaged');
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

    expect(output).toContain('local provider fallback engaged');
    expect(output).toContain('baker> You mentioned that');
    expect(output).not.toContain('I lost my train of thought');

    fs.rmSync(sessionPath, { force: true });
  });

  it('stays first-meeting safe even when llama is forced to prior-familiar wording', () => {
    const sessionId = `first-meet-guardrail-${Date.now()}`;
    const sessionPath = path.join(process.cwd(), '.sugaragent-sim-sessions', `${sessionId}.json`);

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
        'Good to see you again, friend.',
        '--no-lore',
        '--session',
        sessionId,
        '--ask',
        'hello there',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain("baker> Hi, I'm baker. What can I help with today?");
    expect(output).not.toContain('see you again');
    expect(output).not.toContain('local provider fallback engaged');

    fs.rmSync(sessionPath, { force: true });
  });

  it('rejects ungrounded player assumptions on first-meeting greetings', () => {
    const sessionId = `first-meet-greeting-assumption-${Date.now()}`;
    const sessionPath = path.join(process.cwd(), '.sugaragent-sim-sessions', `${sessionId}.json`);

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
        'I noticed your shop has those new energy loaves. How do they work?',
        '--no-lore',
        '--session',
        sessionId,
        '--ask',
        'hello',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain("baker> Hi, I'm baker. What can I help with today?");
    expect(output).not.toContain('energy loaves');
    expect(output).not.toContain('local provider fallback engaged');

    fs.rmSync(sessionPath, { force: true });
  });

  it('uses grounded retrieval output instead of forced hallucinated knowledge text', () => {
    const loreDir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-sugaragent-lore-low-confidence-'));
    fs.writeFileSync(
      path.join(loreDir, 'manifest.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        source: { repo: 'local', commit: 'lowconf-1' },
        generatedAt: new Date().toISOString(),
        toolVersion: 'test',
        counts: { files: 2, chunks: 2, issues: 0 },
      }, null, 2)}\n`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(loreDir, 'chunks.json'),
      `${JSON.stringify([
        {
          chunkId: 'lore.town.alpha#overview',
          pageId: 'lore.town.alpha',
          title: 'Town Alpha',
          sectionHeading: 'Overview',
          sourceFile: 'alpha.md',
          sourceCommit: 'lowconf-1',
          sourceRepo: 'local',
          summary: 'Alpha town has a small market.',
          tokens: ['town', 'market'],
          metadata: {
            id: 'lore.town.alpha',
            tags: ['town'],
            entity_ids: [],
            location_ids: [],
            faction_ids: [],
            beat_ids: [],
          },
        },
        {
          chunkId: 'lore.town.beta#overview',
          pageId: 'lore.town.beta',
          title: 'Town Beta',
          sectionHeading: 'Overview',
          sourceFile: 'beta.md',
          sourceCommit: 'lowconf-1',
          sourceRepo: 'local',
          summary: 'Beta town has an old gate.',
          tokens: ['town', 'gate'],
          metadata: {
            id: 'lore.town.beta',
            tags: ['town'],
            entity_ids: [],
            location_ids: [],
            faction_ids: [],
            beat_ids: [],
          },
        },
      ], null, 2)}\n`,
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
        "Earendale's where the old city walls used to be, before Rackwick was built.",
        '--lore-dir',
        loreDir,
        '--ask',
        'what do you know about town?',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('baker> Alpha town has a small market. Beta town has an old gate.');
    expect(output).not.toContain("Earendale's where the old city walls used to be");
    expect(output).not.toContain('From the archives:');
    expect(output).toContain('citations=');

    fs.rmSync(loreDir, { recursive: true, force: true });
  });

  it('prefers self-attributed lore on self_query when identity profile is configured', () => {
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-sugaragent-self-query-'));
    const loreDir = path.join(tempDir, 'lore');
    const bundlePath = path.join(tempDir, 'authoring.bundle.json');
    fs.mkdirSync(loreDir, { recursive: true });

    fs.writeFileSync(
      path.join(loreDir, 'manifest.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        source: { repo: 'local', commit: 'selfquery-1' },
        generatedAt: new Date().toISOString(),
        toolVersion: 'test',
        counts: { files: 2, chunks: 2, issues: 0 },
      }, null, 2)}\n`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(loreDir, 'chunks.json'),
      `${JSON.stringify([
        {
          chunkId: 'lore.npcs.baker#background',
          pageId: 'lore.npcs.baker',
          title: 'Baker',
          sectionHeading: 'Background',
          sourceFile: 'baker.md',
          sourceCommit: 'selfquery-1',
          sourceRepo: 'local',
          summary: 'Baker grew up near the market ovens and apprenticed as a child.',
          tokens: ['baker', 'background', 'market', 'ovens', 'apprenticed'],
          metadata: {
            id: 'lore.npcs.baker',
            tags: ['baker'],
            entity_ids: ['npc.baker'],
            location_ids: ['locations.rackwick_city'],
            faction_ids: [],
            beat_ids: [],
          },
        },
        {
          chunkId: 'lore.npcs.rowan#background',
          pageId: 'lore.npcs.rowan',
          title: 'Rowan',
          sectionHeading: 'Background',
          sourceFile: 'rowan.md',
          sourceCommit: 'selfquery-1',
          sourceRepo: 'local',
          summary: 'Captain Rowan trained with the city watch.',
          tokens: ['rowan', 'background', 'captain', 'watch', 'trained'],
          metadata: {
            id: 'lore.npcs.rowan',
            tags: ['rowan'],
            entity_ids: ['npc.rowan'],
            location_ids: ['locations.rackwick_city'],
            faction_ids: [],
            beat_ids: [],
          },
        },
      ], null, 2)}\n`,
      'utf8',
    );

    fs.writeFileSync(
      bundlePath,
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: '2026-03-01T00:00:00.000Z',
        source: { gameId: 'wordlark', name: 'Wordlark' },
        policy: { globalSafetyBounds: [] },
        profiles: [
          {
            npcId: 'baker',
            persona: 'Warm baker',
            tone: 'friendly',
            constraints: [],
            loreScopes: ['npcs.baker', 'npcs.rowan'],
            selfEntityId: 'npc.baker',
            selfLoreScopes: ['npcs.baker'],
            relatedLoreScopes: ['npcs.rowan'],
          },
        ],
        beatContracts: [],
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
        '--authoring-bundle',
        bundlePath,
        '--lore-dir',
        loreDir,
        '--ask',
        'tell me about your background as a baker',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('Baker grew up near the market ovens');
    expect(output).not.toContain('Captain Rowan trained');
    expect(output).not.toContain('I am not sure yet');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('forces uncertainty on self_query when only non-self evidence is available', () => {
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-sugaragent-self-query-uncertain-'));
    const loreDir = path.join(tempDir, 'lore');
    const bundlePath = path.join(tempDir, 'authoring.bundle.json');
    fs.mkdirSync(loreDir, { recursive: true });

    fs.writeFileSync(
      path.join(loreDir, 'manifest.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        source: { repo: 'local', commit: 'selfquery-2' },
        generatedAt: new Date().toISOString(),
        toolVersion: 'test',
        counts: { files: 1, chunks: 1, issues: 0 },
      }, null, 2)}\n`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(loreDir, 'chunks.json'),
      `${JSON.stringify([
        {
          chunkId: 'lore.npcs.rowan#background',
          pageId: 'lore.npcs.rowan',
          title: 'Rowan',
          sectionHeading: 'Background',
          sourceFile: 'rowan.md',
          sourceCommit: 'selfquery-2',
          sourceRepo: 'local',
          summary: 'Captain Rowan trained with the city watch.',
          tokens: ['rowan', 'background', 'captain', 'watch', 'trained'],
          metadata: {
            id: 'lore.npcs.rowan',
            tags: ['rowan'],
            entity_ids: ['npc.rowan'],
            location_ids: ['locations.rackwick_city'],
            faction_ids: [],
            beat_ids: [],
          },
        },
      ], null, 2)}\n`,
      'utf8',
    );

    fs.writeFileSync(
      bundlePath,
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: '2026-03-01T00:00:00.000Z',
        source: { gameId: 'wordlark', name: 'Wordlark' },
        policy: { globalSafetyBounds: [] },
        profiles: [
          {
            npcId: 'baker',
            persona: 'Warm baker',
            tone: 'friendly',
            constraints: [],
            loreScopes: ['npcs.rowan'],
            selfEntityId: 'npc.baker',
            selfLoreScopes: ['npcs.baker'],
            relatedLoreScopes: ['npcs.rowan'],
          },
        ],
        beatContracts: [],
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
        '--authoring-bundle',
        bundlePath,
        '--lore-dir',
        loreDir,
        '--ask',
        'tell me about your background',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output).toContain('I am not sure yet. I do not want to guess about my own background without records.');
    expect(output).not.toContain('Captain Rowan trained');

    fs.rmSync(tempDir, { recursive: true, force: true });
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

  it('tracks topic coverage and gracefully closes exhausted character-mode topics', () => {
    const sessionId = `topic-coverage-${Date.now()}`;
    const sessionPath = path.join(process.cwd(), '.sugaragent-sim-sessions', `${sessionId}.json`);

    const runTurn = (debugStructured = false): string => {
      const args = [
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
        'i like coffee',
      ];
      if (debugStructured) {
        args.push('--debug-structured');
      }
      return execFileSync(
        'node',
        args,
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );
    };

    runTurn();
    runTurn();
    runTurn();
    runTurn();
    const output = runTurn(true);

    expect(output).toContain('baker> I think we have covered coffee for now. Goodbye for now, and we can pick this up again later.');
    expect(output).toContain('"topicCoverage"');
    expect(output).toContain('"topicExhausted":true');
    expect(fs.existsSync(sessionPath)).toBe(true);

    const raw = fs.readFileSync(sessionPath, 'utf8');
    expect(raw).toContain('"topicCoverage"');
    const parsed = JSON.parse(raw) as {
      npcs?: Record<string, { topicCoverage?: Array<{ topic?: string }> }>;
    };
    const topicCoverage = parsed.npcs?.baker?.topicCoverage ?? [];
    expect(topicCoverage.some((entry) => entry.topic === 'coffee')).toBe(true);

    fs.rmSync(sessionPath, { force: true });
  });

  it('prefers noun-like topic targets over conversational verbs in topic coverage', () => {
    const sessionId = `topic-focus-${Date.now()}`;
    const sessionPath = path.join(process.cwd(), '.sugaragent-sim-sessions', `${sessionId}.json`);

    const runTurn = (ask: string, debugStructured = false): string => {
      const args = [
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
        ask,
      ];
      if (debugStructured) {
        args.push('--debug-structured');
      }
      return execFileSync(
        'node',
        args,
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );
    };

    runTurn('Tell me about coffee.');
    runTurn('What do you know about coffee?');
    runTurn('I want to know about coffee.', true);

    expect(fs.existsSync(sessionPath)).toBe(true);
    const raw = fs.readFileSync(sessionPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      npcs?: Record<string, { topicCoverage?: Array<{ topic?: string }> }>;
    };
    const topicCoverage = parsed.npcs?.baker?.topicCoverage ?? [];
    const topics = topicCoverage
      .map((entry) => entry.topic)
      .filter((entry): entry is string => typeof entry === 'string');

    expect(topics).toContain('coffee');
    expect(topics).not.toContain('want');
    expect(topics).not.toContain('love');

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
