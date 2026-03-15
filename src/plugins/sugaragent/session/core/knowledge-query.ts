import { tokenizeForPlan } from './retrieval-text';

const FACET_RELEVANCE_STOP_WORDS = new Set([
  'actually',
  'hey',
   'hi',
  'hello',
  'just',
  'want',
  'if',
  'in',
  'good',
  'bad',
  'great',
  'nice',
  'interesting',
  'like',
  'mean',
  'no',
  'ok',
  'okay',
  'really',
  'pretty',
  'sorry',
]);

const FACET_QUERY_SYNONYMS = new Map([
  ['job', ['work', 'occupation', 'career', 'profession', 'owner', 'owns', 'run', 'runs', 'shop', 'store', 'stall', 'manager', 'merchant']],
  ['work', ['job', 'occupation', 'career', 'profession', 'owner', 'owns', 'run', 'runs', 'shop', 'store', 'stall', 'manager', 'merchant']],
  ['occupation', ['job', 'work', 'career', 'profession', 'owner', 'owns', 'run', 'runs', 'shop', 'store', 'stall', 'manager', 'merchant']],
  ['career', ['job', 'work', 'occupation', 'profession', 'owner', 'owns', 'run', 'runs']],
  ['profession', ['job', 'work', 'occupation', 'career', 'owner', 'owns', 'run', 'runs']],
]);

const KNOWLEDGE_FOCUS_CUE = /\b(who|what|when|where|why|how|do you know|know about|know anything about|tell me about|want to know|i want to know|does|do|is|are|have|has)\b/i;

export function extractKnowledgeFocusText(playerMessage: unknown): string {
  const source = String(playerMessage ?? '').trim();
  if (!source) return '';
  const sentences = source
    .split(/(?<=[.!?])\s+|\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (sentences.length === 0) return source;
  const questionSentence = [...sentences].reverse().find((entry) => entry.includes('?'));
  if (questionSentence) return questionSentence;
  const knowledgeSentence = [...sentences].reverse().find((entry) => KNOWLEDGE_FOCUS_CUE.test(entry));
  return knowledgeSentence ?? sentences[sentences.length - 1] ?? source;
}

export function extractFacetQueryTokens(playerMessage: unknown): string[] {
  const baseTokens = tokenizeForPlan(extractKnowledgeFocusText(playerMessage));
  const filtered = baseTokens.filter((token) => !FACET_RELEVANCE_STOP_WORDS.has(token));
  return filtered.length > 0 ? filtered : baseTokens;
}

export function expandFacetQueryTokenVariants(token: unknown): Set<string> {
  const normalized = typeof token === 'string' ? token.trim().toLowerCase() : '';
  const variants = new Set<string>();
  if (!normalized) return variants;
  variants.add(normalized);
  for (const variant of FACET_QUERY_SYNONYMS.get(normalized) ?? []) {
    if (typeof variant === 'string' && variant.trim().length > 0) {
      variants.add(variant.trim().toLowerCase());
    }
  }
  return variants;
}
