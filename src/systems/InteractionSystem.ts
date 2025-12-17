import { System, World } from '../ecs';
import { Position, PlayerControlled, NPC, Inspectable } from '../components';
import { InputManager } from '../core/InputManager';

export type InteractionHandler = (npcId: string, dialogueId?: string) => void;
export type InspectionHandler = (inspectableId: string, inspectionId: string, promptText: string) => void;

/** Type of interactable entity */
export type InteractableType = 'npc' | 'inspectable';

/** Nearby interactable info */
export interface NearbyInteractable {
  type: InteractableType;
  id: string;
  dialogueId?: string;      // For NPCs
  inspectionId?: string;    // For Inspectables
  promptText?: string;      // Custom prompt text
}

export class InteractionSystem extends System {
  private interactionRadius = 2.0; // How close to interact
  private nearestNPC: { id: string; dialogueId?: string } | null = null;
  private nearestInteractable: NearbyInteractable | null = null;
  private onInteract: InteractionHandler | null = null;
  private onInspect: InspectionHandler | null = null;
  private onNearbyChange: ((nearby: { id: string; dialogueId?: string } | null) => void) | null = null;
  private onNearbyInteractableChange: ((nearby: NearbyInteractable | null) => void) | null = null;

  constructor(private input: InputManager) {
    super();
  }

  setInteractHandler(handler: InteractionHandler): void {
    this.onInteract = handler;
  }

  setInspectHandler(handler: InspectionHandler): void {
    this.onInspect = handler;
  }

  setNearbyChangeHandler(handler: (nearby: { id: string; dialogueId?: string } | null) => void): void {
    this.onNearbyChange = handler;
  }

  setNearbyInteractableChangeHandler(handler: (nearby: NearbyInteractable | null) => void): void {
    this.onNearbyInteractableChange = handler;
  }

  getNearestNPC(): { id: string; dialogueId?: string } | null {
    return this.nearestNPC;
  }

  getNearestInteractable(): NearbyInteractable | null {
    return this.nearestInteractable;
  }

  update(world: World, _delta: number): void {
    // Find player position
    const players = world.query<[PlayerControlled, Position]>(PlayerControlled, Position);
    const playerList = Array.from(players);
    if (playerList.length === 0) return;

    const playerPos = playerList[0]!.components[1];

    // Track the overall nearest interactable (NPC or Inspectable)
    let nearestInteractable: (NearbyInteractable & { distance: number }) | null = null;

    // Find nearest NPC within interaction radius
    let nearestNPCData: { id: string; dialogueId?: string; distance: number } | null = null;

    const npcs = world.query<[NPC, Position]>(NPC, Position);
    for (const { components: [npc, npcPos] } of npcs) {
      const dx = playerPos.x - npcPos.x;
      const dz = playerPos.z - npcPos.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance <= this.interactionRadius) {
        if (!nearestNPCData || distance < nearestNPCData.distance) {
          nearestNPCData = {
            id: npc.id,
            dialogueId: npc.dialogueId,
            distance
          };
        }
        if (!nearestInteractable || distance < nearestInteractable.distance) {
          nearestInteractable = {
            type: 'npc',
            id: npc.id,
            dialogueId: npc.dialogueId,
            promptText: `Talk to ${npc.name || npc.id}`,
            distance
          };
        }
      }
    }

    // Find nearest Inspectable within interaction radius
    const inspectables = world.query<[Inspectable, Position]>(Inspectable, Position);
    for (const { components: [inspectable, inspectablePos] } of inspectables) {
      const dx = playerPos.x - inspectablePos.x;
      const dz = playerPos.z - inspectablePos.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance <= this.interactionRadius) {
        if (!nearestInteractable || distance < nearestInteractable.distance) {
          nearestInteractable = {
            type: 'inspectable',
            id: inspectable.id,
            inspectionId: inspectable.inspectionId,
            promptText: inspectable.promptText,
            distance
          };
        }
      }
    }

    // Update nearest NPC (for backward compatibility)
    const newNearestNPC = nearestNPCData ? { id: nearestNPCData.id, dialogueId: nearestNPCData.dialogueId } : null;
    const npcChanged = (this.nearestNPC?.id !== newNearestNPC?.id);

    if (npcChanged) {
      this.nearestNPC = newNearestNPC;
      if (this.onNearbyChange) {
        this.onNearbyChange(newNearestNPC);
      }
    }

    // Update nearest interactable (unified)
    const newNearestInteractable: NearbyInteractable | null = nearestInteractable
      ? { type: nearestInteractable.type, id: nearestInteractable.id, dialogueId: nearestInteractable.dialogueId, inspectionId: nearestInteractable.inspectionId, promptText: nearestInteractable.promptText }
      : null;
    const interactableChanged = (this.nearestInteractable?.id !== newNearestInteractable?.id) ||
                                 (this.nearestInteractable?.type !== newNearestInteractable?.type);

    if (interactableChanged) {
      this.nearestInteractable = newNearestInteractable;
      if (this.onNearbyInteractableChange) {
        this.onNearbyInteractableChange(newNearestInteractable);
      }
    }

    // Check for interact button press
    if (this.nearestInteractable && this.input.isInteractPressed()) {
      if (this.nearestInteractable.type === 'npc' && this.onInteract) {
        this.onInteract(this.nearestInteractable.id, this.nearestInteractable.dialogueId);
      } else if (this.nearestInteractable.type === 'inspectable' && this.onInspect) {
        this.onInspect(
          this.nearestInteractable.id,
          this.nearestInteractable.inspectionId!,
          this.nearestInteractable.promptText || 'Inspect'
        );
      }
    }
  }
}
