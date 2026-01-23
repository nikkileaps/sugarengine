import { Component } from '../ecs';

export class PlayerControlled implements Component {
  static readonly type = 'PlayerControlled';
  readonly type = PlayerControlled.type;

  constructor(
    public speed: number = 5
  ) {}
}
