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
          focusLexicalEntryIds: ['object.suitcase', 'color.red'],
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
          focusLexicalEntryIds: ['object.suitcase', 'color.red'],
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
          focusLexicalEntryIds: ['object.suitcase', 'color.red'],
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
          focusLexicalEntryIds: ['object.suitcase', 'color.blue', 'location.there'],
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
          focusLexicalEntryIds: ['object.suitcase', 'color.blue'],
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
          focusLexicalEntryIds: ['location.here', 'verb.is_located', 'object.suitcase', 'color.blue'],
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
          focusLexicalEntryIds: ['object.suitcase', 'color.black', 'verb.help'],
          responseMode: 'short_text',
          responseData: {
            maxLength: 80,
            hintText: 'Type a short response in Spanish.',
            wordBank: ['sí', 'te ayudo', 'la maleta'],
          },
          evaluation: {
            intents: [
              {
                intentId: 'offer_help',
                label: 'Offer to help',
                keywordPatterns: ['ayud', 'sí', 'si', 'claro', 'puedo'],
                requiredSlots: [],
                optionalSlots: [
                  { lexicalEntryId: 'verb.help', keywords: ['ayud', 'ayudar', 'ayudo'] },
                ],
              },
            ] satisfies IntentFamily[],
            morphologyTolerance: {
              acceptMissingAccents: true,
              acceptMissingArticles: true,
              acceptFlexibleWordOrder: true,
            },
          },
          repairOptions: [
            {
              repairId: 'more-words-1',
              label: 'Show me more words',
              type: 'fixed',
              minAttempt: 1,
              maxAttempt: 1,
              repairReply: 'Try these too: negra, puedo ayudarte.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['sí', 'te ayudo', 'la maleta', 'negra', 'puedo ayudarte'],
                hintText: 'Use these words to respond.',
              },
            },
            {
              repairId: 'simpler-1',
              label: 'Say it more simply',
              type: 'fixed',
              minAttempt: 1,
              maxAttempt: 1,
              repairReply: 'Mi maleta es negra. ¿Me ayudas?',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['sí', 'te ayudo', 'maleta negra'],
                hintText: 'Answer with one short idea.',
              },
            },
            {
              repairId: 'more-words-2',
              label: 'Show me more words',
              type: 'fixed',
              minAttempt: 2,
              repairReply: 'More words: sí, te ayudo, maleta negra, puedo ayudarte.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['sí', 'te ayudo', 'la maleta', 'maleta negra', 'puedo ayudarte'],
                hintText: 'Use these words to respond.',
              },
            },
            {
              repairId: 'simpler-2',
              label: 'Say it more simply',
              type: 'fixed',
              minAttempt: 2,
              repairReply: 'Maleta negra. ¿Me ayudas?',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['sí', 'te ayudo', 'maleta negra'],
                hintText: 'Try a very short answer.',
              },
            },
            {
              repairId: 'support-3',
              label: 'Say it in English',
              type: 'fixed',
              minAttempt: 3,
              repairReply: 'I lost my suitcase. It is black. Can you help me?',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['sí', 'te ayudo', 'la maleta', 'negra', 'puedo ayudarte'],
                hintText: 'Now answer in Spanish.',
              },
            },
          ],
          emotion: 'worried',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b2-es-02',
          targetText: 'Gracias. ¿Dónde está la maleta negra?',
          supportText: 'Thanks. Where is the black suitcase?',
          focusLexicalEntryIds: ['phrase.where_is', 'object.suitcase', 'color.black'],
          responseMode: 'short_text',
          responseData: {
            maxLength: 80,
            hintText: 'Tell the NPC where the black suitcase is.',
            wordBank: ['la maleta', 'negra', 'está'],
          },
          evaluation: {
            intents: [
              {
                intentId: 'report_location',
                label: 'Report suitcase location',
                keywordPatterns: ['está', 'esta', 'aquí', 'aqui', 'allí', 'alli', 'puerta'],
                requiredSlots: [
                  { lexicalEntryId: 'object.suitcase', keywords: ['maleta'] },
                ],
                optionalSlots: [
                  { lexicalEntryId: 'color.black', keywords: ['negra', 'negro'] },
                  { lexicalEntryId: 'object.door', keywords: ['puerta'] },
                ],
              },
            ] satisfies IntentFamily[],
            morphologyTolerance: {
              acceptMissingAccents: true,
              acceptMissingArticles: true,
              acceptFlexibleWordOrder: true,
            },
          },
          repairOptions: [
            {
              repairId: 'more-words-1',
              label: 'Show me more words',
              type: 'fixed',
              minAttempt: 1,
              maxAttempt: 1,
              repairReply: 'Try these too: allí, la puerta.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['la maleta', 'negra', 'está', 'allí', 'la puerta'],
                hintText: 'Use these words to describe the location.',
              },
            },
            {
              repairId: 'simpler-1',
              label: 'Say it more simply',
              type: 'fixed',
              minAttempt: 1,
              maxAttempt: 1,
              repairReply: 'La maleta negra. ¿Dónde está?',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['la maleta', 'negra', 'está'],
                hintText: 'Answer with one short location idea.',
              },
            },
            {
              repairId: 'more-words-2',
              label: 'Show me more words',
              type: 'fixed',
              minAttempt: 2,
              maxAttempt: 2,
              repairReply: 'More words: allí, cerca de, la puerta.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['la maleta', 'negra', 'está', 'allí', 'cerca de', 'la puerta'],
                hintText: 'Use these words to describe the location.',
              },
            },
            {
              repairId: 'simpler-2',
              label: 'Say it more simply',
              type: 'fixed',
              minAttempt: 2,
              maxAttempt: 2,
              repairReply: 'Dime: la maleta negra está allí.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['la maleta negra', 'está', 'allí'],
                hintText: 'Try a very short location answer.',
              },
            },
            {
              repairId: 'support-3',
              label: 'Say it in English',
              type: 'fixed',
              minAttempt: 3,
              repairReply: 'They said: "Thanks. Where is the black suitcase?"',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['la maleta', 'negra', 'está', 'allí', 'cerca de', 'la puerta'],
                hintText: 'Now answer in Spanish.',
              },
            },
          ],
          emotion: 'hopeful',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b2-es-03',
          targetText: '¡Perfecto! La veo cerca de la puerta. ¡Gracias!',
          supportText: 'Perfect! I see it near the door. Thanks!',
          focusLexicalEntryIds: ['object.door'],
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
          focusLexicalEntryIds: ['verb.look_for', 'adjective.small', 'object.counter', 'location.beside', 'object.ribbon_green'],
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
                  { lexicalEntryId: 'adjective.small', keywords: ['pequeña', 'pequena', 'pequeño', 'pequeno', 'chica'] },
                ],
                optionalSlots: [
                  { lexicalEntryId: 'object.ribbon_green', keywords: ['cinta', 'verde'] },
                ],
              },
              {
                intentId: 'clarify_location',
                label: 'Ask about location',
                keywordPatterns: ['dónde', 'donde', 'mostrador', 'lado', 'cerca'],
                requiredSlots: [
                  { lexicalEntryId: 'object.counter', keywords: ['mostrador'] },
                ],
                optionalSlots: [
                  { lexicalEntryId: 'location.beside', keywords: ['lado', 'al lado', 'cerca'] },
                ],
              },
            ] satisfies IntentFamily[],
            morphologyTolerance: {
              acceptMissingAccents: true,
              acceptMissingArticles: true,
              acceptFlexibleWordOrder: true,
            },
          },
          repairOptions: [
            {
              repairId: 'more-words-1',
              label: 'Show me more words',
              type: 'fixed',
              minAttempt: 1,
              maxAttempt: 1,
              repairReply: 'Try these too: ¿Qué significa, mostrador, cinta verde.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['¿Qué significa', 'mostrador', 'cinta verde', 'Voy a buscar', 'la maleta'],
                hintText: 'Use these if they help you respond.',
              },
            },
            {
              repairId: 'simpler-1',
              label: 'Say it more simply',
              type: 'fixed',
              minAttempt: 1,
              maxAttempt: 1,
              repairReply: 'La maleta es pequeña. Tiene una cinta verde. Está al lado del mostrador.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: [],
                hintText: 'Answer in one short sentence.',
              },
            },
            {
              repairId: 'more-words-2',
              label: 'Show me more words',
              type: 'fixed',
              minAttempt: 2,
              repairReply: 'More words: ¿Qué significa, mostrador, cinta verde, al lado del mostrador.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['¿Qué significa', 'mostrador', 'cinta verde', 'al lado del mostrador', 'Voy a buscar', 'la maleta'],
                hintText: 'Use these if they help you respond.',
              },
            },
            {
              repairId: 'simpler-2',
              label: 'Say it more simply',
              type: 'fixed',
              minAttempt: 2,
              repairReply: 'Maleta pequeña. Cinta verde. Está al lado del mostrador.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: [],
                hintText: 'Try one short clarification or search reply.',
              },
            },
            {
              repairId: 'support-3',
              label: 'Say it in English',
              type: 'fixed',
              minAttempt: 3,
              repairReply: 'I am looking for a small suitcase with a green ribbon. I left it beside the counter.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: [],
                hintText: 'Now answer in Spanish.',
              },
            },
          ],
          emotion: 'concerned',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b3-es-02',
          targetText: 'Sí, es pequeña y tiene una cinta verde en el asa. ¿La ves al lado del mostrador?',
          supportText: '',
          focusLexicalEntryIds: ['adjective.small', 'object.ribbon_green', 'location.beside', 'object.counter'],
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
                  { lexicalEntryId: 'object.suitcase', keywords: ['maleta'] },
                  { lexicalEntryId: 'object.counter', keywords: ['mostrador'] },
                ],
              },
              {
                intentId: 'report_location',
                label: 'Report where it is',
                keywordPatterns: ['está', 'esta', 'aquí', 'aqui', 'allí', 'alli', 'mostrador', 'lado'],
                requiredSlots: [
                  { lexicalEntryId: 'object.suitcase', keywords: ['maleta'] },
                ],
                optionalSlots: [
                  { lexicalEntryId: 'location.beside', keywords: ['lado', 'cerca'] },
                ],
              },
            ] satisfies IntentFamily[],
            morphologyTolerance: {
              acceptMissingAccents: true,
              acceptMissingArticles: true,
              acceptFlexibleWordOrder: true,
            },
          },
          repairOptions: [
            {
              repairId: 'more-words-1',
              label: 'Show me more words',
              type: 'fixed',
              minAttempt: 1,
              maxAttempt: 1,
              repairReply: 'Try these too: veo, al lado, mostrador.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['veo', 'la maleta', 'al lado', 'mostrador'],
                hintText: 'Use these if they help you reply.',
              },
            },
            {
              repairId: 'simpler-1',
              label: 'Say it more simply',
              type: 'fixed',
              minAttempt: 1,
              maxAttempt: 1,
              repairReply: 'Es pequeña. Tiene una cinta verde. ¿La ves?',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: [],
                hintText: 'Answer in one short sentence.',
              },
            },
            {
              repairId: 'more-words-2',
              label: 'Show me more words',
              type: 'fixed',
              minAttempt: 2,
              repairReply: 'More words: veo, al lado, mostrador, cinta verde.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['veo', 'la maleta', 'al lado', 'mostrador', 'cinta verde'],
                hintText: 'Use these if they help you reply.',
              },
            },
            {
              repairId: 'simpler-2',
              label: 'Say it more simply',
              type: 'fixed',
              minAttempt: 2,
              repairReply: 'La maleta está al lado del mostrador. ¿La ves?',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: [],
                hintText: 'Try a very short reply.',
              },
            },
            {
              repairId: 'support-3',
              label: 'Say it in English',
              type: 'fixed',
              minAttempt: 3,
              repairReply: 'Yes, it is small and has a green ribbon on the handle. Do you see it beside the counter?',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: [],
                hintText: 'Now answer in Spanish.',
              },
            },
          ],
          emotion: 'hopeful',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b3-es-03',
          targetText: '¡Muchas gracias! La encontré gracias a tu ayuda.',
          supportText: '',
          focusLexicalEntryIds: ['verb.find'],
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
      providerPolicy: 'agent_preferred',
      turns: [
        {
          turnId: 'b4-es-01',
          targetText: 'Creo que alguien movió mi equipaje cuando anunciaron el cambio de andén. Era una maleta de cuero bastante gastada, con una cinta verde en el asa.',
          supportText: '',
          focusLexicalEntryIds: ['location.platform', 'adjective.leather', 'adjective.worn', 'object.ribbon_green'],
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
                  { lexicalEntryId: 'object.suitcase', keywords: ['maleta', 'equipaje'] },
                  { lexicalEntryId: 'adjective.leather', keywords: ['cuero'] },
                ],
              },
              {
                intentId: 'ask_description',
                label: 'Ask for more details',
                keywordPatterns: ['cómo', 'como', 'qué', 'que', 'color', 'grande', 'tamaño'],
                requiredSlots: [],
                optionalSlots: [
                  { lexicalEntryId: 'adjective.worn', keywords: ['gastada', 'gastado', 'vieja'] },
                ],
              },
              {
                intentId: 'report_sighting',
                label: 'Report seeing the suitcase',
                keywordPatterns: ['veo', 'vi', 'está', 'esta', 'aquí', 'aqui', 'allí', 'alli', 'puerta', 'lateral'],
                requiredSlots: [
                  { lexicalEntryId: 'object.suitcase', keywords: ['maleta', 'equipaje'] },
                ],
                optionalSlots: [
                  { lexicalEntryId: 'object.side_door', keywords: ['puerta lateral', 'puerta del lado', 'lateral'] },
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
          focusLexicalEntryIds: ['object.side_door', 'verb.look_for'],
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
                  { lexicalEntryId: 'object.side_door', keywords: ['puerta lateral', 'lateral'] },
                ],
              },
              {
                intentId: 'report_finding',
                label: 'Report finding the suitcase',
                keywordPatterns: ['encontr', 'veo', 'vi', 'está', 'esta', 'aquí', 'aqui'],
                requiredSlots: [
                  { lexicalEntryId: 'object.suitcase', keywords: ['maleta', 'equipaje'] },
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
          focusLexicalEntryIds: ['verb.help', 'verb.find'],
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
