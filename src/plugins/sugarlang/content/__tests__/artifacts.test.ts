/**
 * Golden-slice regression tests for Sugarlang artifact round-trip.
 *
 * Serializes the built-in Find the Luggage bundle to JSON artifacts,
 * deserializes them back, and validates cross-references. This ensures
 * the on-disk format stays compatible with the runtime types.
 */

import { describe, it, expect } from 'vitest';
import { FIND_THE_LUGGAGE_BUNDLE } from '../find-the-luggage';
import {
  serializeContentBundle,
  deserializeContentBundle,
  validateContentBundle,
  getLexiconPlanningStatus,
  artifactPaths,
  deserializeScenarioBrief,
  deserializeGroundingMap,
  deserializeQuestBindings,
  deserializeLexiconPack,
  deserializeBandPolicies,
  deserializeSceneLanguagePack,
} from '../artifacts';
import { generateFindTheLuggageArtifacts } from '../migrate-to-artifacts';

const BUNDLE = FIND_THE_LUGGAGE_BUNDLE;

describe('artifact round-trip: Find the Luggage', () => {
  it('serializes the full bundle without throwing', () => {
    const files = serializeContentBundle(BUNDLE, 'approved');
    expect(files.size).toBeGreaterThan(0);
    // Every value is valid JSON
    for (const [path, json] of files) {
      expect(() => JSON.parse(json), `Invalid JSON at ${path}`).not.toThrow();
    }
  });

  it('produces expected artifact paths', () => {
    const files = serializeContentBundle(BUNDLE, 'approved');
    const paths = Array.from(files.keys()).sort();

    // Must contain at least: scenario, grounding, bindings, band-policies, lexicon(s), scene pack(s)
    expect(paths.some((p) => p.startsWith('scenarios/') && p.endsWith('.json'))).toBe(true);
    expect(paths.some((p) => p.endsWith('.grounding.json'))).toBe(true);
    expect(paths.some((p) => p.endsWith('.bindings.json'))).toBe(true);
    expect(paths).toContain('defaults/band-policies.json');
    expect(paths.some((p) => p.match(/^languages\/[^/]+\/lexicon\.json$/))).toBe(true);
    expect(paths.some((p) => p.match(/^languages\/[^/]+\/scenes\/[^/]+\.json$/))).toBe(true);
  });

  it('deserializes back to a valid bundle with no errors', () => {
    const files = serializeContentBundle(BUNDLE, 'approved');
    const { bundle, errors, warnings } = deserializeContentBundle(files);

    expect(errors).toEqual([]);
    expect(bundle.scenarios.size).toBe(BUNDLE.scenarios.size);
    expect(bundle.groundingMaps.size).toBe(BUNDLE.groundingMaps.size);
    expect(bundle.sceneLanguagePacks.size).toBe(BUNDLE.sceneLanguagePacks.size);
    expect(bundle.lexicons.size).toBe(BUNDLE.lexicons.size);
    expect(bundle.questBindings.size).toBe(BUNDLE.questBindings.size);
    expect(bundle.bandPolicies.policies.length).toBe(BUNDLE.bandPolicies.policies.length);

    // Warnings about coverage gaps are fine; errors are not
    for (const w of warnings) {
      expect(w).not.toMatch(/unknown scenario/i);
    }
  });

  it('cross-reference validation passes on the round-tripped bundle', () => {
    const files = serializeContentBundle(BUNDLE, 'approved');
    const { bundle } = deserializeContentBundle(files);
    const validation = validateContentBundle(bundle);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it('preserves scenario data through round-trip', () => {
    const files = serializeContentBundle(BUNDLE, 'approved');
    const { bundle } = deserializeContentBundle(files);

    for (const [id, original] of BUNDLE.scenarios) {
      const restored = bundle.scenarios.get(id);
      expect(restored, `Missing scenario ${id}`).toBeDefined();
      expect(restored!.scenarioId).toBe(original.scenarioId);
      expect(restored!.supportedBands).toEqual(original.supportedBands);
      expect(restored!.activeReferents.length).toBe(original.activeReferents.length);
    }
  });

  it('preserves scene language pack structure through round-trip', () => {
    const files = serializeContentBundle(BUNDLE, 'approved');
    const { bundle } = deserializeContentBundle(files);

    for (const [key, original] of BUNDLE.sceneLanguagePacks) {
      const restored = bundle.sceneLanguagePacks.get(key);
      expect(restored, `Missing scene pack ${key}`).toBeDefined();
      expect(restored!.scenarioId).toBe(original.scenarioId);
      expect(restored!.targetLanguage).toBe(original.targetLanguage);
      expect(restored!.bands.length).toBe(original.bands.length);

      for (let i = 0; i < original.bands.length; i++) {
        expect(restored!.bands[i].bandId).toBe(original.bands[i].bandId);
        expect(restored!.bands[i].turns.length).toBe(original.bands[i].turns.length);
      }
    }
  });

  it('generateFindTheLuggageArtifacts produces a valid set', () => {
    const files = generateFindTheLuggageArtifacts('approved');
    expect(files.size).toBeGreaterThan(0);

    const { errors } = deserializeContentBundle(files);
    expect(errors).toEqual([]);
  });

  it('warns when band policies are missing delivery contracts', () => {
    const files = serializeContentBundle(BUNDLE, 'approved');
    const rawBandPolicies = files.get('defaults/band-policies.json');
    expect(rawBandPolicies).toBeTruthy();

    const parsed = JSON.parse(rawBandPolicies!);
    delete parsed.data.policies[1].deliveryContract;
    files.set('defaults/band-policies.json', JSON.stringify(parsed, null, 2));

    const { warnings } = deserializeContentBundle(files);
    expect(warnings.some((warning) => warning.includes('missing deliveryContract fields'))).toBe(true);
  });
});

describe('artifact path generators', () => {
  it('scenario path', () => {
    expect(artifactPaths.scenario('find-luggage')).toBe('scenarios/find-luggage.json');
  });
  it('grounding map path', () => {
    expect(artifactPaths.groundingMap('find-luggage')).toBe('scenarios/find-luggage.grounding.json');
  });
  it('quest bindings path', () => {
    expect(artifactPaths.questBindings('find-luggage')).toBe('scenarios/find-luggage.bindings.json');
  });
  it('lexicon path', () => {
    expect(artifactPaths.lexicon('es')).toBe('languages/es/lexicon.json');
  });
  it('band policies path', () => {
    expect(artifactPaths.bandPolicies()).toBe('defaults/band-policies.json');
  });
  it('scene language pack path', () => {
    expect(artifactPaths.sceneLanguagePack('es', 'find-luggage')).toBe(
      'languages/es/scenes/find-luggage.json',
    );
  });
});

describe('individual deserializer error handling', () => {
  it('rejects invalid JSON', () => {
    const { data, errors } = deserializeScenarioBrief('not json');
    expect(data).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/Invalid JSON/);
  });

  it('rejects wrong artifact type', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      artifactType: 'grounding_map',
      status: 'draft',
      data: { scenarioId: 'x', supportedBands: ['B0'] },
    });
    const { data, errors } = deserializeScenarioBrief(json);
    expect(data).toBeNull();
    expect(errors.some((e) => e.includes('Expected artifactType'))).toBe(true);
  });

  it('rejects missing required fields in scenario brief', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      artifactType: 'scenario_brief',
      status: 'draft',
      data: {},
    });
    const { data, errors } = deserializeScenarioBrief(json);
    expect(data).toBeNull();
    expect(errors.some((e) => e.includes('scenarioId'))).toBe(true);
  });

  it('rejects invalid band IDs', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      artifactType: 'scenario_brief',
      status: 'draft',
      data: {
        scenarioId: 'test',
        supportedBands: ['B0', 'INVALID'],
        activeReferents: [],
        npcIds: [],
      },
    });
    const { data, errors } = deserializeScenarioBrief(json);
    expect(data).toBeNull();
    expect(errors.some((e) => e.includes('INVALID'))).toBe(true);
  });

  it('deserializes grounding map correctly', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      artifactType: 'grounding_map',
      status: 'approved',
      data: { scenarioId: 'test', entries: [] },
    });
    const { data, errors } = deserializeGroundingMap(json);
    expect(errors).toEqual([]);
    expect(data).toEqual({ scenarioId: 'test', entries: [] });
  });

  it('deserializes quest bindings correctly', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      artifactType: 'quest_bindings',
      status: 'draft',
      data: { scenarioId: 'test', bindings: [] },
    });
    const { scenarioId, data, errors } = deserializeQuestBindings(json);
    expect(errors).toEqual([]);
    expect(scenarioId).toBe('test');
    expect(data).toEqual([]);
  });

  it('deserializes lexicon pack correctly', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      artifactType: 'lexicon_pack',
      status: 'draft',
      data: { targetLanguage: 'es', entries: [] },
    });
    const { data, errors } = deserializeLexiconPack(json);
    expect(errors).toEqual([]);
    expect(data!.targetLanguage).toBe('es');
  });

  it('deserializes band policies correctly', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      artifactType: 'band_policies',
      status: 'draft',
      data: { policies: [] },
    });
    const { data, errors } = deserializeBandPolicies(json);
    expect(errors).toEqual([]);
    expect(data!.policies).toEqual([]);
  });

  it('deserializes scene language pack correctly', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      artifactType: 'scene_language_pack',
      status: 'approved',
      data: {
        scenarioId: 'test',
        targetLanguage: 'es',
        supportLanguage: 'en',
        bands: [],
      },
    });
    const { data, errors } = deserializeSceneLanguagePack(json);
    expect(errors).toEqual([]);
    expect(data!.scenarioId).toBe('test');
    expect(data!.targetLanguage).toBe('es');
  });
});

describe('cross-reference validation', () => {
  it('detects orphaned scene pack references', () => {
    const { bundle } = deserializeContentBundle(new Map());
    // Manually add a scene pack referencing a nonexistent scenario
    bundle.sceneLanguagePacks.set('test:es', {
      scenarioId: 'nonexistent',
      targetLanguage: 'es',
      supportLanguage: 'en',
      bands: [],
    });

    const validation = validateContentBundle(bundle);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('nonexistent'))).toBe(true);
  });

  it('warns about scenarios with no scene packs', () => {
    const { bundle } = deserializeContentBundle(new Map());
    bundle.scenarios.set('lonely', {
      scenarioId: 'lonely',
      supportedBands: ['B0'],
      activeReferents: [],
      npcIds: [],
    });

    const validation = validateContentBundle(bundle);
    expect(validation.warnings.some((w) => w.includes('lonely'))).toBe(true);
  });

  it('does not warn solely because a lexicon is below the long-term planning targets', () => {
    const { bundle } = deserializeContentBundle(new Map());
    bundle.lexicons.set('es', {
      targetLanguage: 'es',
      entries: [
        {
          lexicalEntryId: 'object.suitcase',
          targetForm: 'maleta',
          gloss: 'suitcase',
          category: 'object',
          introductionBand: 'B0',
          usage: 'active',
          groundable: true,
        },
      ],
    });

    const validation = validateContentBundle(bundle);
    expect(validation.warnings.some((w) => w.includes('tracked-pool target'))).toBe(false);
  });
});

describe('lexicon planning status', () => {
  it('computes cumulative counts against the V1 planning targets', () => {
    const planning = getLexiconPlanningStatus({
      targetLanguage: 'es',
      entries: [
        {
          lexicalEntryId: 'object.suitcase',
          targetForm: 'maleta',
          gloss: 'suitcase',
          category: 'object',
          introductionBand: 'B0',
          usage: 'active',
          groundable: true,
        },
        {
          lexicalEntryId: 'verb.help',
          targetForm: 'ayudar',
          gloss: 'help',
          category: 'verb',
          introductionBand: 'B2',
          usage: 'active',
          groundable: false,
        },
      ],
    });

    expect(planning.totalTracked).toBe(2);
    expect(planning.cumulativeCounts.B0).toBe(1);
    expect(planning.cumulativeCounts.B1).toBe(1);
    expect(planning.cumulativeCounts.B2).toBe(2);
    expect(planning.targets.B4).toBe(850);
    expect(planning.deficits.B0).toBeGreaterThan(0);
  });
});
