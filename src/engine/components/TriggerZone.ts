import { Component } from '../ecs';

export interface TriggerEvent {
  type: string;
  target?: string;
  [key: string]: unknown;
}

export class TriggerZone implements Component {
  static readonly type = 'TriggerZone';
  readonly type = TriggerZone.type;

  // Track if player is currently inside (for enter/exit detection)
  playerInside: boolean = false;

  constructor(
    public id: string,
    public minX: number,
    public minY: number,
    public minZ: number,
    public maxX: number,
    public maxY: number,
    public maxZ: number,
    public event: TriggerEvent
  ) {}

  containsPoint(x: number, y: number, z: number): boolean {
    return (
      x >= this.minX && x <= this.maxX &&
      y >= this.minY && y <= this.maxY &&
      z >= this.minZ && z <= this.maxZ
    );
  }
}
