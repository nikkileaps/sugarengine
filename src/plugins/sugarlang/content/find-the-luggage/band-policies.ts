/**
 * Find the Luggage — Band Policy Defaults.
 *
 * Shared band-level policy defaults for support-language, grounding,
 * response modes, and correction posture.
 */

import type { BandPolicyPack } from '../../types';

export const BAND_POLICIES: BandPolicyPack = {
  policies: [
    {
      bandId: 'B0',
      supportLanguagePolicy: {
        mixingLevel: 'full_support',
        showSupportStrip: false,
        showGlosses: false,
      },
      groundingIntensity: 'always',
      allowedResponseModes: ['chip_composition', 'object_selection'],
      correctionPosture: 'immediate',
    },
    {
      bandId: 'B1',
      supportLanguagePolicy: {
        mixingLevel: 'heavy_support',
        showSupportStrip: false,
        showGlosses: false,
      },
      groundingIntensity: 'on_first_encounter',
      allowedResponseModes: ['single_blank', 'blank_fill', 'phrase_assembly', 'word_bank', 'object_selection'],
      correctionPosture: 'immediate',
    },
    {
      bandId: 'B2',
      supportLanguagePolicy: {
        mixingLevel: 'light_support',
        showSupportStrip: false,
        showGlosses: true,
      },
      groundingIntensity: 'on_request',
      allowedResponseModes: ['short_text'],
      correctionPosture: 'delayed',
    },
    {
      bandId: 'B3',
      supportLanguagePolicy: {
        mixingLevel: 'target_dominant',
        showSupportStrip: false,
        showGlosses: false,
      },
      groundingIntensity: 'on_request',
      allowedResponseModes: ['short_text', 'open_text'],
      correctionPosture: 'on_request',
    },
    {
      bandId: 'B4',
      supportLanguagePolicy: {
        mixingLevel: 'target_only',
        showSupportStrip: false,
        showGlosses: false,
      },
      groundingIntensity: 'none',
      allowedResponseModes: ['open_text', 'free_form'],
      correctionPosture: 'none',
    },
  ],
};
