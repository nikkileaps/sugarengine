/**
 * @file project-document.ts
 * @description Shared authored game-project document model and normalization helpers.
 */

import {
  normalizeNPCInteractionCapabilitiesFromDocument,
  type NPCInteractionCapabilities,
} from '../../engine/conversation';
import type {
  DialogueData,
  EpisodeData,
  InspectionData,
  ItemData,
  NPCData,
  PluginConfigData,
  PlayerCasterData,
  QuestData,
  RegionData,
  ResonancePointData,
  SeasonData,
  SpellData,
  VFXDefinitionData,
} from '../store/useEditorStore';

export interface ProjectDocumentMeta {
  gameId: string;
  name: string;
  contentBasePath: string;
  version: string;
  createdAt?: string;
  savedAt?: string;
}

export interface EditorProjectDocument {
  meta: ProjectDocumentMeta;
  defaultEpisode?: string;
  seasons: SeasonData[];
  episodes: EpisodeData[];
  plugins: PluginConfigData[];
  npcs: NPCData[];
  dialogues: DialogueData[];
  quests: QuestData[];
  items: ItemData[];
  inspections: InspectionData[];
  regions: RegionData[];
  playerCaster: PlayerCasterData | null;
  playerModel: string | null;
  playerAnimations: Record<string, string>;
  titleScreen: {
    cameraPosition?: { x: number; y: number; z: number };
    cameraLookAt?: { x: number; y: number; z: number };
    hidePlayer?: boolean;
    transitionDuration?: number;
    title?: string;
    subtitle?: string;
    footerHintText?: string;
    versionText?: string;
    menu?: {
      newGameLabel?: string;
      continueLabel?: string;
      quitLabel?: string;
      showQuit?: boolean;
    };
    playerProfile?: {
      sugarlang?: {
        enabled?: boolean;
        targetLanguages?: string[];
        defaultTargetLanguage?: string;
        learnerBands?: string[];
        defaultLearnerBand?: string;
      };
    };
  } | null;
  spells: SpellData[];
  resonancePoints: ResonancePointData[];
  vfxDefinitions: VFXDefinitionData[];
}

export interface ProjectSnapshotInput {
  gameId: string;
  name: string;
  version?: string | null;
  createdAt?: string | null;
  defaultEpisode?: string | null;
  seasons: SeasonData[];
  episodes: EpisodeData[];
  plugins: PluginConfigData[];
  npcs: NPCData[];
  dialogues: DialogueData[];
  quests: QuestData[];
  items: ItemData[];
  inspections: InspectionData[];
  regions: RegionData[];
  playerCaster: PlayerCasterData | null;
  playerModel: string | null;
  playerAnimations: Record<string, string>;
  titleScreen: EditorProjectDocument['titleScreen'];
  spells: SpellData[];
  resonancePoints: ResonancePointData[];
  vfxDefinitions: VFXDefinitionData[];
}

export const AUTHORED_CONTENT_BASE_PATH = 'assets/';
export const PROJECT_FILE_NAME = 'project.sgrgame';
export const GAME_CONFIG_FILE = 'game.config.json';
export const PUBLISHED_ASSETS_MANIFEST_FILE = 'published-assets.json';

export function toGameSlug(value: string | null | undefined): string {
  const normalized = (value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'untitled-game';
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {};
  const entries: Array<[string, string]> = [];
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entryValue !== 'string' || entryValue.length === 0) continue;
    entries.push([key, entryValue]);
  }
  return Object.fromEntries(entries);
}

function normalizeNpcDocument(value: unknown): NPCData | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const id = normalizeString(record.id);
  const name = normalizeString(record.name);
  if (!id || !name) return null;

  const normalized = {
    ...(record as Record<string, unknown>),
    id,
    name,
    interactionCapabilities: normalizeNPCInteractionCapabilitiesFromDocument(
      record.interactionCapabilities as NPCInteractionCapabilities | undefined,
      record.interactionMode,
    ),
  } as unknown as NPCData;

  delete (normalized as unknown as Record<string, unknown>).interactionMode;
  return normalized;
}

export function normalizeAuthoredContentBasePath(value: unknown): string {
  const raw = normalizeString(value);
  if (!raw) return AUTHORED_CONTENT_BASE_PATH;
  const normalized = raw.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized) return AUTHORED_CONTENT_BASE_PATH;
  if (normalized === 'assets') return AUTHORED_CONTENT_BASE_PATH;
  if (/^games\/[a-z0-9-]+\/assets$/i.test(normalized)) return AUTHORED_CONTENT_BASE_PATH;
  return `${normalized}/`;
}

export function createStarterProjectDocument(options: {
  gameId: string;
  name: string;
  now?: string;
}): EditorProjectDocument {
  const now = options.now ?? new Date().toISOString();
  const seasonId = 'season-1';
  const episodeId = 'episode-1';

  return {
    meta: {
      gameId: toGameSlug(options.gameId),
      name: normalizeString(options.name) ?? 'Untitled Game',
      contentBasePath: AUTHORED_CONTENT_BASE_PATH,
      version: '1.0.0',
      createdAt: now,
      savedAt: now,
    },
    defaultEpisode: episodeId,
    seasons: [{ id: seasonId, name: 'Season 1', order: 1 }],
    episodes: [{ id: episodeId, seasonId, name: 'Episode 1', order: 1 }],
    plugins: [],
    npcs: [],
    dialogues: [],
    quests: [],
    items: [],
    inspections: [],
    regions: [],
    playerCaster: null,
    playerModel: null,
    playerAnimations: {},
    titleScreen: null,
    spells: [],
    resonancePoints: [],
    vfxDefinitions: [],
  };
}

export function normalizeLoadedProjectDocument(
  raw: unknown,
  options: {
    fallbackName?: string;
    fallbackGameId?: string;
  } = {},
): EditorProjectDocument {
  const value = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
  const meta = typeof value.meta === 'object' && value.meta !== null
    ? value.meta as Record<string, unknown>
    : {};

  const name = normalizeString(meta.name)
    ?? normalizeString(options.fallbackName)
    ?? 'Untitled Game';
  const gameId = toGameSlug(
    normalizeString(meta.gameId)
    ?? normalizeString(options.fallbackGameId)
    ?? name,
  );
  const seasons = Array.isArray(value.seasons) ? value.seasons as SeasonData[] : [];
  const episodes = Array.isArray(value.episodes) ? value.episodes as EpisodeData[] : [];
  const defaultEpisode = normalizeString(value.defaultEpisode)
    ?? episodes[0]?.id
    ?? undefined;

  return {
    meta: {
      gameId,
      name,
      contentBasePath: normalizeAuthoredContentBasePath(meta.contentBasePath),
      version: normalizeString(meta.version) ?? '1.0.0',
      createdAt: normalizeString(meta.createdAt),
      savedAt: normalizeString(meta.savedAt),
    },
    defaultEpisode,
    seasons,
    episodes,
    plugins: Array.isArray(value.plugins) ? value.plugins as PluginConfigData[] : [],
    npcs: Array.isArray(value.npcs)
      ? value.npcs
          .map((entry) => normalizeNpcDocument(entry))
          .filter((entry): entry is NPCData => entry !== null)
      : [],
    dialogues: Array.isArray(value.dialogues) ? value.dialogues as DialogueData[] : [],
    quests: Array.isArray(value.quests) ? value.quests as QuestData[] : [],
    items: Array.isArray(value.items) ? value.items as ItemData[] : [],
    inspections: Array.isArray(value.inspections) ? value.inspections as InspectionData[] : [],
    regions: Array.isArray(value.regions) ? value.regions as RegionData[] : [],
    playerCaster: (value.playerCaster as PlayerCasterData | null | undefined) ?? null,
    playerModel: normalizeString(value.playerModel) ?? null,
    playerAnimations: normalizeStringRecord(value.playerAnimations),
    titleScreen: (typeof value.titleScreen === 'object' && value.titleScreen !== null)
      ? value.titleScreen as EditorProjectDocument['titleScreen']
      : null,
    spells: Array.isArray(value.spells) ? value.spells as SpellData[] : [],
    resonancePoints: Array.isArray(value.resonancePoints) ? value.resonancePoints as ResonancePointData[] : [],
    vfxDefinitions: Array.isArray(value.vfxDefinitions) ? value.vfxDefinitions as VFXDefinitionData[] : [],
  };
}

export function buildProjectDocumentFromSnapshot(
  snapshot: ProjectSnapshotInput,
  options: {
    savedAt?: string;
  } = {},
): EditorProjectDocument {
  const savedAt = options.savedAt ?? new Date().toISOString();
  const createdAt = normalizeString(snapshot.createdAt) ?? savedAt;
  const version = normalizeString(snapshot.version) ?? '1.0.0';
  const gameId = toGameSlug(snapshot.gameId);
  const name = normalizeString(snapshot.name) ?? 'Untitled Game';

  return {
    meta: {
      gameId,
      name,
      contentBasePath: AUTHORED_CONTENT_BASE_PATH,
      version,
      createdAt,
      savedAt,
    },
    defaultEpisode: normalizeString(snapshot.defaultEpisode)
      ?? snapshot.episodes[0]?.id
      ?? undefined,
    seasons: snapshot.seasons,
    episodes: snapshot.episodes,
    plugins: snapshot.plugins,
    npcs: snapshot.npcs,
    dialogues: snapshot.dialogues,
    quests: snapshot.quests,
    items: snapshot.items,
    inspections: snapshot.inspections,
    regions: snapshot.regions,
    playerCaster: snapshot.playerCaster,
    playerModel: snapshot.playerModel,
    playerAnimations: snapshot.playerAnimations,
    titleScreen: snapshot.titleScreen,
    spells: snapshot.spells,
    resonancePoints: snapshot.resonancePoints,
    vfxDefinitions: snapshot.vfxDefinitions,
  };
}

export function stringifyProjectDocument(project: EditorProjectDocument): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}

export function createStarterGameConfig(gameId: string): Record<string, unknown> {
  return {
    gameId: toGameSlug(gameId),
    deploy: {},
  };
}

export function createEmptyPublishedAssetsManifest(): Record<string, unknown> {
  return {
    version: 1,
    files: [],
  };
}
