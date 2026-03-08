/**
 * Find the Luggage — Spanish Target Scene Language Pack.
 *
 * Contains the NPC dialogue lines, response contracts, and evaluation rules
 * for the Spanish-target version of Find the Luggage at B0 and B1.
 *
 * Support language: English.
 */

import type { SceneLanguagePack, IntentFamily } from '../../types';

export const SCENE_PACK_ES: SceneLanguagePack = {
  scenarioId: 'find-the-luggage',
  targetLanguage: 'es',
  supportLanguage: 'en',
  bands: [
    // -----------------------------------------------------------------------
    // B0 — Anchored Recognition (immersive pivot)
    // -----------------------------------------------------------------------
    {
      bandId: 'B0',
      turns: [
        // Turn 1: Recognition — NPC asks with mixed-language line, player chip-composes a response
        {
          turnId: 'b0-es-01',
          targetText: '¿Ves la maleta roja?',
          initialDelivery: 'Do you see la maleta roja?',
          teachingConcepts: ['object.suitcase', 'color.red'],
          responseMode: 'chip_composition',
          responseData: {
            chips: ['Sí', 'I see', 'la', 'maleta', 'roja'],
          },
          evaluation: {
            acceptedCompositions: [
              'Sí I see la maleta roja',
              'Sí la maleta roja',
              'I see la maleta roja',
              'la maleta roja',
            ],
          },
          repairOptions: [
            {
              repairId: 'no-entiendo',
              label: 'No entiendo',
              type: 'fixed',
              repairReply: 'Suitcase. La maleta roja — the red suitcase!',
              groundingAction: {
                type: 'highlight',
                worldObjectId: 'suitcase-red',
              },
            },
            {
              repairId: 'senalalo',
              label: 'Señálalo',
              type: 'fixed',
              repairReply: 'Here — la maleta roja!',
              groundingAction: {
                type: 'point',
                worldObjectId: 'suitcase-red',
              },
            },
            {
              repairId: 'que-significa',
              label: '¿Qué significa "__" en inglés?',
              type: 'clarification_template',
              repairReply: '"__" — la maleta = suitcase, roja = red. La maleta roja!',
            },
          ],
          emotion: 'curious',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        // Turn 2: Object selection — player taps the correct suitcase
        {
          turnId: 'b0-es-02',
          targetText: 'Bien. Toca la maleta roja.',
          initialDelivery: 'Good! Now tap la maleta roja.',
          teachingConcepts: ['object.suitcase', 'color.red'],
          responseMode: 'object_selection',
          responseData: {
            hintText: 'Tap the red suitcase in the scene.',
          },
          evaluation: {
            acceptedObjectIds: ['suitcase-red'],
          },
          repairOptions: [
            {
              repairId: 'senalalo',
              label: 'Señálalo',
              type: 'fixed',
              repairReply: 'La maleta roja — right there!',
              groundingAction: {
                type: 'point',
                worldObjectId: 'suitcase-red',
              },
            },
          ],
          emotion: 'encouraging',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        // Turn 3: Completion — player chip-builds "Here is la maleta roja."
        {
          turnId: 'b0-es-03',
          targetText: 'Aquí está la maleta roja.',
          initialDelivery: 'You found it! Now say: here is la maleta roja.',
          teachingConcepts: ['object.suitcase', 'color.red'],
          responseMode: 'chip_composition',
          responseData: {
            chips: ['Here', 'is', 'la', 'maleta', 'roja'],
          },
          evaluation: {
            acceptedCompositions: [
              'Here is la maleta roja',
            ],
          },
          emotion: 'encouraging',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
      ],
    },

    // -----------------------------------------------------------------------
    // B1 — Guided Response (immersive pivot)
    // -----------------------------------------------------------------------
    {
      bandId: 'B1',
      turns: [
        // Turn 1: Blank fill — player fills in location word
        {
          turnId: 'b1-es-01',
          targetText: 'Necesito la maleta azul. ¿Puedes mostrarme dónde está?',
          initialDelivery: 'Necesito la maleta azul. Can you show me where it is?',
          teachingConcepts: ['object.suitcase', 'color.blue', 'location.there'],
          responseMode: 'single_blank',
          responseData: {
            blanks: [{ id: 'blank1', acceptedAnswers: ['allí', 'alli', 'aquí', 'aqui'] }],
            wordBank: ['allí', 'aquí', 'cerca'],
            hintText: 'La maleta azul está ____.',
          },
          evaluation: {
            acceptedAnswers: ['allí', 'alli', 'aquí', 'aqui'],
          },
          repairOptions: [
            {
              repairId: 'no-entiendo',
              label: 'No entiendo',
              type: 'fixed',
              repairReply: 'La maleta azul. It\'s over there — the blue suitcase!',
              groundingAction: {
                type: 'highlight',
                worldObjectId: 'suitcase-blue',
              },
            },
            {
              repairId: 'senalala',
              label: 'Señálala',
              type: 'fixed',
              repairReply: 'La maleta azul — over there!',
              groundingAction: {
                type: 'point',
                worldObjectId: 'suitcase-blue',
              },
            },
            {
              repairId: 'que-significa',
              label: '¿Qué significa "__" en inglés?',
              type: 'clarification_template',
              repairReply: '"__" — necesito = I need, azul = blue, allí = there.',
            },
          ],
          emotion: 'concerned',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        // Turn 2: Object selection — player taps the blue suitcase
        {
          turnId: 'b1-es-02',
          targetText: 'Muéstrame la maleta azul.',
          initialDelivery: 'Show me la maleta azul.',
          teachingConcepts: ['object.suitcase', 'color.blue'],
          responseMode: 'object_selection',
          responseData: {
            hintText: 'Tap the blue suitcase in the scene.',
          },
          evaluation: {
            acceptedObjectIds: ['suitcase-blue'],
          },
          repairOptions: [
            {
              repairId: 'senalala',
              label: 'Señálala',
              type: 'fixed',
              repairReply: 'La maleta azul — the blue one, right there!',
              groundingAction: {
                type: 'point',
                worldObjectId: 'suitcase-blue',
              },
            },
          ],
          emotion: 'encouraging',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        // Turn 3: Guided assembly — player builds "Aquí está la maleta azul"
        {
          turnId: 'b1-es-03',
          targetText: 'Aquí está la maleta azul.',
          initialDelivery: 'Great! Now tell me: here is the blue suitcase.',
          teachingConcepts: ['location.here', 'verb.is_located', 'object.suitcase', 'color.blue'],
          responseMode: 'phrase_assembly',
          responseData: {
            wordBank: ['Aquí', 'está', 'la', 'maleta', 'azul'],
          },
          evaluation: {
            acceptedAnswers: ['Aquí está la maleta azul', 'aquí está la maleta azul'],
          },
          emotion: 'encouraging',
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
          turnId: 'b2-es-01',
          targetText: 'Perdí mi maleta. Es negra. ¿Puedes ayudarme?',
          supportText: 'I lost my suitcase. It is black. Can you help me?',
          teachingConcepts: ['object.suitcase', 'color.black', 'verb.help'],
          responseMode: 'short_text',
          responseData: {
            maxLength: 80,
            hintText: 'Type a short response in Spanish.',
            wordBank: ['sí', 'ayudar', 'maleta', 'negra'],
          },
          evaluation: {
            intents: [
              {
                intentId: 'offer_help',
                label: 'Offer to help',
                keywordPatterns: ['ayud', 'sí', 'si', 'claro', 'puedo'],
                requiredSlots: [],
                optionalSlots: [
                  { conceptId: 'verb.help', keywords: ['ayud', 'ayudar', 'ayudo'] },
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
          turnId: 'b2-es-02',
          targetText: 'Gracias. ¿Dónde está la maleta negra?',
          supportText: 'Thanks. Where is the black suitcase?',
          teachingConcepts: ['phrase.where_is', 'object.suitcase', 'color.black'],
          responseMode: 'short_text',
          responseData: {
            maxLength: 80,
            hintText: 'Tell the NPC where the black suitcase is.',
            wordBank: ['maleta', 'negra', 'está', 'aquí', 'allí', 'puerta'],
          },
          evaluation: {
            intents: [
              {
                intentId: 'report_location',
                label: 'Report suitcase location',
                keywordPatterns: ['está', 'esta', 'aquí', 'aqui', 'allí', 'alli', 'puerta'],
                requiredSlots: [
                  { conceptId: 'object.suitcase', keywords: ['maleta'] },
                ],
                optionalSlots: [
                  { conceptId: 'color.black', keywords: ['negra', 'negro'] },
                  { conceptId: 'object.door', keywords: ['puerta'] },
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
          turnId: 'b2-es-03',
          targetText: '¡Perfecto! La veo cerca de la puerta. ¡Gracias!',
          supportText: 'Perfect! I see it near the door. Thanks!',
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
          turnId: 'b3-es-01',
          targetText: 'Estoy buscando una maleta pequeña que dejé al lado del mostrador. Tiene una cinta verde.',
          supportText: '',
          teachingConcepts: ['verb.look_for', 'adjective.small', 'object.counter', 'location.beside', 'object.ribbon_green'],
          responseMode: 'short_text',
          responseData: {
            maxLength: 120,
            hintText: 'Ask a clarification question or describe what you see.',
            wordBank: ['maleta', 'pequeña', 'mostrador', 'cinta', 'verde'],
          },
          evaluation: {
            intents: [
              {
                intentId: 'clarify_attribute',
                label: 'Ask about an attribute',
                keywordPatterns: ['es', 'tiene', 'color', 'pequeña', 'pequena', 'cinta', 'verde'],
                requiredSlots: [
                  { conceptId: 'adjective.small', keywords: ['pequeña', 'pequena', 'pequeño', 'pequeno', 'chica'] },
                ],
                optionalSlots: [
                  { conceptId: 'object.ribbon_green', keywords: ['cinta', 'verde'] },
                ],
              },
              {
                intentId: 'clarify_location',
                label: 'Ask about location',
                keywordPatterns: ['dónde', 'donde', 'mostrador', 'lado', 'cerca'],
                requiredSlots: [
                  { conceptId: 'object.counter', keywords: ['mostrador'] },
                ],
                optionalSlots: [
                  { conceptId: 'location.beside', keywords: ['lado', 'al lado', 'cerca'] },
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
          turnId: 'b3-es-02',
          targetText: 'Sí, es pequeña y tiene una cinta verde en el asa. ¿La ves al lado del mostrador?',
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
                keywordPatterns: ['sí', 'si', 'veo', 'encuentro', 'encontré', 'encontre', 'aquí', 'aqui', 'allí', 'alli'],
                requiredSlots: [],
                optionalSlots: [
                  { conceptId: 'object.suitcase', keywords: ['maleta'] },
                  { conceptId: 'object.counter', keywords: ['mostrador'] },
                ],
              },
              {
                intentId: 'report_location',
                label: 'Report where it is',
                keywordPatterns: ['está', 'esta', 'aquí', 'aqui', 'allí', 'alli', 'mostrador', 'lado'],
                requiredSlots: [
                  { conceptId: 'object.suitcase', keywords: ['maleta'] },
                ],
                optionalSlots: [
                  { conceptId: 'location.beside', keywords: ['lado', 'cerca'] },
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
          turnId: 'b3-es-03',
          targetText: '¡Muchas gracias! La encontré gracias a tu ayuda.',
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
          turnId: 'b4-es-01',
          targetText: 'Creo que alguien movió mi equipaje cuando anunciaron el cambio de andén. Era una maleta de cuero bastante gastada, con una cinta verde en el asa.',
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
                keywordPatterns: ['ayud', 'busc', 'encontr', 'veo', 'vi', 'puedo'],
                requiredSlots: [],
                optionalSlots: [
                  { conceptId: 'object.suitcase', keywords: ['maleta', 'equipaje'] },
                  { conceptId: 'adjective.leather', keywords: ['cuero'] },
                ],
              },
              {
                intentId: 'ask_description',
                label: 'Ask for more details',
                keywordPatterns: ['cómo', 'como', 'qué', 'que', 'color', 'grande', 'tamaño'],
                requiredSlots: [],
                optionalSlots: [
                  { conceptId: 'adjective.worn', keywords: ['gastada', 'gastado', 'vieja'] },
                ],
              },
              {
                intentId: 'report_sighting',
                label: 'Report seeing the suitcase',
                keywordPatterns: ['veo', 'vi', 'está', 'esta', 'aquí', 'aqui', 'allí', 'alli', 'puerta', 'lateral'],
                requiredSlots: [
                  { conceptId: 'object.suitcase', keywords: ['maleta', 'equipaje'] },
                ],
                optionalSlots: [
                  { conceptId: 'object.side_door', keywords: ['puerta lateral', 'puerta del lado', 'lateral'] },
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
          turnId: 'b4-es-02',
          targetText: 'La última vez la vi cerca de la puerta lateral. ¿Podrías ir a mirar?',
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
                keywordPatterns: ['sí', 'si', 'claro', 'voy', 'vamos', 'busc', 'miro', 'mirar'],
                requiredSlots: [],
                optionalSlots: [
                  { conceptId: 'object.side_door', keywords: ['puerta lateral', 'lateral'] },
                ],
              },
              {
                intentId: 'report_finding',
                label: 'Report finding the suitcase',
                keywordPatterns: ['encontr', 'veo', 'vi', 'está', 'esta', 'aquí', 'aqui'],
                requiredSlots: [
                  { conceptId: 'object.suitcase', keywords: ['maleta', 'equipaje'] },
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
          turnId: 'b4-es-03',
          targetText: '¡Excelente! Esa es mi maleta. Muchas gracias por tu ayuda.',
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
