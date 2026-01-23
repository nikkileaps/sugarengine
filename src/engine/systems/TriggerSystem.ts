import { System, World } from '../ecs';
import { Position, PlayerControlled, TriggerZone, TriggerEvent } from '../components';

export type TriggerHandler = (event: TriggerEvent, triggerId: string) => void;

export class TriggerSystem extends System {
  private onTriggerEnter: TriggerHandler | null = null;
  private onTriggerExit: TriggerHandler | null = null;

  setTriggerEnterHandler(handler: TriggerHandler): void {
    this.onTriggerEnter = handler;
  }

  setTriggerExitHandler(handler: TriggerHandler): void {
    this.onTriggerExit = handler;
  }

  update(world: World, _delta: number): void {
    // Find the player
    const players = world.query<[PlayerControlled, Position]>(PlayerControlled, Position);
    const playerList = Array.from(players);
    if (playerList.length === 0) return;

    const player = playerList[0]!;
    const playerPos = player.components[1];

    // Check all trigger zones
    const triggers = world.query<[TriggerZone]>(TriggerZone);
    for (const { components: [trigger] } of triggers) {
      const wasInside = trigger.playerInside;
      const isInside = trigger.containsPoint(playerPos.x, playerPos.y, playerPos.z);

      if (isInside && !wasInside) {
        // Player entered the trigger zone
        trigger.playerInside = true;
        if (this.onTriggerEnter) {
          this.onTriggerEnter(trigger.event, trigger.id);
        }
      } else if (!isInside && wasInside) {
        // Player exited the trigger zone
        trigger.playerInside = false;
        if (this.onTriggerExit) {
          this.onTriggerExit(trigger.event, trigger.id);
        }
      }
    }
  }
}
