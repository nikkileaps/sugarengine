import * as THREE from 'three';
import { ModelLoader } from './ModelLoader';

export interface CharacterModel {
  mesh: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
}

/**
 * Loads a character model with normalized scale, shadow casting,
 * and named animation clips assembled from multiple files.
 */
export class CharacterLoader {
  constructor(private models: ModelLoader) {}

  async load(
    baseUrl: string,
    animationPaths: Record<string, string> = {},
    targetHeight: number = 1.5,
  ): Promise<CharacterModel> {
    const result = await this.models.loadAnimatedModel(baseUrl);
    const mesh = this.normalizeModel(result.scene, targetHeight);

    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
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
          console.log(`[CharacterLoader] Loaded animation "${name}" from ${path}`);
        }
      } catch (e) {
        console.warn(`[CharacterLoader] Failed to load animation "${name}" from ${path}`, e);
      }
    }

    return { mesh, clips };
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
    console.log(`[CharacterLoader] Normalized: height ${size.y.toFixed(1)} → ${targetHeight}`);
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
