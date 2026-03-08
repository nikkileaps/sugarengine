/**
 * Find the Luggage — Content Bundle Assembly.
 *
 * Re-exports all content artifacts and assembles them into a
 * ready-to-load SugarlangContentBundle.
 */

import type { SugarlangContentBundle } from '../../types';
import { FIND_THE_LUGGAGE_SCENARIO, FIND_THE_LUGGAGE_GROUNDING } from './scenario';
import { SPANISH_LEXICON, ENGLISH_LEXICON } from './lexicon';
import { BAND_POLICIES } from './band-policies';
import { SCENE_PACK_ES } from './scene-pack-es';
import { SCENE_PACK_EN } from './scene-pack-en';

export {
  FIND_THE_LUGGAGE_SCENARIO,
  FIND_THE_LUGGAGE_GROUNDING,
  SPANISH_LEXICON,
  ENGLISH_LEXICON,
  BAND_POLICIES,
  SCENE_PACK_ES,
  SCENE_PACK_EN,
};

export const FIND_THE_LUGGAGE_BUNDLE: SugarlangContentBundle = {
  scenarios: new Map([
    [FIND_THE_LUGGAGE_SCENARIO.scenarioId, FIND_THE_LUGGAGE_SCENARIO],
  ]),
  groundingMaps: new Map([
    [FIND_THE_LUGGAGE_GROUNDING.scenarioId, FIND_THE_LUGGAGE_GROUNDING],
  ]),
  lexicons: new Map([
    [SPANISH_LEXICON.targetLanguage, SPANISH_LEXICON],
    [ENGLISH_LEXICON.targetLanguage, ENGLISH_LEXICON],
  ]),
  bandPolicies: BAND_POLICIES,
  sceneLanguagePacks: new Map([
    [`${SCENE_PACK_ES.scenarioId}:${SCENE_PACK_ES.targetLanguage}`, SCENE_PACK_ES],
    [`${SCENE_PACK_EN.scenarioId}:${SCENE_PACK_EN.targetLanguage}`, SCENE_PACK_EN],
  ]),
};
