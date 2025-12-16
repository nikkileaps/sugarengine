import { Component } from '../ecs';

export class Inspectable implements Component {
  static readonly type = 'Inspectable';
  readonly type = Inspectable.type;

  constructor(
    public id: string,
    public inspectionId: string,
    public promptText: string = 'Inspect'
  ) {}
}
