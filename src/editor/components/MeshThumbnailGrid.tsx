/**
 * MeshThumbnailGrid - Shows a grid of mesh previews for selection
 */

import { useEffect, useState, useRef } from 'react';
import { SimpleGrid, Paper, Text, Loader, Stack, Badge, ScrollArea } from '@mantine/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

interface MeshThumbnail {
  name: string;
  type: 'mesh' | 'material';
  dataUrl: string;
}

interface MeshThumbnailGridProps {
  geometryPath: string;
  existingMeshes?: string[];
  onSelectMesh: (meshName: string) => void;
}

// Shared renderer for generating thumbnails
let sharedRenderer: THREE.WebGLRenderer | null = null;

function getSharedRenderer(): THREE.WebGLRenderer {
  if (!sharedRenderer) {
    sharedRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    sharedRenderer.setSize(128, 128);
    sharedRenderer.setPixelRatio(1);
  }
  return sharedRenderer;
}

async function generateMeshThumbnail(mesh: THREE.Mesh): Promise<string> {
  const renderer = getSharedRenderer();

  // Create a temporary scene with just this mesh
  const tempScene = new THREE.Scene();
  tempScene.background = new THREE.Color(0x1e1e2e);

  // Clone the mesh to avoid modifying the original
  const clone = mesh.clone();

  // Reset transform to center it
  clone.position.set(0, 0, 0);
  clone.rotation.set(0, 0, 0);
  clone.scale.set(1, 1, 1);

  // Calculate bounding box and center/scale
  const box = new THREE.Box3().setFromObject(clone);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  if (maxDim > 0) {
    const scale = 2 / maxDim;
    clone.scale.setScalar(scale);
    clone.position.sub(center.multiplyScalar(scale));
  }

  tempScene.add(clone);

  // Add lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  tempScene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(2, 3, 2);
  tempScene.add(dirLight);

  // Camera
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(3, 2, 3);
  camera.lookAt(0, 0, 0);

  // Render
  renderer.render(tempScene, camera);

  // Get data URL
  const dataUrl = renderer.domElement.toDataURL('image/png');

  // Cleanup
  tempScene.remove(clone);
  clone.geometry?.dispose();

  return dataUrl;
}

export function MeshThumbnailGrid({
  geometryPath,
  existingMeshes = [],
  onSelectMesh,
}: MeshThumbnailGridProps) {
  const [thumbnails, setThumbnails] = useState<MeshThumbnail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!geometryPath || loadedRef.current) return;
    loadedRef.current = true;

    const loader = new GLTFLoader();
    const url = `/regions/${geometryPath}/geometry.glb`;

    console.log('[MeshThumbnailGrid] Loading:', url);
    setLoading(true);

    loader.load(
      url,
      async (gltf) => {
        console.log('[MeshThumbnailGrid] GLB loaded, finding emissive meshes...');

        const emissiveMeshes: THREE.Mesh[] = [];

        gltf.scene.traverse((object) => {
          if (!(object as THREE.Mesh).isMesh) return;
          const mesh = object as THREE.Mesh;
          if (!mesh.name) return;

          // Check for emissive material
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const hasEmissive = materials.some((mat) => {
            if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
              const stdMat = mat as THREE.MeshStandardMaterial;
              return stdMat.emissive &&
                (stdMat.emissive.r > 0 || stdMat.emissive.g > 0 || stdMat.emissive.b > 0);
            }
            return false;
          });

          if (hasEmissive) {
            emissiveMeshes.push(mesh);
          }
        });

        console.log(`[MeshThumbnailGrid] Found ${emissiveMeshes.length} emissive meshes`);

        if (emissiveMeshes.length === 0) {
          setThumbnails([]);
          setLoading(false);
          return;
        }

        // Generate thumbnails for each mesh
        const thumbs: MeshThumbnail[] = [];

        for (const mesh of emissiveMeshes) {
          try {
            const dataUrl = await generateMeshThumbnail(mesh);
            thumbs.push({
              name: mesh.name,
              type: 'mesh',
              dataUrl,
            });
          } catch (err) {
            console.error(`[MeshThumbnailGrid] Failed to generate thumbnail for ${mesh.name}:`, err);
          }
        }

        console.log(`[MeshThumbnailGrid] Generated ${thumbs.length} thumbnails`);
        setThumbnails(thumbs);
        setLoading(false);
      },
      undefined,
      (err) => {
        console.error('[MeshThumbnailGrid] Failed to load:', err);
        setError('Failed to load geometry');
        setLoading(false);
      }
    );

    return () => {
      loadedRef.current = false;
    };
  }, [geometryPath]);

  if (loading) {
    return (
      <Paper p="md" radius="sm" style={{ background: '#1e1e2e', border: '1px solid #45475a' }}>
        <Stack align="center" gap="xs">
          <Loader size="sm" />
          <Text size="xs" c="dimmed">Generating mesh previews...</Text>
        </Stack>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper p="md" radius="sm" style={{ background: '#1e1e2e', border: '1px solid #45475a' }}>
        <Text size="xs" c="red">{error}</Text>
      </Paper>
    );
  }

  if (thumbnails.length === 0) {
    return (
      <Paper p="md" radius="sm" style={{ background: '#1e1e2e', border: '1px solid #45475a' }}>
        <Text size="xs" c="dimmed">No emissive meshes found</Text>
      </Paper>
    );
  }

  return (
    <Paper p="sm" radius="sm" style={{ background: '#1e1e2e', border: '1px solid #45475a' }}>
      <Text size="xs" c="dimmed" mb="xs">
        Click to add animation ({thumbnails.length} emissive mesh{thumbnails.length !== 1 ? 'es' : ''})
      </Text>
      <ScrollArea.Autosize mah={300} offsetScrollbars>
        <SimpleGrid cols={6} spacing="xs">
          {thumbnails.map((thumb) => {
            const isSelected = existingMeshes.includes(thumb.name);
            return (
              <Paper
                key={thumb.name}
                p={4}
                radius="sm"
                style={{
                  background: isSelected ? '#313244' : '#181825',
                  border: isSelected ? '2px solid #89b4fa' : '1px solid #313244',
                  cursor: isSelected ? 'default' : 'pointer',
                  opacity: isSelected ? 0.6 : 1,
                  textAlign: 'center',
                }}
                onClick={() => {
                  if (!isSelected) {
                    onSelectMesh(thumb.name);
                  }
                }}
              >
                <img
                  src={thumb.dataUrl}
                  alt={thumb.name}
                  style={{
                    width: '100%',
                    height: 64,
                    objectFit: 'contain',
                    borderRadius: 4,
                  }}
                />
                <Text size="xs" truncate mt={4} title={thumb.name}>
                  {thumb.name.length > 12 ? thumb.name.slice(0, 10) + '...' : thumb.name}
                </Text>
                {isSelected && (
                  <Badge size="xs" color="blue" variant="light" mt={2}>
                    Added
                  </Badge>
                )}
              </Paper>
            );
          })}
        </SimpleGrid>
      </ScrollArea.Autosize>
    </Paper>
  );
}
