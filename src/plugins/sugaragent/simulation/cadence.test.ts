import { describe, expect, it } from 'vitest';
import { runCrowdTownCadenceSimulation } from './cadence.ts';

describe('SugarAgent cadence simulation (ADR-006 MVP)', () => {
  it('respects per-tick budget and keeps far beat auto-completions at zero', () => {
    const report = runCrowdTownCadenceSimulation(300, {
      maxNpcUpdatesPerTick: 6,
      activeBeatNpcId: 'npc.guard',
      seed: 1337,
    });

    expect(report.scenarioId).toBe('crowd-town');
    expect(report.ticks).toBe(300);
    expect(report.maxUpdatesInTick).toBeLessThanOrEqual(6);
    expect(report.budgetViolations).toBe(0);
    expect(report.activeBeat.farAutoCompletions).toBe(0);
  });

  it('keeps active beat npc responsive when near the player', () => {
    const report = runCrowdTownCadenceSimulation(300, {
      maxNpcUpdatesPerTick: 6,
      activeBeatNpcId: 'npc.guard',
      seed: 1337,
    });

    expect(report.activeBeat.nearTicks).toBeGreaterThan(0);
    expect(report.activeBeat.updatedWhileNear).toBeGreaterThan(0);
    expect(report.activeBeat.responsiveness).toBeGreaterThanOrEqual(0.9);
  });
});
