/**
 * Sugar Engine
 *
 * A lightweight game engine for building isometric/perspective games.
 */

// Core
export { SugarEngine } from './core/Engine';
export type { EngineConfig, CameraConfig } from './core/Engine';
export { GameCamera } from './core/GameCamera';
export type { GameCameraConfig } from './core/GameCamera';
export { InputManager } from './core/InputManager';
export { PostProcessing } from './core/PostProcessing';

// ECS
export { World } from './ecs/World';
export { System } from './ecs/System';
export type { Component } from './ecs/Component';
export type { Entity } from './ecs/Entity';

// Components
export {
  Position,
  Velocity,
  Renderable,
  PlayerControlled,
  TriggerZone,
  NPC,
  ItemPickup,
  Inspectable,
} from './components';
export { NPCMovement } from './components/NPCMovement';
export type { MovementBehavior, Waypoint } from './components/NPCMovement';

// Systems
export {
  MovementSystem,
  RenderSystem,
  TriggerSystem,
  InteractionSystem,
  NPCMovementSystem,
} from './systems';
export type {
  TriggerHandler,
  InteractionHandler,
  InspectionHandler,
  NearbyInteractable,
} from './systems';

// Loaders
export { ModelLoader } from './loaders/ModelLoader';
export { RegionLoader } from './loaders/RegionLoader';
export type { RegionData, LoadedRegion } from './loaders/RegionLoader';

// Dialogue
export { DialogueManager } from './dialogue/DialogueManager';
export { DialogueLoader } from './dialogue/DialogueLoader';
export type * from './dialogue/types';

// Quests
export { QuestManager } from './quests/QuestManager';
export { QuestLoader } from './quests/QuestLoader';
export type * from './quests/types';

// Inventory
export { InventoryManager } from './inventory/InventoryManager';
export { ItemLoader } from './inventory/ItemLoader';
export type * from './inventory/types';

// Inspection
export { InspectionManager } from './inspection/InspectionManager';
export { InspectionLoader } from './inspection/InspectionLoader';
export type * from './inspection/types';

// Save System
export { SaveManager } from './save/SaveManager';
export { LocalStorageProvider } from './save/LocalStorageProvider';
export { TauriFileProvider } from './save/TauriFileProvider';
export type * from './save/types';

// Scenes
export { SceneManager } from './scenes/SceneManager';
export { Screen } from './scenes/Screen';
export { TitleScreen } from './scenes/TitleScreen';
export { PauseScreen } from './scenes/PauseScreen';
export { SaveLoadScreen } from './scenes/SaveLoadScreen';

// UI
export {
  DialogueBox,
  InteractionPrompt,
  QuestTracker,
  QuestJournal,
  QuestNotification,
  InventoryUI,
  ItemNotification,
  InspectionUI,
  GiftUI,
} from './ui';
