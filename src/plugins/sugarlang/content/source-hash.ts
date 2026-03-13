/**
 * Source hash computation for turn provenance tracking (ADR-015).
 *
 * Produces a 12-char hex fingerprint of the upstream content that was used
 * to generate a turn. When the upstream changes, the hash misses, and the
 * turn is flagged as stale.
 */

export interface SourceHashInput {
  sourceText: string;
  speakerId?: string;
  speakerName?: string;
  choiceLabels?: string[];
  questNodeId?: string;
  bandId: string;
  targetLanguage: string;
  /** Opaque fingerprint of the lexicon state used for generation. */
  lexiconFingerprint?: string;
}

/**
 * Compute a 12-char hex source hash from the given input fields.
 * Uses a fast non-crypto hash (FNV-1a 64-bit, truncated) for performance.
 * This is a change-detection fingerprint, not a security hash.
 */
export function computeSourceHash(input: SourceHashInput): string {
  const parts = [
    input.sourceText,
    input.speakerId ?? '',
    input.speakerName ?? '',
    (input.choiceLabels ?? []).join('|'),
    input.questNodeId ?? '',
    input.bandId,
    input.targetLanguage,
    input.lexiconFingerprint ?? '',
  ];
  return fnv1aHash(parts.join('\x00'));
}

/**
 * Compute a short fingerprint of a lexicon pack's entry IDs + glosses.
 * Changes when entries are added, removed, or their glosses/targetForms change.
 */
export function computeLexiconFingerprint(
  entries: ReadonlyArray<{ lexicalEntryId: string; gloss: string; targetForm: string }>,
): string {
  const data = entries.map((e) => `${e.lexicalEntryId}:${e.gloss}:${e.targetForm}`).join('\n');
  return fnv1aHash(data);
}

/**
 * FNV-1a hash producing a 12-char hex string.
 * Deterministic, fast, good distribution for change detection.
 */
function fnv1aHash(data: string): string {
  // FNV-1a 64-bit offset basis and prime (using two 32-bit halves)
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  const prime1 = 0x01000193;
  const prime2 = 0x00000100;

  for (let i = 0; i < data.length; i++) {
    const byte = data.charCodeAt(i) & 0xff;
    h1 ^= byte;
    h1 = Math.imul(h1, prime1) >>> 0;
    h2 ^= byte;
    h2 = Math.imul(h2, prime2) >>> 0;
  }

  // Combine both halves into a 12-char hex string
  const hex1 = h1.toString(16).padStart(8, '0');
  const hex2 = (h2 & 0xffff).toString(16).padStart(4, '0');
  return `${hex1}${hex2}`;
}
