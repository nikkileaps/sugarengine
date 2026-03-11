/**
 * Sugarlang artifact serialization, deserialization, and validation.
 *
 * Each artifact is stored as a JSON file with a standard envelope:
 * { schemaVersion, artifactType, status, generatedAt?, data }
 *
 * Individual artifact types (ScenarioBrief, GroundingMap, etc.) are already
 * plain JSON-safe interfaces — no Maps, no class instances. The runtime
 * SugarlangContentBundle uses Maps, but on disk each artifact lives in its own file.
 */

import type {
  ScenarioBrief,
  GroundingMap,
  GroundedQuestBinding,
  LexiconPack,
  BandPolicyPack,
  SceneLanguagePack,
  LearnerBandId,
  SugarlangContentBundle,
} from '../types';

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export type ArtifactType =
  | 'scenario_brief'
  | 'grounding_map'
  | 'quest_bindings'
  | 'lexicon_pack'
  | 'band_policies'
  | 'scene_language_pack';

export type ArtifactStatus = 'draft' | 'reviewed' | 'approved';

export interface ArtifactEnvelope<T = unknown> {
  schemaVersion: 1;
  artifactType: ArtifactType;
  status: ArtifactStatus;
  generatedAt?: string;
  data: T;
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export interface ArtifactValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface LexiconPlanningStatus {
  totalTracked: number;
  cumulativeCounts: Record<LearnerBandId, number>;
  targets: Record<LearnerBandId, number>;
  deficits: Record<LearnerBandId, number>;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function wrapArtifact<T>(
  artifactType: ArtifactType,
  data: T,
  status: ArtifactStatus = 'draft',
): ArtifactEnvelope<T> {
  return {
    schemaVersion: 1,
    artifactType,
    status,
    generatedAt: new Date().toISOString(),
    data,
  };
}

export function serializeScenarioBrief(s: ScenarioBrief, status?: ArtifactStatus): string {
  return JSON.stringify(wrapArtifact('scenario_brief', s, status), null, 2);
}

export function serializeGroundingMap(g: GroundingMap, status?: ArtifactStatus): string {
  return JSON.stringify(wrapArtifact('grounding_map', g, status), null, 2);
}

export function serializeQuestBindings(
  scenarioId: string,
  bindings: GroundedQuestBinding[],
  status?: ArtifactStatus,
): string {
  return JSON.stringify(
    wrapArtifact('quest_bindings', { scenarioId, bindings }, status),
    null,
    2,
  );
}

export function serializeLexiconPack(l: LexiconPack, status?: ArtifactStatus): string {
  return JSON.stringify(wrapArtifact('lexicon_pack', l, status), null, 2);
}

export function serializeBandPolicies(b: BandPolicyPack, status?: ArtifactStatus): string {
  return JSON.stringify(wrapArtifact('band_policies', b, status), null, 2);
}

export function serializeSceneLanguagePack(p: SceneLanguagePack, status?: ArtifactStatus): string {
  return JSON.stringify(wrapArtifact('scene_language_pack', p, status), null, 2);
}

// ---------------------------------------------------------------------------
// Deserialization helpers
// ---------------------------------------------------------------------------

function parseEnvelope(json: string, expectedType: ArtifactType): {
  envelope: ArtifactEnvelope | null;
  errors: string[];
} {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { envelope: null, errors: [`Invalid JSON: ${e}`] };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { envelope: null, errors: ['Root value is not an object'] };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.schemaVersion !== 1) {
    errors.push(`Unsupported schemaVersion: ${obj.schemaVersion}`);
  }
  if (obj.artifactType !== expectedType) {
    errors.push(`Expected artifactType "${expectedType}", got "${obj.artifactType}"`);
  }
  if (!obj.data || typeof obj.data !== 'object') {
    errors.push('Missing or invalid "data" field');
  }

  if (errors.length > 0) return { envelope: null, errors };

  return {
    envelope: obj as unknown as ArtifactEnvelope,
    errors: [],
  };
}

function requireString(obj: Record<string, unknown>, field: string, errors: string[], ctx: string): string | undefined {
  const val = obj[field];
  if (typeof val !== 'string' || val.length === 0) {
    errors.push(`${ctx}: missing or empty "${field}"`);
    return undefined;
  }
  return val;
}

// Reserved for future use: validate string arrays in artifact fields.
// function requireStringArray(obj: Record<string, unknown>, field: string, errors: string[], ctx: string): string[] {
//   const val = obj[field];
//   if (!Array.isArray(val)) { errors.push(`${ctx}: "${field}" must be an array`); return []; }
//   return val.filter((v): v is string => typeof v === 'string');
// }

const VALID_BANDS: LearnerBandId[] = ['B0', 'B1', 'B2', 'B3', 'B4'];
export const V1_CUMULATIVE_LEXICON_TARGETS: Record<LearnerBandId, number> = {
  B0: 60,
  B1: 150,
  B2: 300,
  B3: 550,
  B4: 850,
};

function isValidBand(b: unknown): b is LearnerBandId {
  return typeof b === 'string' && VALID_BANDS.includes(b as LearnerBandId);
}

function bandRank(band: LearnerBandId): number {
  return VALID_BANDS.indexOf(band);
}

export function getLexiconPlanningStatus(lexicon: LexiconPack): LexiconPlanningStatus {
  const cumulativeCounts = VALID_BANDS.reduce<Record<LearnerBandId, number>>((acc, band) => {
    acc[band] = lexicon.entries.filter((entry) => bandRank(entry.introductionBand) <= bandRank(band)).length;
    return acc;
  }, { B0: 0, B1: 0, B2: 0, B3: 0, B4: 0 });

  const deficits = VALID_BANDS.reduce<Record<LearnerBandId, number>>((acc, band) => {
    acc[band] = Math.max(0, V1_CUMULATIVE_LEXICON_TARGETS[band] - cumulativeCounts[band]);
    return acc;
  }, { B0: 0, B1: 0, B2: 0, B3: 0, B4: 0 });

  return {
    totalTracked: lexicon.entries.length,
    cumulativeCounts,
    targets: V1_CUMULATIVE_LEXICON_TARGETS,
    deficits,
  };
}

// ---------------------------------------------------------------------------
// Deserializers
// ---------------------------------------------------------------------------

export function deserializeScenarioBrief(json: string): {
  data: ScenarioBrief | null;
  status: ArtifactStatus;
  errors: string[];
} {
  const { envelope, errors } = parseEnvelope(json, 'scenario_brief');
  if (!envelope) return { data: null, status: 'draft', errors };

  const d = envelope.data as Record<string, unknown>;
  const ctx = 'ScenarioBrief';
  requireString(d, 'scenarioId', errors, ctx);
  requireString(d, 'communicativeTask', errors, ctx);

  if (!Array.isArray(d.supportedBands)) {
    errors.push(`${ctx}: missing "supportedBands" array`);
  } else {
    for (const b of d.supportedBands) {
      if (!isValidBand(b)) errors.push(`${ctx}: invalid band "${b}" in supportedBands`);
    }
  }

  if (errors.length > 0) return { data: null, status: envelope.status ?? 'draft', errors };

  return {
    data: envelope.data as ScenarioBrief,
    status: envelope.status ?? 'draft',
    errors: [],
  };
}

export function deserializeGroundingMap(json: string): {
  data: GroundingMap | null;
  status: ArtifactStatus;
  errors: string[];
} {
  const { envelope, errors } = parseEnvelope(json, 'grounding_map');
  if (!envelope) return { data: null, status: 'draft', errors };

  const d = envelope.data as Record<string, unknown>;
  requireString(d, 'scenarioId', errors, 'GroundingMap');
  if (!Array.isArray(d.entries)) {
    errors.push('GroundingMap: missing "entries" array');
  }

  if (errors.length > 0) return { data: null, status: envelope.status ?? 'draft', errors };
  return { data: envelope.data as GroundingMap, status: envelope.status ?? 'draft', errors: [] };
}

export function deserializeQuestBindings(json: string): {
  scenarioId: string | null;
  data: GroundedQuestBinding[] | null;
  status: ArtifactStatus;
  errors: string[];
} {
  const { envelope, errors } = parseEnvelope(json, 'quest_bindings');
  if (!envelope) return { scenarioId: null, data: null, status: 'draft', errors };

  const d = envelope.data as Record<string, unknown>;
  const scenarioId = requireString(d, 'scenarioId', errors, 'QuestBindings');
  if (!Array.isArray(d.bindings)) {
    errors.push('QuestBindings: missing "bindings" array');
  }

  if (errors.length > 0) return { scenarioId: scenarioId ?? null, data: null, status: envelope.status ?? 'draft', errors };
  return {
    scenarioId: scenarioId!,
    data: (d.bindings as GroundedQuestBinding[]),
    status: envelope.status ?? 'draft',
    errors: [],
  };
}

export function deserializeLexiconPack(json: string): {
  data: LexiconPack | null;
  status: ArtifactStatus;
  errors: string[];
} {
  const { envelope, errors } = parseEnvelope(json, 'lexicon_pack');
  if (!envelope) return { data: null, status: 'draft', errors };

  const d = envelope.data as Record<string, unknown>;
  requireString(d, 'targetLanguage', errors, 'LexiconPack');
  if (!Array.isArray(d.entries)) {
    errors.push('LexiconPack: missing "entries" array');
  }

  if (errors.length > 0) return { data: null, status: envelope.status ?? 'draft', errors };
  return { data: envelope.data as LexiconPack, status: envelope.status ?? 'draft', errors: [] };
}

export function deserializeBandPolicies(json: string): {
  data: BandPolicyPack | null;
  status: ArtifactStatus;
  errors: string[];
} {
  const { envelope, errors } = parseEnvelope(json, 'band_policies');
  if (!envelope) return { data: null, status: 'draft', errors };

  const d = envelope.data as Record<string, unknown>;
  if (!Array.isArray(d.policies)) {
    errors.push('BandPolicies: missing "policies" array');
  }

  if (errors.length > 0) return { data: null, status: envelope.status ?? 'draft', errors };
  return { data: envelope.data as BandPolicyPack, status: envelope.status ?? 'draft', errors: [] };
}

export function deserializeSceneLanguagePack(json: string): {
  data: SceneLanguagePack | null;
  status: ArtifactStatus;
  errors: string[];
} {
  const { envelope, errors } = parseEnvelope(json, 'scene_language_pack');
  if (!envelope) return { data: null, status: 'draft', errors };

  const d = envelope.data as Record<string, unknown>;
  const ctx = 'SceneLanguagePack';
  requireString(d, 'scenarioId', errors, ctx);
  requireString(d, 'targetLanguage', errors, ctx);
  requireString(d, 'supportLanguage', errors, ctx);
  if (!Array.isArray(d.bands)) {
    errors.push(`${ctx}: missing "bands" array`);
  }

  if (errors.length > 0) return { data: null, status: envelope.status ?? 'draft', errors };
  return { data: envelope.data as SceneLanguagePack, status: envelope.status ?? 'draft', errors: [] };
}

// ---------------------------------------------------------------------------
// Cross-reference validation
// ---------------------------------------------------------------------------

/**
 * Validate cross-references across a loaded content bundle.
 * Returns errors for broken references, warnings for coverage gaps.
 */
export function validateContentBundle(bundle: SugarlangContentBundle): ArtifactValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lexiconEntryIdsByLanguage = new Map<string, Set<string>>();

  for (const [lang, lex] of bundle.lexicons) {
    lexiconEntryIdsByLanguage.set(lang, new Set(lex.entries.map((entry) => entry.lexicalEntryId)));
  }

  // Check scene language packs reference valid scenarios
  for (const [key, pack] of bundle.sceneLanguagePacks) {
    if (!bundle.scenarios.has(pack.scenarioId)) {
      errors.push(`Scene pack "${key}" references unknown scenario "${pack.scenarioId}"`);
    }

    // Check band coverage
    const scenario = bundle.scenarios.get(pack.scenarioId);
    if (scenario) {
      const packBands = new Set(pack.bands.map((b) => b.bandId));
      for (const expectedBand of scenario.supportedBands) {
        if (!packBands.has(expectedBand)) {
          warnings.push(
            `Scene pack "${key}" missing band "${expectedBand}" declared by scenario "${pack.scenarioId}"`,
          );
        }
      }
    }

    // Check turns have required fields
    for (const band of pack.bands) {
      for (const turn of band.turns) {
        if (!turn.turnId) {
          errors.push(`Scene pack "${key}" band "${band.bandId}": turn missing turnId`);
        }
        if (!turn.targetText) {
          errors.push(`Scene pack "${key}" band "${band.bandId}" turn "${turn.turnId}": missing targetText`);
        }
        if (!turn.responseMode) {
          errors.push(`Scene pack "${key}" band "${band.bandId}" turn "${turn.turnId}": missing responseMode`);
        }

        const lexiconEntryIds = lexiconEntryIdsByLanguage.get(pack.targetLanguage);
        const focusIds = turn.focusLexicalEntryIds ?? [];
        const reinforcementIds = turn.reinforcementLexicalEntryIds ?? [];
        const ambientIds = turn.ambientLexicalEntryIds ?? [];

        for (const lexicalEntryId of [...focusIds, ...reinforcementIds, ...ambientIds]) {
          if (lexiconEntryIds && !lexiconEntryIds.has(lexicalEntryId)) {
            errors.push(
              `Scene pack "${key}" band "${band.bandId}" turn "${turn.turnId}" references missing lexical entry "${lexicalEntryId}" for language "${pack.targetLanguage}"`,
            );
          }
        }

        const lexicon = bundle.lexicons.get(pack.targetLanguage);
        if (lexicon) {
          const bandLimit = bandRank(band.bandId);
          for (const lexicalEntryId of [...focusIds, ...reinforcementIds]) {
            const entry = lexicon.entries.find((candidate) => candidate.lexicalEntryId === lexicalEntryId);
            if (entry && bandRank(entry.introductionBand) > bandLimit) {
              warnings.push(
                `Scene pack "${key}" band "${band.bandId}" turn "${turn.turnId}" uses lexical entry "${lexicalEntryId}" above its introduction band "${entry.introductionBand}"`,
              );
            }
          }
        }
      }
    }
  }

  // Check grounding maps reference valid scenarios
  for (const [scenarioId] of bundle.groundingMaps) {
    if (!bundle.scenarios.has(scenarioId)) {
      errors.push(`Grounding map references unknown scenario "${scenarioId}"`);
    }
  }

  // Check quest bindings reference valid scenarios
  for (const [scenarioId, bindings] of bundle.questBindings) {
    if (!bundle.scenarios.has(scenarioId)) {
      errors.push(`Quest bindings reference unknown scenario "${scenarioId}"`);
    }
    for (const binding of bindings) {
      if (!binding.scenarioReferentId) {
        errors.push(`Quest binding in "${scenarioId}" missing scenarioReferentId`);
      }
      for (const variant of binding.bandVariants) {
        if (!isValidBand(variant.bandId)) {
          errors.push(
            `Quest binding "${binding.scenarioReferentId}" in "${scenarioId}" has invalid band "${variant.bandId}"`,
          );
        }
      }
    }
  }

  // Check scenarios have corresponding scene packs for at least one language
  for (const [scenarioId] of bundle.scenarios) {
    let hasAnyPack = false;
    for (const [, pack] of bundle.sceneLanguagePacks) {
      if (pack.scenarioId === scenarioId) {
        hasAnyPack = true;
        break;
      }
    }
    if (!hasAnyPack) {
      warnings.push(`Scenario "${scenarioId}" has no scene language packs`);
    }
  }

  // Check lexicon packs have entries
  for (const [lang, lex] of bundle.lexicons) {
    if (lex.entries.length === 0) {
      warnings.push(`Lexicon for "${lang}" has no entries`);
      continue;
    }

    const uniqueIds = new Set(lex.entries.map((entry) => entry.lexicalEntryId));
    if (uniqueIds.size !== lex.entries.length) {
      errors.push(`Lexicon for "${lang}" contains duplicate lexicalEntryId values`);
    }
  }

  // Check band policies exist
  if (bundle.bandPolicies.policies.length === 0) {
    warnings.push('No band policies defined');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Canonical on-disk paths (relative to plugins/sugarlang/)
// ---------------------------------------------------------------------------

/** Returns the relative path within plugins/sugarlang/ for each artifact. */
export const artifactPaths = {
  scenario: (scenarioId: string) => `scenarios/${scenarioId}.json`,
  groundingMap: (scenarioId: string) => `scenarios/${scenarioId}.grounding.json`,
  questBindings: (scenarioId: string) => `scenarios/${scenarioId}.bindings.json`,
  lexicon: (lang: string) => `languages/${lang}/lexicon.json`,
  bandPolicies: () => 'defaults/band-policies.json',
  sceneLanguagePack: (lang: string, scenarioId: string) =>
    `languages/${lang}/scenes/${scenarioId}.json`,
} as const;

/**
 * Serialize a full content bundle to a map of relative paths → JSON strings.
 * Useful for bulk export / migration.
 */
export function serializeContentBundle(
  bundle: SugarlangContentBundle,
  status: ArtifactStatus = 'draft',
): Map<string, string> {
  const files = new Map<string, string>();

  for (const [, scenario] of bundle.scenarios) {
    files.set(
      artifactPaths.scenario(scenario.scenarioId),
      serializeScenarioBrief(scenario, status),
    );
  }

  for (const [, grounding] of bundle.groundingMaps) {
    files.set(
      artifactPaths.groundingMap(grounding.scenarioId),
      serializeGroundingMap(grounding, status),
    );
  }

  for (const [scenarioId, bindings] of bundle.questBindings) {
    files.set(
      artifactPaths.questBindings(scenarioId),
      serializeQuestBindings(scenarioId, bindings, status),
    );
  }

  for (const [, lexicon] of bundle.lexicons) {
    files.set(
      artifactPaths.lexicon(lexicon.targetLanguage),
      serializeLexiconPack(lexicon, status),
    );
  }

  files.set(
    artifactPaths.bandPolicies(),
    serializeBandPolicies(bundle.bandPolicies, status),
  );

  for (const [, pack] of bundle.sceneLanguagePacks) {
    files.set(
      artifactPaths.sceneLanguagePack(pack.targetLanguage, pack.scenarioId),
      serializeSceneLanguagePack(pack, status),
    );
  }

  return files;
}

/**
 * Deserialize a map of relative paths → JSON strings back into a content bundle.
 * This is the inverse of serializeContentBundle.
 */
export function deserializeContentBundle(files: Map<string, string>): {
  bundle: SugarlangContentBundle;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const bundle: SugarlangContentBundle = {
    scenarios: new Map(),
    groundingMaps: new Map(),
    lexicons: new Map(),
    bandPolicies: { policies: [] },
    sceneLanguagePacks: new Map(),
    questBindings: new Map(),
  };

  for (const [path, json] of files) {
    // Determine artifact type from path pattern
    if (path.startsWith('scenarios/') && path.endsWith('.bindings.json')) {
      const result = deserializeQuestBindings(json);
      if (result.errors.length > 0) {
        errors.push(...result.errors.map((e) => `${path}: ${e}`));
      } else if (result.scenarioId && result.data) {
        bundle.questBindings.set(result.scenarioId, result.data);
      }
    } else if (path.startsWith('scenarios/') && path.endsWith('.grounding.json')) {
      const result = deserializeGroundingMap(json);
      if (result.errors.length > 0) {
        errors.push(...result.errors.map((e) => `${path}: ${e}`));
      } else if (result.data) {
        bundle.groundingMaps.set(result.data.scenarioId, result.data);
      }
    } else if (path.startsWith('scenarios/') && path.endsWith('.json')) {
      const result = deserializeScenarioBrief(json);
      if (result.errors.length > 0) {
        errors.push(...result.errors.map((e) => `${path}: ${e}`));
      } else if (result.data) {
        bundle.scenarios.set(result.data.scenarioId, result.data);
      }
    } else if (path.match(/^languages\/[^/]+\/lexicon\.json$/)) {
      const result = deserializeLexiconPack(json);
      if (result.errors.length > 0) {
        errors.push(...result.errors.map((e) => `${path}: ${e}`));
      } else if (result.data) {
        bundle.lexicons.set(result.data.targetLanguage, result.data);
      }
    } else if (path === 'defaults/band-policies.json') {
      const result = deserializeBandPolicies(json);
      if (result.errors.length > 0) {
        errors.push(...result.errors.map((e) => `${path}: ${e}`));
      } else if (result.data) {
        bundle.bandPolicies = result.data;
      }
    } else if (path.match(/^languages\/[^/]+\/scenes\/[^/]+\.json$/)) {
      const result = deserializeSceneLanguagePack(json);
      if (result.errors.length > 0) {
        errors.push(...result.errors.map((e) => `${path}: ${e}`));
      } else if (result.data) {
        const key = `${result.data.scenarioId}:${result.data.targetLanguage}`;
        bundle.sceneLanguagePacks.set(key, result.data);
      }
    } else if (path.startsWith('dialogues/') && path.endsWith('.json')) {
      // Dialogue trees are no longer stored in the sugarlang bundle —
      // the provider resolves them from the game's canonical dialogue data.
    } else {
      warnings.push(`Unknown artifact path: ${path}`);
    }
  }

  // Cross-reference validation
  const validation = validateContentBundle(bundle);
  errors.push(...validation.errors);
  warnings.push(...validation.warnings);

  return { bundle, errors, warnings };
}
