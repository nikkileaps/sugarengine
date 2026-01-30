import * as THREE from 'three';
import { Component } from '../ecs';

/**
 * Component for surface patches with LOD (Level of Detail) switching.
 * Attached to entities created from SugarBuilder's surfacePatches export.
 */
export class SurfacePatchLOD implements Component {
  static readonly type = 'SurfacePatchLOD';
  readonly type = SurfacePatchLOD.type;

  /** Current LOD level (0 = high detail, 1 = low detail) */
  currentLOD: 0 | 1 = 0;

  constructor(
    /** Unique identifier for this surface patch */
    public id: string,
    /** Surface type (e.g., 'wall_brick', 'ground_cobblestone') */
    public patchType: string,
    /** World-space center point for distance calculations */
    public centerX: number,
    public centerY: number,
    public centerZ: number,
    /** Distance at which to switch from LOD0 to LOD1 */
    public switchDistance: number,
    /** Buffer zone to prevent flip-flopping */
    public hysteresis: number,
    /** References to high-detail meshes (LOD0) */
    public lod0Meshes: THREE.Object3D[],
    /** References to low-detail meshes (LOD1) */
    public lod1Meshes: THREE.Object3D[]
  ) {}

  /**
   * Calculate distance from a point to this patch's center (XZ plane only).
   */
  distanceTo(x: number, z: number): number {
    const dx = this.centerX - x;
    const dz = this.centerZ - z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /**
   * Set visibility for all LOD0 meshes.
   */
  setLOD0Visible(visible: boolean): void {
    for (const mesh of this.lod0Meshes) {
      mesh.visible = visible;
    }
  }

  /**
   * Set visibility for all LOD1 meshes.
   */
  setLOD1Visible(visible: boolean): void {
    for (const mesh of this.lod1Meshes) {
      mesh.visible = visible;
    }
  }
}
