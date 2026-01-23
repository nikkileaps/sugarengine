import { Component } from '../ecs';

export class NPC implements Component {
  static readonly type = 'NPC';
  readonly type = NPC.type;

  constructor(
    public id: string,
    public name: string = '',
    public dialogueId?: string
  ) {}
}
