import { describe, expect, it } from 'vitest';
import { extractExplicitPlayerFacts } from './memory-provenance';

describe('memory-provenance', () => {
  it('extracts explicit player self-assertions and ignores world beliefs', () => {
    expect(extractExplicitPlayerFacts("I'm from Portland. I speak Spanish.")).toMatchObject([
      { type: 'player_fact', text: "I'm from Portland" },
      { type: 'player_fact', text: 'I speak Spanish' },
    ]);

    expect(extractExplicitPlayerFacts('I think the station is north of here.')).toEqual([]);
    expect(extractExplicitPlayerFacts('There is a fire in the mountains.')).toEqual([]);
  });
});
