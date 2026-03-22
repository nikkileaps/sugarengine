import type { TitleScreenConfig } from './Game';

interface RawSugarlangTitleScreenSettings {
  enabled?: boolean;
  targetLanguages?: string[];
  defaultTargetLanguage?: string;
  learnerBands?: string[];
  defaultLearnerBand?: string;
}

interface RawTitleScreenConfig extends Partial<TitleScreenConfig> {
  playerProfile?: {
    sugarlang?: RawSugarlangTitleScreenSettings;
  };
}

export function buildTitleScreenConfig(options: {
  base: TitleScreenConfig;
  overrides?: RawTitleScreenConfig | null;
  gameTitle?: string;
  hasSugarlang: boolean;
  sugarlangTargetLanguages: string[];
}): TitleScreenConfig {
  const { base, overrides, gameTitle, hasSugarlang, sugarlangTargetLanguages } = options;
  const authoredSugarlang = overrides?.playerProfile?.sugarlang;

  return {
    ...base,
    title: overrides?.title ?? gameTitle ?? base.title,
    ...overrides,
    playerProfile: {
      sugarlang: hasSugarlang
        ? {
            enabled: authoredSugarlang?.enabled ?? true,
            targetLanguages: authoredSugarlang?.targetLanguages?.length
              ? authoredSugarlang.targetLanguages
              : sugarlangTargetLanguages,
            defaultTargetLanguage: authoredSugarlang?.defaultTargetLanguage,
            learnerBands: authoredSugarlang?.learnerBands,
            defaultLearnerBand: authoredSugarlang?.defaultLearnerBand,
          }
        : undefined,
    },
  };
}
