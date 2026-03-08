/**
 * Find the Luggage — English Target Scene Language Pack.
 *
 * Contains the NPC dialogue lines, response contracts, and evaluation rules
 * for the English-target version of Find the Luggage at B0 and B1.
 *
 * Support language: Spanish.
 */

import type { SceneLanguagePack, IntentFamily } from '../../types';

export const SCENE_PACK_EN: SceneLanguagePack = {
  scenarioId: 'find-the-luggage',
  targetLanguage: 'en',
  supportLanguage: 'es',
  bands: [
    // -----------------------------------------------------------------------
    // B0 — Anchored Recognition
    // -----------------------------------------------------------------------
    {
      bandId: 'B0',
      turns: [
        {
          turnId: 'b0-en-01',
          targetText: 'Do you see the red suitcase?',
          supportText: 'Busca la <kw>suitcase</kw> roja.',
          teachingConcepts: ['object.suitcase', 'color.red'],
          responseMode: 'yes_no',
          evaluation: {
            expectedYesNo: true,
          },
          emotion: 'curious',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b0-en-02',
          targetText: 'Good. Tap the red suitcase.',
          supportText: 'Toca la <kw>suitcase</kw> <kw>red</kw>.',
          teachingConcepts: ['object.suitcase', 'color.red'],
          responseMode: 'object_selection',
          responseData: {
            hintText: 'Tap the red suitcase in the scene.',
          },
          evaluation: {
            acceptedObjectIds: ['suitcase-red'],
          },
          emotion: 'encouraging',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b0-en-03',
          targetText: 'The ____ is red.',
          supportText: 'La ____ es roja.',
          teachingConcepts: ['object.suitcase'],
          responseMode: 'single_blank',
          responseData: {
            blanks: [{ id: 'blank1', acceptedAnswers: ['suitcase'] }],
            wordBank: ['suitcase', 'door', 'table'],
            hintText: 'The ____ is red.',
          },
          evaluation: {
            acceptedAnswers: ['suitcase'],
          },
          emotion: 'neutral',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
      ],
    },

    // -----------------------------------------------------------------------
    // B1 — Guided Response
    // -----------------------------------------------------------------------
    {
      bandId: 'B1',
      turns: [
        {
          turnId: 'b1-en-01',
          targetText: 'I need the blue suitcase. Where is it?',
          supportText: 'Necesitas la <kw>suitcase</kw> azul. ¿Dónde está?',
          teachingConcepts: ['object.suitcase', 'color.blue', 'verb.is_located'],
          responseMode: 'single_blank',
          responseData: {
            blanks: [{ id: 'blank1', acceptedAnswers: ['here', 'there'] }],
            wordBank: ['here', 'there', 'big'],
            hintText: 'The suitcase is _____.',
          },
          evaluation: {
            acceptedAnswers: ['here', 'there'],
          },
          emotion: 'concerned',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b1-en-02',
          targetText: 'Build a short phrase: "Here is the suitcase."',
          supportText: 'Construye la frase: "Aquí está la <kw>suitcase</kw>."',
          teachingConcepts: ['location.here', 'verb.is_located', 'object.suitcase'],
          responseMode: 'phrase_assembly',
          responseData: {
            wordBank: ['Here', 'is', 'the', 'suitcase'],
          },
          evaluation: {
            acceptedAnswers: ['Here is the suitcase', 'here is the suitcase'],
          },
          emotion: 'encouraging',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b1-en-03',
          targetText: 'The blue suitcase ____ here.',
          supportText: 'La <kw>suitcase</kw> azul ____ aquí.',
          teachingConcepts: ['verb.is_located', 'color.blue'],
          responseMode: 'single_blank',
          responseData: {
            blanks: [{ id: 'blank1', acceptedAnswers: ['is'] }],
            wordBank: ['is', 'are', 'has'],
            hintText: 'The blue suitcase ____ here.',
          },
          evaluation: {
            acceptedAnswers: ['is'],
          },
          emotion: 'neutral',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
      ],
    },

    // -----------------------------------------------------------------------
    // B2 — Constrained Exchange
    // -----------------------------------------------------------------------
    {
      bandId: 'B2',
      turns: [
        {
          turnId: 'b2-en-01',
          targetText: 'I lost my suitcase. It is black. Can you help me?',
          supportText: 'Perdí mi maleta. Es negra. ¿Puedes ayudarme?',
          teachingConcepts: ['object.suitcase', 'color.black', 'verb.help'],
          responseMode: 'short_text',
          responseData: {
            maxLength: 80,
            hintText: 'Type a short response in English.',
            wordBank: ['yes', 'help', 'suitcase', 'black'],
          },
          evaluation: {
            intents: [
              {
                intentId: 'offer_help',
                label: 'Offer to help',
                keywordPatterns: ['help', 'yes', 'sure', 'okay', 'ok', 'can'],
                requiredSlots: [],
                optionalSlots: [
                  { conceptId: 'verb.help', keywords: ['help'] },
                ],
              },
            ] satisfies IntentFamily[],
            morphologyTolerance: {
              acceptMissingAccents: true,
              acceptMissingArticles: true,
              acceptFlexibleWordOrder: true,
            },
          },
          emotion: 'worried',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b2-en-02',
          targetText: 'Thank you. Where is the black suitcase?',
          supportText: 'Gracias. ¿Dónde está la maleta negra?',
          teachingConcepts: ['phrase.where_is', 'object.suitcase', 'color.black'],
          responseMode: 'short_text',
          responseData: {
            maxLength: 80,
            hintText: 'Tell the NPC where the black suitcase is.',
            wordBank: ['suitcase', 'black', 'is', 'here', 'there', 'door'],
          },
          evaluation: {
            intents: [
              {
                intentId: 'report_location',
                label: 'Report suitcase location',
                keywordPatterns: ['is', 'here', 'there', 'door', 'near', 'by'],
                requiredSlots: [
                  { conceptId: 'object.suitcase', keywords: ['suitcase', 'bag', 'luggage'] },
                ],
                optionalSlots: [
                  { conceptId: 'color.black', keywords: ['black'] },
                  { conceptId: 'object.door', keywords: ['door'] },
                ],
              },
            ] satisfies IntentFamily[],
            morphologyTolerance: {
              acceptMissingAccents: true,
              acceptMissingArticles: true,
              acceptFlexibleWordOrder: true,
            },
          },
          emotion: 'hopeful',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b2-en-03',
          targetText: 'Perfect! I see it near the door. Thank you!',
          supportText: '¡Perfecto! La veo cerca de la puerta. ¡Gracias!',
          teachingConcepts: ['object.door'],
          responseMode: 'yes_no',
          evaluation: {
            expectedYesNo: true,
          },
          emotion: 'happy',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
      ],
    },

    // -----------------------------------------------------------------------
    // B3 — Independent Task Dialogue
    // -----------------------------------------------------------------------
    {
      bandId: 'B3',
      turns: [
        {
          turnId: 'b3-en-01',
          targetText: 'I am looking for a small suitcase I left beside the counter. It has a green ribbon.',
          supportText: '',
          teachingConcepts: ['verb.look_for', 'adjective.small', 'object.counter', 'location.beside', 'object.ribbon_green'],
          responseMode: 'short_text',
          responseData: {
            maxLength: 120,
            hintText: 'Ask a clarification question or describe what you see.',
            wordBank: ['suitcase', 'small', 'counter', 'ribbon', 'green'],
          },
          evaluation: {
            intents: [
              {
                intentId: 'clarify_attribute',
                label: 'Ask about an attribute',
                keywordPatterns: ['is it', 'does it', 'what', 'small', 'ribbon', 'green', 'color'],
                requiredSlots: [
                  { conceptId: 'adjective.small', keywords: ['small', 'little'] },
                ],
                optionalSlots: [
                  { conceptId: 'object.ribbon_green', keywords: ['ribbon', 'green'] },
                ],
              },
              {
                intentId: 'clarify_location',
                label: 'Ask about location',
                keywordPatterns: ['where', 'counter', 'beside', 'near', 'next to', 'by'],
                requiredSlots: [
                  { conceptId: 'object.counter', keywords: ['counter', 'desk'] },
                ],
                optionalSlots: [
                  { conceptId: 'location.beside', keywords: ['beside', 'near', 'next to', 'by'] },
                ],
              },
            ] satisfies IntentFamily[],
            morphologyTolerance: {
              acceptMissingAccents: true,
              acceptMissingArticles: true,
              acceptFlexibleWordOrder: true,
            },
          },
          emotion: 'concerned',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b3-en-02',
          targetText: 'Yes, it is small and has a green ribbon on the handle. Do you see it beside the counter?',
          supportText: '',
          teachingConcepts: ['adjective.small', 'object.ribbon_green', 'location.beside', 'object.counter'],
          responseMode: 'short_text',
          responseData: {
            maxLength: 120,
            hintText: 'Confirm if you see the suitcase or ask for more details.',
          },
          evaluation: {
            intents: [
              {
                intentId: 'confirm_sighting',
                label: 'Confirm seeing the suitcase',
                keywordPatterns: ['yes', 'see', 'found', 'find', 'here', 'there', 'got it'],
                requiredSlots: [],
                optionalSlots: [
                  { conceptId: 'object.suitcase', keywords: ['suitcase', 'bag', 'luggage'] },
                  { conceptId: 'object.counter', keywords: ['counter', 'desk'] },
                ],
              },
              {
                intentId: 'report_location',
                label: 'Report where it is',
                keywordPatterns: ['is', 'here', 'there', 'counter', 'beside', 'near'],
                requiredSlots: [
                  { conceptId: 'object.suitcase', keywords: ['suitcase', 'bag', 'luggage', 'it'] },
                ],
                optionalSlots: [
                  { conceptId: 'location.beside', keywords: ['beside', 'near', 'next to'] },
                ],
              },
            ] satisfies IntentFamily[],
            morphologyTolerance: {
              acceptMissingAccents: true,
              acceptMissingArticles: true,
              acceptFlexibleWordOrder: true,
            },
          },
          emotion: 'hopeful',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b3-en-03',
          targetText: 'Thank you so much! I found it thanks to your help.',
          supportText: '',
          teachingConcepts: ['verb.find'],
          responseMode: 'yes_no',
          evaluation: {
            expectedYesNo: true,
          },
          emotion: 'grateful',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
      ],
    },

    // -----------------------------------------------------------------------
    // B4 — Natural Interaction
    // -----------------------------------------------------------------------
    {
      bandId: 'B4',
      turns: [
        {
          turnId: 'b4-en-01',
          targetText: 'I think someone moved my luggage after the platform change announcement. It was a worn leather suitcase with a green ribbon on the handle.',
          supportText: '',
          teachingConcepts: ['location.platform', 'adjective.leather', 'adjective.worn', 'object.ribbon_green'],
          responseMode: 'open_text',
          responseData: {
            maxLength: 200,
            hintText: 'Respond naturally — describe what you see or ask questions.',
          },
          evaluation: {
            intents: [
              {
                intentId: 'offer_help',
                label: 'Offer to help look',
                keywordPatterns: ['help', 'look', 'find', 'search', 'see', 'can', 'let me'],
                requiredSlots: [],
                optionalSlots: [
                  { conceptId: 'object.suitcase', keywords: ['suitcase', 'luggage', 'bag'] },
                  { conceptId: 'adjective.leather', keywords: ['leather'] },
                ],
              },
              {
                intentId: 'ask_description',
                label: 'Ask for more details',
                keywordPatterns: ['what', 'which', 'color', 'size', 'look like', 'describe'],
                requiredSlots: [],
                optionalSlots: [
                  { conceptId: 'adjective.worn', keywords: ['worn', 'old', 'beat'] },
                ],
              },
              {
                intentId: 'report_sighting',
                label: 'Report seeing the suitcase',
                keywordPatterns: ['see', 'saw', 'found', 'is', 'here', 'there', 'door', 'side'],
                requiredSlots: [
                  { conceptId: 'object.suitcase', keywords: ['suitcase', 'luggage', 'bag', 'it'] },
                ],
                optionalSlots: [
                  { conceptId: 'object.side_door', keywords: ['side door', 'side entrance'] },
                ],
              },
            ] satisfies IntentFamily[],
            morphologyTolerance: {
              acceptMissingAccents: true,
              acceptMissingArticles: true,
              acceptFlexibleWordOrder: true,
            },
          },
          emotion: 'worried',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b4-en-02',
          targetText: 'Last time I saw it near the side door. Could you go and check?',
          supportText: '',
          teachingConcepts: ['object.side_door', 'verb.look_for'],
          responseMode: 'open_text',
          responseData: {
            maxLength: 200,
            hintText: 'Continue the conversation naturally.',
          },
          evaluation: {
            intents: [
              {
                intentId: 'agree_to_look',
                label: 'Agree to go look',
                keywordPatterns: ['yes', 'sure', 'okay', 'ok', 'go', 'check', 'look', 'will'],
                requiredSlots: [],
                optionalSlots: [
                  { conceptId: 'object.side_door', keywords: ['side door', 'side entrance'] },
                ],
              },
              {
                intentId: 'report_finding',
                label: 'Report finding the suitcase',
                keywordPatterns: ['found', 'see', 'saw', 'is', 'here', 'there', 'got'],
                requiredSlots: [
                  { conceptId: 'object.suitcase', keywords: ['suitcase', 'luggage', 'bag', 'it'] },
                ],
                optionalSlots: [],
              },
            ] satisfies IntentFamily[],
            morphologyTolerance: {
              acceptMissingAccents: true,
              acceptMissingArticles: true,
              acceptFlexibleWordOrder: true,
            },
          },
          emotion: 'thoughtful',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b4-en-03',
          targetText: 'Excellent! That is my suitcase. Thank you so much for your help.',
          supportText: '',
          teachingConcepts: ['verb.help', 'verb.find'],
          responseMode: 'yes_no',
          evaluation: {
            expectedYesNo: true,
          },
          emotion: 'relieved',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
      ],
    },
  ],
};
