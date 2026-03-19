import { describe, expect, it } from 'vitest';
import {
  countEvidenceTokens,
  lexicalOverlapScore,
  normalizeEvidenceTextForPlan,
  tokenizeForPlan,
} from './retrieval-text.js';

describe('retrieval text core', () => {
  it('normalizes archive prefixes from evidence text', () => {
    expect(normalizeEvidenceTextForPlan('From the archives: The resort is nearby.')).toBe('The resort is nearby.');
  });

  it('filters low-signal filler terms from plan tokenization', () => {
    const tokens = tokenizeForPlan('Do you know anything about the resort near here?');
    expect(tokens).toEqual(['resort']);
  });

  it('computes lexical overlap from filtered token sets', () => {
    const overlap = lexicalOverlapScore(
      'Do you know anything about the resort near here?',
      'The Wordlark Hollow Resort and Spa is located just outside Earendale.',
    );
    expect(overlap).toBeGreaterThan(0);
  });

  it('counts evidence tokens with shared tokenizer behavior', () => {
    expect(countEvidenceTokens('The resort is by Earendale.')).toBe(3);
  });
});
