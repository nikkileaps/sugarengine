import { Component } from '../ecs';

export class Position implements Component {
  static readonly type = 'Position';
  readonly type = Position.type;

  constructor(
    public x: number = 0,
    public y: number = 0,
    public z: number = 0
  ) {}
}
