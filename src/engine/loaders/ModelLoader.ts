import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export interface AnimatedModel {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

export class ModelLoader {
  private gltfLoader: GLTFLoader;
  private fbxLoader: FBXLoader;
  private gltfCache: Map<string, GLTF> = new Map();
  private fbxCache: Map<string, THREE.Group> = new Map();

  constructor() {
    this.gltfLoader = new GLTFLoader();
    this.fbxLoader = new FBXLoader();
  }

  async load(url: string): Promise<THREE.Group> {
    // Check cache first
    const cached = this.gltfCache.get(url);
    if (cached) {
      return cached.scene.clone();
    }

    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf) => {
          this.gltfCache.set(url, gltf);
          resolve(gltf.scene.clone());
        },
        undefined,
        (error) => {
          console.error(`Failed to load model: ${url}`, error);
          reject(error);
        }
      );
    });
  }

  // Load and return the raw GLTF if you need animations, etc.
  async loadGLTF(url: string): Promise<GLTF> {
    const cached = this.gltfCache.get(url);
    if (cached) {
      return cached;
    }

    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf) => {
          this.gltfCache.set(url, gltf);
          resolve(gltf);
        },
        undefined,
        (error) => {
          console.error(`Failed to load GLTF: ${url}`, error);
          reject(error);
        }
      );
    });
  }

  async loadFBX(url: string): Promise<THREE.Group> {
    const cached = this.fbxCache.get(url);
    if (cached) {
      return cached.clone();
    }

    return new Promise((resolve, reject) => {
      this.fbxLoader.load(
        url,
        (group) => {
          this.fbxCache.set(url, group);
          resolve(group.clone());
        },
        undefined,
        (error) => {
          console.error(`Failed to load FBX: ${url}`, error);
          reject(error);
        }
      );
    });
  }

  /**
   * Load a model with its animations. Format-agnostic — detects by extension.
   * Returns the scene graph and any animation clips embedded in the file.
   */
  async loadAnimatedModel(url: string): Promise<AnimatedModel> {
    const ext = url.split('.').pop()?.toLowerCase();

    if (ext === 'fbx') {
      return this.loadAnimatedFBX(url);
    } else {
      return this.loadAnimatedGLTF(url);
    }
  }

  private async loadAnimatedGLTF(url: string): Promise<AnimatedModel> {
    const gltf = await this.loadGLTF(url);
    return {
      scene: gltf.scene.clone(),
      clips: gltf.animations ?? [],
    };
  }

  private async loadAnimatedFBX(url: string): Promise<AnimatedModel> {
    return new Promise((resolve, reject) => {
      this.fbxLoader.load(
        url,
        (group) => {
          // Return the original group directly — Object3D.clone() breaks SkinnedMesh skeleton bindings
          resolve({
            scene: group,
            clips: group.animations ?? [],
          });
        },
        undefined,
        (error) => {
          console.error(`Failed to load FBX: ${url}`, error);
          reject(error);
        }
      );
    });
  }
}
