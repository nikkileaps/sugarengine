import { describe, expect, it } from 'vitest';
import { reconcileTurns } from '../reconcile-turns';
import type { SceneBandRealization, SceneTurn } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTurn(overrides: Partial<SceneTurn> = {}): SceneTurn {
  return {
    turnId: 'ix--B0--t1',
    targetText: 'Hola.',
    focusLexicalEntryIds: [],
    responseMode: 'free_form',
    editStatus: 'generated',
    sourceHash: 'aabbccdd0011',
    ...overrides,
  };
}

function makeBand(bandId: string, turns: SceneTurn[]): SceneBandRealization {
  return {
    bandId: bandId as SceneBandRealization['bandId'],
    turns,
    providerPolicy: 'scripted',
    interactionId: 'ix',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reconcileTurns', () => {
  const interactionIds = new Set(['ix']);

  it('skips turns when source hash matches', () => {
    const existing = [makeBand('B0', [makeTurn()])];
    const fresh = [makeBand('B0', [makeTurn()])];

    const { bands, summary } = reconcileTurns(existing, fresh, interactionIds);

    expect(summary.skipped).toBe(1);
    expect(summary.regenerated).toBe(0);
    expect(summary.flaggedStale).toBe(0);
    expect(bands[0].turns[0].stale).toBe(false);
  });

  it('regenerates generated turns when hash changes', () => {
    const existing = [makeBand('B0', [
      makeTurn({ editStatus: 'generated', sourceHash: 'old_hash_0000' }),
    ])];
    const fresh = [makeBand('B0', [
      makeTurn({ sourceHash: 'new_hash_0000', targetText: 'Hola amigo.' }),
    ])];

    const { bands, summary } = reconcileTurns(existing, fresh, interactionIds);

    expect(summary.regenerated).toBe(1);
    expect(bands[0].turns[0].targetText).toBe('Hola amigo.');
    expect(bands[0].turns[0].sourceHash).toBe('new_hash_0000');
    expect(bands[0].turns[0].stale).toBe(false);
  });

  it('flags reviewed turns as stale when hash changes', () => {
    const existing = [makeBand('B0', [
      makeTurn({ editStatus: 'reviewed', sourceHash: 'old_hash_0000', targetText: 'My reviewed text' }),
    ])];
    const fresh = [makeBand('B0', [
      makeTurn({ sourceHash: 'new_hash_0000', targetText: 'Fresh text' }),
    ])];

    const { bands, summary } = reconcileTurns(existing, fresh, interactionIds);

    expect(summary.flaggedStale).toBe(1);
    expect(bands[0].turns[0].targetText).toBe('My reviewed text'); // NOT overwritten
    expect(bands[0].turns[0].stale).toBe(true);
  });

  it('flags manual turns as stale when hash changes', () => {
    const existing = [makeBand('B0', [
      makeTurn({ editStatus: 'manual', sourceHash: 'old_hash_0000', targetText: 'My manual edit' }),
    ])];
    const fresh = [makeBand('B0', [
      makeTurn({ sourceHash: 'new_hash_0000', targetText: 'Fresh text' }),
    ])];

    const { bands, summary } = reconcileTurns(existing, fresh, interactionIds);

    expect(summary.flaggedStale).toBe(1);
    expect(bands[0].turns[0].targetText).toBe('My manual edit'); // NOT overwritten
    expect(bands[0].turns[0].stale).toBe(true);
  });

  it('adds new turns from fresh when not in existing', () => {
    const existing = [makeBand('B0', [])];
    const fresh = [makeBand('B0', [
      makeTurn({ turnId: 'ix--B0--t1' }),
      makeTurn({ turnId: 'ix--B0--t2', targetText: 'Segundo.' }),
    ])];

    const { bands, summary } = reconcileTurns(existing, fresh, interactionIds);

    expect(summary.added).toBe(2);
    expect(bands[0].turns).toHaveLength(2);
  });

  it('flags orphaned manual/reviewed turns when interaction removed', () => {
    const removed = new Set<string>(); // interaction 'ix' is NOT in the set
    const existing = [makeBand('B0', [
      makeTurn({ editStatus: 'manual' }),
    ])];
    const fresh = [makeBand('B0', [])];

    const { bands, summary } = reconcileTurns(existing, fresh, removed);

    expect(summary.flaggedOrphaned).toBe(1);
    expect(bands[0].turns[0].orphaned).toBe(true);
  });

  it('drops orphaned generated turns silently', () => {
    const removed = new Set<string>(); // interaction 'ix' is NOT in the set
    const existing = [makeBand('B0', [
      makeTurn({ editStatus: 'generated' }),
    ])];
    const fresh = [makeBand('B0', [])];

    const { bands, summary } = reconcileTurns(existing, fresh, removed);

    expect(summary.flaggedOrphaned).toBe(1);
    expect(bands[0].turns).toHaveLength(0); // generated orphan removed
  });

  it('adds entirely new bands from fresh', () => {
    const existing = [makeBand('B0', [makeTurn()])];
    const fresh = [
      makeBand('B0', [makeTurn()]),
      makeBand('B1', [makeTurn({ turnId: 'ix--B1--t1', sourceHash: 'b1hash00000' })]),
    ];

    const { bands, summary } = reconcileTurns(existing, fresh, interactionIds);

    expect(bands).toHaveLength(2);
    expect(summary.added).toBe(1);
    expect(bands[1].bandId).toBe('B1');
  });

  it('clears stale flag when source hash matches again', () => {
    const existing = [makeBand('B0', [
      makeTurn({ editStatus: 'manual', stale: true, sourceHash: 'current_hash' }),
    ])];
    const fresh = [makeBand('B0', [
      makeTurn({ sourceHash: 'current_hash' }),
    ])];

    const { bands } = reconcileTurns(existing, fresh, interactionIds);

    expect(bands[0].turns[0].stale).toBe(false);
  });

  it('returns correct summary across multiple turns and bands', () => {
    const existing = [
      makeBand('B0', [
        makeTurn({ turnId: 'ix--B0--t1', editStatus: 'generated', sourceHash: 'old1' }),
        makeTurn({ turnId: 'ix--B0--t2', editStatus: 'manual', sourceHash: 'old2' }),
        makeTurn({ turnId: 'ix--B0--t3', editStatus: 'reviewed', sourceHash: 'same' }),
      ]),
    ];
    const fresh = [
      makeBand('B0', [
        makeTurn({ turnId: 'ix--B0--t1', sourceHash: 'new1', targetText: 'Regen' }),
        makeTurn({ turnId: 'ix--B0--t2', sourceHash: 'new2', targetText: 'Fresh' }),
        makeTurn({ turnId: 'ix--B0--t3', sourceHash: 'same' }),
        makeTurn({ turnId: 'ix--B0--t4', sourceHash: 'brand_new_00' }),
      ]),
    ];

    const { summary } = reconcileTurns(existing, fresh, interactionIds);

    expect(summary.regenerated).toBe(1);  // t1: generated + hash changed
    expect(summary.flaggedStale).toBe(1); // t2: manual + hash changed
    expect(summary.skipped).toBe(1);      // t3: reviewed + hash same
    expect(summary.added).toBe(1);        // t4: new
  });
});
