export type Entity = number;

let nextEntityId = 0;

export function createEntity(): Entity {
  return nextEntityId++;
}

export function resetEntityIds(): void {
  nextEntityId = 0;
}
