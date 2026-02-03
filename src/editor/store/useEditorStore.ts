/**
 * useEditorStore - Zustand store for editor state
 */

import { create } from 'zustand';
import type { EnvironmentAnimationEntry } from '../../engine/shaders';

export type EditorTab = 'dialogues' | 'quests' | 'npcs' | 'items' | 'inspections' | 'regions' | 'spells' | 'player' | 'resonance';

export interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  entryId?: string;
  field?: string;
}

// Data types
export interface NPCData {
  id: string;
  name: string;
  portrait?: string;
  description?: string;
  defaultDialogue?: string;
  faction?: string;
}

export interface DialogueData {
  id: string;
  displayName?: string;
  nodes?: { speaker?: string }[];
}

export interface QuestData {
  id: string;
  name: string;
  stages: {
    id: string;
    description: string;
    objectives: { type: string; target: string; description: string }[];
  }[];
  episodeId?: string;
}

export interface ItemData {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: 'quest' | 'gift' | 'key' | 'misc';
  stackable: boolean;
  maxStack?: number;
  giftable: boolean;
}

export interface InspectionData {
  id: string;
  title: string;
  subtitle?: string;
  headerImage?: string;
  content?: string;
  sections?: { heading?: string; text: string }[];
}

export interface ResonancePointData {
  id: string;
  name: string;
  description?: string;
  icon?: string;                    // Emoji for editor display
  resonanceReward: number;          // How much resonance gained on success (0-100)
  difficulty: 'easy' | 'medium' | 'hard';  // Affects firefly pattern complexity
  cooldownMinutes?: number;         // Optional cooldown before reuse
}

export interface ResonancePointDefinition {
  id: string;
  resonancePointId: string;         // References ResonancePointData.id
  position: { x: number; y: number; z: number };
  promptText?: string;              // Custom "Press E to..." text
}

export interface RegionData {
  id: string;
  name: string;
  geometry?: { path: string };
  gridPosition?: { x: number; z: number };
  playerSpawn: { x: number; y: number; z: number };
  npcs?: { id: string; position: { x: number; y: number; z: number } }[];
  pickups?: { id: string; itemId: string; position: { x: number; y: number; z: number }; quantity?: number }[];
  inspectables?: { id: string; position: { x: number; y: number; z: number }; inspectionId: string; promptText?: string }[];
  resonancePoints?: ResonancePointDefinition[];
  triggers?: { id: string; type: 'box'; bounds: { min: [number, number, number]; max: [number, number, number] }; event: { type: string; target?: string } }[];
  availability?: { fromEpisode?: string; untilEpisode?: string };
  environmentAnimations?: EnvironmentAnimationEntry[];
}

export interface PlayerCasterData {
  initialBattery: number;        // Starting battery % (0-100) for the episode
  rechargeRate: number;          // Battery % per minute (slow trickle from ambient magic)
  initialResonance?: number;     // Starting resonance % (0-100) for the episode
  allowedSpellTags?: string[];
  blockedSpellTags?: string[];
}

export interface SpellEffectData {
  type: 'event' | 'unlock' | 'world-flag' | 'dialogue' | 'heal' | 'damage';
  eventName?: string;
  flagName?: string;
  flagValue?: boolean | string | number;
  dialogueId?: string;
  amount?: number;
}

export interface SpellData {
  id: string;
  name: string;
  description: string;
  icon?: string;
  tags: string[];
  batteryCost: number;
  effects: SpellEffectData[];
  chaosEffects?: SpellEffectData[];
}

export interface SeasonData {
  id: string;
  name: string;
  order: number;
}

export interface EpisodeData {
  id: string;
  seasonId: string;
  name: string;
  order: number;
  startRegion?: string;
  completionCondition?: {
    type: 'quest';
    questId: string;
  };
}

interface EditorState {
  // UI state
  activeTab: EditorTab;
  selectedEntryId: string | null;
  isDirty: boolean;
  validationErrors: ValidationError[];
  searchQuery: string;

  // Project state
  projectLoaded: boolean;
  projectName: string | null;

  // Project data
  seasons: SeasonData[];
  episodes: EpisodeData[];
  npcs: NPCData[];
  dialogues: DialogueData[];
  quests: QuestData[];
  items: ItemData[];
  inspections: InspectionData[];
  regions: RegionData[];
  playerCaster: PlayerCasterData | null;
  spells: SpellData[];
  resonancePoints: ResonancePointData[];

  // Episode context
  currentSeasonId: string | null;
  currentEpisodeId: string | null;
  episodeFilter: 'all' | 'current';

  // Actions
  setActiveTab: (tab: EditorTab) => void;
  selectEntry: (entryId: string | null) => void;
  setDirty: (isDirty: boolean) => void;
  setSearchQuery: (query: string) => void;
  addValidationError: (error: ValidationError) => void;
  clearValidationErrors: () => void;
  setCurrentSeason: (seasonId: string | null) => void;
  setCurrentEpisode: (episodeId: string | null) => void;
  setEpisodeFilter: (filter: 'all' | 'current') => void;
  setProjectLoaded: (loaded: boolean, name?: string | null) => void;

  // Data actions
  setSeasons: (seasons: SeasonData[]) => void;
  setEpisodes: (episodes: EpisodeData[]) => void;
  updateEpisode: (id: string, updates: Partial<EpisodeData>) => void;
  setNPCs: (npcs: NPCData[]) => void;
  setDialogues: (dialogues: DialogueData[]) => void;
  setQuests: (quests: QuestData[]) => void;
  setItems: (items: ItemData[]) => void;
  setInspections: (inspections: InspectionData[]) => void;
  setRegions: (regions: RegionData[]) => void;
  setPlayerCaster: (playerCaster: PlayerCasterData | null) => void;
  setSpells: (spells: SpellData[]) => void;
  setResonancePoints: (resonancePoints: ResonancePointData[]) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  // Initial state
  activeTab: 'dialogues',
  selectedEntryId: null,
  isDirty: false,
  validationErrors: [],
  searchQuery: '',
  projectLoaded: false,
  projectName: null,
  currentSeasonId: null,
  currentEpisodeId: null,
  episodeFilter: 'all',

  // Project data
  seasons: [],
  episodes: [],
  npcs: [],
  dialogues: [],
  quests: [],
  items: [],
  inspections: [],
  regions: [],
  playerCaster: null,
  spells: [],
  resonancePoints: [],

  // Actions
  setActiveTab: (tab) => set({ activeTab: tab, selectedEntryId: null }),
  selectEntry: (entryId) => set({ selectedEntryId: entryId }),
  setDirty: (isDirty) => set({ isDirty }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  addValidationError: (error) =>
    set((state) => ({ validationErrors: [...state.validationErrors, error] })),
  clearValidationErrors: () => set({ validationErrors: [] }),
  setCurrentSeason: (seasonId) => set({ currentSeasonId: seasonId }),
  setCurrentEpisode: (episodeId) => set({ currentEpisodeId: episodeId }),
  setEpisodeFilter: (filter) => set({ episodeFilter: filter }),
  setProjectLoaded: (loaded, name = null) => set({ projectLoaded: loaded, projectName: name }),

  // Data actions
  setSeasons: (seasons) => set({ seasons }),
  setEpisodes: (episodes) => set({ episodes }),
  updateEpisode: (id, updates) => set((state) => ({
    episodes: state.episodes.map((e) => (e.id === id ? { ...e, ...updates } : e)),
  })),
  setNPCs: (npcs) => set({ npcs }),
  setDialogues: (dialogues) => set({ dialogues }),
  setQuests: (quests) => set({ quests }),
  setItems: (items) => set({ items }),
  setInspections: (inspections) => set({ inspections }),
  setRegions: (regions) => set({ regions }),
  setPlayerCaster: (playerCaster) => set({ playerCaster }),
  setSpells: (spells) => set({ spells }),
  setResonancePoints: (resonancePoints) => set({ resonancePoints }),
}));
