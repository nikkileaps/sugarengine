import * as THREE from 'three';

export interface ZoomConfig {
  min: number;
  max: number;
  default: number;
}

export class IsometricCamera {
  camera: THREE.OrthographicCamera;
  private zoom: number;
  private zoomConfig: ZoomConfig;
  private baseSize = 10;

  constructor(zoomConfig: ZoomConfig, container: HTMLElement) {
    this.zoomConfig = zoomConfig;
    this.zoom = zoomConfig.default;

    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.OrthographicCamera(
      -this.baseSize * aspect,
      this.baseSize * aspect,
      this.baseSize,
      -this.baseSize,
      0.1,
      1000
    );

    // Classic isometric angle
    // Position camera at isometric angle (roughly 35.264 degrees from horizontal)
    this.camera.position.set(20, 20, 20);
    this.camera.lookAt(0, 0, 0);

    this.updateZoom();

    // Mouse wheel zoom
    container.addEventListener('wheel', (e) => this.onWheel(e));
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const zoomSpeed = 0.1;
    const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;

    this.zoom = Math.max(
      this.zoomConfig.min,
      Math.min(this.zoomConfig.max, this.zoom + delta)
    );

    this.updateZoom();
  }

  private updateZoom(): void {
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
  }

  updateAspect(container: HTMLElement): void {
    const aspect = container.clientWidth / container.clientHeight;
    this.camera.left = -this.baseSize * aspect;
    this.camera.right = this.baseSize * aspect;
    this.camera.top = this.baseSize;
    this.camera.bottom = -this.baseSize;
    this.camera.updateProjectionMatrix();
  }

  follow(target: THREE.Vector3): void {
    // Keep same isometric offset, just follow target position
    const offset = new THREE.Vector3(20, 20, 20);
    this.camera.position.copy(target).add(offset);
    this.camera.lookAt(target);
  }
}
