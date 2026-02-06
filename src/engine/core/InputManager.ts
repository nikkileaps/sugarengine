export interface InputState {
  moveX: number;  // -1 to 1 (left/right)
  moveY: number;  // -1 to 1 (up/down, maps to Z in world)
}

export class InputManager {
  private keys: Set<string> = new Set();
  private keysJustPressed: Set<string> = new Set();
  private gamepadIndex: number | null = null;
  private prevGamepadButtons: boolean[] = [];

  // Movement lock system - movement is allowed only when no locks exist
  private movementLocks = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('gamepadconnected', (e) => this.onGamepadConnected(e));
    window.addEventListener('gamepaddisconnected', (e) => this.onGamepadDisconnected(e));
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.keys.has(e.code)) {
      this.keysJustPressed.add(e.code);
    }
    this.keys.add(e.code);
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
  }

  private onGamepadConnected(e: GamepadEvent): void {
    this.gamepadIndex = e.gamepad.index;
  }

  private onGamepadDisconnected(e: GamepadEvent): void {
    if (this.gamepadIndex === e.gamepad.index) {
      this.gamepadIndex = null;
    }
  }

  getInput(): InputState {
    // Return no movement if any locks are active
    if (this.movementLocks.size > 0) {
      return { moveX: 0, moveY: 0 };
    }

    let moveX = 0;
    let moveY = 0;

    // Keyboard input (WASD and arrow keys)
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveY -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveY += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;

    // Gamepad input (left stick)
    if (this.gamepadIndex !== null) {
      const gamepads = navigator.getGamepads();
      const gamepad = gamepads[this.gamepadIndex];

      if (gamepad) {
        const deadzone = 0.15;
        const leftStickX = gamepad.axes[0] ?? 0;
        const leftStickY = gamepad.axes[1] ?? 0;

        if (Math.abs(leftStickX) > deadzone) {
          moveX = leftStickX;
        }
        if (Math.abs(leftStickY) > deadzone) {
          moveY = leftStickY;
        }
      }
    }

    // Normalize diagonal movement
    const length = Math.sqrt(moveX * moveX + moveY * moveY);
    if (length > 1) {
      moveX /= length;
      moveY /= length;
    }

    return { moveX, moveY };
  }

  /**
   * Check if interact button was just pressed (E key or gamepad A button)
   */
  isInteractPressed(): boolean {
    // Keyboard: E key
    if (this.keysJustPressed.has('KeyE')) {
      return true;
    }

    // Gamepad: A button (index 0 on most controllers)
    if (this.gamepadIndex !== null) {
      const gamepads = navigator.getGamepads();
      const gamepad = gamepads[this.gamepadIndex];

      if (gamepad) {
        const aButton = gamepad.buttons[0];
        const wasPressed = this.prevGamepadButtons[0] ?? false;
        const isPressed = aButton?.pressed ?? false;

        if (isPressed && !wasPressed) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Consume the interact key press so it won't be detected again this frame.
   * Call this after handling an interaction to prevent double-triggers.
   */
  consumeInteract(): void {
    this.keysJustPressed.delete('KeyE');
  }

  /**
   * Check if journal toggle was just pressed (J key)
   */
  isJournalPressed(): boolean {
    return this.keysJustPressed.has('KeyJ');
  }

  /**
   * Check if escape was just pressed
   */
  isEscapePressed(): boolean {
    return this.keysJustPressed.has('Escape');
  }

  /**
   * Check if inventory key was just pressed (I key)
   */
  isInventoryPressed(): boolean {
    return this.keysJustPressed.has('KeyI');
  }

  /**
   * Check if gift key was just pressed (G key)
   */
  isGiftPressed(): boolean {
    return this.keysJustPressed.has('KeyG');
  }

  /**
   * Check if spell menu key was just pressed (C key)
   */
  isSpellMenuPressed(): boolean {
    return this.keysJustPressed.has('KeyC');
  }

  /**
   * Call at end of frame to clear "just pressed" state
   */
  endFrame(): void {
    this.keysJustPressed.clear();

    // Update previous gamepad button state
    if (this.gamepadIndex !== null) {
      const gamepads = navigator.getGamepads();
      const gamepad = gamepads[this.gamepadIndex];

      if (gamepad) {
        this.prevGamepadButtons = gamepad.buttons.map(b => b.pressed);
      }
    }
  }

  /**
   * Add a movement lock. Movement is disabled while any locks exist.
   * @param reason - Identifier for the lock (e.g., 'dialogue', 'pause', 'inventory')
   */
  addMovementLock(reason: string): void {
    this.movementLocks.add(reason);
  }

  /**
   * Remove a movement lock. Movement re-enables when all locks are removed.
   * @param reason - Identifier for the lock to remove
   */
  removeMovementLock(reason: string): void {
    this.movementLocks.delete(reason);
  }

  /**
   * Check if movement is currently allowed (no locks active)
   */
  isMovementAllowed(): boolean {
    return this.movementLocks.size === 0;
  }
}
