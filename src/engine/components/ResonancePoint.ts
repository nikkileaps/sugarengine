import { Component } from '../ecs';

/**
 * ResonancePoint component - attached to resonance point entities
 * Allows interaction to trigger the resonance mini-game
 */
export class ResonancePoint implements Component {
  static readonly type = 'ResonancePoint';
  readonly type = ResonancePoint.type;

  constructor(
    public id: string,
    public resonancePointId: string,
    public promptText: string = 'Attune'
  ) {}
}
