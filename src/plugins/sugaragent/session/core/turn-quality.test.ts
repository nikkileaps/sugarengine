import { describe, expect, it } from 'vitest';
import {
  extractDeclaredIdentityName,
  isLikelyGreetingOnlyMessage,
  normalizeForEchoCheck,
  validateTurnQuality,
} from './turn-quality';

describe('turn-quality', () => {
  it('normalizes echo check tokens', () => {
    expect(normalizeForEchoCheck('Hello, THERE!!')).toBe('hello there');
  });

  it('detects greeting-only player messages', () => {
    expect(isLikelyGreetingOnlyMessage('hello')).toBe(true);
    expect(isLikelyGreetingOnlyMessage('tell me about the resort')).toBe(false);
  });

  it('extracts declared identity names', () => {
    expect(extractDeclaredIdentityName("my name is nikki")).toBe('nikki');
    expect(extractDeclaredIdentityName("i'm okay")).toBe(null);
  });

  it('rejects placeholder and echoed outputs', () => {
    const placeholder = validateTurnQuality(
      { utterance: 'string' },
      'hello',
      [],
      [],
      {},
    );
    expect(placeholder.valid).toBe(false);

    const echoed = validateTurnQuality(
      { utterance: 'i need directions to the resort near town' },
      'i need directions to the resort near town',
      [],
      [],
      {},
    );
    expect(echoed.valid).toBe(false);
  });

  it('rejects ungrounded player attribution in conversation turns', () => {
    const quality = validateTurnQuality(
      { utterance: 'I noticed your bakery is very popular.' },
      'hello',
      [],
      [],
      { routingIntent: 'social_chat', queryType: 'conversation' },
    );
    expect(quality.valid).toBe(false);
    if (!quality.valid) {
      expect(quality.reason).toContain('player-attribution claim is not grounded');
    }
  });

  it('rejects generic assistant filler on social turns', () => {
    const quality = validateTurnQuality(
      { utterance: "Got it. Tell me a little more and I'll help where I can." },
      'hello',
      [],
      [],
      { routingIntent: 'social_chat', queryType: 'conversation' },
    );
    expect(quality.valid).toBe(false);
    if (!quality.valid) {
      expect(quality.reason).toContain('generic assistant filler');
    }
  });

  it('rejects social replies that confuse a destination with the current location', () => {
    const quality = validateTurnQuality(
      { utterance: 'Welcome to the resort.' },
      "I'm headed to the resort to start a new apprenticeship.",
      [],
      [],
      {
        routingIntent: 'social_chat',
        queryType: 'conversation',
        regionName: 'Station',
        regionPath: 'regions.station',
      },
    );
    expect(quality.valid).toBe(false);
    if (!quality.valid) {
      expect(quality.reason).toContain('authoritative current location');
    }
  });
});
