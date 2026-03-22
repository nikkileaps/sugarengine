export const DEFAULT_SUGARLANG_SUPPORT_LANGUAGE = 'en';
export const DEFAULT_SUGARLANG_LEARNER_BANDS = ['B0', 'B1', 'B2', 'B3', 'B4'] as const;

export interface SugarlangPlayerProfile {
  targetLanguage: string;
  supportLanguage: string;
  learnerBand: string;
}

export interface PlayerProfile {
  plugins: {
    sugarlang?: SugarlangPlayerProfile;
  };
}

export interface SugarlangPlayerProfileOptions {
  enabled?: boolean;
  targetLanguages?: string[];
  defaultTargetLanguage?: string;
  learnerBands?: string[];
  defaultLearnerBand?: string;
}

export interface SugarlangPlayerProfileUpdate {
  targetLanguage?: string;
  supportLanguage?: string;
  learnerBand?: string;
}

function normalizeNonEmptyString(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveSugarlangLearnerBands(
  options?: SugarlangPlayerProfileOptions,
): string[] {
  const configured = Array.isArray(options?.learnerBands)
    ? options.learnerBands
        .map((band) => normalizeNonEmptyString(band))
        .filter((band): band is string => typeof band === 'string')
    : [];
  return configured.length > 0 ? configured : [...DEFAULT_SUGARLANG_LEARNER_BANDS];
}

export function resolveSugarlangTargetLanguages(
  options?: SugarlangPlayerProfileOptions,
): string[] {
  return Array.isArray(options?.targetLanguages)
    ? options.targetLanguages
        .map((language) => normalizeNonEmptyString(language))
        .filter((language): language is string => typeof language === 'string' && language !== DEFAULT_SUGARLANG_SUPPORT_LANGUAGE)
    : [];
}

export function normalizeSugarlangPlayerProfile(
  current: Partial<SugarlangPlayerProfile> | undefined,
  options?: SugarlangPlayerProfileOptions,
): SugarlangPlayerProfile | undefined {
  if (options?.enabled === false) return undefined;

  const targetLanguages = resolveSugarlangTargetLanguages(options);
  if (targetLanguages.length === 0) return undefined;

  const learnerBands = resolveSugarlangLearnerBands(options);
  const defaultTargetLanguage = normalizeNonEmptyString(options?.defaultTargetLanguage);
  const requestedTargetLanguage = normalizeNonEmptyString(current?.targetLanguage);
  const targetLanguage = targetLanguages.includes(requestedTargetLanguage ?? '')
    ? requestedTargetLanguage!
    : (
      targetLanguages.includes(defaultTargetLanguage ?? '')
        ? defaultTargetLanguage!
        : targetLanguages[0]!
    );

  const defaultLearnerBand = normalizeNonEmptyString(options?.defaultLearnerBand);
  const requestedLearnerBand = normalizeNonEmptyString(current?.learnerBand);
  const learnerBand = learnerBands.includes(requestedLearnerBand ?? '')
    ? requestedLearnerBand!
    : (
      learnerBands.includes(defaultLearnerBand ?? '')
        ? defaultLearnerBand!
        : learnerBands[0]!
    );

  return {
    targetLanguage,
    supportLanguage: DEFAULT_SUGARLANG_SUPPORT_LANGUAGE,
    learnerBand,
  };
}
