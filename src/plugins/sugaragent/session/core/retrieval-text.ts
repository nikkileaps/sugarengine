function sanitizePromptText(text: unknown): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

const PLAN_TOKEN_STOP_WORDS = new Set([
  'a',
  'about',
  'an',
  'and',
  'anything',
  'are',
  'as',
  'at',
  'be',
  'but',
  'can',
  'could',
  'do',
  'does',
  'did',
  'for',
  'from',
  'have',
  'has',
  'had',
  'how',
  'here',
  'i',
  'im',
  'is',
  'it',
  'its',
  'know',
  'me',
  'my',
  'near',
  'of',
  'on',
  'or',
  'our',
  'something',
  'that',
  'the',
  'their',
  'them',
  'there',
  'they',
  'thing',
  'this',
  'tell',
  'to',
  'was',
  'we',
  'what',
  'when',
  'where',
  'who',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

export function normalizeEvidenceTextForPlan(text: unknown): string {
  return sanitizePromptText(text)
    .replace(/^from the archives:\s*/i, '')
    .trim();
}

export function tokenizeForPlan(text: unknown): string[] {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s]+/g, ' ')
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 2 && !PLAN_TOKEN_STOP_WORDS.has(entry));
}

export function lexicalOverlapScore(left: unknown, right: unknown): number {
  const leftTokens = tokenizeForPlan(left);
  const rightTokens = tokenizeForPlan(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const rightSet = new Set(rightTokens);
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightSet.has(token)) overlap += 1;
  }
  return overlap / leftTokens.length;
}

export function countEvidenceTokens(text: unknown): number {
  return tokenizeForPlan(text).length;
}
