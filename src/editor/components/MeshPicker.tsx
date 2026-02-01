/**
 * MeshPicker - 3D viewport for visually selecting meshes from a GLB
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Box, Text, Badge, Group, Loader, Paper } from '@mantine/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

interface MeshPickerProps {
  geometryPath: string;
  onSelectMesh: (meshName: string) => void;
  existingMeshes?: string[]; // Already added meshes (shown differently)
  height?: number;
}

export function MeshPicker({
  geometryPath,
  onSelectMesh,
  existingMeshes = [],
  height = 300,
}: MeshPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    meshes: THREE.Mesh[];
    hoveredMesh: THREE.Mesh | null;
    originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [meshCount, setMeshCount] = useState(0);

  // Highlight material for hover
  const highlightMaterial = useRef(
    new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.7 })
  );
  const selectedMaterial = useRef(
    new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.5 })
  );

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const h = height;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1e2e);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / h, 0.1, 1000);
    camera.position.set(10, 10, 10);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    // Raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      raycaster,
      mouse,
      meshes: [],
      hoveredMesh: null,
      originalMaterials: new Map(),
    };

    // Animation loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, [height]);

  // Load geometry
  useEffect(() => {
    if (!sceneRef.current || !geometryPath) return;

    const { scene, camera, controls, originalMaterials } = sceneRef.current;

    // Clear previous geometry
    const toRemove: THREE.Object3D[] = [];
    scene.traverse((child) => {
      if (child.userData.isLoadedGeometry) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((obj) => scene.remove(obj));
    sceneRef.current.meshes = [];
    originalMaterials.clear();

    setLoading(true);
    setError(null);

    const loader = new GLTFLoader();
    const url = `/regions/${geometryPath}/geometry.glb`;

    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene;
        model.userData.isLoadedGeometry = true;

        // Collect all meshes and store original materials
        const meshes: THREE.Mesh[] = [];
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            meshes.push(mesh);
            originalMaterials.set(mesh, mesh.material);

            // Mark already-selected meshes
            if (existingMeshes.includes(mesh.name)) {
              mesh.userData.isSelected = true;
            }
          }
        });

        sceneRef.current!.meshes = meshes;
        setMeshCount(meshes.length);

        // Center and scale model
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 10 / maxDim;

        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));

        scene.add(model);

        // Position camera to see the whole model
        const distance = 15;
        camera.position.set(distance, distance * 0.8, distance);
        controls.target.set(0, 0, 0);
        controls.update();

        setLoading(false);
      },
      undefined,
      (err) => {
        console.error('[MeshPicker] Failed to load:', err);
        setError(`Failed to load geometry: ${geometryPath}`);
        setLoading(false);
      }
    );
  }, [geometryPath, existingMeshes]);

  // Mouse move handler for hover highlighting
  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!sceneRef.current || !containerRef.current) return;

    const { raycaster, mouse, camera, meshes, hoveredMesh, originalMaterials } = sceneRef.current;
    const rect = containerRef.current.getBoundingClientRect();

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(meshes, false);

    // Restore previous hovered mesh material
    if (hoveredMesh && !hoveredMesh.userData.isSelected) {
      const originalMat = originalMaterials.get(hoveredMesh);
      if (originalMat) hoveredMesh.material = originalMat;
    }

    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh;
      if (mesh.name) {
        setHoveredName(mesh.name);
        sceneRef.current.hoveredMesh = mesh;

        // Apply highlight material (unless already selected)
        if (!mesh.userData.isSelected) {
          mesh.material = highlightMaterial.current;
        }
      }
    } else {
      setHoveredName(null);
      sceneRef.current.hoveredMesh = null;
    }
  }, []);

  // Click handler
  const handleClick = useCallback(() => {
    if (!sceneRef.current) return;

    const { hoveredMesh } = sceneRef.current;
    if (hoveredMesh && hoveredMesh.name) {
      // Check if already selected
      if (existingMeshes.includes(hoveredMesh.name)) {
        return; // Already added
      }
      onSelectMesh(hoveredMesh.name);

      // Mark as selected
      hoveredMesh.userData.isSelected = true;
      hoveredMesh.material = selectedMaterial.current;
    }
  }, [onSelectMesh, existingMeshes]);

  return (
    <Paper
      radius="sm"
      style={{
        background: '#181825',
        border: '1px solid #45475a',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Group p="xs" justify="space-between" style={{ borderBottom: '1px solid #313244' }}>
        <Text size="xs" fw={500}>
          Click a mesh to add animation
        </Text>
        <Group gap="xs">
          {loading && <Loader size="xs" />}
          {!loading && <Badge size="xs" variant="light">{meshCount} meshes</Badge>}
          {hoveredName && (
            <Badge size="xs" color="green" variant="filled">
              {hoveredName}
            </Badge>
          )}
        </Group>
      </Group>

      {/* 3D Viewport */}
      <Box
        ref={containerRef}
        style={{
          width: '100%',
          height,
          cursor: hoveredName ? 'pointer' : 'grab',
        }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />

      {/* Error message */}
      {error && (
        <Text size="xs" c="red" p="xs">
          {error}
        </Text>
      )}
    </Paper>
  );
}
