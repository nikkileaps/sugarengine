import * as THREE from 'three';
import { Component } from '../ecs';

export class Renderable implements Component {
  static readonly type = 'Renderable';
  readonly type = Renderable.type;

  constructor(
    public mesh: THREE.Object3D,
    public visible: boolean = true
  ) {}
}
