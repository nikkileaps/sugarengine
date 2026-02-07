/**
 * Sugar Engine
 *
 * A lightweight game engine for building isometric/perspective games.
 */

// Core
export { SugarEngine } from './core/Engine';
export type { EngineConfig, CameraConfig, LoadedRegionState, NPCDatabaseEntry } from './core/Engine';
export { Game } from './core/Game';
export type { GameConfig, GameEventHandlers, TitleScreenConfig } from './core/Game';
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
export type { RegionData, LoadedRegion, RegionStreamingConfig, GridPosition, Vec3 } from './loaders/RegionLoader';

// Streaming
export * from './streaming';

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

// Caster System
export { CasterManager, SpellLoader } from './caster';
export type {
  PlayerCasterConfig,
  SpellDefinition,
  SpellEffect,
  BatteryTier,
  SpellResult,
  SpellCastEvent,
  ChaosEvent,
} from './caster';

// Scenes
export { SceneManager } from './scenes/SceneManager';
export { Screen } from './scenes/Screen';
export { TitleScreen } from './scenes/TitleScreen';
export { PauseScreen } from './scenes/PauseScreen';
export { SaveLoadScreen } from './scenes/SaveLoadScreen';

// Audio
export { AudioManager } from './audio';
export type { AudioConfig, AudioState, SoundCategory, SoundOptions } from './audio';

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
  DebugHUD,
  SpellMenuUI,
  CasterHUD,
  ResonanceGameUI,
  FadeOverlay,
} from './ui';

// Resonance System
export { ResonancePointLoader } from './resonance';
export type {
  ResonanceDifficulty,
  ResonancePointConfig,
  FireflyPattern,
  Trajectory,
  TrajectoryPoint,
  TrajectoryOption,
  ResonanceGameResult,
} from './resonance';

// Behavior Trees (ADR-017)
export { BehaviorTreeEvaluator } from './behavior';
export type {
  BTNode,
  BTNodeType,
  BTAction,
  BTActionType,
  BTCondition,
  BTConditionType,
  BTStatus,
  BTResult,
  BTContext,
  BTControlNode,
  BTParallelNode,
  BTDecoratorNode,
  BTConditionNode,
  BTActionNode,
} from './behavior';
export { NPCBehavior } from './components/NPCBehavior';
export type { BehaviorMode } from './components/NPCBehavior';
export { BehaviorTreeSystem } from './systems/BehaviorTreeSystem';
export type { BTConditionChecker, BTActionHandler } from './systems/BehaviorTreeSystem';

// World State (ADR-018)
export { WorldStateEvaluator, WorldStateNotifier, FlagsManager } from './state';
export type { WorldStateCondition, StateChange, StateChangeListener, StateNamespace } from './state';

// Debug
export { FreeCameraController } from './debug';
