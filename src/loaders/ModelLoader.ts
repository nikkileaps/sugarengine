import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';

export class ModelLoader {
  private loader: GLTFLoader;
  private cache: Map<string, GLTF> = new Map();

  constructor() {
    this.loader = new GLTFLoader();
  }

  async load(url: string): Promise<THREE.Group> {
    // Check cache first
    const cached = this.cache.get(url);
    if (cached) {
      return cached.scene.clone();
    }

    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          this.cache.set(url, gltf);
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
    const cached = this.cache.get(url);
    if (cached) {
      return cached;
    }

    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          this.cache.set(url, gltf);
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
}
