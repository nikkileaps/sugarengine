function normalizeMessage(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s'!?-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasQuestionCue(text: string): boolean {
  if (!text) return false;
  if (text.includes('?')) return true;
  return /^(what|when|where|who|why|how|do|did|can|could|would|will|have|has|is|are)\b/.test(text);
}

export type SocialAcknowledgementKind =
  | 'gratitude'
  | 'shared_preference'
  | 'agreement'
  | 'generic';

export function detectSocialAcknowledgement(message: unknown): SocialAcknowledgementKind | null {
  const normalized = normalizeMessage(message);
  if (!normalized || hasQuestionCue(normalized)) return null;

  if (/\b(thanks|thank you|appreciate it)\b/.test(normalized)) {
    return 'gratitude';
  }

  if (
    /\b(i love|i like|i enjoy|me too|same here|same)\b/.test(normalized)
    || /^yay\b/.test(normalized)
  ) {
    return 'shared_preference';
  }

  if (
    /^(nice|cool|sweet|awesome|alright|fair enough|got it|makes sense|right)\b/.test(normalized)
    || /\b(yeah|yep|yup|okay|ok|sure)\b/.test(normalized)
  ) {
    return 'agreement';
  }

  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length <= 6 && /!$/.test(String(message ?? '').trim())) {
    return 'generic';
  }

  return null;
}

export function isLikelyAcknowledgementOnlyMessage(message: unknown): boolean {
  return detectSocialAcknowledgement(message) !== null;
}
