function normalizeMessage(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s'!?-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLanguageCode(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) return 'default';
  return value.trim().toLowerCase().split(/[-_]/)[0] ?? 'default';
}

function hasQuestionCue(text: string, targetLanguage?: unknown): boolean {
  if (!text) return false;
  if (text.includes('?')) return true;
  const language = normalizeLanguageCode(targetLanguage);
  if (language === 'es') return /^(que|qué|cuando|cuándo|donde|dónde|quien|quién|por que|por qué|como|cómo|estas|estás|eres|puedes|puedo|hay)\b/.test(text);
  if (language === 'fr') return /^(quoi|que|quand|ou|où|qui|pourquoi|comment|est ce|peux|pouvez|as tu|avez vous)\b/.test(text);
  if (language === 'de') return /^(was|wann|wo|wer|warum|wie|bist|seid|kannst|können)\b/.test(text);
  if (language === 'it') return /^(cosa|che|quando|dove|chi|perche|perché|come|sei|puoi)\b/.test(text);
  if (language === 'pt') return /^(o que|que|quando|onde|quem|por que|por quê|como|voce|você|estas|está|pode)\b/.test(text);
  return /^(what|when|where|who|why|how|do|did|can|could|would|will|have|has|is|are)\b/.test(text);
}

interface LanguageCuePack {
  greetings: RegExp[];
  gratitude: RegExp[];
  sharedPreference: RegExp[];
  agreement: RegExp[];
  reciprocalFollowUps: RegExp[];
  smallTalkQueries: RegExp[];
  lightweightLocation: RegExp[];
  introductions: RegExp[];
}

const DEFAULT_CUE_PACK: LanguageCuePack = {
  greetings: [
    /^(hi|hello|hey|howdy)$/,
    /^(hi|hello|hey|howdy)\s+(there|friend|sir|maam|madam)$/,
    /^(good\s+morning|good\s+afternoon|good\s+evening)$/,
  ],
  gratitude: [/\b(thanks|thank you|appreciate it)\b/],
  sharedPreference: [/\b(i love|i like|i enjoy|me too|same here|same)\b/, /^yay\b/],
  agreement: [/^(nice|cool|sweet|awesome|alright|fair enough|got it|makes sense|right)\b/, /\b(yeah|yep|yup|okay|ok|sure)\b/],
  reciprocalFollowUps: [/\b(and you|what about you|how about you)\b/, /^you\?$/],
  smallTalkQueries: [/\bhow are you\b/, /\bhow('s| is) it going\b/, /\bhow have you been\b/, /\bwhat('?s| is) up\b/, /\bare you (okay|ok|good)\b/, /\bhows your day\b/],
  lightweightLocation: [/\b(where are you|where are we|where am i|where is this|this place|here|there)\b/],
  introductions: [/\bmy name is\s+([a-z\u00c0-\u024f' -]{2,40})\b/i, /^(?:i am|i'm)\s+([a-z\u00c0-\u024f' -]{2,40})(?:[,.!?;:]|$)/i],
};

const LANGUAGE_CUE_PACKS: Record<string, LanguageCuePack> = {
  default: DEFAULT_CUE_PACK,
  en: DEFAULT_CUE_PACK,
  es: {
    greetings: [
      /^(hola|buenas)$/,
      /^(buenos dias|buenas tardes|buenas noches)$/,
    ],
    gratitude: [/\b(gracias|muchas gracias)\b/],
    sharedPreference: [/\b(a mi tambien|a mí también|yo tambien|yo también|me gusta|me encanta)\b/, /^bien\b/],
    agreement: [/^(vale|claro|genial|perfecto|de acuerdo)\b/, /\b(si|sí|ok|okay)\b/],
    reciprocalFollowUps: [/\b(y tu|y tú|y usted|y vos)\b/, /^tu\?$/],
    smallTalkQueries: [/\b(como estas|cómo estás|que tal|qué tal|como te va|cómo te va)\b/, /\b(todo bien)\b/],
    lightweightLocation: [/\b(donde estas|dónde estás|donde estamos|dónde estamos|donde estoy|dónde estoy)\b/],
    introductions: [
      /\bmi nombre es\s+([a-z\u00c0-\u024f' -]{2,40})\b/i,
      /\b(?:me|mi)\s+llamo\s+([a-z\u00c0-\u024f' -]{2,40})\b/i,
      /^soy\s+([a-z\u00c0-\u024f' -]{2,40})(?:[,.!?;:]|$)/i,
    ],
  },
  fr: {
    greetings: [/^(bonjour|salut|coucou)$/, /^(bonsoir)$/],
    gratitude: [/\b(merci|merci beaucoup)\b/],
    sharedPreference: [/\b(moi aussi|j aime|j'adore)\b/],
    agreement: [/^(d accord|super|genial|génial|bien sur|bien sûr)\b/, /\b(oui|ok)\b/],
    reciprocalFollowUps: [/\b(et toi|et vous)\b/],
    smallTalkQueries: [/\b(ca va|ça va|comment ca va|comment ça va)\b/],
    lightweightLocation: [/\b(ou es tu|où es tu|ou est on|où est on)\b/],
    introductions: [/\bje m appelle\s+([a-z\u00c0-\u024f' -]{2,40})\b/i, /^c est moi\s+([a-z\u00c0-\u024f' -]{2,40})(?:[,.!?;:]|$)/i],
  },
  de: {
    greetings: [/^(hallo|hi|guten tag)$/, /^(guten morgen|guten abend)$/],
    gratitude: [/\b(danke|vielen dank)\b/],
    sharedPreference: [/\b(ich auch|mag ich auch|gefallt mir|gefällt mir)\b/],
    agreement: [/^(klar|natürlich|natuerlich|stimmt|gut)\b/, /\b(ja|ok)\b/],
    reciprocalFollowUps: [/\b(und du|und sie)\b/],
    smallTalkQueries: [/\b(wie geht es dir|wie gehts|wie läufts)\b/],
    lightweightLocation: [/\b(wo bist du|wo sind wir|wo bin ich)\b/],
    introductions: [/\bich heisse\s+([a-z\u00c0-\u024f' -]{2,40})\b/i, /\bich bin\s+([a-z\u00c0-\u024f' -]{2,40})\b/i],
  },
  it: {
    greetings: [/^(ciao|salve)$/, /^(buongiorno|buonasera)$/],
    gratitude: [/\b(grazie|mille grazie)\b/],
    sharedPreference: [/\b(anch io|anche io|mi piace|adoro)\b/],
    agreement: [/^(va bene|certo|perfetto|bene)\b/, /\b(si|sì|ok)\b/],
    reciprocalFollowUps: [/\b(e tu|e voi)\b/],
    smallTalkQueries: [/\b(come stai|come va)\b/],
    lightweightLocation: [/\b(dove sei|dove siamo|dove sono)\b/],
    introductions: [/\bmi chiamo\s+([a-z\u00c0-\u024f' -]{2,40})\b/i, /^sono\s+([a-z\u00c0-\u024f' -]{2,40})(?:[,.!?;:]|$)/i],
  },
  pt: {
    greetings: [/^(ola|olá|oi)$/, /^(bom dia|boa tarde|boa noite)$/],
    gratitude: [/\b(obrigado|obrigada|muito obrigado|muito obrigada)\b/],
    sharedPreference: [/\b(eu tambem|eu também|tambem|também|eu gosto|adoro)\b/],
    agreement: [/^(claro|perfeito|beleza|certo)\b/, /\b(sim|ok)\b/],
    reciprocalFollowUps: [/\b(e voce|e você|e tu)\b/],
    smallTalkQueries: [/\b(como vai|como voce esta|como você está|tudo bem)\b/],
    lightweightLocation: [/\b(onde esta|onde está|onde estamos|onde estou)\b/],
    introductions: [/\bme chamo\s+([a-z\u00c0-\u024f' -]{2,40})\b/i, /\bmeu nome e\s+([a-z\u00c0-\u024f' -]{2,40})\b/i, /^sou\s+([a-z\u00c0-\u024f' -]{2,40})(?:[,.!?;:]|$)/i],
  },
};

function getCuePack(targetLanguage?: unknown): LanguageCuePack {
  const language = normalizeLanguageCode(targetLanguage);
  const languagePack = LANGUAGE_CUE_PACKS[language];
  if (!languagePack || language === 'default' || language === 'en') {
    return DEFAULT_CUE_PACK;
  }
  return {
    greetings: [...DEFAULT_CUE_PACK.greetings, ...languagePack.greetings],
    gratitude: [...DEFAULT_CUE_PACK.gratitude, ...languagePack.gratitude],
    sharedPreference: [...DEFAULT_CUE_PACK.sharedPreference, ...languagePack.sharedPreference],
    agreement: [...DEFAULT_CUE_PACK.agreement, ...languagePack.agreement],
    reciprocalFollowUps: [...DEFAULT_CUE_PACK.reciprocalFollowUps, ...languagePack.reciprocalFollowUps],
    smallTalkQueries: [...DEFAULT_CUE_PACK.smallTalkQueries, ...languagePack.smallTalkQueries],
    lightweightLocation: [...DEFAULT_CUE_PACK.lightweightLocation, ...languagePack.lightweightLocation],
    introductions: [...DEFAULT_CUE_PACK.introductions, ...languagePack.introductions],
  };
}

function tokenCount(message: unknown): number {
  const normalized = normalizeMessage(message);
  if (!normalized) return 0;
  return normalized.split(' ').filter(Boolean).length;
}

export type SocialAcknowledgementKind =
  | 'gratitude'
  | 'shared_preference'
  | 'agreement'
  | 'generic';

export function detectSocialAcknowledgement(
  message: unknown,
  targetLanguage?: unknown,
): SocialAcknowledgementKind | null {
  const normalized = normalizeMessage(message);
  if (!normalized || hasQuestionCue(normalized, targetLanguage)) return null;
  const cues = getCuePack(targetLanguage);

  if (cues.gratitude.some((pattern) => pattern.test(normalized))) {
    return 'gratitude';
  }

  if (cues.sharedPreference.some((pattern) => pattern.test(normalized))) {
    return 'shared_preference';
  }

  if (cues.agreement.some((pattern) => pattern.test(normalized))) {
    return 'agreement';
  }

  if (tokenCount(message) <= 6 && /!$/.test(String(message ?? '').trim())) {
    return 'generic';
  }

  return null;
}

export function isLikelyAcknowledgementOnlyMessage(
  message: unknown,
  targetLanguage?: unknown,
): boolean {
  return detectSocialAcknowledgement(message, targetLanguage) !== null;
}

export function isLikelyGreetingOnlyMessage(
  playerMessage: unknown,
  targetLanguage?: unknown,
): boolean {
  const normalized = normalizeMessage(playerMessage);
  if (!normalized) return false;
  return getCuePack(targetLanguage).greetings.some((pattern) => pattern.test(normalized));
}

export function extractDeclaredIdentityName(
  message: unknown,
  targetLanguage?: unknown,
): string | null {
  const source = String(message ?? '').replace(/\s+/g, ' ').trim();
  if (!source) return null;

  const excluded = new Set([
    'a',
    'an',
    'bien',
    'fine',
    'good',
    'great',
    'here',
    'new',
    'ok',
    'okay',
    'ready',
    'sorry',
  ]);

  const normalizeIdentityName = (text: unknown): string => String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const pattern of getCuePack(targetLanguage).introductions) {
    const match = source.match(pattern);
    if (!match?.[1]) continue;
    const normalized = normalizeIdentityName(match[1]);
    if (!normalized || excluded.has(normalized)) continue;
    return normalized;
  }

  return null;
}

export function isLikelyReciprocalSocialQuestion(
  message: unknown,
  targetLanguage?: unknown,
): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized) return false;
  return getCuePack(targetLanguage).reciprocalFollowUps.some((pattern) => pattern.test(normalized));
}

export function isLikelySmallTalkQuery(
  message: unknown,
  targetLanguage?: unknown,
): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized) return false;
  const cues = getCuePack(targetLanguage);
  return cues.smallTalkQueries.some((pattern) => pattern.test(normalized))
    || isLikelyReciprocalSocialQuestion(normalized, targetLanguage);
}

export function isLikelyLightweightLocationPrompt(
  message: unknown,
  targetLanguage?: unknown,
): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized) return false;
  return getCuePack(targetLanguage).lightweightLocation.some((pattern) => pattern.test(normalized));
}

export function isLikelyNpcDirectedLocationPrompt(
  message: unknown,
  targetLanguage?: unknown,
): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized) return false;
  const language = normalizeLanguageCode(targetLanguage);
  if (language === 'es') return /\b(donde estas|dónde estás)\b/.test(normalized);
  if (language === 'fr') return /\b(ou es tu|où es tu)\b/.test(normalized);
  if (language === 'de') return /\b(wo bist du)\b/.test(normalized);
  if (language === 'it') return /\b(dove sei)\b/.test(normalized);
  if (language === 'pt') return /\b(onde esta|onde está|onde voce esta|onde você está)\b/.test(normalized);
  return /\b(where are you)\b/.test(normalized);
}

export function isLikelySceneLocationPrompt(
  message: unknown,
  targetLanguage?: unknown,
): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized) return false;
  const language = normalizeLanguageCode(targetLanguage);
  if (language === 'es') return /\b(donde estamos|dónde estamos|donde estoy|dónde estoy)\b/.test(normalized);
  if (language === 'fr') return /\b(ou sommes nous|où sommes nous|ou suis je|où suis je)\b/.test(normalized);
  if (language === 'de') return /\b(wo sind wir|wo bin ich)\b/.test(normalized);
  if (language === 'it') return /\b(dove siamo|dove sono)\b/.test(normalized);
  if (language === 'pt') return /\b(onde estamos|onde estou)\b/.test(normalized);
  return /\b(where are we|where am i|where is this|this place)\b/.test(normalized);
}

export function isProtectedShortSocialTurn(
  message: unknown,
  targetLanguage?: unknown,
): boolean {
  return tokenCount(message) <= 8 && (
    isLikelyGreetingOnlyMessage(message, targetLanguage)
    || isLikelyAcknowledgementOnlyMessage(message, targetLanguage)
    || extractDeclaredIdentityName(message, targetLanguage) !== null
    || isLikelyReciprocalSocialQuestion(message, targetLanguage)
    || isLikelySmallTalkQuery(message, targetLanguage)
    || isLikelyNpcDirectedLocationPrompt(message, targetLanguage)
  );
}
