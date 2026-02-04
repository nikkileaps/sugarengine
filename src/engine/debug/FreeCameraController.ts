/**
 * FreeCameraController - Debug tool for positioning cameras
 *
 * Press F2 to toggle free camera mode.
 * - WASD: Move horizontally
 * - Space/Shift: Move up/down
 * - Mouse drag: Look around
 * - Scroll: Adjust move speed
 * - F2 again: Print coordinates and exit
 */

import * as THREE from 'three';

export class FreeCameraController {
  private camera: THREE.Camera;
  private container: HTMLElement;
  private enabled = false;
  private moveSpeed = 0.5;

  // Input state
  private keys: Set<string> = new Set();
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Camera state
  private yaw = 0;    // Horizontal rotation (radians)
  private pitch = 0;  // Vertical rotation (radians)

  // Callbacks
  private onEnableCallback?: () => void;
  private onDisableCallback?: () => void;

  // Bound handlers
  private boundOnKeyDown: (e: KeyboardEvent) => void;
  private boundOnKeyUp: (e: KeyboardEvent) => void;
  private boundOnMouseDown: (e: MouseEvent) => void;
  private boundOnMouseMove: (e: MouseEvent) => void;
  private boundOnMouseUp: (e: MouseEvent) => void;
  private boundOnWheel: (e: WheelEvent) => void;
  private boundUpdate: () => void;

  // UI
  private overlay: HTMLDivElement | null = null;
  private animationFrameId: number | null = null;

  constructor(camera: THREE.Camera, container: HTMLElement) {
    this.camera = camera;
    this.container = container;

    // Bind handlers
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnKeyUp = this.onKeyUp.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundOnWheel = this.onWheel.bind(this);
    this.boundUpdate = this.update.bind(this);

    // Always listen for F2
    window.addEventListener('keydown', this.boundOnKeyDown);
  }

  onEnable(callback: () => void): void {
    this.onEnableCallback = callback;
  }

  onDisable(callback: () => void): void {
    this.onDisableCallback = callback;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private toggle(): void {
    if (this.enabled) {
      this.disable();
    } else {
      this.enable();
    }
  }

  private enable(): void {
    this.enabled = true;

    // Get current camera orientation
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = euler.y;
    this.pitch = euler.x;

    // Add listeners
    window.addEventListener('keyup', this.boundOnKeyUp);
    this.container.addEventListener('mousedown', this.boundOnMouseDown);
    window.addEventListener('mousemove', this.boundOnMouseMove);
    window.addEventListener('mouseup', this.boundOnMouseUp);
    this.container.addEventListener('wheel', this.boundOnWheel);

    // Show overlay
    this.showOverlay();

    // Start update loop
    this.animationFrameId = requestAnimationFrame(this.boundUpdate);

    this.onEnableCallback?.();

    console.log('[FreeCam] Enabled - WASD to move, mouse to look, Space/Shift for up/down, scroll for speed, F2 to exit');
  }

  private disable(): void {
    this.enabled = false;
    this.keys.clear();
    this.isDragging = false;

    // Remove listeners
    window.removeEventListener('keyup', this.boundOnKeyUp);
    this.container.removeEventListener('mousedown', this.boundOnMouseDown);
    window.removeEventListener('mousemove', this.boundOnMouseMove);
    window.removeEventListener('mouseup', this.boundOnMouseUp);
    this.container.removeEventListener('wheel', this.boundOnWheel);

    // Hide overlay
    this.hideOverlay();

    // Stop update loop
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Log position for copying
    this.logCameraPosition();

    this.onDisableCallback?.();
  }

  private logCameraPosition(): void {
    const pos = this.camera.position;

    // Calculate look-at point (50 units in front of camera)
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.camera.quaternion);
    const lookAt = pos.clone().add(forward.multiplyScalar(50));

    const configText = `titleScreen: {
  cameraPosition: { x: ${pos.x.toFixed(1)}, y: ${pos.y.toFixed(1)}, z: ${pos.z.toFixed(1)} },
  cameraLookAt: { x: ${lookAt.x.toFixed(1)}, y: ${lookAt.y.toFixed(1)}, z: ${lookAt.z.toFixed(1)} },
  hidePlayer: true,
  transitionDuration: 600,
},`;

    // Log to console
    console.log('\n========== CAMERA POSITION ==========');
    console.log('Copy this into your titleScreen config:\n');
    console.log(configText);
    console.log('======================================\n');

    // Show on screen for easy copying
    this.showResultOverlay(configText);
  }

  private showResultOverlay(configText: string): void {
    const resultOverlay = document.createElement('div');
    resultOverlay.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.95);
      color: #00ff00;
      padding: 24px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 14px;
      z-index: 10001;
      white-space: pre;
      border: 2px solid #00ff00;
      max-width: 90%;
    `;

    const title = document.createElement('div');
    title.textContent = 'CAMERA POSITION - Copy to preview.ts';
    title.style.cssText = 'margin-bottom: 16px; font-weight: bold; color: #ffff00;';

    const code = document.createElement('div');
    code.textContent = configText;
    code.style.cssText = 'background: #111; padding: 12px; border-radius: 4px; user-select: all; cursor: text;';

    const hint = document.createElement('div');
    hint.textContent = 'Click the code to select, then Cmd/Ctrl+C to copy. Click anywhere to close.';
    hint.style.cssText = 'margin-top: 16px; font-size: 12px; color: #888;';

    resultOverlay.appendChild(title);
    resultOverlay.appendChild(code);
    resultOverlay.appendChild(hint);

    // Click anywhere to close
    resultOverlay.addEventListener('click', (e) => {
      if (e.target === resultOverlay) {
        resultOverlay.remove();
      }
    });

    // Click outside to close
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
    `;
    backdrop.addEventListener('click', () => {
      backdrop.remove();
      resultOverlay.remove();
    });

    this.container.appendChild(backdrop);
    this.container.appendChild(resultOverlay);
  }

  private showOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: #00ff00;
      padding: 8px 16px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      z-index: 10000;
      pointer-events: none;
      white-space: pre;
    `;
    this.updateOverlayText();
    this.container.appendChild(this.overlay);
  }

  private hideOverlay(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  private updateOverlayText(): void {
    if (!this.overlay) return;
    const pos = this.camera.position;
    this.overlay.textContent =
      `FREE CAMERA MODE (F2 to exit)\n` +
      `WASD: move | Mouse: look | Space/Shift: up/down | Scroll: speed\n` +
      `Position: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}) | Speed: ${this.moveSpeed.toFixed(2)}`;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'F2') {
      e.preventDefault();
      this.toggle();
      return;
    }

    if (!this.enabled) return;

    this.keys.add(e.key.toLowerCase());
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (!this.enabled) return;
    this.keys.delete(e.key.toLowerCase());
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.enabled) return;
    if (e.button === 0) { // Left click
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      e.preventDefault();
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.enabled || !this.isDragging) return;

    const deltaX = e.clientX - this.lastMouseX;
    const deltaY = e.clientY - this.lastMouseY;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    // Rotate camera
    const sensitivity = 0.003;
    this.yaw -= deltaX * sensitivity;
    this.pitch -= deltaY * sensitivity;

    // Clamp pitch to avoid flipping
    this.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.pitch));

    // Apply rotation
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      this.isDragging = false;
    }
  }

  private onWheel(e: WheelEvent): void {
    if (!this.enabled) return;
    e.preventDefault();

    // Adjust speed
    if (e.deltaY > 0) {
      this.moveSpeed = Math.max(0.05, this.moveSpeed * 0.8);
    } else {
      this.moveSpeed = Math.min(5, this.moveSpeed * 1.25);
    }

    this.updateOverlayText();
  }

  private update(): void {
    if (!this.enabled) return;

    // Calculate movement direction
    const forward = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(1, 0, 0);

    forward.applyQuaternion(this.camera.quaternion);
    right.applyQuaternion(this.camera.quaternion);

    // Keep movement horizontal for WASD
    forward.y = 0;
    forward.normalize();
    right.y = 0;
    right.normalize();

    const movement = new THREE.Vector3();

    if (this.keys.has('w')) movement.add(forward);
    if (this.keys.has('s')) movement.sub(forward);
    if (this.keys.has('d')) movement.add(right);
    if (this.keys.has('a')) movement.sub(right);
    if (this.keys.has(' ')) movement.y += 1; // Space = up
    if (this.keys.has('shift')) movement.y -= 1; // Shift = down

    if (movement.length() > 0) {
      movement.normalize().multiplyScalar(this.moveSpeed);
      this.camera.position.add(movement);
      this.updateOverlayText();
    }

    this.animationFrameId = requestAnimationFrame(this.boundUpdate);
  }

  dispose(): void {
    if (this.enabled) {
      this.disable();
    }
    window.removeEventListener('keydown', this.boundOnKeyDown);
  }
}
