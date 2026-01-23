import * as THREE from 'three';

export interface GameCameraConfig {
  fov: number;
  pitchMin: number;
  pitchMax: number;
  pitchDefault: number;
  distanceMin: number;
  distanceMax: number;
  distanceDefault: number;
  followStrength: number;
  rotationSpeed: number;
  snapToCardinal: boolean;
  snapThreshold: number;
  autoFollow: boolean;          // Camera rotates to stay behind player movement
  autoFollowStrength: number;   // How fast camera swings behind (lower = smoother)
  occlusionEnabled: boolean;    // Fade objects blocking camera view of player
  occlusionFadeSpeed: number;   // Higher = faster fade (default: 8)
  occlusionMinOpacity: number;  // Minimum opacity when faded (default: 0.3)
}

const DEFAULT_CONFIG: GameCameraConfig = {
  fov: 30,
  pitchMin: 35,
  pitchMax: 55,
  pitchDefault: 45,
  distanceMin: 15,
  distanceMax: 40,
  distanceDefault: 25,
  followStrength: 8,
  rotationSpeed: 0.003,
  snapToCardinal: true,
  snapThreshold: 10,
  autoFollow: true,
  autoFollowStrength: 2,  // Gentle swing-behind effect
  occlusionEnabled: true,
  occlusionFadeSpeed: 8,
  occlusionMinOpacity: 0.3,
};

export class GameCamera {
  camera: THREE.PerspectiveCamera;

  private config: GameCameraConfig;
  private container: HTMLElement;

  // Rig components
  private cameraTarget: THREE.Object3D;
  private yawPivot: THREE.Object3D;
  private pitchPivot: THREE.Object3D;

  // Current state (yaw starts at 5π/4 for classic isometric diagonal view)
  private currentYaw = Math.PI * 1.25;  // 225° - behind and to the side
  private currentPitch: number;
  private currentDistance: number;

  // Target state (for smooth interpolation)
  private targetYaw = Math.PI * 1.25;
  private targetPitch: number;
  private targetDistance: number;
  private targetPosition = new THREE.Vector3();

  // Input state
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Auto-follow state
  private prevTargetPosition = new THREE.Vector3();
  private movementDirection = new THREE.Vector2();  // XZ plane

  // Occlusion state
  private occlusionRaycaster: THREE.Raycaster;
  private occludedMeshes: Map<THREE.Mesh, { originalOpacity: number; currentOpacity: number }> = new Map();
  private scene: THREE.Scene | null = null;

  // Bound event handlers (for cleanup)
  private boundOnMouseDown: (e: MouseEvent) => void;
  private boundOnMouseMove: (e: MouseEvent) => void;
  private boundOnMouseUp: (e: MouseEvent) => void;
  private boundOnWheel: (e: WheelEvent) => void;
  private boundOnKeyDown: (e: KeyboardEvent) => void;
  private boundOnContextMenu: (e: MouseEvent) => void;

  constructor(config: Partial<GameCameraConfig>, container: HTMLElement) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.container = container;

    // Initialize state from config
    this.currentPitch = this.config.pitchDefault;
    this.targetPitch = this.config.pitchDefault;
    this.currentDistance = this.config.distanceDefault;
    this.targetDistance = this.config.distanceDefault;

    // Create perspective camera with low FOV
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(
      this.config.fov,
      aspect,
      0.1,
      1000
    );

    // Build rig hierarchy
    this.cameraTarget = new THREE.Object3D();
    this.cameraTarget.name = 'CameraTarget';

    this.yawPivot = new THREE.Object3D();
    this.yawPivot.name = 'YawPivot';
    this.cameraTarget.add(this.yawPivot);

    this.pitchPivot = new THREE.Object3D();
    this.pitchPivot.name = 'PitchPivot';
    this.yawPivot.add(this.pitchPivot);

    this.pitchPivot.add(this.camera);

    // Apply initial rotation and position
    this.updateRig();

    // Initialize occlusion raycaster
    this.occlusionRaycaster = new THREE.Raycaster();

    // Bind event handlers
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundOnWheel = this.onWheel.bind(this);
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnContextMenu = (e: MouseEvent) => e.preventDefault();

    // Attach event listeners
    container.addEventListener('mousedown', this.boundOnMouseDown);
    container.addEventListener('wheel', this.boundOnWheel);
    container.addEventListener('contextmenu', this.boundOnContextMenu);
    window.addEventListener('mousemove', this.boundOnMouseMove);
    window.addEventListener('mouseup', this.boundOnMouseUp);
    window.addEventListener('keydown', this.boundOnKeyDown);
  }

  private updateRig(): void {
    // Apply yaw (rotation around Y axis)
    this.yawPivot.rotation.y = this.currentYaw;

    // Apply pitch (rotation around X axis, negative because we're looking down)
    const pitchRadians = THREE.MathUtils.degToRad(-this.currentPitch);
    this.pitchPivot.rotation.x = pitchRadians;

    // Position camera at distance along local Z axis
    // Camera looks down -Z by default, so it naturally faces the pivot origin (player)
    this.camera.position.set(0, 0, this.currentDistance);
  }

  update(deltaTime: number): void {
    // Calculate movement direction for auto-follow
    if (this.config.autoFollow && !this.isDragging) {
      const dx = this.targetPosition.x - this.prevTargetPosition.x;
      const dz = this.targetPosition.z - this.prevTargetPosition.z;
      const moveSpeed = Math.sqrt(dx * dx + dz * dz);

      // Only update direction if actually moving (threshold to ignore tiny movements)
      if (moveSpeed > 0.01) {
        this.movementDirection.set(dx, dz).normalize();

        // Calculate the "behind" angle (opposite of movement direction)
        // atan2 gives angle from +X axis, we want camera behind so add PI
        const behindAngle = Math.atan2(this.movementDirection.x, this.movementDirection.y) + Math.PI;

        // Smoothly move target yaw toward behind angle
        const autoFollowFactor = 1 - Math.exp(-this.config.autoFollowStrength * deltaTime);

        // Handle wrap-around for shortest path
        let angleDiff = behindAngle - this.targetYaw;
        angleDiff = ((angleDiff + Math.PI) % (Math.PI * 2)) - Math.PI;

        this.targetYaw += angleDiff * autoFollowFactor;
      }
    }

    // Store current position for next frame's movement calculation
    this.prevTargetPosition.copy(this.targetPosition);

    // Smooth position follow
    const smoothFactor = 1 - Math.exp(-this.config.followStrength * deltaTime);
    this.cameraTarget.position.lerp(this.targetPosition, smoothFactor);

    // Smooth yaw interpolation
    const yawDiff = this.targetYaw - this.currentYaw;
    // Handle wrap-around for shortest path
    const normalizedYawDiff = ((yawDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
    this.currentYaw += normalizedYawDiff * smoothFactor;

    // Smooth pitch interpolation
    this.currentPitch += (this.targetPitch - this.currentPitch) * smoothFactor;

    // Smooth distance interpolation
    this.currentDistance +=
      (this.targetDistance - this.currentDistance) * smoothFactor;

    // Update the rig with interpolated values
    this.updateRig();

    // Update occlusion fading
    if (this.config.occlusionEnabled) {
      this.updateOcclusion(deltaTime);
    }
  }

  private updateOcclusion(deltaTime: number): void {
    if (!this.scene) return;

    // Ensure world matrices are up to date for raycasting
    this.scene.updateMatrixWorld(true);

    // Get camera world position
    const cameraWorldPos = new THREE.Vector3();
    this.camera.getWorldPosition(cameraWorldPos);

    // Target position is where the camera is looking (player position)
    const targetPos = this.cameraTarget.position.clone();

    // Calculate direction and distance
    const direction = new THREE.Vector3()
      .subVectors(targetPos, cameraWorldPos)
      .normalize();
    const distance = cameraWorldPos.distanceTo(targetPos);

    // Set up raycaster
    this.occlusionRaycaster.set(cameraWorldPos, direction);
    this.occlusionRaycaster.far = distance;

    // Get all intersections
    const intersects = this.occlusionRaycaster.intersectObjects(this.scene.children, true);

    // Track which meshes are currently occluding
    const currentlyOccluding = new Set<THREE.Mesh>();

    for (const hit of intersects) {
      const obj = hit.object;
      if (!(obj instanceof THREE.Mesh)) continue;

      // Skip meshes that shouldn't fade
      const name = obj.name;
      if (
        name.startsWith('player') ||
        name.startsWith('npc-') ||
        name.startsWith('pickup-') ||
        name.startsWith('inspectable-')
      ) {
        continue;
      }

      // Skip ground/floor meshes (check face normal)
      if (hit.face && hit.face.normal.y > 0.9) {
        continue;
      }

      // This mesh is occluding
      currentlyOccluding.add(obj);

      // If not already tracked, store original opacity
      if (!this.occludedMeshes.has(obj)) {
        const material = obj.material as THREE.MeshStandardMaterial;
        const originalOpacity = material.opacity ?? 1;
        this.occludedMeshes.set(obj, {
          originalOpacity,
          currentOpacity: originalOpacity,
        });
      }
    }

    // Update all tracked meshes
    const toRemove: THREE.Mesh[] = [];

    for (const [mesh, state] of this.occludedMeshes) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      const isOccluding = currentlyOccluding.has(mesh);

      // Determine target opacity
      const targetOpacity = isOccluding
        ? this.config.occlusionMinOpacity
        : state.originalOpacity;

      // Interpolate toward target
      const fadeSpeed = this.config.occlusionFadeSpeed;
      const smoothFactor = 1 - Math.exp(-fadeSpeed * deltaTime);
      state.currentOpacity += (targetOpacity - state.currentOpacity) * smoothFactor;

      // Apply opacity
      material.transparent = true;
      material.opacity = state.currentOpacity;
      material.needsUpdate = true;

      // If fully restored, remove from tracking
      if (!isOccluding && Math.abs(state.currentOpacity - state.originalOpacity) < 0.01) {
        material.opacity = state.originalOpacity;
        // Only disable transparent if original was fully opaque
        if (state.originalOpacity >= 1) {
          material.transparent = false;
        }
        material.needsUpdate = true;
        toRemove.push(mesh);
      }
    }

    // Clean up fully restored meshes
    for (const mesh of toRemove) {
      this.occludedMeshes.delete(mesh);
    }
  }

  follow(target: THREE.Vector3): void {
    this.targetPosition.copy(target);
  }

  private onMouseDown(e: MouseEvent): void {
    // Right mouse button for rotation
    if (e.button === 2) {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.lastMouseX;
    const deltaY = e.clientY - this.lastMouseY;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    // Apply yaw rotation (horizontal drag)
    this.rotateYaw(-deltaX * this.config.rotationSpeed);

    // Apply pitch rotation (vertical drag)
    this.rotatePitch(deltaY * this.config.rotationSpeed * 50);
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 2 && this.isDragging) {
      this.isDragging = false;

      // Check for snap-to-cardinal
      if (this.config.snapToCardinal) {
        this.snapToNearest();
      }
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();

    const zoomSpeed = 1.5;
    const delta = e.deltaY > 0 ? zoomSpeed : -zoomSpeed;

    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance + delta,
      this.config.distanceMin,
      this.config.distanceMax
    );
  }

  private onKeyDown(e: KeyboardEvent): void {
    // Q/R for 45 degree rotation steps (E is used for interact)
    if (e.key === 'q' || e.key === 'Q') {
      this.rotateYawStep(-1);
    } else if (e.key === 'r' || e.key === 'R') {
      this.rotateYawStep(1);
    }
  }

  rotateYaw(delta: number): void {
    this.targetYaw += delta;
  }

  rotateYawStep(direction: number): void {
    // Snap to nearest 45 degree increment then step in direction
    const currentStep = Math.round(this.targetYaw / (Math.PI / 4));
    this.targetYaw = (currentStep + direction) * (Math.PI / 4);
  }

  rotatePitch(deltaDegrees: number): void {
    this.targetPitch = THREE.MathUtils.clamp(
      this.targetPitch + deltaDegrees,
      this.config.pitchMin,
      this.config.pitchMax
    );
  }

  snapToNearest(): void {
    const step = Math.PI / 4; // 45 degrees
    const thresholdRadians = THREE.MathUtils.degToRad(this.config.snapThreshold);

    // Find nearest cardinal angle
    const nearestStep = Math.round(this.targetYaw / step);
    const nearestAngle = nearestStep * step;

    // Check if within snap threshold
    const diff = Math.abs(this.targetYaw - nearestAngle);
    if (diff <= thresholdRadians) {
      this.targetYaw = nearestAngle;
    }
  }

  setZoom(normalized: number): void {
    // normalized: 0 = min distance (zoomed in), 1 = max distance (zoomed out)
    this.targetDistance = THREE.MathUtils.lerp(
      this.config.distanceMin,
      this.config.distanceMax,
      normalized
    );
  }

  getZoom(): number {
    return (
      (this.currentDistance - this.config.distanceMin) /
      (this.config.distanceMax - this.config.distanceMin)
    );
  }

  updateAspect(container: HTMLElement): void {
    const aspect = container.clientWidth / container.clientHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  getSceneObject(): THREE.Object3D {
    return this.cameraTarget;
  }

  getThreeCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  setScene(scene: THREE.Scene): void {
    this.scene = scene;
  }

  getYaw(): number {
    return this.currentYaw;
  }

  dispose(): void {
    this.container.removeEventListener('mousedown', this.boundOnMouseDown);
    this.container.removeEventListener('wheel', this.boundOnWheel);
    this.container.removeEventListener('contextmenu', this.boundOnContextMenu);
    window.removeEventListener('mousemove', this.boundOnMouseMove);
    window.removeEventListener('mouseup', this.boundOnMouseUp);
    window.removeEventListener('keydown', this.boundOnKeyDown);
  }
}
