import type { LexiconCategory, LexiconEntry, LexiconPack, LearnerBandId } from '../../types';

const VALID_BANDS: LearnerBandId[] = ['B0', 'B1', 'B2', 'B3', 'B4'];
const CUMULATIVE_TARGETS: Record<LearnerBandId, number> = {
  B0: 60,
  B1: 150,
  B2: 300,
  B3: 550,
  B4: 850,
};

const COLOR_WORDS: Record<string, Set<string>> = {
  en: new Set(['red', 'blue', 'green', 'black', 'white', 'yellow', 'brown', 'gray', 'grey', 'orange', 'pink', 'purple', 'gold', 'silver']),
  es: new Set(['rojo', 'roja', 'azul', 'verde', 'negro', 'negra', 'blanco', 'blanca', 'amarillo', 'amarilla', 'marron', 'marrón', 'gris', 'naranja', 'rosa', 'morado', 'morada', 'dorado', 'plateado']),
  it: new Set(['rosso', 'rossa', 'blu', 'verde', 'nero', 'nera', 'bianco', 'bianca', 'giallo', 'gialla', 'marrone', 'grigio', 'grigia', 'arancione', 'rosa', 'viola', 'dorato', 'argentato']),
};

const LOCATION_WORDS: Record<string, Set<string>> = {
  en: new Set([
    'station', 'platform', 'bridge', 'town', 'city', 'country', 'street', 'road', 'path', 'house',
    'home', 'room', 'kitchen', 'bathroom', 'bedroom', 'school', 'office', 'store', 'shop', 'market',
    'restaurant', 'hotel', 'park', 'garden', 'beach', 'river', 'mountain', 'forest', 'door', 'window',
    'entrance', 'exit', 'inside', 'outside', 'north', 'south', 'east', 'west', 'here', 'there',
  ]),
  es: new Set([
    'estacion', 'estación', 'anden', 'andén', 'puente', 'pueblo', 'ciudad', 'pais', 'país', 'calle',
    'camino', 'casa', 'hogar', 'cuarto', 'habitacion', 'habitación', 'cocina', 'bano', 'baño',
    'escuela', 'oficina', 'tienda', 'mercado', 'restaurante', 'hotel', 'parque', 'jardin', 'jardín',
    'playa', 'rio', 'río', 'montana', 'montaña', 'bosque', 'puerta', 'ventana', 'entrada', 'salida',
    'dentro', 'fuera', 'norte', 'sur', 'este', 'oeste', 'aqui', 'aquí', 'alli', 'allí', 'alla', 'allá',
  ]),
  it: new Set([
    'stazione', 'binario', 'ponte', 'paese', 'città', 'strada', 'via', 'casa',
    'stanza', 'camera', 'cucina', 'bagno', 'scuola', 'ufficio', 'negozio', 'mercato',
    'ristorante', 'hotel', 'parco', 'giardino', 'spiaggia', 'fiume', 'montagna', 'foresta',
    'porta', 'finestra', 'entrata', 'uscita', 'dentro', 'fuori', 'nord', 'sud', 'est', 'ovest',
    'qui', 'lì', 'là',
  ]),
};

function normalizeLexeme(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(value: string): string {
  return normalizeLexeme(value).replace(/\s+/g, '-');
}

export function splitWordList(words: string): string[] {
  return words
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** A bilingual word pair: targetForm in the target language, gloss in the support language. */
export interface WordPair {
  targetForm: string;
  gloss: string;
}

/**
 * Parse bilingual word pairs from a newline-delimited string.
 * Format: `gloss = targetForm` (one pair per line).
 * Lines without `=` are treated as target-only (gloss = targetForm).
 */
export function splitWordPairs(text: string): WordPair[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) {
        return { targetForm: line, gloss: line };
      }
      return {
        gloss: line.slice(0, eqIdx).trim(),
        targetForm: line.slice(eqIdx + 1).trim(),
      };
    });
}

function bandRank(band: LearnerBandId): number {
  return VALID_BANDS.indexOf(band);
}

function inferCategory(language: string, word: string): LexiconCategory {
  const normalized = normalizeLexeme(word);
  if (COLOR_WORDS[language]?.has(normalized)) return 'color';
  if (LOCATION_WORDS[language]?.has(normalized)) return 'location';
  if (word.includes(' ')) return 'phrase';
  return 'function';
}

function usageForBand(band: LearnerBandId): LexiconEntry['usage'] {
  return bandRank(band) <= bandRank('B2') ? 'active' : 'passive';
}

function buildGeneratedBandAssignments(explicitEntries: LexiconEntry[]): LearnerBandId[] {
  const assignments: LearnerBandId[] = [];
  let previousNeededCumulative = 0;

  for (const band of VALID_BANDS) {
    const explicitCumulative = explicitEntries.filter(
      (entry) => bandRank(entry.introductionBand) <= bandRank(band),
    ).length;
    const neededCumulative = Math.max(0, CUMULATIVE_TARGETS[band] - explicitCumulative);
    const neededAtBand = Math.max(0, neededCumulative - previousNeededCumulative);
    for (let index = 0; index < neededAtBand; index += 1) {
      assignments.push(band);
    }
    previousNeededCumulative = neededCumulative;
  }

  return assignments;
}

const ENGLISH_UNDER_TWENTY = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const ENGLISH_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function englishCardinal(value: number): string {
  if (value < 20) return ENGLISH_UNDER_TWENTY[value]!;
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const units = value % 10;
    return units === 0 ? ENGLISH_TENS[tens]! : `${ENGLISH_TENS[tens]} ${ENGLISH_UNDER_TWENTY[units]}`;
  }
  if (value === 100) return 'one hundred';
  const remainder = value - 100;
  return remainder === 0 ? 'one hundred' : `one hundred ${englishCardinal(remainder)}`;
}

const SPANISH_UNDER_SIXTEEN = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
];
const SPANISH_TENS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];

function spanishCardinal(value: number): string {
  if (value < 16) return SPANISH_UNDER_SIXTEEN[value]!;
  if (value === 16) return 'dieciseis';
  if (value === 17) return 'diecisiete';
  if (value === 18) return 'dieciocho';
  if (value === 19) return 'diecinueve';
  if (value === 20) return 'veinte';
  if (value < 30) return `veinti${SPANISH_UNDER_SIXTEEN[value - 20]}`;
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const units = value % 10;
    return units === 0 ? SPANISH_TENS[tens]! : `${SPANISH_TENS[tens]} y ${SPANISH_UNDER_SIXTEEN[units]}`;
  }
  if (value === 100) return 'cien';
  const remainder = value - 100;
  return remainder === 0 ? 'cien' : `ciento ${spanishCardinal(remainder)}`;
}

const ITALIAN_UNDER_TWENTY = [
  'zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove',
  'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici',
  'diciassette', 'diciotto', 'diciannove',
];
const ITALIAN_TENS = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];

function italianCardinal(value: number): string {
  if (value < 20) return ITALIAN_UNDER_TWENTY[value]!;
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const units = value % 10;
    if (units === 0) return ITALIAN_TENS[tens]!;
    // Drop final vowel of tens before 'uno' and 'otto'
    const base = (units === 1 || units === 8) ? ITALIAN_TENS[tens]!.slice(0, -1) : ITALIAN_TENS[tens]!;
    return `${base}${ITALIAN_UNDER_TWENTY[units]}`;
  }
  if (value === 100) return 'cento';
  const remainder = value - 100;
  return remainder === 0 ? 'cento' : `cento${italianCardinal(remainder)}`;
}

function buildNumberWords(language: string): WordPair[] {
  const values: WordPair[] = [];
  for (let index = 0; index <= 199; index += 1) {
    if (language === 'es') {
      values.push({ targetForm: spanishCardinal(index), gloss: englishCardinal(index) });
    } else if (language === 'it') {
      values.push({ targetForm: italianCardinal(index), gloss: englishCardinal(index) });
    } else {
      values.push({ targetForm: englishCardinal(index), gloss: spanishCardinal(index) });
    }
  }
  return values;
}

const CALENDAR_PAIRS: Array<[string, string]> = [
  ['monday', 'lunes'],
  ['tuesday', 'martes'],
  ['wednesday', 'miércoles'],
  ['thursday', 'jueves'],
  ['friday', 'viernes'],
  ['saturday', 'sábado'],
  ['sunday', 'domingo'],
  ['january', 'enero'],
  ['february', 'febrero'],
  ['march', 'marzo'],
  ['april', 'abril'],
  ['may', 'mayo'],
  ['june', 'junio'],
  ['july', 'julio'],
  ['august', 'agosto'],
  ['september', 'septiembre'],
  ['october', 'octubre'],
  ['november', 'noviembre'],
  ['december', 'diciembre'],
  ['spring', 'primavera'],
  ['summer', 'verano'],
  ['autumn', 'otoño'],
  ['winter', 'invierno'],
  ['morning', 'mañana'],
  ['afternoon', 'tarde'],
  ['night', 'noche'],
  ['today', 'hoy'],
  ['yesterday', 'ayer'],
  ['tomorrow', 'mañana siguiente'],
];

const ITALIAN_CALENDAR: Array<[string, string]> = [
  ['monday', 'lunedì'],
  ['tuesday', 'martedì'],
  ['wednesday', 'mercoledì'],
  ['thursday', 'giovedì'],
  ['friday', 'venerdì'],
  ['saturday', 'sabato'],
  ['sunday', 'domenica'],
  ['january', 'gennaio'],
  ['february', 'febbraio'],
  ['march', 'marzo'],
  ['april', 'aprile'],
  ['may', 'maggio'],
  ['june', 'giugno'],
  ['july', 'luglio'],
  ['august', 'agosto'],
  ['september', 'settembre'],
  ['october', 'ottobre'],
  ['november', 'novembre'],
  ['december', 'dicembre'],
  ['spring', 'primavera'],
  ['summer', 'estate'],
  ['autumn', 'autunno'],
  ['winter', 'inverno'],
  ['morning', 'mattina'],
  ['afternoon', 'pomeriggio'],
  ['night', 'notte'],
  ['today', 'oggi'],
  ['yesterday', 'ieri'],
  ['tomorrow', 'domani'],
];

function buildCalendarWords(language: string): WordPair[] {
  if (language === 'it') {
    return ITALIAN_CALENDAR.map(([en, it]) => ({ targetForm: it, gloss: en }));
  }
  return CALENDAR_PAIRS.map(([en, es]) =>
    language === 'es'
      ? { targetForm: es, gloss: en }
      : { targetForm: en, gloss: es },
  );
}

function buildGeneratedEntries(
  language: string,
  commonWords: WordPair[],
  explicitEntries: LexiconEntry[],
): LexiconEntry[] {
  const assignments = buildGeneratedBandAssignments(explicitEntries);
  const seenForms = new Set(explicitEntries.map((entry) => normalizeLexeme(entry.targetForm)));
  const seenIds = new Set(explicitEntries.map((entry) => entry.lexicalEntryId));
  const seedWords = [...commonWords, ...buildCalendarWords(language), ...buildNumberWords(language)];
  const generatedEntries: LexiconEntry[] = [];

  for (const pair of seedWords) {
    if (generatedEntries.length >= assignments.length) break;
    const normalized = normalizeLexeme(pair.targetForm);
    if (!normalized || seenForms.has(normalized)) continue;

    let lexicalEntryId = `common.${language}.${String(generatedEntries.length + 1).padStart(4, '0')}.${slugify(pair.targetForm)}`;
    while (seenIds.has(lexicalEntryId)) {
      lexicalEntryId = `${lexicalEntryId}-alt`;
    }

    const introductionBand = assignments[generatedEntries.length]!;
    const category = inferCategory(language, pair.targetForm);

    seenForms.add(normalized);
    seenIds.add(lexicalEntryId);
    generatedEntries.push({
      lexicalEntryId,
      targetForm: pair.targetForm,
      gloss: pair.gloss,
      category,
      introductionBand,
      usage: usageForBand(introductionBand),
      groundable: category === 'color' || category === 'location',
    });
  }

  if (generatedEntries.length < assignments.length) {
    throw new Error(
      `Shared lexicon seed for ${language} only produced ${explicitEntries.length + generatedEntries.length} entries;`
      + ` expected ${CUMULATIVE_TARGETS.B4}.`,
    );
  }

  return generatedEntries;
}

export function buildSeededSharedLexicon(
  language: 'en' | 'es' | 'it',
  explicitEntries: LexiconEntry[],
  commonWords: WordPair[],
): LexiconPack {
  return {
    targetLanguage: language,
    entries: [
      ...explicitEntries,
      ...buildGeneratedEntries(language, commonWords, explicitEntries),
    ],
  };
}
