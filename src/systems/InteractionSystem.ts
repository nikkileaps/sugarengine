import { System, World } from '../ecs';
import { Position, PlayerControlled, NPC } from '../components';
import { InputManager } from '../core/InputManager';

export type InteractionHandler = (npcId: string, dialogueId?: string) => void;

export class InteractionSystem extends System {
  private interactionRadius = 2.0; // How close to interact
  private nearestNPC: { id: string; dialogueId?: string } | null = null;
  private onInteract: InteractionHandler | null = null;
  private onNearbyChange: ((nearby: { id: string; dialogueId?: string } | null) => void) | null = null;

  constructor(private input: InputManager) {
    super();
  }

  setInteractHandler(handler: InteractionHandler): void {
    this.onInteract = handler;
  }

  setNearbyChangeHandler(handler: (nearby: { id: string; dialogueId?: string } | null) => void): void {
    this.onNearbyChange = handler;
  }

  getNearestNPC(): { id: string; dialogueId?: string } | null {
    return this.nearestNPC;
  }

  update(world: World, _delta: number): void {
    // Find player position
    const players = world.query<[PlayerControlled, Position]>(PlayerControlled, Position);
    const playerList = Array.from(players);
    if (playerList.length === 0) return;

    const playerPos = playerList[0]!.components[1];

    // Find nearest NPC within interaction radius
    let nearest: { id: string; dialogueId?: string; distance: number } | null = null;

    const npcs = world.query<[NPC, Position]>(NPC, Position);
    for (const { components: [npc, npcPos] } of npcs) {
      const dx = playerPos.x - npcPos.x;
      const dz = playerPos.z - npcPos.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance <= this.interactionRadius) {
        if (!nearest || distance < nearest.distance) {
          nearest = {
            id: npc.id,
            dialogueId: npc.dialogueId,
            distance
          };
        }
      }
    }

    // Update nearest NPC and notify if changed
    const newNearest = nearest ? { id: nearest.id, dialogueId: nearest.dialogueId } : null;
    const changed = (this.nearestNPC?.id !== newNearest?.id);

    if (changed) {
      this.nearestNPC = newNearest;
      if (this.onNearbyChange) {
        this.onNearbyChange(newNearest);
      }
    }

    // Check for interact button press
    if (this.nearestNPC && this.input.isInteractPressed()) {
      if (this.onInteract) {
        this.onInteract(this.nearestNPC.id, this.nearestNPC.dialogueId);
      }
    }
  }
}
