import type { Entity } from './Entity';
import { createEntity } from './Entity';
import type { Component } from './Component';
import { System } from './System';

export class World {
  private entities: Set<Entity> = new Set();
  private componentStores: Map<string, Map<Entity, Component>> = new Map();
  private systems: System[] = [];

  createEntity(): Entity {
    const entity = createEntity();
    this.entities.add(entity);
    return entity;
  }

  removeEntity(entity: Entity): void {
    this.entities.delete(entity);
    for (const store of this.componentStores.values()) {
      store.delete(entity);
    }
  }

  addComponent<T extends Component>(entity: Entity, component: T): void {
    const type = component.type;
    if (!this.componentStores.has(type)) {
      this.componentStores.set(type, new Map());
    }
    this.componentStores.get(type)!.set(entity, component);
  }

  getComponent<T extends Component>(entity: Entity, componentClass: { type: string }): T | undefined {
    const store = this.componentStores.get(componentClass.type);
    return store?.get(entity) as T | undefined;
  }

  hasComponent(entity: Entity, componentClass: { type: string }): boolean {
    const store = this.componentStores.get(componentClass.type);
    return store?.has(entity) ?? false;
  }

  removeComponent(entity: Entity, componentClass: { type: string }): void {
    const store = this.componentStores.get(componentClass.type);
    store?.delete(entity);
  }

  query<T extends Component[]>(...componentClasses: { type: string }[]): { entity: Entity; components: T }[] {
    const results: { entity: Entity; components: Component[] }[] = [];

    for (const entity of this.entities) {
      const components: Component[] = [];
      let hasAll = true;

      for (const componentClass of componentClasses) {
        const component = this.getComponent(entity, componentClass);
        if (component) {
          components.push(component);
        } else {
          hasAll = false;
          break;
        }
      }

      if (hasAll) {
        results.push({ entity, components });
      }
    }

    return results as { entity: Entity; components: T }[];
  }

  addSystem(system: System): void {
    this.systems.push(system);
  }

  update(delta: number): void {
    for (const system of this.systems) {
      system.update(this, delta);
    }
  }
}
