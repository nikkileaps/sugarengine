/**
 * Find the Luggage — Scenario Brief and Grounding Map.
 *
 * Defines the semantic learning scenario, active referents, and world grounding
 * for the first Sugarlang vertical slice.
 */

import type { ScenarioBrief, GroundingMap } from '../../types';

export const FIND_THE_LUGGAGE_SCENARIO: ScenarioBrief = {
  scenarioId: 'find-the-luggage',
  communicativeTask: 'Help an NPC identify and recover a missing piece of luggage',
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
  ],
  supportedBands: ['B0', 'B1', 'B2', 'B3', 'B4'],
  npcIds: ['station-clerk'],
  npcNames: ['Station Clerk', 'Station Manager'],
};

export const FIND_THE_LUGGAGE_GROUNDING: GroundingMap = {
  scenarioId: 'find-the-luggage',
  entries: [
    {
      conceptId: 'object.suitcase',
      worldObjectId: 'suitcase-red',
      highlightActions: ['highlight', 'tap_inspect'],
    },
    {
      conceptId: 'object.suitcase',
      worldObjectId: 'suitcase-blue',
      highlightActions: ['highlight', 'tap_inspect'],
    },
    {
      conceptId: 'object.suitcase',
      worldObjectId: 'suitcase-black',
      highlightActions: ['highlight', 'tap_inspect'],
    },
    {
      conceptId: 'color.red',
      worldObjectId: 'suitcase-red',
      worldAttribute: 'color',
      highlightActions: ['highlight'],
    },
    {
      conceptId: 'color.blue',
      worldObjectId: 'suitcase-blue',
      worldAttribute: 'color',
      highlightActions: ['highlight'],
    },
    {
      conceptId: 'color.black',
      worldObjectId: 'suitcase-black',
      worldAttribute: 'color',
      highlightActions: ['highlight'],
    },
    {
      conceptId: 'object.door',
      worldObjectId: 'station-door',
      highlightActions: ['highlight', 'camera_focus'],
    },
    {
      conceptId: 'object.counter',
      worldObjectId: 'service-counter',
      highlightActions: ['highlight', 'camera_focus'],
    },
  ],
};
