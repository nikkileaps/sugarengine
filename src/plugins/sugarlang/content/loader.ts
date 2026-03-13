/**
 * Sugarlang content loader.
 *
 * Loads content from the game project's `plugins/sugarlang/` directory structure.
 * Supports two loading modes:
 *   1. Inline project data (legacy: TS modules or JSON embedded in project)
 *   2. Artifact files (V1: JSON files under plugins/sugarlang/)
 */

import type {
  SugarlangContentBundle,
  ScenarioBrief,
  GroundingMap,
  GroundedQuestBinding,
  LexiconPack,
  BandPolicyPack,
  SceneLanguagePack,
} from '../types';

import { deserializeContentBundle, validateContentBundle } from './artifacts';

/** Raw project data shape for sugarlang content. */
export interface SugarlangProjectData {
  scenarios?: ScenarioBrief[];
  groundingMaps?: GroundingMap[];
  questBindings?: Record<string, GroundedQuestBinding[]>;
  lexicons?: LexiconPack[];
  bandPolicies?: BandPolicyPack;
  sceneLanguagePacks?: SceneLanguagePack[];
}

/** Create an empty content bundle. */
export function createEmptyBundle(): SugarlangContentBundle {
  return {
    scenarios: new Map(),
    groundingMaps: new Map(),
    lexicons: new Map(),
    bandPolicies: { policies: [] },
    sceneLanguagePacks: new Map(),
    questBindings: new Map(),
  };
}

/**
 * Build a content bundle from project data (development mode).
 * Returns the bundle and any validation warnings.
 */
export function loadContentFromProject(data: unknown): {
  bundle: SugarlangContentBundle;
  warnings: string[];
} {
  const warnings: string[] = [];
  const bundle = createEmptyBundle();

  if (!data || typeof data !== 'object') {
    return { bundle, warnings };
  }

  const project = data as SugarlangProjectData;

  // Scenarios
  if (Array.isArray(project.scenarios)) {
    for (const s of project.scenarios) {
      if (s.scenarioId) {
        bundle.scenarios.set(s.scenarioId, s);
      } else {
        warnings.push('Scenario missing scenarioId, skipped.');
      }
    }
  }

  // Grounding maps
  if (Array.isArray(project.groundingMaps)) {
    for (const g of project.groundingMaps) {
      if (g.scenarioId) {
        bundle.groundingMaps.set(g.scenarioId, g);
      } else {
        warnings.push('Grounding map missing scenarioId, skipped.');
      }
    }
  }

  // Lexicons
  if (Array.isArray(project.lexicons)) {
    for (const l of project.lexicons) {
      if (l.targetLanguage) {
        bundle.lexicons.set(l.targetLanguage, l);
      } else {
        warnings.push('Lexicon pack missing targetLanguage, skipped.');
      }
    }
  }

  // Band policies
  if (project.bandPolicies && Array.isArray(project.bandPolicies.policies)) {
    bundle.bandPolicies = project.bandPolicies;
  }

  // Quest bindings
  if (project.questBindings && typeof project.questBindings === 'object') {
    for (const [scenarioId, bindings] of Object.entries(project.questBindings)) {
      if (Array.isArray(bindings)) {
        bundle.questBindings.set(scenarioId, bindings);
      }
    }
  }

  // Scene language packs — keyed by `${scenarioId}:${targetLanguage}`
  if (Array.isArray(project.sceneLanguagePacks)) {
    for (const pack of project.sceneLanguagePacks) {
      if (pack.scenarioId && pack.targetLanguage) {
        const key = `${pack.scenarioId}:${pack.targetLanguage}`;
        bundle.sceneLanguagePacks.set(key, pack);
      } else {
        warnings.push('Scene language pack missing scenarioId or targetLanguage, skipped.');
      }
    }
  }

  return { bundle, warnings };
}

/**
 * Look up the scene language pack for a given scenario, target language, and band.
 * Returns the band realization and its turns, or null if not found.
 */
export function resolveSceneBandContent(
  bundle: SugarlangContentBundle,
  scenarioId: string,
  targetLanguage: string,
  bandId: string,
): SceneLanguagePack['bands'][number] | null {
  const key = `${scenarioId}:${targetLanguage}`;
  const pack = bundle.sceneLanguagePacks.get(key);
  if (!pack) return null;
  return pack.bands.find((b) => b.bandId === bandId) ?? null;
}

/**
 * Load a content bundle from persisted JSON artifact files.
 * Takes a Map<relativePath, jsonString> as returned by loadAllSugarlangArtifacts().
 */
export function loadContentFromArtifacts(files: Map<string, string>): {
  bundle: SugarlangContentBundle;
  errors: string[];
  warnings: string[];
} {
  return deserializeContentBundle(files);
}

/**
 * Validate an already-loaded content bundle for cross-reference integrity.
 */
export { validateContentBundle };
