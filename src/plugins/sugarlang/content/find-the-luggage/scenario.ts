/**
 * Find the Luggage — Scenario Brief and Grounding Map.
 *
 * Defines the semantic learning scenario, active referents, and world grounding
 * for the first Sugarlang vertical slice.
 */

import type { ScenarioBrief, GroundingMap, GroundedQuestBinding } from '../../types';

export const FIND_THE_LUGGAGE_SCENARIO: ScenarioBrief = {
  scenarioId: 'find-the-luggage',
  successCriteria: [
    'Player confirms recognition of the target suitcase',
    'Player selects or describes the correct suitcase',
    'Player provides location information when asked',
  ],
  activeReferents: [
    'object.suitcase',
    'color.red',
    'color.blue',
    'color.black',
    'location.here',
    'location.there',
    'object.door',
    'object.counter',
    'verb.help',
    'phrase.where_is',
    'adjective.small',
    'location.beside',
    'object.ribbon_green',
    'verb.look_for',
    'verb.find',
    'location.platform',
    'adjective.leather',
    'adjective.worn',
    'object.side_door',
  ],
  supportedBands: ['B0', 'B1', 'B2', 'B3', 'B4'],
  npcIds: ['station-clerk'],
  npcNames: ['Station Clerk', 'Station Manager'],
};

export const FIND_THE_LUGGAGE_GROUNDING: GroundingMap = {
  scenarioId: 'find-the-luggage',
  entries: [
    {
      lexicalEntryId: 'object.suitcase',
      worldObjectId: 'suitcase-red',
      highlightActions: ['highlight', 'tap_inspect'],
    },
    {
      lexicalEntryId: 'object.suitcase',
      worldObjectId: 'suitcase-blue',
      highlightActions: ['highlight', 'tap_inspect'],
    },
    {
      lexicalEntryId: 'object.suitcase',
      worldObjectId: 'suitcase-black',
      highlightActions: ['highlight', 'tap_inspect'],
    },
    {
      lexicalEntryId: 'color.red',
      worldObjectId: 'suitcase-red',
      worldAttribute: 'color',
      highlightActions: ['highlight'],
    },
    {
      lexicalEntryId: 'color.blue',
      worldObjectId: 'suitcase-blue',
      worldAttribute: 'color',
      highlightActions: ['highlight'],
    },
    {
      lexicalEntryId: 'color.black',
      worldObjectId: 'suitcase-black',
      worldAttribute: 'color',
      highlightActions: ['highlight'],
    },
    {
      lexicalEntryId: 'object.door',
      worldObjectId: 'station-door',
      highlightActions: ['highlight', 'camera_focus'],
    },
    {
      lexicalEntryId: 'object.counter',
      worldObjectId: 'service-counter',
      highlightActions: ['highlight', 'camera_focus'],
    },
    {
      lexicalEntryId: 'object.ribbon_green',
      worldObjectId: 'suitcase-ribbon',
      highlightActions: ['highlight', 'tap_inspect'],
    },
    {
      lexicalEntryId: 'location.platform',
      worldObjectId: 'station-platform',
      highlightActions: ['highlight', 'camera_focus'],
    },
    {
      lexicalEntryId: 'object.side_door',
      worldObjectId: 'side-door',
      highlightActions: ['highlight', 'camera_focus'],
    },
  ],
};

export const FIND_THE_LUGGAGE_QUEST_BINDINGS: GroundedQuestBinding[] = [
  {
    scenarioReferentId: 'target_luggage_primary',
    bandVariants: [
      { bandId: 'B0', worldObjectId: 'suitcase-red', highlightedLexicalEntryIds: ['object.suitcase', 'color.red'] },
      { bandId: 'B1', worldObjectId: 'suitcase-blue', highlightedLexicalEntryIds: ['object.suitcase', 'color.blue'] },
      { bandId: 'B2', worldObjectId: 'suitcase-black', highlightedLexicalEntryIds: ['object.suitcase', 'color.black'] },
      { bandId: 'B3', worldObjectId: 'suitcase-ribbon', highlightedLexicalEntryIds: ['object.suitcase', 'object.ribbon_green', 'adjective.leather'] },
      { bandId: 'B4', worldObjectId: 'suitcase-ribbon', highlightedLexicalEntryIds: ['object.suitcase', 'object.ribbon_green', 'adjective.leather', 'adjective.worn'] },
    ],
    affordances: {
      tapInspect: true,
      highlight: true,
      cameraFocus: true,
    },
    pickupIdentity: 'Lost Suitcase',
    inventoryIdentity: 'Recovered Luggage',
    questCompletionStep: 'recover_luggage',
  },
];
