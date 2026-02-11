import * as THREE from 'three';
import { ModelLoader } from './ModelLoader';

export interface PropModel {
  mesh: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
}

/**
 * Loads a prop model. Currently identical to CharacterLoader —
 * will be teased apart over time for prop-specific handling.
 */
export class PropLoader {
  constructor(private models: ModelLoader) {}

  async load(
    baseUrl: string,
    animationPaths: Record<string, string> = {},
    targetHeight: number = 1.5,
    colorOverride?: number,
  ): Promise<PropModel> {
    const result = await this.models.loadAnimatedModel(baseUrl);
    const mesh = this.normalizeModel(result.scene, targetHeight);
    const isFBX = baseUrl.toLowerCase().endsWith('.fbx');

    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        if (isFBX) {
          child.material = this.normalizeMaterials(child.material);
        }
        if (colorOverride !== undefined) {
          this.applyColorOverride(child.material, colorOverride);
        }
      }
    });

    // Collect named clips from the base model
    const clips = new Map<string, THREE.AnimationClip>();
    for (const clip of result.clips) {
      const name = inferClipName(clip.name, result.clips.length, baseUrl);
      clips.set(name, clip);
    }

    // Load additional animation files
    for (const [name, path] of Object.entries(animationPaths)) {
      try {
        const animResult = await this.models.loadAnimatedModel(path);
        const firstClip = animResult.clips[0];
        if (firstClip) {
          clips.set(name, firstClip);
          console.log(`[PropLoader] Loaded animation "${name}" from ${path}`);
        }
      } catch (e) {
        console.warn(`[PropLoader] Failed to load animation "${name}" from ${path}`, e);
      }
    }

    return { mesh, clips };
  }

  private applyColorOverride(
    material: THREE.Material | THREE.Material[],
    color: number,
  ): void {
    const mats = Array.isArray(material) ? material : [material];
    for (const mat of mats) {
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.color.set(color);
        mat.map = null;
        mat.needsUpdate = true;
      }
    }
  }

  /**
   * Aggressive material conversion for character models.
   * Strips metalness, forces high roughness, converts Phong to Standard.
   */
  private normalizeMaterials(
    material: THREE.Material | THREE.Material[],
  ): THREE.Material | THREE.Material[] {
    if (Array.isArray(material)) {
      return material.map((m) => this.convertMaterial(m));
    }
    return this.convertMaterial(material);
  }

  private convertMaterial(mat: THREE.Material): THREE.Material {
    if (mat instanceof THREE.MeshStandardMaterial) {
      mat.metalness = 0.0;
      mat.roughness = Math.max(mat.roughness, 0.8);
      mat.metalnessMap = null;
      return mat;
    }

    const src = mat as THREE.MeshPhongMaterial;
    const std = new THREE.MeshStandardMaterial({
      map: src.map ?? null,
      color: src.color ?? new THREE.Color(0xffffff),
      normalMap: src.normalMap ?? null,
      transparent: src.transparent,
      opacity: src.opacity,
      side: src.side,
      alphaTest: src.alphaTest,
      roughness: 0.9,
      metalness: 0.0,
    });

    src.dispose();
    return std;
  }

  /** Normalize a model to a target height with feet at y=0, wrapped in a group. */
  private normalizeModel(model: THREE.Object3D, targetHeight: number): THREE.Group {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    if (size.y > 0) {
      model.scale.multiplyScalar(targetHeight / size.y);
    }

    // Recompute after scaling, center horizontally with feet at y=0
    box.setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);

    // Disable frustum culling on skinned meshes — bounding spheres go stale after rescaling
    model.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        child.frustumCulled = false;
      }
    });

    const wrapper = new THREE.Group();
    wrapper.add(model);
    console.log(`[PropLoader] Normalized: height ${size.y.toFixed(1)} → ${targetHeight}`);
    return wrapper;
  }
}

/** Infer a standard clip name (idle/walk/run/jump) from a raw clip name. */
function inferClipName(rawName: string, totalClips: number, modelPath: string): string {
  const lower = rawName.toLowerCase();

  if (lower.includes('idle')) return 'idle';
  if (lower.includes('walk')) return 'walk';
  if (lower.includes('run')) return 'run';
  if (lower.includes('jump')) return 'jump';

  if (totalClips === 1) {
    const modelLower = modelPath.toLowerCase();
    if (modelLower.includes('walk')) return 'walk';
    if (modelLower.includes('idle')) return 'idle';
    if (modelLower.includes('run')) return 'run';
    return 'walk';
  }

  // Strip common prefixes (e.g., "Armature|Walk" -> "walk")
  const stripped = rawName.replace(/^.*\|/, '').toLowerCase().trim();
  if (stripped) return stripped;

  return rawName;
}
