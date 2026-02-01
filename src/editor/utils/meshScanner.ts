/**
 * Utility to scan GLB files for mesh and material names
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface MeshInfo {
  name: string;
  type: 'mesh' | 'material';
  hasEmissive: boolean;
}

const loader = new GLTFLoader();
const cache = new Map<string, MeshInfo[]>();

/**
 * Scan a GLB file and return all mesh and material names
 */
export async function scanGLBForMeshes(geometryPath: string): Promise<MeshInfo[]> {
  const url = `/regions/${geometryPath}/geometry.glb`;
  console.log(`[MeshScanner] Scanning: ${url}`);

  // Check cache
  if (cache.has(url)) {
    console.log(`[MeshScanner] Using cached result: ${cache.get(url)!.length} meshes`);
    return cache.get(url)!;
  }

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        console.log(`[MeshScanner] GLB loaded successfully`);
        const meshes: MeshInfo[] = [];
        const seenNames = new Set<string>();

        gltf.scene.traverse((object) => {
          // Add mesh names - check for Mesh type more broadly
          if ((object as THREE.Mesh).isMesh) {
            const mesh = object as THREE.Mesh;
            const meshName = mesh.name || '';

            if (meshName && !seenNames.has(meshName)) {
              seenNames.add(meshName);

              // Check if any material has emissive
              const materials = Array.isArray(mesh.material)
                ? mesh.material
                : [mesh.material];

              const hasEmissive = materials.some((mat) => {
                if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                  const stdMat = mat as THREE.MeshStandardMaterial;
                  return stdMat.emissive && (stdMat.emissive.r > 0 || stdMat.emissive.g > 0 || stdMat.emissive.b > 0);
                }
                return false;
              });

              meshes.push({
                name: meshName,
                type: 'mesh',
                hasEmissive,
              });

              // Also add material names
              for (const mat of materials) {
                if (mat && mat.name && !seenNames.has(mat.name)) {
                  seenNames.add(mat.name);
                  const matHasEmissive = (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial &&
                    (mat as THREE.MeshStandardMaterial).emissive &&
                    ((mat as THREE.MeshStandardMaterial).emissive.r > 0 ||
                     (mat as THREE.MeshStandardMaterial).emissive.g > 0 ||
                     (mat as THREE.MeshStandardMaterial).emissive.b > 0);
                  meshes.push({
                    name: mat.name,
                    type: 'material',
                    hasEmissive: matHasEmissive,
                  });
                }
              }
            }
          }
        });

        console.log(`[MeshScanner] Found ${meshes.length} meshes/materials before filtering`);

        // Filter out any entries with empty/undefined names
        const validMeshes = meshes.filter((m) => m.name && m.name.trim() !== '');

        // Sort: emissive first, then alphabetically
        validMeshes.sort((a, b) => {
          if (a.hasEmissive !== b.hasEmissive) {
            return a.hasEmissive ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

        console.log(`[MeshScanner] Final result: ${validMeshes.length} valid meshes/materials`);
        if (validMeshes.length > 0) {
          console.log(`[MeshScanner] First few:`, validMeshes.slice(0, 5).map(m => m.name));
        }

        cache.set(url, validMeshes);
        resolve(validMeshes);
      },
      (progress) => {
        if (progress.total > 0) {
          console.log(`[MeshScanner] Loading: ${Math.round((progress.loaded / progress.total) * 100)}%`);
        }
      },
      (error) => {
        console.error(`[MeshScanner] Failed to load GLB: ${url}`, error);
        reject(new Error(`Failed to load geometry: ${geometryPath}`));
      }
    );
  });
}

/**
 * Clear the mesh scanner cache
 */
export function clearMeshScannerCache(): void {
  cache.clear();
}
