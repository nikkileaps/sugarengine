/**
 * Find the Luggage — English Target Scene Language Pack.
 *
 * Contains the NPC dialogue lines, response contracts, and evaluation rules
 * for the English-target version of Find the Luggage at B0 and B1.
 *
 * Support language: Spanish.
 */

import type { SceneLanguagePack } from '../../types';

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
  ],
};
