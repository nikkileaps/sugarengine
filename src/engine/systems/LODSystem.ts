import * as THREE from 'three';
import { System, World } from '../ecs';
import { Position, PlayerControlled, SurfacePatchLOD } from '../components';

/**
 * Stats about the LOD system's current state.
 */
export interface LODStats {
  /** Total number of surface patches being managed */
  totalPatches: number;
  /** Number of patches currently at LOD0 (high detail) */
  lod0Count: number;
  /** Number of patches currently at LOD1 (low detail) */
  lod1Count: number;
  /** Total LOD switches since last reset */
  totalSwitches: number;
  /** LOD switches in the last frame */
  switchesThisFrame: number;
}

/**
 * System that manages Level of Detail (LOD) switching for surface patches.
 *
 * Each frame, checks player distance to each surface patch and switches
 * between LOD0 (high detail) and LOD1 (low detail) based on distance.
 * Uses hysteresis to prevent flickering at the switch boundary.
 */
export class LODSystem extends System {
  // Stats tracking
  private totalSwitches = 0;
  private switchesThisFrame = 0;
  private lod0Count = 0;
  private lod1Count = 0;
  private totalPatches = 0;

  // Force LOD level (null = automatic, 0 = force LOD0, 1 = force LOD1)
  private forcedLOD: 0 | 1 | null = null;

  // Debug visualization
  private debugEnabled = false;
  private debugGroup: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;
  private debugMeshes: Map<string, THREE.Mesh> = new Map();

  /**
   * Set the scene for debug visualization.
   * Must be called before enabling debug mode.
   */
  setScene(scene: THREE.Scene): void {
    this.scene = scene;
  }

  update(world: World, _delta: number): void {
    // Reset per-frame stats
    this.switchesThisFrame = 0;
    this.lod0Count = 0;
    this.lod1Count = 0;

    // Find the player position
    const players = world.query<[PlayerControlled, Position]>(PlayerControlled, Position);
    const playerList = Array.from(players);
    if (playerList.length === 0) return;

    const player = playerList[0]!;
    const playerPos = player.components[1];

    // Query all surface patches with LOD components
    const patches = world.query<[SurfacePatchLOD]>(SurfacePatchLOD);
    this.totalPatches = patches.length;

    for (const { components: [patch] } of patches) {
      // Skip patches with no meshes
      if (patch.lod0Meshes.length === 0 && patch.lod1Meshes.length === 0) continue;

      let targetLOD: 0 | 1;

      if (this.forcedLOD !== null) {
        // Use forced LOD level
        targetLOD = this.forcedLOD;
      } else {
        // Calculate based on distance with hysteresis
        const distance = patch.distanceTo(playerPos.x, playerPos.z);

        // Apply hysteresis to prevent flip-flopping
        // When at LOD0: only switch to LOD1 if beyond (switchDistance + hysteresis)
        // When at LOD1: only switch to LOD0 if within (switchDistance - hysteresis)
        let shouldBeLOD0: boolean;
        if (patch.currentLOD === 0) {
          shouldBeLOD0 = distance < patch.switchDistance + patch.hysteresis;
        } else {
          shouldBeLOD0 = distance < patch.switchDistance - patch.hysteresis;
        }

        targetLOD = shouldBeLOD0 ? 0 : 1;
      }

      if (targetLOD !== patch.currentLOD) {
        // Switch LOD - toggle visibility on ALL meshes in each array
        patch.setLOD0Visible(targetLOD === 0);
        patch.setLOD1Visible(targetLOD === 1);
        patch.currentLOD = targetLOD;
        this.totalSwitches++;
        this.switchesThisFrame++;
      }

      // Update LOD counts
      if (patch.currentLOD === 0) {
        this.lod0Count++;
      } else {
        this.lod1Count++;
      }

      // Update debug visualization if enabled
      if (this.debugEnabled) {
        this.updateDebugVisualization(patch);
      }
    }
  }

  /**
   * Get current LOD statistics.
   */
  getStats(): LODStats {
    return {
      totalPatches: this.totalPatches,
      lod0Count: this.lod0Count,
      lod1Count: this.lod1Count,
      totalSwitches: this.totalSwitches,
      switchesThisFrame: this.switchesThisFrame
    };
  }

  /**
   * Reset statistics counters.
   */
  resetStats(): void {
    this.totalSwitches = 0;
    this.switchesThisFrame = 0;
  }

  /**
   * Force all patches to a specific LOD level, or null for automatic.
   */
  setForcedLOD(level: 0 | 1 | null): void {
    this.forcedLOD = level;
  }

  /**
   * Get the current forced LOD level (null = automatic).
   */
  getForcedLOD(): 0 | 1 | null {
    return this.forcedLOD;
  }

  /**
   * Enable or disable debug visualization.
   * Shows wireframe spheres at switch distances.
   */
  setDebugEnabled(enabled: boolean): void {
    if (enabled === this.debugEnabled) return;

    this.debugEnabled = enabled;

    if (enabled) {
      if (!this.scene) {
        console.warn('LODSystem: Cannot enable debug visualization - scene not set');
        this.debugEnabled = false;
        return;
      }
      this.createDebugGroup();
    } else {
      this.destroyDebugGroup();
    }
  }

  /**
   * Check if debug visualization is enabled.
   */
  isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  /**
   * Clean up debug visualization resources.
   */
  dispose(): void {
    this.destroyDebugGroup();
  }

  private createDebugGroup(): void {
    if (this.debugGroup) return;

    this.debugGroup = new THREE.Group();
    this.debugGroup.name = 'LODDebug';
    this.scene?.add(this.debugGroup);
  }

  private destroyDebugGroup(): void {
    if (!this.debugGroup) return;

    // Dispose all debug meshes
    for (const mesh of this.debugMeshes.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.debugMeshes.clear();

    this.scene?.remove(this.debugGroup);
    this.debugGroup = null;
  }

  private updateDebugVisualization(patch: SurfacePatchLOD): void {
    if (!this.debugGroup) return;

    let debugMesh = this.debugMeshes.get(patch.id);

    if (!debugMesh) {
      // Create debug sphere for this patch
      const geometry = new THREE.SphereGeometry(patch.switchDistance, 32, 16);
      const material = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        wireframe: true,
        transparent: true,
        opacity: 0.3
      });
      debugMesh = new THREE.Mesh(geometry, material);
      debugMesh.position.set(patch.centerX, patch.centerY, patch.centerZ);
      debugMesh.name = `LODDebug_${patch.id}`;

      this.debugGroup.add(debugMesh);
      this.debugMeshes.set(patch.id, debugMesh);
    }

    // Update color based on current LOD state
    const material = debugMesh.material as THREE.MeshBasicMaterial;
    if (patch.currentLOD === 0) {
      // LOD0 (high detail) - green
      material.color.setHex(0x00ff00);
    } else {
      // LOD1 (low detail) - orange
      material.color.setHex(0xff8800);
    }
  }

  /**
   * Remove debug visualization for a specific patch (call when patch entity is removed).
   */
  removeDebugVisualization(patchId: string): void {
    const mesh = this.debugMeshes.get(patchId);
    if (mesh && this.debugGroup) {
      this.debugGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.debugMeshes.delete(patchId);
    }
  }
}
