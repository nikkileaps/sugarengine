import { Component } from '../ecs';

/**
 * Component for items that can be picked up from the world
 */
export class ItemPickup implements Component {
  static readonly type = 'ItemPickup';
  readonly type = ItemPickup.type;

  constructor(
    public id: string,              // Unique pickup ID
    public itemId: string,          // Item definition ID
    public quantity: number = 1,
    public collected: boolean = false
  ) {}
}
