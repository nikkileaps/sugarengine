import { Component } from '../ecs';

export class Velocity implements Component {
  static readonly type = 'Velocity';
  readonly type = Velocity.type;

  constructor(
    public x: number = 0,
    public y: number = 0,
    public z: number = 0
  ) {}
}
