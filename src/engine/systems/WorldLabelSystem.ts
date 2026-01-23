import * as THREE from 'three';
import { System, World } from '../ecs';
import { Position, WorldLabel } from '../components';

/**
 * System that renders WorldLabel components as Three.js sprites.
 * Creates canvas-based text textures and positions them above entities.
 */
export class WorldLabelSystem extends System {
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    super();
    this.scene = scene;
    this.camera = camera;
  }

  /**
   * Update camera reference (needed if camera changes)
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  update(world: World, _delta: number): void {
    if (!this.camera || !this.scene) return;

    const entities = world.query<[WorldLabel, Position]>(WorldLabel, Position);

    // Get camera world position once
    const cameraPos = new THREE.Vector3();
    this.camera.getWorldPosition(cameraPos);

    for (const { components: [label, position] } of entities) {
      try {
        // Create sprite if it doesn't exist
        if (!label.sprite) {
          label.sprite = this.createTextSprite(label.text, label.fontSize, label.color);
          this.scene.add(label.sprite);
        }

        // Update sprite position (above entity)
        label.sprite.position.set(
          position.x,
          position.y + label.offsetY,
          position.z
        );

        // Update visibility
        label.sprite.visible = label.visible;

        // Scale based on distance for consistent readability
        const distance = label.sprite.position.distanceTo(cameraPos);
        const scale = Math.max(0.5, Math.min(2, distance * 0.15));
        label.sprite.scale.set(scale, scale * 0.5, 1);
      } catch (err) {
        console.error('WorldLabelSystem error:', err);
      }
    }
  }

  /**
   * Create a sprite with canvas-rendered text
   */
  private createTextSprite(text: string, fontSize: number, color: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;

    // Configure font
    const font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    context.font = font;

    // Measure text
    const metrics = context.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.2;

    // Size canvas with padding
    const padding = 16;
    canvas.width = textWidth + padding * 2;
    canvas.height = textHeight + padding * 2;

    // Re-set font after resize (canvas reset clears it)
    context.font = font;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Draw background (semi-transparent dark)
    context.fillStyle = 'rgba(0, 0, 0, 0.6)';
    const radius = 8;
    this.roundRect(context, 0, 0, canvas.width, canvas.height, radius);
    context.fill();

    // Draw text
    context.fillStyle = color;
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    // Create texture and sprite
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false, // Always render on top
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);

    // Disable raycasting on label sprites - they shouldn't be hit by
    // the occlusion system or click detection
    sprite.raycast = () => {};

    // Set initial scale based on canvas aspect ratio
    const aspectRatio = canvas.width / canvas.height;
    sprite.scale.set(aspectRatio, 1, 1);

    return sprite;
  }

  /**
   * Helper to draw rounded rectangle
   */
  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * Clean up sprite when entity is removed
   */
  onEntityRemoved(world: World, entityId: number): void {
    const label = world.getComponent<WorldLabel>(entityId, WorldLabel);
    if (label?.sprite) {
      this.scene.remove(label.sprite);
      label.sprite.material.map?.dispose();
      (label.sprite.material as THREE.SpriteMaterial).dispose();
    }
  }
}
