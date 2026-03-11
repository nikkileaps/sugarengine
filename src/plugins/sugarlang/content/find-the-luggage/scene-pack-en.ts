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
    // B0 — Anchored Recognition (immersive pivot)
    // -----------------------------------------------------------------------
    {
      bandId: 'B0',
      turns: [
        // Turn 1: Recognition — NPC asks with mixed-language line, player chip-composes a response
        {
          turnId: 'b0-en-01',
          targetText: 'Do you see the red suitcase?',
          initialDelivery: '¿Ves the red suitcase?',
          focusLexicalEntryIds: ['object.suitcase', 'color.red'],
          responseMode: 'chip_composition',
          responseData: {
            chips: ['Yes', 'I see', 'the', 'red', 'suitcase'],
          },
          evaluation: {
            acceptedCompositions: [
              'Yes I see the red suitcase',
              'Yes the red suitcase',
              'I see the red suitcase',
              'the red suitcase',
            ],
          },
          repairOptions: [
            {
              repairId: 'no-entiendo',
              label: 'No entiendo',
              type: 'fixed',
              repairReply: 'Suitcase — es una maleta. The red suitcase — ¡la maleta roja!',
              groundingAction: {
                type: 'highlight',
                worldObjectId: 'suitcase-red',
              },
            },
            {
              repairId: 'senalalo',
              label: 'Señálalo',
              type: 'fixed',
              repairReply: 'Here — the red suitcase!',
              groundingAction: {
                type: 'point',
                worldObjectId: 'suitcase-red',
              },
            },
            {
              repairId: 'que-significa',
              label: '¿Qué significa "__"?',
              type: 'clarification_template',
              repairReply: '"__" — suitcase = maleta, red = rojo. The red suitcase!',
            },
          ],
          emotion: 'curious',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        // Turn 2: Object selection — player taps the correct suitcase
        {
          turnId: 'b0-en-02',
          targetText: 'Good. Tap the red suitcase.',
          initialDelivery: '¡Bien! Now tap the red suitcase.',
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
              repairReply: 'The red suitcase — ¡ahí!',
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
        // Turn 3: Completion — player chip-builds "Aquí está the red suitcase."
        {
          turnId: 'b0-en-03',
          targetText: 'Here is the red suitcase.',
          initialDelivery: '¡Lo encontraste! Now say: here is the red suitcase.',
          focusLexicalEntryIds: ['object.suitcase', 'color.red'],
          responseMode: 'chip_composition',
          responseData: {
            chips: ['Here', 'is', 'the', 'red', 'suitcase'],
          },
          evaluation: {
            acceptedCompositions: [
              'Here is the red suitcase',
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
          turnId: 'b1-en-01',
          targetText: 'I need the blue suitcase. Can you show me where it is?',
          initialDelivery: 'Necesito the blue suitcase. ¿Puedes mostrarme where it is?',
          focusLexicalEntryIds: ['object.suitcase', 'color.blue', 'location.there'],
          responseMode: 'single_blank',
          responseData: {
            blanks: [{ id: 'blank1', acceptedAnswers: ['there', 'here'] }],
            wordBank: ['there', 'here', 'near'],
            hintText: 'The blue suitcase is ____.',
          },
          evaluation: {
            acceptedAnswers: ['there', 'here'],
          },
          repairOptions: [
            {
              repairId: 'no-entiendo',
              label: 'No entiendo',
              type: 'fixed',
              repairReply: 'The blue suitcase — la maleta azul. It\'s over there!',
              groundingAction: {
                type: 'highlight',
                worldObjectId: 'suitcase-blue',
              },
            },
            {
              repairId: 'senalala',
              label: 'Señálala',
              type: 'fixed',
              repairReply: 'The blue suitcase — ¡allí!',
              groundingAction: {
                type: 'point',
                worldObjectId: 'suitcase-blue',
              },
            },
            {
              repairId: 'que-significa',
              label: '¿Qué significa "__"?',
              type: 'clarification_template',
              repairReply: '"__" — blue = azul, suitcase = maleta, there = allí.',
            },
          ],
          emotion: 'concerned',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        // Turn 2: Object selection — player taps the blue suitcase
        {
          turnId: 'b1-en-02',
          targetText: 'Show me the blue suitcase.',
          initialDelivery: 'Muéstrame the blue suitcase.',
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
              repairReply: 'The blue suitcase — the blue one, ¡ahí!',
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
        // Turn 3: Guided assembly — player builds "Here is the blue suitcase"
        {
          turnId: 'b1-en-03',
          targetText: 'Here is the blue suitcase.',
          initialDelivery: '¡Genial! Now tell me: here is the blue suitcase.',
          focusLexicalEntryIds: ['location.here', 'verb.is_located', 'object.suitcase', 'color.blue'],
          responseMode: 'phrase_assembly',
          responseData: {
            wordBank: ['Here', 'is', 'the', 'blue', 'suitcase'],
          },
          evaluation: {
            acceptedAnswers: ['Here is the blue suitcase', 'here is the blue suitcase'],
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
          turnId: 'b2-en-01',
          targetText: 'I lost my suitcase. It is black. Can you help me?',
          supportText: 'Perdí mi maleta. Es negra. ¿Puedes ayudarme?',
          focusLexicalEntryIds: ['object.suitcase', 'color.black', 'verb.help'],
          responseMode: 'short_text',
          responseData: {
            maxLength: 80,
            hintText: 'Type a short response in English.',
            wordBank: ['yes', 'I can help', 'the suitcase'],
          },
          evaluation: {
            intents: [
              {
                intentId: 'offer_help',
                label: 'Offer to help',
                keywordPatterns: ['help', 'yes', 'sure', 'okay', 'ok', 'can'],
                requiredSlots: [],
                optionalSlots: [
                  { lexicalEntryId: 'verb.help', keywords: ['help'] },
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
              label: 'Muéstrame más palabras',
              type: 'fixed',
              minAttempt: 1,
              maxAttempt: 1,
              repairReply: 'Prueba también: black, help, can help.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['yes', 'I can help', 'the suitcase', 'black', 'can help'],
                hintText: 'Use these words to respond.',
              },
            },
            {
              repairId: 'simpler-1',
              label: 'Dilo más simple',
              type: 'fixed',
              minAttempt: 1,
              maxAttempt: 1,
              repairReply: 'My suitcase is black. Can you help?',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['yes', 'I can help', 'black suitcase'],
                hintText: 'Answer with one short idea.',
              },
            },
            {
              repairId: 'more-words-2',
              label: 'Muéstrame más palabras',
              type: 'fixed',
              minAttempt: 2,
              repairReply: 'Más palabras: yes, I can help, black suitcase.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['yes', 'I can help', 'the suitcase', 'black suitcase', 'can help'],
                hintText: 'Use these words to respond.',
              },
            },
            {
              repairId: 'simpler-2',
              label: 'Dilo más simple',
              type: 'fixed',
              minAttempt: 2,
              repairReply: 'Black suitcase. Can you help?',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['yes', 'I can help', 'black suitcase'],
                hintText: 'Try a very short answer.',
              },
            },
            {
              repairId: 'support-3',
              label: 'Dilo en español',
              type: 'fixed',
              minAttempt: 3,
              repairReply: 'Dijeron: "Perdí mi maleta. Es negra. ¿Puedes ayudarme?"',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['yes', 'I can help', 'the suitcase', 'black', 'can help'],
                hintText: 'Now answer in English.',
              },
            },
          ],
          emotion: 'worried',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b2-en-02',
          targetText: 'Thank you. Where is the black suitcase?',
          supportText: 'Gracias. ¿Dónde está la maleta negra?',
          focusLexicalEntryIds: ['phrase.where_is', 'object.suitcase', 'color.black'],
          responseMode: 'short_text',
          responseData: {
            maxLength: 80,
            hintText: 'Tell the NPC where the black suitcase is.',
            wordBank: ['the suitcase', 'black', 'is'],
          },
          evaluation: {
            intents: [
              {
                intentId: 'report_location',
                label: 'Report suitcase location',
                keywordPatterns: ['is', 'here', 'there', 'door', 'near', 'by'],
                requiredSlots: [
                  { lexicalEntryId: 'object.suitcase', keywords: ['suitcase', 'bag', 'luggage'] },
                ],
                optionalSlots: [
                  { lexicalEntryId: 'color.black', keywords: ['black'] },
                  { lexicalEntryId: 'object.door', keywords: ['door'] },
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
              label: 'Muéstrame más palabras',
              type: 'fixed',
              minAttempt: 1,
              maxAttempt: 1,
              repairReply: 'Prueba también: there, the door.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['the suitcase', 'black', 'is', 'there', 'the door'],
                hintText: 'Use these words to describe the location.',
              },
            },
            {
              repairId: 'simpler-1',
              label: 'Dilo más simple',
              type: 'fixed',
              minAttempt: 1,
              maxAttempt: 1,
              repairReply: 'The black suitcase. Where is it?',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['the suitcase', 'black', 'is'],
                hintText: 'Answer with one short location idea.',
              },
            },
            {
              repairId: 'more-words-2',
              label: 'Muéstrame más palabras',
              type: 'fixed',
              minAttempt: 2,
              maxAttempt: 2,
              repairReply: 'Más palabras: there, near, the door.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['the suitcase', 'black', 'is', 'there', 'near', 'the door'],
                hintText: 'Use these words to describe the location.',
              },
            },
            {
              repairId: 'simpler-2',
              label: 'Dilo más simple',
              type: 'fixed',
              minAttempt: 2,
              maxAttempt: 2,
              repairReply: 'Say: the black suitcase is there.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['the black suitcase', 'is', 'there'],
                hintText: 'Try a very short location answer.',
              },
            },
            {
              repairId: 'support-3',
              label: 'Dilo en español',
              type: 'fixed',
              minAttempt: 3,
              repairReply: 'Dijeron: "Gracias. ¿Dónde está la maleta negra?"',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['the suitcase', 'black', 'is', 'there', 'near', 'the door'],
                hintText: 'Now answer in English.',
              },
            },
          ],
          emotion: 'hopeful',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b2-en-03',
          targetText: 'Perfect! I see it near the door. Thank you!',
          supportText: '¡Perfecto! La veo cerca de la puerta. ¡Gracias!',
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
          turnId: 'b3-en-01',
          targetText: 'I am looking for a small suitcase I left beside the counter. It has a green ribbon.',
          supportText: '',
          focusLexicalEntryIds: ['verb.look_for', 'adjective.small', 'object.counter', 'location.beside', 'object.ribbon_green'],
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
                  { lexicalEntryId: 'adjective.small', keywords: ['small', 'little'] },
                ],
                optionalSlots: [
                  { lexicalEntryId: 'object.ribbon_green', keywords: ['ribbon', 'green'] },
                ],
              },
              {
                intentId: 'clarify_location',
                label: 'Ask about location',
                keywordPatterns: ['where', 'counter', 'beside', 'near', 'next to', 'by'],
                requiredSlots: [
                  { lexicalEntryId: 'object.counter', keywords: ['counter', 'desk'] },
                ],
                optionalSlots: [
                  { lexicalEntryId: 'location.beside', keywords: ['beside', 'near', 'next to', 'by'] },
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
              label: 'Muéstrame más palabras',
              type: 'fixed',
              minAttempt: 1,
              maxAttempt: 1,
              repairReply: 'Prueba también: what does, counter, green ribbon.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['What does', 'counter', 'green ribbon', 'I will look', 'the suitcase'],
                hintText: 'Use these if they help you respond.',
              },
            },
            {
              repairId: 'simpler-1',
              label: 'Dilo más simple',
              type: 'fixed',
              minAttempt: 1,
              maxAttempt: 1,
              repairReply: 'The suitcase is small. It has a green ribbon. It is beside the counter.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: [],
                hintText: 'Answer in one short sentence.',
              },
            },
            {
              repairId: 'more-words-2',
              label: 'Muéstrame más palabras',
              type: 'fixed',
              minAttempt: 2,
              repairReply: 'Más palabras: what does, counter, green ribbon, beside the counter.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['What does', 'counter', 'green ribbon', 'beside the counter', 'I will look', 'the suitcase'],
                hintText: 'Use these if they help you respond.',
              },
            },
            {
              repairId: 'simpler-2',
              label: 'Dilo más simple',
              type: 'fixed',
              minAttempt: 2,
              repairReply: 'Small suitcase. Green ribbon. It is beside the counter.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: [],
                hintText: 'Try one short clarification or search reply.',
              },
            },
            {
              repairId: 'support-3',
              label: 'Dilo en español',
              type: 'fixed',
              minAttempt: 3,
              repairReply: 'Estoy buscando una maleta pequeña con una cinta verde. La dejé al lado del mostrador.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: [],
                hintText: 'Now answer in English.',
              },
            },
          ],
          emotion: 'concerned',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b3-en-02',
          targetText: 'Yes, it is small and has a green ribbon on the handle. Do you see it beside the counter?',
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
                keywordPatterns: ['yes', 'see', 'found', 'find', 'here', 'there', 'got it'],
                requiredSlots: [],
                optionalSlots: [
                  { lexicalEntryId: 'object.suitcase', keywords: ['suitcase', 'bag', 'luggage'] },
                  { lexicalEntryId: 'object.counter', keywords: ['counter', 'desk'] },
                ],
              },
              {
                intentId: 'report_location',
                label: 'Report where it is',
                keywordPatterns: ['is', 'here', 'there', 'counter', 'beside', 'near'],
                requiredSlots: [
                  { lexicalEntryId: 'object.suitcase', keywords: ['suitcase', 'bag', 'luggage', 'it'] },
                ],
                optionalSlots: [
                  { lexicalEntryId: 'location.beside', keywords: ['beside', 'near', 'next to'] },
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
              label: 'Muéstrame más palabras',
              type: 'fixed',
              minAttempt: 1,
              maxAttempt: 1,
              repairReply: 'Prueba también: see, beside, counter.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['see', 'the suitcase', 'beside', 'counter'],
                hintText: 'Use these if they help you reply.',
              },
            },
            {
              repairId: 'simpler-1',
              label: 'Dilo más simple',
              type: 'fixed',
              minAttempt: 1,
              maxAttempt: 1,
              repairReply: 'It is small. It has a green ribbon. Do you see it?',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: [],
                hintText: 'Answer in one short sentence.',
              },
            },
            {
              repairId: 'more-words-2',
              label: 'Muéstrame más palabras',
              type: 'fixed',
              minAttempt: 2,
              repairReply: 'Más palabras: see, beside, counter, green ribbon.',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: ['see', 'the suitcase', 'beside', 'counter', 'green ribbon'],
                hintText: 'Use these if they help you reply.',
              },
            },
            {
              repairId: 'simpler-2',
              label: 'Dilo más simple',
              type: 'fixed',
              minAttempt: 2,
              repairReply: 'The suitcase is beside the counter. Do you see it?',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: [],
                hintText: 'Try a very short reply.',
              },
            },
            {
              repairId: 'support-3',
              label: 'Dilo en español',
              type: 'fixed',
              minAttempt: 3,
              repairReply: 'Sí, es pequeña y tiene una cinta verde en el asa. ¿La ves al lado del mostrador?',
              responseContractOverride: {
                mode: 'short_text',
                wordBank: [],
                hintText: 'Now answer in English.',
              },
            },
          ],
          emotion: 'hopeful',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b3-en-03',
          targetText: 'Thank you so much! I found it thanks to your help.',
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
          turnId: 'b4-en-01',
          targetText: 'I think someone moved my luggage after the platform change announcement. It was a worn leather suitcase with a green ribbon on the handle.',
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
                keywordPatterns: ['help', 'look', 'find', 'search', 'see', 'can', 'let me'],
                requiredSlots: [],
                optionalSlots: [
                  { lexicalEntryId: 'object.suitcase', keywords: ['suitcase', 'luggage', 'bag'] },
                  { lexicalEntryId: 'adjective.leather', keywords: ['leather'] },
                ],
              },
              {
                intentId: 'ask_description',
                label: 'Ask for more details',
                keywordPatterns: ['what', 'which', 'color', 'size', 'look like', 'describe'],
                requiredSlots: [],
                optionalSlots: [
                  { lexicalEntryId: 'adjective.worn', keywords: ['worn', 'old', 'beat'] },
                ],
              },
              {
                intentId: 'report_sighting',
                label: 'Report seeing the suitcase',
                keywordPatterns: ['see', 'saw', 'found', 'is', 'here', 'there', 'door', 'side'],
                requiredSlots: [
                  { lexicalEntryId: 'object.suitcase', keywords: ['suitcase', 'luggage', 'bag', 'it'] },
                ],
                optionalSlots: [
                  { lexicalEntryId: 'object.side_door', keywords: ['side door', 'side entrance'] },
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
                keywordPatterns: ['yes', 'sure', 'okay', 'ok', 'go', 'check', 'look', 'will'],
                requiredSlots: [],
                optionalSlots: [
                  { lexicalEntryId: 'object.side_door', keywords: ['side door', 'side entrance'] },
                ],
              },
              {
                intentId: 'report_finding',
                label: 'Report finding the suitcase',
                keywordPatterns: ['found', 'see', 'saw', 'is', 'here', 'there', 'got'],
                requiredSlots: [
                  { lexicalEntryId: 'object.suitcase', keywords: ['suitcase', 'luggage', 'bag', 'it'] },
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
