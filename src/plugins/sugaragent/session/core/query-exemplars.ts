import type { QueryFacet } from './turn-contracts';

export const FACET_EXEMPLARS: Record<QueryFacet, string[]> = {
  identity: [
    'what is your name',
    'who are you',
    'what are you called',
  ],
  occupation: [
    'what do you do',
    'what is your job',
    'what do you do for work',
    'where do you work',
    'what do you do for a living',
  ],
  current_activity: [
    'what are you doing',
    'what are you doing right now',
    'what are you up to',
    'what are you up to right now',
  ],
  location: [
    'where are we',
    'where are we right now',
    'where is this',
    'what place is this',
    'where am i',
  ],
  background: [
    'tell me about yourself',
    'where are you from',
    'what is your background',
    'tell me about your past',
  ],
  preference: [
    'what do you like',
    'what is your favorite thing',
    'what do you love',
    'what do you prefer',
  ],
  relationship: [
    'do you remember me',
    'have we met before',
    'did we meet before',
    'what do you remember about me',
  ],
  general_lore: [
    'tell me about this town',
    'what do you know about this place',
    'who founded this town',
    'tell me about the history here',
    'what do you know about earendale',
  ],
  unknown: [],
};
