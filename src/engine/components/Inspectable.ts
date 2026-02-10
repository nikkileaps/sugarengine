import { Component } from '../ecs';

export class Inspectable implements Component {
  static readonly type = 'Inspectable';
  readonly type = Inspectable.type;

  /** XZ collision radius — set after model loads from bounding box */
  public collisionRadius = 0;

  constructor(
    public id: string,
    public inspectionId: string,
    public promptText: string = 'Inspect'
  ) {}
}
