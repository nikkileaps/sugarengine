/**
 * Find the Luggage — Spanish Target Scene Language Pack.
 *
 * Contains the NPC dialogue lines, response contracts, and evaluation rules
 * for the Spanish-target version of Find the Luggage at B0 and B1.
 *
 * Support language: English.
 */

import type { SceneLanguagePack } from '../../types';

export const SCENE_PACK_ES: SceneLanguagePack = {
  scenarioId: 'find-the-luggage',
  targetLanguage: 'es',
  supportLanguage: 'en',
  bands: [
    // -----------------------------------------------------------------------
    // B0 — Anchored Recognition
    // -----------------------------------------------------------------------
    {
      bandId: 'B0',
      turns: [
        {
          turnId: 'b0-es-01',
          targetText: '¿Ves la maleta roja?',
          supportText: 'Find the red <kw>maleta</kw>.',
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
          turnId: 'b0-es-02',
          targetText: 'Bien. Toca la maleta roja.',
          supportText: 'Tap the <kw>maleta</kw> <kw>roja</kw>.',
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
          turnId: 'b0-es-03',
          targetText: 'La ____ es roja.',
          supportText: 'The ____ is red.',
          teachingConcepts: ['object.suitcase'],
          responseMode: 'single_blank',
          responseData: {
            blanks: [{ id: 'blank1', acceptedAnswers: ['maleta'] }],
            wordBank: ['maleta', 'puerta', 'mesa'],
            hintText: 'La ____ es roja.',
          },
          evaluation: {
            acceptedAnswers: ['maleta'],
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
          turnId: 'b1-es-01',
          targetText: 'Necesito la maleta azul. ¿Dónde está?',
          supportText: 'You need the blue <kw>maleta</kw>. Where is it?',
          teachingConcepts: ['object.suitcase', 'color.blue', 'verb.is_located'],
          responseMode: 'single_blank',
          responseData: {
            blanks: [{ id: 'blank1', acceptedAnswers: ['aquí', 'allí', 'aca', 'acá', 'alla', 'allá'] }],
            wordBank: ['aquí', 'allí', 'grande'],
            hintText: 'La maleta está _____.',
          },
          evaluation: {
            acceptedAnswers: ['aquí', 'allí', 'aca', 'acá', 'alla', 'allá'],
          },
          emotion: 'concerned',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b1-es-02',
          targetText: 'Escribe una frase corta: "Aquí está la maleta."',
          supportText: 'Build the phrase: "Here is the <kw>maleta</kw>."',
          teachingConcepts: ['location.here', 'verb.is_located', 'object.suitcase'],
          responseMode: 'phrase_assembly',
          responseData: {
            wordBank: ['Aquí', 'está', 'la', 'maleta'],
          },
          evaluation: {
            acceptedAnswers: ['Aquí está la maleta', 'aquí está la maleta'],
          },
          emotion: 'encouraging',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
        {
          turnId: 'b1-es-03',
          targetText: 'La maleta azul ____ aquí.',
          supportText: 'The blue <kw>maleta</kw> ____ here.',
          teachingConcepts: ['verb.is_located', 'color.blue'],
          responseMode: 'single_blank',
          responseData: {
            blanks: [{ id: 'blank1', acceptedAnswers: ['está', 'esta'] }],
            wordBank: ['está', 'es', 'tiene'],
            hintText: 'La maleta azul ____ aquí.',
          },
          evaluation: {
            acceptedAnswers: ['está', 'esta'],
          },
          emotion: 'neutral',
          speakerId: 'station-clerk',
          speakerName: 'Station Clerk',
        },
      ],
    },
  ],
};
