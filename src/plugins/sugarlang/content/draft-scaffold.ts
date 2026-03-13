/**
 * Structural draft scaffolding for Sugarlang artifacts.
 *
 * Reads English-authored game structure (quests, dialogue, NPCs, regions,
 * items) and emits correctly-shaped Sugarlang artifact skeletons with
 * stable source references.
 *
 * This does NOT perform semantic inference, natural-language drafting,
 * or mixed-language pedagogy generation. It produces empty but structurally
 * valid artifact shells that can be filled by:
 *   - direct human editing of the JSON files
 *   - external AI-assisted generation operating on those files
 *
 * The output is a Map<relativePath, jsonString> ready for writeAllSugarlangArtifacts().
 */

import type {
  ScenarioBrief,
  GroundingMap,
  GroundingEntry,
  GroundedQuestBinding,
  QuestBindingBandVariant,
  LexiconPack,
  BandPolicyPack,
  SceneLanguagePack,
  LearnerBandId,
} from '../types';

import {
  serializeScenarioBrief,
  serializeGroundingMap,
  serializeQuestBindings,
  serializeLexiconPack,
  serializeBandPolicies,
  serializeSceneLanguagePack,
  artifactPaths,
} from './artifacts';
import { getSharedLexicon } from './lexicons';

// ---------------------------------------------------------------------------
// Input types — simplified game content from the editor
// ---------------------------------------------------------------------------

/** Minimal quest data needed for scaffolding. */
export interface ScaffoldQuestInput {
  id: string;
  name: string;
  stages: Array<{
    id: string;
    description: string;
    objectives: Array<{
      id: string;
      type: string;
      target: string;
      description: string;
    }>;
  }>;
}

/** Minimal dialogue data needed for scaffolding. */
export interface ScaffoldDialogueInput {
  id: string;
  name?: string;
  nodes?: Array<{
    id?: string;
    speaker?: string;
    speakerId?: string;
    text?: string;
  }>;
}

/** Minimal NPC data needed for scaffolding. */
export interface ScaffoldNPCInput {
  id: string;
  name: string;
  defaultDialogue?: string;
}

/** Minimal region data needed for scaffolding. */
export interface ScaffoldRegionInput {
  id: string;
  name: string;
  npcs?: Array<{ id: string }>;
  pickups?: Array<{ id: string; itemId: string }>;
  inspectables?: Array<{ id: string; inspectionId: string }>;
}

/** Minimal item data needed for scaffolding. */
export interface ScaffoldItemInput {
  id: string;
  name: string;
  category: string;
}

/** Full project input for scaffolding. */
export interface ScaffoldProjectInput {
  quests: ScaffoldQuestInput[];
  dialogues: ScaffoldDialogueInput[];
  npcs: ScaffoldNPCInput[];
  regions: ScaffoldRegionInput[];
  items: ScaffoldItemInput[];
}

// ---------------------------------------------------------------------------
// Scaffold options
// ---------------------------------------------------------------------------

export interface ScaffoldOptions {
  /** Target languages to generate scene pack shells for. Default: ['en', 'es'] */
  targetLanguages?: string[];
  /** Support languages per target. Default: en→es, es→en */
  supportLanguageMap?: Record<string, string>;
  /** Bands to include. Default: all B0-B4 */
  bands?: LearnerBandId[];
}

const DEFAULT_TARGET_LANGUAGES = ['es'];
const DEFAULT_SUPPORT_MAP: Record<string, string> = { es: 'en' };
const DEFAULT_BANDS: LearnerBandId[] = ['B0', 'B1', 'B2', 'B3', 'B4'];

// ---------------------------------------------------------------------------
// Slug / ID helpers
// ---------------------------------------------------------------------------

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

// ---------------------------------------------------------------------------
// Scaffolding
// ---------------------------------------------------------------------------

/**
 * Generate structural artifact skeletons from game content.
 *
 * For each quest that has dialogue-linked objectives:
 *   - infers a scenario brief
 *   - infers grounding entries from region pickups/inspectables
 *   - infers quest binding shells from pickup items
 *   - generates empty scene language pack shells per target language + band
 *
 * Also generates:
 *   - empty lexicon shells per target language
 *   - default band policy pack (from built-in defaults)
 */
export function generateDraftScaffold(
  project: ScaffoldProjectInput,
  options: ScaffoldOptions = {},
): Map<string, string> {
  const targetLanguages = options.targetLanguages ?? DEFAULT_TARGET_LANGUAGES;
  const supportMap = options.supportLanguageMap ?? DEFAULT_SUPPORT_MAP;
  const bands = options.bands ?? DEFAULT_BANDS;
  const files = new Map<string, string>();

  const npcMap = new Map(project.npcs.map((n) => [n.id, n]));
  const itemMap = new Map(project.items.map((i) => [i.id, i]));
  // dialogueMap reserved for future scene-pack content inference
  // const dialogueMap = new Map(project.dialogues.map((d) => [d.id, d]));

  // Find regions containing each NPC for grounding
  const npcRegions = new Map<string, ScaffoldRegionInput>();
  for (const region of project.regions) {
    for (const npc of region.npcs ?? []) {
      npcRegions.set(npc.id, region);
    }
  }

  // Generate per-quest scenarios
  for (const quest of project.quests) {
    const scenarioId = toSlug(quest.name);

    // Find NPCs involved via dialogue objectives
    const involvedNpcIds = new Set<string>();
    const involvedDialogueIds = new Set<string>();
    for (const stage of quest.stages) {
      for (const obj of stage.objectives) {
        if (obj.type === 'talk' && obj.target) {
          involvedNpcIds.add(obj.target);
        }
        if (obj.type === 'dialogue' && obj.target) {
          involvedDialogueIds.add(obj.target);
        }
      }
    }

    // If no NPCs or dialogues found, look at region NPCs
    if (involvedNpcIds.size === 0) {
      for (const region of project.regions) {
        for (const npc of region.npcs ?? []) {
          const npcData = npcMap.get(npc.id);
          if (npcData?.defaultDialogue) {
            involvedNpcIds.add(npc.id);
            involvedDialogueIds.add(npcData.defaultDialogue);
          }
        }
      }
    }

    const npcIds = Array.from(involvedNpcIds);
    const npcNames = npcIds
      .map((id) => npcMap.get(id)?.name)
      .filter((n): n is string => !!n);

    // Build scenario brief
    const scenario: ScenarioBrief = {
      scenarioId,
      associatedQuestId: quest.id,
      successCriteria: quest.stages.flatMap((s) =>
        s.objectives.map((o) => o.description || `Complete: ${o.type} ${o.target}`),
      ),
      activeReferents: [],
      supportedBands: bands,
      npcIds,
      npcNames,
    };

    files.set(artifactPaths.scenario(scenarioId), serializeScenarioBrief(scenario, 'draft'));

    // Build grounding map from region pickups/inspectables
    const groundingEntries: GroundingEntry[] = [];
    const questRegions = new Set<ScaffoldRegionInput>();
    for (const npcId of npcIds) {
      const region = npcRegions.get(npcId);
      if (region) questRegions.add(region);
    }

    for (const region of questRegions) {
      for (const pickup of region.pickups ?? []) {
        const item = itemMap.get(pickup.itemId);
        if (item) {
          groundingEntries.push({
            lexicalEntryId: `object.${toSlug(item.name)}`,
            worldObjectId: pickup.id,
            highlightActions: ['highlight', 'tap_inspect'],
          });
          scenario.activeReferents.push(`object.${toSlug(item.name)}`);
        }
      }
      for (const insp of region.inspectables ?? []) {
        groundingEntries.push({
          lexicalEntryId: `inspectable.${toSlug(insp.id)}`,
          worldObjectId: insp.id,
          highlightActions: ['highlight', 'tap_inspect'],
        });
      }
    }

    const groundingMap: GroundingMap = {
      scenarioId,
      entries: groundingEntries,
    };
    files.set(artifactPaths.groundingMap(scenarioId), serializeGroundingMap(groundingMap, 'draft'));

    // Build quest binding shells from pickups
    const questBindings: GroundedQuestBinding[] = [];
    for (const region of questRegions) {
      for (const pickup of region.pickups ?? []) {
        const item = itemMap.get(pickup.itemId);
        if (!item) continue;

        const bandVariants: QuestBindingBandVariant[] = bands.map((bandId) => ({
          bandId,
          worldObjectId: pickup.id,
          highlightedLexicalEntryIds: [`object.${toSlug(item.name)}`],
        }));

        questBindings.push({
          scenarioReferentId: `target_${toSlug(item.name)}`,
          bandVariants,
          affordances: {
            tapInspect: true,
            highlight: true,
            cameraFocus: true,
          },
          pickupIdentity: item.name,
          inventoryIdentity: item.name,
        });
      }
    }

    files.set(
      artifactPaths.questBindings(scenarioId),
      serializeQuestBindings(scenarioId, questBindings, 'draft'),
    );

    // Build scene language pack shells per target language
    for (const lang of targetLanguages) {
      const supportLang = supportMap[lang] ?? (lang === 'en' ? 'es' : 'en');

      const pack: SceneLanguagePack = {
        scenarioId,
        targetLanguage: lang,
        supportLanguage: supportLang,
        bands: bands.map((bandId) => ({
          bandId,
          turns: [
            {
              turnId: `${bandId.toLowerCase()}-${lang}-01`,
              targetText: `[TODO: Target-language NPC line for ${quest.name}, band ${bandId}]`,
              initialDelivery: `[TODO: Initial delivery line, may be mixed-language at low bands]`,
              focusLexicalEntryIds: [],
              responseMode: bandId === 'B0' ? 'chip_composition'
                : bandId === 'B1' ? 'blank_fill'
                : 'short_text',
              responseData: {},
              evaluation: {},
              speakerName: npcNames[0] ?? 'NPC',
            },
          ],
        })),
      };

      files.set(
        artifactPaths.sceneLanguagePack(lang, scenarioId),
        serializeSceneLanguagePack(pack, 'draft'),
      );
    }
  }

  // Generate bundle-level starter lexicons for each target language.
  for (const lang of targetLanguages) {
    const lexicon: LexiconPack = getSharedLexicon(lang);
    files.set(artifactPaths.lexicon(lang), serializeLexiconPack(lexicon, 'draft'));
  }

  // Generate default band policies
  const bandPolicies: BandPolicyPack = {
    policies: bands.map((bandId) => ({
      bandId,
      supportLanguagePolicy: {
        mixingLevel: bandId === 'B0' ? 'full_support'
          : bandId === 'B1' ? 'heavy_support'
          : bandId === 'B2' ? 'light_support'
          : bandId === 'B3' ? 'target_dominant'
          : 'target_only',
        showSupportStrip: false,
        showGlosses: bandId === 'B2',
      },
      groundingIntensity: bandId === 'B0' ? 'always'
        : bandId === 'B1' ? 'on_first_encounter'
        : bandId === 'B4' ? 'none'
        : 'on_request',
      allowedResponseModes: bandId === 'B0' ? ['chip_composition', 'object_selection']
        : bandId === 'B1' ? ['single_blank', 'blank_fill', 'phrase_assembly', 'word_bank', 'object_selection']
        : bandId === 'B2' ? ['short_text']
        : bandId === 'B3' ? ['short_text', 'open_text']
        : ['open_text', 'free_form'],
      correctionPosture: bandId <= 'B1' ? 'immediate'
        : bandId === 'B2' ? 'delayed'
        : bandId === 'B3' ? 'on_request'
        : 'none',
    })),
  };
  files.set(artifactPaths.bandPolicies(), serializeBandPolicies(bandPolicies, 'draft'));

  return files;
}
