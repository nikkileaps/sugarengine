/**
 * VFXPanel - Editor panel for VFX definitions
 */

import { useState, ReactNode, useEffect, useRef } from 'react';
import {
  Stack,
  TextInput,
  ScrollArea,
  Text,
  Group,
  Badge,
  ActionIcon,
  Tooltip,
  Slider,
  Select,
  Button,
  Paper,
  ColorInput,
  NumberInput,
  Switch,
} from '@mantine/core';
import * as THREE from 'three';
import { useEditorStore } from '../../store';
import { generateUUID, shortId } from '../../utils';
import { VFXManager, BUILTIN_PRESETS } from '../../../engine/vfx';
import type { VFXDefinition, ParticleGeometry, BlendMode } from '../../../engine/vfx';

export interface VFXData extends VFXDefinition {}

export interface VFXPanelResult {
  list: ReactNode;
  content: ReactNode;
  inspector: ReactNode;
}

interface VFXPanelProps {
  vfxDefinitions: VFXData[];
  onVFXDefinitionsChange: (definitions: VFXData[]) => void;
  children: (result: VFXPanelResult) => ReactNode;
}

const GEOMETRY_OPTIONS: { value: ParticleGeometry; label: string }[] = [
  { value: 'point', label: 'Point (Round)' },
  { value: 'sparkle', label: 'Sparkle (Starburst)' },
  { value: 'spark', label: 'Spark (Soft Circle)' },
  { value: 'cube', label: 'Cube' },
  { value: 'shard', label: 'Shard' },
];

const BLEND_MODE_OPTIONS: { value: BlendMode; label: string }[] = [
  { value: 'additive', label: 'Additive (Glow)' },
  { value: 'normal', label: 'Normal' },
];

const PRESET_ICONS: Record<string, string> = {
  'builtin-flame': '🔥',
  'builtin-sparkle': '✨',
  'builtin-magic-burst': '💫',
};

export function VFXPanel({
  vfxDefinitions,
  onVFXDefinitionsChange,
  children,
}: VFXPanelProps) {
  const [selectedVFXId, setSelectedVFXId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const setDirty = useEditorStore((s) => s.setDirty);

  const selectedVFX = selectedVFXId
    ? vfxDefinitions.find((v) => v.id === selectedVFXId)
    : null;

  const handleCreateVFX = (preset?: VFXDefinition) => {
    const id = generateUUID();
    const base = preset || BUILTIN_PRESETS[0]!;
    const newVFX: VFXData = {
      ...base,
      id,
      name: preset ? `${preset.name} Copy` : 'New Effect',
    };
    onVFXDefinitionsChange([...vfxDefinitions, newVFX]);
    setSelectedVFXId(id);
    setDirty(true);
  };

  const handleUpdateVFX = (updated: VFXData) => {
    onVFXDefinitionsChange(
      vfxDefinitions.map((v) => (v.id === updated.id ? updated : v))
    );
    setDirty(true);
  };

  const handleDeleteVFX = (id: string) => {
    onVFXDefinitionsChange(vfxDefinitions.filter((v) => v.id !== id));
    if (selectedVFXId === id) setSelectedVFXId(null);
    setDirty(true);
  };

  const filteredVFX = vfxDefinitions.filter(
    (v) =>
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.geometry.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const result: VFXPanelResult = {
    // List panel (left)
    list: (
      <Stack gap="xs" h="100%">
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            VFX Definitions ({vfxDefinitions.length})
          </Text>
          <Tooltip label="Create VFX">
            <ActionIcon variant="subtle" onClick={() => handleCreateVFX()}>
              +
            </ActionIcon>
          </Tooltip>
        </Group>

        <TextInput
          placeholder="Search..."
          size="xs"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
        />

        {/* Preset buttons */}
        <Group gap="xs">
          {BUILTIN_PRESETS.map((preset) => (
            <Tooltip key={preset.id} label={`Create from ${preset.name}`}>
              <ActionIcon
                variant="light"
                size="sm"
                onClick={() => handleCreateVFX(preset)}
              >
                {PRESET_ICONS[preset.id] || '✨'}
              </ActionIcon>
            </Tooltip>
          ))}
        </Group>

        <ScrollArea style={{ flex: 1 }}>
          <Stack gap={4}>
            {filteredVFX.map((vfx) => (
              <Group
                key={vfx.id}
                p="xs"
                gap="xs"
                style={{
                  background:
                    selectedVFXId === vfx.id
                      ? 'var(--mantine-color-dark-6)'
                      : undefined,
                  borderRadius: 'var(--mantine-radius-sm)',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedVFXId(vfx.id)}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 4,
                    background: vfx.color,
                    boxShadow: vfx.blendMode === 'additive' ? `0 0 8px ${vfx.color}` : undefined,
                  }}
                />
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>
                    {vfx.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {vfx.geometry} · {shortId(vfx.id)}
                  </Text>
                </Stack>
                <Badge size="xs" variant="light" color={vfx.loop ? 'blue' : 'orange'}>
                  {vfx.loop ? 'Loop' : 'Once'}
                </Badge>
              </Group>
            ))}
            {filteredVFX.length === 0 && (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No VFX yet. Click + or a preset to create one.
              </Text>
            )}
          </Stack>
        </ScrollArea>
      </Stack>
    ),

    // Content panel (center)
    content: selectedVFX ? (
      <VFXDetail
        vfx={selectedVFX}
        onChange={handleUpdateVFX}
        onDelete={() => handleDeleteVFX(selectedVFX.id)}
      />
    ) : (
      <EmptyState />
    ),

    // Inspector panel (right) - Preview
    inspector: selectedVFX ? <VFXPreview vfx={selectedVFX} /> : null,
  };

  return <>{children(result)}</>;
}

// ============================================
// Detail Editor
// ============================================

const EFFECT_TYPE_OPTIONS = [
  { value: 'flame', label: 'Flame / Smoke', description: 'Particles emit, move, and fade' },
  { value: 'sparkle', label: 'Sparkle', description: 'Stationary twinkling particles' },
];

function VFXDetail({
  vfx,
  onChange,
  onDelete,
}: {
  vfx: VFXData;
  onChange: (v: VFXData) => void;
  onDelete: () => void;
}) {
  const isSparkle = vfx.geometry === 'sparkle';

  const handleEffectTypeChange = (type: string | null) => {
    if (type === 'sparkle') {
      // Switch to sparkle with appropriate defaults
      onChange({
        ...vfx,
        geometry: 'sparkle',
        speed: [0, 0],
        gravity: 0,
        spread: 360,
        sizeOverLife: 1.0,
      });
    } else {
      // Switch to flame with appropriate defaults
      onChange({
        ...vfx,
        geometry: 'spark',
        speed: [0.8, 1.5],
        gravity: -0.4,
        spread: 25,
        sizeOverLife: 0.3,
        direction: { x: 0, y: 1, z: 0 },
      });
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 60px)', overflow: 'auto', padding: 'var(--mantine-spacing-md)' }}>
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="xs">
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: vfx.color,
                boxShadow: vfx.blendMode === 'additive' ? `0 0 12px ${vfx.color}` : undefined,
              }}
            />
            <Text size="xl" fw={600}>
              {vfx.name}
            </Text>
          </Group>
          <Button variant="subtle" color="red" size="xs" onClick={onDelete}>
            Delete
          </Button>
        </Group>

        <TextInput
          label="Name"
          value={vfx.name}
          onChange={(e) => onChange({ ...vfx, name: e.currentTarget.value })}
        />

        {/* Effect Type - Primary Choice */}
        <Paper p="md" withBorder style={{ background: '#252536' }}>
          <Stack gap="md">
            <Text fw={500}>Effect Type</Text>
            <Select
              label="Type"
              description="Determines particle behavior"
              data={EFFECT_TYPE_OPTIONS}
              value={isSparkle ? 'sparkle' : 'flame'}
              onChange={handleEffectTypeChange}
            />
          </Stack>
        </Paper>

        {/* SPARKLE-SPECIFIC SETTINGS */}
        {isSparkle ? (
          <>
            {/* Sparkle Appearance */}
            <Paper p="md" withBorder>
              <Stack gap="md">
                <Text fw={500}>Sparkle Appearance</Text>

                <ColorInput
                  label="Color"
                  description="Sparkle color (stays constant)"
                  value={vfx.color}
                  onChange={(v) => onChange({ ...vfx, color: v, colorEnd: v })}
                />

                <Group grow>
                  <NumberInput
                    label="Size Min"
                    description="Smallest sparkle"
                    value={vfx.size[0]}
                    onChange={(v) => onChange({ ...vfx, size: [Number(v) || 0.01, vfx.size[1]] })}
                    min={0.01}
                    max={0.5}
                    step={0.01}
                    decimalScale={2}
                  />
                  <NumberInput
                    label="Size Max"
                    description="Largest sparkle"
                    value={vfx.size[1]}
                    onChange={(v) => onChange({ ...vfx, size: [vfx.size[0], Number(v) || 0.01] })}
                    min={0.01}
                    max={0.5}
                    step={0.01}
                    decimalScale={2}
                  />
                </Group>
              </Stack>
            </Paper>

            {/* Sparkle Spawning */}
            <Paper p="md" withBorder>
              <Stack gap="md">
                <Text fw={500}>Spawning</Text>

                <NumberInput
                  label="Spawn Rate"
                  description="New sparkles per second"
                  value={vfx.emissionRate}
                  onChange={(v) => onChange({ ...vfx, emissionRate: Number(v) || 1 })}
                  min={1}
                  max={50}
                />

                <NumberInput
                  label="Max Sparkles"
                  description="Maximum visible at once"
                  value={vfx.maxParticles}
                  onChange={(v) => onChange({ ...vfx, maxParticles: Number(v) || 10 })}
                  min={5}
                  max={200}
                  step={5}
                />

                <Group grow>
                  <NumberInput
                    label="Lifetime Min"
                    description="Shortest twinkle duration"
                    value={vfx.lifetime[0]}
                    onChange={(v) => onChange({ ...vfx, lifetime: [Number(v) || 0.5, vfx.lifetime[1]] })}
                    min={0.3}
                    max={5}
                    step={0.1}
                    decimalScale={1}
                  />
                  <NumberInput
                    label="Lifetime Max"
                    description="Longest twinkle duration"
                    value={vfx.lifetime[1]}
                    onChange={(v) => onChange({ ...vfx, lifetime: [vfx.lifetime[0], Number(v) || 0.5] })}
                    min={0.3}
                    max={5}
                    step={0.1}
                    decimalScale={1}
                  />
                </Group>

                <Switch
                  label="Loop"
                  description="Continuously spawn new sparkles"
                  checked={vfx.loop}
                  onChange={(e) => onChange({ ...vfx, loop: e.currentTarget.checked })}
                />
              </Stack>
            </Paper>
          </>
        ) : (
          <>
            {/* FLAME-SPECIFIC SETTINGS */}

            {/* Flame Appearance */}
            <Paper p="md" withBorder>
              <Stack gap="md">
                <Text fw={500}>Appearance</Text>

                <Select
                  label="Particle Shape"
                  data={GEOMETRY_OPTIONS.filter(g => g.value !== 'sparkle')}
                  value={vfx.geometry}
                  onChange={(v) => onChange({ ...vfx, geometry: (v as ParticleGeometry) || 'spark' })}
                />

                <Group grow>
                  <ColorInput
                    label="Start Color"
                    value={vfx.color}
                    onChange={(v) => onChange({ ...vfx, color: v })}
                  />
                  <ColorInput
                    label="End Color"
                    description="Fades to this color"
                    value={vfx.colorEnd || vfx.color}
                    onChange={(v) => onChange({ ...vfx, colorEnd: v })}
                  />
                </Group>

                <Select
                  label="Blend Mode"
                  data={BLEND_MODE_OPTIONS}
                  value={vfx.blendMode}
                  onChange={(v) => onChange({ ...vfx, blendMode: (v as BlendMode) || 'additive' })}
                />

                <Stack gap={4}>
                  <Text size="sm">Opacity: {(vfx.opacity ?? 1).toFixed(2)}</Text>
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={vfx.opacity ?? 1}
                    onChange={(v) => onChange({ ...vfx, opacity: v })}
                  />
                </Stack>
              </Stack>
            </Paper>

            {/* Flame Emission */}
            <Paper p="md" withBorder>
              <Stack gap="md">
                <Text fw={500}>Emission</Text>

                <NumberInput
                  label="Emission Rate"
                  description="Particles per second"
                  value={vfx.emissionRate}
                  onChange={(v) => onChange({ ...vfx, emissionRate: Number(v) || 0 })}
                  min={0}
                  max={200}
                />

                <NumberInput
                  label="Max Particles"
                  description="Pool size"
                  value={vfx.maxParticles}
                  onChange={(v) => onChange({ ...vfx, maxParticles: Number(v) || 10 })}
                  min={10}
                  max={1000}
                  step={10}
                />

                <Switch
                  label="Loop"
                  checked={vfx.loop}
                  onChange={(e) => onChange({ ...vfx, loop: e.currentTarget.checked })}
                />

                {!vfx.loop && (
                  <NumberInput
                    label="Duration"
                    value={vfx.duration ?? 1}
                    onChange={(v) => onChange({ ...vfx, duration: Number(v) || 1 })}
                    min={0.1}
                    max={10}
                    step={0.1}
                    decimalScale={1}
                  />
                )}
              </Stack>
            </Paper>

            {/* Flame Particle Properties */}
            <Paper p="md" withBorder>
              <Stack gap="md">
                <Text fw={500}>Particle Properties</Text>

                <Group grow>
                  <NumberInput
                    label="Lifetime Min"
                    value={vfx.lifetime[0]}
                    onChange={(v) => onChange({ ...vfx, lifetime: [Number(v) || 0.1, vfx.lifetime[1]] })}
                    min={0.1}
                    max={10}
                    step={0.1}
                    decimalScale={1}
                  />
                  <NumberInput
                    label="Lifetime Max"
                    value={vfx.lifetime[1]}
                    onChange={(v) => onChange({ ...vfx, lifetime: [vfx.lifetime[0], Number(v) || 0.1] })}
                    min={0.1}
                    max={10}
                    step={0.1}
                    decimalScale={1}
                  />
                </Group>

                <Group grow>
                  <NumberInput
                    label="Size Min"
                    value={vfx.size[0]}
                    onChange={(v) => onChange({ ...vfx, size: [Number(v) || 0.01, vfx.size[1]] })}
                    min={0.01}
                    max={2}
                    step={0.01}
                    decimalScale={2}
                  />
                  <NumberInput
                    label="Size Max"
                    value={vfx.size[1]}
                    onChange={(v) => onChange({ ...vfx, size: [vfx.size[0], Number(v) || 0.01] })}
                    min={0.01}
                    max={2}
                    step={0.01}
                    decimalScale={2}
                  />
                </Group>

                <Stack gap={4}>
                  <Text size="sm">Size Over Life: {(vfx.sizeOverLife ?? 1).toFixed(2)}</Text>
                  <Slider
                    min={0}
                    max={2}
                    step={0.1}
                    value={vfx.sizeOverLife ?? 1}
                    onChange={(v) => onChange({ ...vfx, sizeOverLife: v })}
                  />
                </Stack>

                <Group grow>
                  <NumberInput
                    label="Speed Min"
                    value={vfx.speed[0]}
                    onChange={(v) => onChange({ ...vfx, speed: [Number(v) || 0, vfx.speed[1]] })}
                    min={0}
                    max={10}
                    step={0.1}
                    decimalScale={1}
                  />
                  <NumberInput
                    label="Speed Max"
                    value={vfx.speed[1]}
                    onChange={(v) => onChange({ ...vfx, speed: [vfx.speed[0], Number(v) || 0] })}
                    min={0}
                    max={10}
                    step={0.1}
                    decimalScale={1}
                  />
                </Group>
              </Stack>
            </Paper>

            {/* Flame Movement */}
            <Paper p="md" withBorder>
              <Stack gap="md">
                <Text fw={500}>Movement</Text>

                <Group grow>
                  <NumberInput
                    label="Direction X"
                    value={vfx.direction.x}
                    onChange={(v) => onChange({ ...vfx, direction: { ...vfx.direction, x: Number(v) || 0 } })}
                    min={-1}
                    max={1}
                    step={0.1}
                    decimalScale={1}
                  />
                  <NumberInput
                    label="Direction Y"
                    value={vfx.direction.y}
                    onChange={(v) => onChange({ ...vfx, direction: { ...vfx.direction, y: Number(v) || 0 } })}
                    min={-1}
                    max={1}
                    step={0.1}
                    decimalScale={1}
                  />
                  <NumberInput
                    label="Direction Z"
                    value={vfx.direction.z}
                    onChange={(v) => onChange({ ...vfx, direction: { ...vfx.direction, z: Number(v) || 0 } })}
                    min={-1}
                    max={1}
                    step={0.1}
                    decimalScale={1}
                  />
                </Group>

                <Stack gap={4}>
                  <Text size="sm">Spread: {vfx.spread}°</Text>
                  <Slider
                    min={0}
                    max={180}
                    step={5}
                    value={vfx.spread}
                    onChange={(v) => onChange({ ...vfx, spread: v })}
                  />
                </Stack>

                <Stack gap={4}>
                  <Text size="sm">
                    Gravity: {vfx.gravity.toFixed(2)} ({vfx.gravity < 0 ? 'rise' : vfx.gravity > 0 ? 'fall' : 'none'})
                  </Text>
                  <Slider
                    min={-1}
                    max={1}
                    step={0.05}
                    value={vfx.gravity}
                    onChange={(v) => onChange({ ...vfx, gravity: v })}
                  />
                </Stack>
              </Stack>
            </Paper>
          </>
        )}
      </Stack>
    </div>
  );
}

// ============================================
// Preview Component
// ============================================

function VFXPreview({ vfx }: { vfx: VFXData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const managerRef = useRef<VFXManager | null>(null);
  const frameRef = useRef<number>(0);
  const clockRef = useRef<THREE.Clock | null>(null);
  const emitterIdRef = useRef<string | null>(null);

  // Setup scene once
  useEffect(() => {
    if (!containerRef.current) return;

    // Setup scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Setup camera - position to see particles at origin rising up
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0.5, 2.5);
    camera.lookAt(0, 0.5, 0);
    cameraRef.current = camera;

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(200, 200);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Ensure canvas has proper styles
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '200px';
    renderer.domElement.style.height = '200px';

    // Clear any existing children first (handles StrictMode remount)
    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }

    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Setup clock for consistent timing
    const clock = new THREE.Clock();
    clockRef.current = clock;

    // Setup VFX manager
    const manager = new VFXManager(scene);
    managerRef.current = manager;


    // Animation loop
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      manager.update(delta);
      renderer.render(scene, camera);

    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
      manager.dispose();
      renderer.dispose();
      scene.clear();
      if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update effect when VFX definition changes
  useEffect(() => {
    const manager = managerRef.current;
    const scene = sceneRef.current;
    if (!manager || !scene) return;

    // Remove old emitter if exists
    if (emitterIdRef.current) {
      manager.removeEmitter(emitterIdRef.current);
      emitterIdRef.current = null;
    }

    // Clear old definitions and register new one
    manager.clearDefinitions();
    manager.registerDefinition(vfx);

    // Create emitter at origin
    const emitter = manager.createEmitter(vfx.id, new THREE.Vector3(0, 0, 0), 1, true);
    if (emitter) {
      emitterIdRef.current = emitter.id;
    }
  }, [vfx]);

  return (
    <Stack gap="xs" p="xs">
      <Text size="sm" fw={500}>
        Preview
      </Text>
      <div
        ref={containerRef}
        style={{
          width: 200,
          height: 200,
          overflow: 'hidden',
          borderRadius: 8,
          border: '1px solid #313244',
          background: '#1a1a2e',
        }}
      />
      <Text size="xs" c="dimmed">
        Live preview of {vfx.name}
      </Text>
    </Stack>
  );
}

// ============================================
// Empty State
// ============================================

function EmptyState() {
  return (
    <Stack align="center" justify="center" h="100%" gap="md">
      <Text size="4rem">✨</Text>
      <Text c="dimmed">Select a VFX to edit or create a new one</Text>
    </Stack>
  );
}
