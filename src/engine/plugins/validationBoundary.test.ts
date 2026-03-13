import { describe, expect, it } from 'vitest';
import {
  deriveValidationSource,
  mergeValidationBoundary,
} from './validationBoundary';

describe('validationBoundary', () => {
  it('derives the correct validation source for each boundary combination', () => {
    expect(deriveValidationSource({})).toBe('none');
    expect(deriveValidationSource({ npcOutputValidated: true })).toBe('npc_output');
    expect(deriveValidationSource({ progressionGateEvaluated: true })).toBe('progression_gate');
    expect(deriveValidationSource({ npcOutputValidated: true, progressionGateEvaluated: true })).toBe('npc_output+progression_gate');
  });

  it('merges boundary flags without discarding existing validation fields', () => {
    expect(mergeValidationBoundary({
      decision: 'accept',
      errors: [],
    }, {
      npcOutputValidated: true,
    })).toEqual({
      decision: 'accept',
      errors: [],
      npcOutputValidated: true,
      progressionGateEvaluated: false,
      source: 'npc_output',
    });

    expect(mergeValidationBoundary({
      decision: 'fallback',
      errors: ['x'],
      npcOutputValidated: true,
    }, {
      progressionGateEvaluated: true,
    })).toEqual({
      decision: 'fallback',
      errors: ['x'],
      npcOutputValidated: true,
      progressionGateEvaluated: true,
      source: 'npc_output+progression_gate',
    });
  });
});
