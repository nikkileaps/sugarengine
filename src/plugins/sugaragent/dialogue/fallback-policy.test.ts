import { describe, expect, it } from 'vitest';
import {
  createConversationFallbackReply,
  createDeterministicFallbackReply,
} from './fallback-policy.mjs';

describe('SugarAgent dialogue fallback policy', () => {
  it('returns generic conversation fallback for non-recall prompts', () => {
    const reply = createDeterministicFallbackReply('how is your day going?', [
      'my name is nikki',
    ]);
    expect(reply).toEqual(createConversationFallbackReply());
  });

  it('returns memory-based recall fallback when prompted for recall', () => {
    const reply = createDeterministicFallbackReply('what did i mention before?', [
      'my name is nikki',
      'i like dogs and coffee',
    ]);

    expect(reply.intent).toBe('recall');
    expect(reply.utterance).toContain('You mentioned that');
    expect(reply.utterance).toContain('your name is nikki');
  });

  it('returns no-memory recall fallback when no facts are available', () => {
    const reply = createDeterministicFallbackReply('what do you remember about me?', []);
    expect(reply.intent).toBe('recall');
    expect(reply.utterance).toContain("I don't remember any details yet");
  });

  it('splits composite memory facts and deduplicates recall clauses', () => {
    const reply = createDeterministicFallbackReply('what did i mention before?', [
      'my name is nikki and i like dogs and coffee',
      'i like dogs and coffee',
    ]);

    expect(reply.intent).toBe('recall');
    expect(reply.utterance).toBe('You mentioned that your name is nikki, and you like dogs and coffee.');
  });

  it('does not treat plain statements with \"i said\" as recall prompts', () => {
    const reply = createDeterministicFallbackReply('i said my name is mim.', [
      'my name is mim',
    ]);

    expect(reply).toEqual(createConversationFallbackReply());
  });
});
