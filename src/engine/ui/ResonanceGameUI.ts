/**
 * ResonanceGameUI - Full-screen mini-game overlay for resonance attunement
 * Displays the "Dance With the Fireflies" pattern recognition game
 */

import type {
  FireflyPattern,
  ResonancePointConfig,
  ResonanceGameResult,
} from '../resonance';
import {
  generatePattern,
  checkAnswer,
  interpolateTrajectory,
} from '../resonance';

const MAX_ATTEMPTS = 3;
const TRAIL_LENGTH = 25; // Number of positions to remember for trail

export class ResonanceGameUI {
  private overlay: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private optionsContainer: HTMLDivElement;
  private attemptsDisplay: HTMLDivElement;
  private messageDisplay: HTMLDivElement;

  private currentPattern: FireflyPattern | null = null;
  private currentConfig: ResonancePointConfig | null = null;
  private attemptsRemaining: number = MAX_ATTEMPTS;
  private animationFrame: number | null = null;
  private animationStartTime: number = 0;
  private isAnimating: boolean = false;

  // Trail history for each firefly (array of recent positions)
  private trailHistory: { x: number; y: number }[][] = [];

  private onCompleteHandler: ((result: ResonanceGameResult) => void) | null = null;

  constructor(parentContainer: HTMLElement) {
    this.injectStyles();

    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'resonance-game-overlay';

    // Panel
    const panel = document.createElement('div');
    panel.className = 'resonance-game-panel';

    // Title
    const title = document.createElement('div');
    title.className = 'resonance-game-title';
    title.textContent = 'Resonance Attunement';
    panel.appendChild(title);

    // Canvas container
    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'resonance-game-canvas-container';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'resonance-game-canvas';
    this.canvas.width = 400;
    this.canvas.height = 300;
    canvasContainer.appendChild(this.canvas);
    panel.appendChild(canvasContainer);

    this.ctx = this.canvas.getContext('2d')!;

    // Instructions
    const instructions = document.createElement('div');
    instructions.className = 'resonance-game-instructions';
    instructions.textContent = 'Watch the fireflies dance, then identify the lead trajectory';
    panel.appendChild(instructions);

    // Options container
    this.optionsContainer = document.createElement('div');
    this.optionsContainer.className = 'resonance-game-options';
    panel.appendChild(this.optionsContainer);

    // Attempts display
    this.attemptsDisplay = document.createElement('div');
    this.attemptsDisplay.className = 'resonance-game-attempts';
    panel.appendChild(this.attemptsDisplay);

    // Message display (for feedback)
    this.messageDisplay = document.createElement('div');
    this.messageDisplay.className = 'resonance-game-message';
    panel.appendChild(this.messageDisplay);

    // Footer with hints
    const footer = document.createElement('div');
    footer.className = 'resonance-game-footer';
    footer.innerHTML = `
      <div class="resonance-game-hint">
        <span class="key">1-4</span> or click to select
        <span class="separator"></span>
        <span class="key">Esc</span> to abandon
      </div>
    `;
    panel.appendChild(footer);

    this.overlay.appendChild(panel);
    parentContainer.appendChild(this.overlay);

    // Bind keyboard handler
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  private injectStyles(): void {
    if (document.getElementById('resonance-game-ui-styles')) return;

    const style = document.createElement('style');
    style.id = 'resonance-game-ui-styles';
    style.textContent = `
      .resonance-game-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 400;
        transition: background 0.5s ease-out;
      }

      .resonance-game-overlay.visible {
        display: flex;
      }

      .resonance-game-overlay.faded-in {
        background: rgba(0, 0, 0, 0.9);
      }

      .resonance-game-panel {
        background: linear-gradient(180deg, rgba(30, 25, 50, 0.98) 0%, rgba(20, 18, 35, 0.98) 100%);
        border: 3px solid rgba(123, 104, 238, 0.4);
        border-radius: 20px;
        padding: 28px 36px;
        min-width: 480px;
        max-width: 520px;
        box-shadow: 0 16px 64px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.05);
        font-family: 'Segoe UI', system-ui, sans-serif;
        color: #e8e0f0;
        opacity: 0;
        transform: scale(0.95);
        transition: opacity 0.4s ease-out, transform 0.4s ease-out;
      }

      .resonance-game-overlay.faded-in .resonance-game-panel {
        opacity: 1;
        transform: scale(1);
      }

      .resonance-game-title {
        font-size: 22px;
        font-weight: 600;
        text-align: center;
        color: #c8b8ff;
        margin-bottom: 20px;
        text-shadow: 0 0 20px rgba(123, 104, 238, 0.4);
      }

      .resonance-game-canvas-container {
        display: flex;
        justify-content: center;
        margin-bottom: 16px;
      }

      .resonance-game-canvas {
        background: radial-gradient(ellipse at center, rgba(20, 15, 40, 1) 0%, rgba(10, 8, 20, 1) 100%);
        border: 2px solid rgba(123, 104, 238, 0.3);
        border-radius: 12px;
      }

      .resonance-game-instructions {
        text-align: center;
        font-size: 14px;
        color: rgba(232, 224, 240, 0.6);
        margin-bottom: 20px;
      }

      .resonance-game-options {
        display: flex;
        justify-content: center;
        gap: 16px;
        margin-bottom: 20px;
      }

      .resonance-game-option {
        width: 90px;
        height: 90px;
        background: rgba(0, 0, 0, 0.4);
        border: 2px solid rgba(123, 104, 238, 0.3);
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.15s ease-out;
        position: relative;
        overflow: hidden;
      }

      .resonance-game-option:hover {
        border-color: rgba(123, 104, 238, 0.6);
        background: rgba(123, 104, 238, 0.1);
        transform: translateY(-2px);
      }

      .resonance-game-option.disabled {
        opacity: 0.4;
        cursor: not-allowed;
        pointer-events: none;
      }

      .resonance-game-option.correct {
        border-color: #4caf50;
        background: rgba(76, 175, 80, 0.2);
        box-shadow: 0 0 20px rgba(76, 175, 80, 0.3);
      }

      .resonance-game-option.incorrect {
        border-color: #e91e63;
        background: rgba(233, 30, 99, 0.2);
        box-shadow: 0 0 20px rgba(233, 30, 99, 0.3);
      }

      .resonance-game-option-label {
        position: absolute;
        top: 4px;
        left: 8px;
        font-size: 12px;
        font-weight: 600;
        color: rgba(232, 224, 240, 0.5);
      }

      .resonance-game-option-canvas {
        width: 100%;
        height: 100%;
      }

      .resonance-game-attempts {
        display: flex;
        justify-content: center;
        gap: 8px;
        margin-bottom: 12px;
      }

      .resonance-game-attempt-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: rgba(123, 104, 238, 0.3);
        border: 2px solid rgba(123, 104, 238, 0.5);
        transition: all 0.3s ease-out;
      }

      .resonance-game-attempt-dot.active {
        background: #7b68ee;
        box-shadow: 0 0 10px rgba(123, 104, 238, 0.5);
      }

      .resonance-game-attempt-dot.used {
        background: rgba(233, 30, 99, 0.6);
        border-color: rgba(233, 30, 99, 0.8);
      }

      .resonance-game-message {
        text-align: center;
        font-size: 16px;
        font-weight: 600;
        min-height: 24px;
        margin-bottom: 16px;
        transition: all 0.3s ease-out;
      }

      .resonance-game-message.success {
        color: #4caf50;
        text-shadow: 0 0 10px rgba(76, 175, 80, 0.4);
      }

      .resonance-game-message.failure {
        color: #e91e63;
        text-shadow: 0 0 10px rgba(233, 30, 99, 0.4);
      }

      .resonance-game-message.info {
        color: #ffeb3b;
        text-shadow: 0 0 10px rgba(255, 235, 59, 0.4);
      }

      .resonance-game-footer {
        display: flex;
        justify-content: center;
        padding-top: 12px;
        border-top: 2px solid rgba(123, 104, 238, 0.15);
      }

      .resonance-game-hint {
        font-size: 12px;
        color: rgba(232, 224, 240, 0.4);
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .resonance-game-hint .key {
        display: inline-block;
        background: rgba(123, 104, 238, 0.2);
        border: 1px solid rgba(123, 104, 238, 0.3);
        border-radius: 4px;
        padding: 2px 6px;
        font-weight: 600;
        font-size: 11px;
        color: #b8a8e8;
      }

      .resonance-game-hint .separator {
        width: 1px;
        height: 14px;
        background: rgba(123, 104, 238, 0.2);
        margin: 0 4px;
      }
    `;
    document.head.appendChild(style);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Escape') {
      e.preventDefault();
      this.abandon();
      return;
    }

    // Number keys 1-4
    if (e.code >= 'Digit1' && e.code <= 'Digit4') {
      e.preventDefault();
      const index = parseInt(e.code.slice(5)) - 1;
      this.selectOption(index);
    }
  }

  /**
   * Start the resonance game with the given configuration
   */
  start(config: ResonancePointConfig): void {
    this.currentConfig = config;
    this.attemptsRemaining = MAX_ATTEMPTS;
    this.messageDisplay.textContent = '';
    this.messageDisplay.className = 'resonance-game-message';

    // Generate new pattern
    this.currentPattern = generatePattern(config.difficulty);

    // Initialize trail history for each firefly
    this.trailHistory = this.currentPattern.trajectories.map(() => []);

    // Setup UI
    this.renderOptions();
    this.renderAttempts();

    // Show overlay with fade
    this.overlay.classList.add('visible');
    // Trigger fade-in on next frame
    requestAnimationFrame(() => {
      this.overlay.classList.add('faded-in');
    });

    // Start animation
    this.startAnimation();

    // Add keyboard listener
    window.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Hide the game and cleanup
   */
  private hide(): void {
    this.stopAnimation();
    window.removeEventListener('keydown', this.handleKeyDown);

    // Fade out
    this.overlay.classList.remove('faded-in');
    setTimeout(() => {
      this.overlay.classList.remove('visible');
    }, 500);
  }

  /**
   * Start firefly animation
   */
  private startAnimation(): void {
    this.isAnimating = true;
    this.animationStartTime = performance.now();
    this.animate();
  }

  /**
   * Stop firefly animation
   */
  private stopAnimation(): void {
    this.isAnimating = false;
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Animation loop
   */
  private animate = (): void => {
    if (!this.isAnimating || !this.currentPattern) return;

    const elapsed = (performance.now() - this.animationStartTime) / 1000;
    this.renderFireflies(elapsed);

    this.animationFrame = requestAnimationFrame(this.animate);
  };

  /**
   * Render fireflies on canvas
   */
  private renderFireflies(time: number): void {
    if (!this.currentPattern) return;

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Fully clear canvas each frame
    ctx.fillStyle = 'rgb(10, 8, 20)';
    ctx.fillRect(0, 0, width, height);

    // Draw each firefly with trail
    for (let i = 0; i < this.currentPattern.trajectories.length; i++) {
      const trajectory = this.currentPattern.trajectories[i]!;
      const pos = interpolateTrajectory(trajectory, time);

      // Convert normalized coords to canvas coords
      const x = pos.x * width;
      const y = pos.y * height;

      // Update trail history
      const trail = this.trailHistory[i]!;
      trail.unshift({ x, y }); // Add current position to front
      if (trail.length > TRAIL_LENGTH) {
        trail.pop(); // Remove oldest position
      }

      // Draw trail as fading line segments
      if (trail.length > 1) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let j = 0; j < trail.length - 1; j++) {
          const p1 = trail[j]!;
          const p2 = trail[j + 1]!;

          // Fade opacity based on distance from current position
          const alpha = 1 - (j / TRAIL_LENGTH);
          // Line width tapers toward the end
          const lineWidth = Math.max(1, 3 * (1 - j / TRAIL_LENGTH));

          ctx.strokeStyle = trajectory.color + Math.floor(alpha * 180).toString(16).padStart(2, '0');
          ctx.lineWidth = lineWidth;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      // Draw small glow around core
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, 10);
      gradient.addColorStop(0, trajectory.color);
      gradient.addColorStop(0.5, trajectory.color + '40');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();

      // Draw core dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();

      // Highlight the lead firefly (first trajectory)
      if (i === 0) {
        ctx.strokeStyle = trajectory.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /**
   * Render the trajectory option buttons
   */
  private renderOptions(): void {
    if (!this.currentPattern) return;

    this.optionsContainer.innerHTML = '';

    for (let i = 0; i < this.currentPattern.options.length; i++) {
      const option = this.currentPattern.options[i]!;

      const optionEl = document.createElement('div');
      optionEl.className = 'resonance-game-option';
      optionEl.dataset.index = String(i);

      // Label
      const label = document.createElement('div');
      label.className = 'resonance-game-option-label';
      label.textContent = option.label;
      optionEl.appendChild(label);

      // Mini canvas for trajectory preview
      const miniCanvas = document.createElement('canvas');
      miniCanvas.className = 'resonance-game-option-canvas';
      miniCanvas.width = 90;
      miniCanvas.height = 90;
      optionEl.appendChild(miniCanvas);

      // Draw trajectory preview
      this.drawTrajectoryPreview(miniCanvas, option.previewPath);

      // Click handler
      optionEl.addEventListener('click', () => {
        this.selectOption(i);
      });

      this.optionsContainer.appendChild(optionEl);
    }
  }

  /**
   * Draw a trajectory preview on a mini canvas
   */
  private drawTrajectoryPreview(
    canvas: HTMLCanvasElement,
    path: { x: number; y: number }[]
  ): void {
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;
    const padding = 15;

    ctx.clearRect(0, 0, w, h);

    if (path.length < 2) return;

    // Draw path in warm yellow-white
    const pathColor = 'rgba(255, 245, 200, 0.9)';
    ctx.strokeStyle = pathColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    const startX = padding + path[0]!.x * (w - 2 * padding);
    const startY = padding + path[0]!.y * (h - 2 * padding);
    ctx.moveTo(startX, startY);

    for (let i = 1; i < path.length; i++) {
      const x = padding + path[i]!.x * (w - 2 * padding);
      const y = padding + path[i]!.y * (h - 2 * padding);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /**
   * Render attempts remaining dots
   */
  private renderAttempts(): void {
    this.attemptsDisplay.innerHTML = '';

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const dot = document.createElement('div');
      dot.className = 'resonance-game-attempt-dot';

      if (i < this.attemptsRemaining) {
        dot.classList.add('active');
      } else {
        dot.classList.add('used');
      }

      this.attemptsDisplay.appendChild(dot);
    }
  }

  /**
   * Handle option selection
   */
  private selectOption(index: number): void {
    if (!this.currentPattern || !this.currentConfig) return;
    if (this.attemptsRemaining <= 0) return;

    const isCorrect = checkAnswer(this.currentPattern, index);
    const optionEls = this.optionsContainer.querySelectorAll('.resonance-game-option');

    if (isCorrect) {
      // Mark correct option
      optionEls[index]?.classList.add('correct');

      // Show success message
      this.messageDisplay.textContent = 'Attunement successful!';
      this.messageDisplay.className = 'resonance-game-message success';

      // Disable all options
      optionEls.forEach((el) => el.classList.add('disabled'));

      // Complete after delay
      setTimeout(() => {
        this.complete(true);
      }, 1500);
    } else {
      // Mark incorrect option
      optionEls[index]?.classList.add('incorrect');

      // Use an attempt
      this.attemptsRemaining--;
      this.renderAttempts();

      // Reset incorrect visual after delay
      setTimeout(() => {
        optionEls[index]?.classList.remove('incorrect');
      }, 500);

      if (this.attemptsRemaining <= 0) {
        // Show failure message
        this.messageDisplay.textContent = 'Attunement failed...';
        this.messageDisplay.className = 'resonance-game-message failure';

        // Disable all options
        optionEls.forEach((el) => el.classList.add('disabled'));

        // Complete after delay
        setTimeout(() => {
          this.complete(false);
        }, 1500);
      } else {
        // Show try again message
        this.messageDisplay.textContent = `Incorrect. ${this.attemptsRemaining} attempt${this.attemptsRemaining === 1 ? '' : 's'} remaining.`;
        this.messageDisplay.className = 'resonance-game-message info';
      }
    }
  }

  /**
   * Complete the game
   */
  private complete(success: boolean): void {
    const result: ResonanceGameResult = {
      success,
      resonanceGained: success ? (this.currentConfig?.resonanceReward ?? 0) : 0,
      attemptsUsed: MAX_ATTEMPTS - this.attemptsRemaining,
    };

    this.hide();

    if (this.onCompleteHandler) {
      this.onCompleteHandler(result);
    }
  }

  /**
   * Abandon the game early
   */
  private abandon(): void {
    const result: ResonanceGameResult = {
      success: false,
      resonanceGained: 0,
      attemptsUsed: MAX_ATTEMPTS - this.attemptsRemaining,
    };

    this.hide();

    if (this.onCompleteHandler) {
      this.onCompleteHandler(result);
    }
  }

  /**
   * Set the completion callback
   */
  setOnComplete(handler: (result: ResonanceGameResult) => void): void {
    this.onCompleteHandler = handler;
  }

  /**
   * Check if the game is currently active
   */
  isActive(): boolean {
    return this.overlay.classList.contains('visible');
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.stopAnimation();
    window.removeEventListener('keydown', this.handleKeyDown);
    this.overlay.remove();
  }
}
