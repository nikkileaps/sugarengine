/**
 * ResonanceGameUI - Full-screen mini-game overlay for resonance attunement
 *
 * "Dance With the Fireflies" - Pattern recognition through emergence
 *
 * Fireflies are positioned along a hidden trajectory. They twinkle in and out
 * with coordinated timing so that periodically the shape "emerges" - enough
 * fireflies are visible simultaneously to reveal the pattern. Then it fades
 * back to apparent randomness. Players must catch these moments of coherence
 * and identify which trajectory matches.
 */

import type {
  FireflyPattern,
  ResonancePointConfig,
  ResonanceGameResult,
} from '../resonance';
import { generatePattern, checkAnswer } from '../resonance';

const MAX_ATTEMPTS = 3;

// Firefly rendering parameters
const FIREFLIES_PER_PATH = 24;      // Number of fireflies along the trajectory
const DISTRACTION_FIREFLIES = 35;   // Random fireflies to distract/add noise
const COHERENCE_PERIOD = 18.0;      // Total cycle time (sweep + firefly lifecycle + dark pause)
const SWEEP_DURATION = 3.5;         // How long the wave takes to sweep across the pattern (slower)
const AFTERGLOW_DURATION = 2.0;     // How long afterglow persists (longer for meditative feel)
// Note: Dark pause is implicit - after sweep + firefly cycle, remaining time is dark

interface FireflyState {
  x: number;
  y: number;
  pathPosition: number;    // 0-1 position along path (for coherence wave)
  brightness: number;      // Current brightness (0-1)
  afterglow: number;       // Afterglow intensity (0-1)
  peakTime: number;        // Last time this firefly was at peak brightness
  // State-based timing (like distraction fireflies)
  state: 'dark' | 'fading-in' | 'bright' | 'fading-out';
  stateStartTime: number;
  stateDuration: number;
  triggered: boolean;      // Whether this firefly has been triggered by coherence wave
}

// Distraction firefly with organic timing
interface DistractionFirefly {
  x: number;
  y: number;
  brightness: number;
  state: 'dark' | 'fading-in' | 'bright' | 'fading-out';
  stateStartTime: number;
  stateDuration: number;   // How long this state lasts
}

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

  // Firefly states for the main trajectory (the one player must identify)
  private fireflies: FireflyState[] = [];

  // Firefly states for distraction patterns (emerge but don't match any option)
  private distractionPatternFireflies: { fireflies: FireflyState[]; color: string; phaseOffset: number }[] = [];

  // Distraction fireflies scattered randomly across canvas
  private distractionFireflies: DistractionFirefly[] = [];

  // Track cycle for position randomization
  private lastCycleIndex: number = -1;

  // Base positions for patterns (before offset applied) - stored for repositioning
  private mainPatternBasePositions: { x: number; y: number }[] = [];
  private distractionPatternBasePositions: { x: number; y: number }[][] = [];

  // Phase offset for main pattern (so it doesn't always emerge first)
  private mainPatternPhaseOffset: number = 0;

  // Afterglow buffer - accumulates glow that fades over time
  private afterglowCanvas: HTMLCanvasElement | null = null;
  private afterglowCtx: CanvasRenderingContext2D | null = null;

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
    instructions.textContent = 'Watch for the pattern to emerge from the fireflies';
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

    // Initialize fireflies along the first (correct) trajectory
    this.initializeFireflies();

    // Create afterglow buffer canvas
    this.afterglowCanvas = document.createElement('canvas');
    this.afterglowCanvas.width = this.canvas.width;
    this.afterglowCanvas.height = this.canvas.height;
    this.afterglowCtx = this.afterglowCanvas.getContext('2d')!;
    this.afterglowCtx.fillStyle = 'rgb(10, 8, 20)';
    this.afterglowCtx.fillRect(0, 0, this.afterglowCanvas.width, this.afterglowCanvas.height);

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
   * Initialize fireflies at positions along the trajectory
   */
  private initializeFireflies(): void {
    if (!this.currentPattern) return;

    const trajectory = this.currentPattern.trajectories[0]!;
    const points = trajectory.points;

    // Store base positions (scaled but not offset) for repositioning between cycles
    this.mainPatternBasePositions = [];
    this.fireflies = [];

    for (let i = 0; i < FIREFLIES_PER_PATH; i++) {
      const pathPosition = i / (FIREFLIES_PER_PATH - 1);
      const pointIndex = Math.floor(pathPosition * (points.length - 1));
      const point = points[pointIndex]!;

      // Store scaled base position (before quadrant offset)
      const baseX = (point.x - 0.5) * 0.7 + 0.5;
      const baseY = (point.y - 0.5) * 0.7 + 0.5;
      this.mainPatternBasePositions.push({ x: baseX, y: baseY });

      this.fireflies.push({
        x: baseX,  // Will be offset in randomizePatternPositions
        y: baseY,
        pathPosition,
        brightness: 0,
        afterglow: 0,
        peakTime: -999,
        state: 'dark',
        stateStartTime: 0,
        stateDuration: this.getPatternFireflyDuration('dark'),
        triggered: false,
      });
    }

    // Create fireflies for distraction patterns (patterns that emerge but don't match options)
    this.distractionPatternFireflies = [];
    this.distractionPatternBasePositions = [];
    const distractionTrajectories = this.currentPattern.distractionTrajectories || [];

    // Generate and shuffle phase offsets for ALL patterns (main + distractions)
    // so the main pattern doesn't always emerge first
    const totalPatterns = 1 + distractionTrajectories.length;
    const phaseOffsets: number[] = [];
    for (let i = 0; i < totalPatterns; i++) {
      phaseOffsets.push(i * (COHERENCE_PERIOD / totalPatterns));
    }
    // Shuffle the phase offsets
    for (let i = phaseOffsets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [phaseOffsets[i], phaseOffsets[j]] = [phaseOffsets[j]!, phaseOffsets[i]!];
    }

    // Main pattern gets the first shuffled offset
    this.mainPatternPhaseOffset = phaseOffsets[0]!;

    for (let patternIndex = 0; patternIndex < distractionTrajectories.length; patternIndex++) {
      const distractionTraj = distractionTrajectories[patternIndex]!;
      const patternFireflies: FireflyState[] = [];
      const patternBasePositions: { x: number; y: number }[] = [];

      // Distraction patterns get remaining shuffled offsets
      const phaseOffset = phaseOffsets[patternIndex + 1]!;

      for (let i = 0; i < FIREFLIES_PER_PATH; i++) {
        const pathPosition = i / (FIREFLIES_PER_PATH - 1);
        const pointIndex = Math.floor(pathPosition * (distractionTraj.points.length - 1));
        const point = distractionTraj.points[pointIndex]!;

        // Store scaled base position
        const baseX = (point.x - 0.5) * 0.7 + 0.5;
        const baseY = (point.y - 0.5) * 0.7 + 0.5;
        patternBasePositions.push({ x: baseX, y: baseY });

        patternFireflies.push({
          x: baseX,  // Will be offset in randomizePatternPositions
          y: baseY,
          pathPosition,
          brightness: 0,
          afterglow: 0,
          peakTime: -999,
          state: 'dark',
          stateStartTime: 0,
          stateDuration: this.getPatternFireflyDuration('dark'),
          triggered: false,
        });
      }

      this.distractionPatternBasePositions.push(patternBasePositions);
      this.distractionPatternFireflies.push({
        fireflies: patternFireflies,
        color: distractionTraj.color,
        phaseOffset,
      });
    }

    // Initial position randomization
    this.lastCycleIndex = -1;
    this.randomizePatternPositions();

    // Create distraction fireflies scattered randomly
    this.distractionFireflies = [];
    for (let i = 0; i < DISTRACTION_FIREFLIES; i++) {
      // Stagger initial states so they don't all start dark
      const initialState = Math.random() < 0.3 ? 'bright' : 'dark';
      this.distractionFireflies.push({
        x: 0.05 + Math.random() * 0.9,  // Keep away from edges
        y: 0.05 + Math.random() * 0.9,
        brightness: initialState === 'bright' ? Math.random() * 0.5 + 0.3 : 0,
        state: initialState,
        stateStartTime: -Math.random() * 3,  // Stagger start times
        stateDuration: this.getRandomStateDuration(initialState),
      });
    }
  }

  /**
   * Get random duration for a distraction firefly state
   */
  private getRandomStateDuration(state: DistractionFirefly['state']): number {
    switch (state) {
      case 'dark':
        // Stay dark for 3-8 seconds
        return 3 + Math.random() * 5;
      case 'fading-in':
        // Fade in over 3.0-5.5 seconds (slow, meditative)
        return 3.0 + Math.random() * 2.5;
      case 'bright':
        // Stay bright for 1.5-3.5 seconds
        return 1.5 + Math.random() * 2.0;
      case 'fading-out':
        // Fade out over 2.5-5.0 seconds (slow, meditative)
        return 2.5 + Math.random() * 2.5;
    }
  }

  /**
   * Get next state for distraction firefly
   */
  private getNextState(state: DistractionFirefly['state']): DistractionFirefly['state'] {
    switch (state) {
      case 'dark': return 'fading-in';
      case 'fading-in': return 'bright';
      case 'bright': return 'fading-out';
      case 'fading-out': return 'dark';
    }
  }

  /**
   * Get random duration for pattern firefly states (similar to distraction but for coordinated emergence)
   */
  private getPatternFireflyDuration(state: FireflyState['state']): number {
    switch (state) {
      case 'dark':
        // Stays dark until triggered by coherence wave
        return 999;
      case 'fading-in':
        // Fade in over 3.0-5.0 seconds (slow, meditative)
        return 3.0 + Math.random() * 2.0;
      case 'bright':
        // Stay bright for 2.0-3.5 seconds
        return 2.0 + Math.random() * 1.5;
      case 'fading-out':
        // Fade out over 2.5-4.5 seconds (slow, meditative)
        return 2.5 + Math.random() * 2.0;
    }
  }

  /**
   * Randomize which quadrant each pattern appears in
   */
  private randomizePatternPositions(): void {
    // Position offsets for all patterns (main + distractions)
    const allPositionOffsets = [
      { x: -0.22, y: -0.18 },   // Top-left area
      { x: 0.22, y: -0.18 },    // Top-right area
      { x: -0.22, y: 0.18 },    // Bottom-left area
      { x: 0.22, y: 0.18 },     // Bottom-right area
    ];

    // Shuffle the offsets
    const shuffledOffsets = [...allPositionOffsets].sort(() => Math.random() - 0.5);

    // Apply offset to main pattern fireflies
    const mainOffset = shuffledOffsets[0]!;
    for (let i = 0; i < this.fireflies.length; i++) {
      const base = this.mainPatternBasePositions[i]!;
      const jitterX = (Math.random() - 0.5) * 0.02;
      const jitterY = (Math.random() - 0.5) * 0.02;
      this.fireflies[i]!.x = base.x + mainOffset.x + jitterX;
      this.fireflies[i]!.y = base.y + mainOffset.y + jitterY;
    }

    // Apply offsets to distraction pattern fireflies
    for (let patternIndex = 0; patternIndex < this.distractionPatternFireflies.length; patternIndex++) {
      const offset = shuffledOffsets[(patternIndex + 1) % shuffledOffsets.length]!;
      const pattern = this.distractionPatternFireflies[patternIndex]!;
      const basePositions = this.distractionPatternBasePositions[patternIndex]!;

      for (let i = 0; i < pattern.fireflies.length; i++) {
        const base = basePositions[i]!;
        const jitterX = (Math.random() - 0.5) * 0.02;
        const jitterY = (Math.random() - 0.5) * 0.02;
        pattern.fireflies[i]!.x = base.x + offset.x + jitterX;
        pattern.fireflies[i]!.y = base.y + offset.y + jitterY;
      }
    }
  }

  /**
   * Hide the game and cleanup
   */
  private hide(): void {
    this.stopAnimation();
    window.removeEventListener('keydown', this.handleKeyDown);

    // Cleanup afterglow canvas
    this.afterglowCanvas = null;
    this.afterglowCtx = null;
    this.fireflies = [];
    this.distractionPatternFireflies = [];
    this.distractionFireflies = [];
    this.mainPatternBasePositions = [];
    this.distractionPatternBasePositions = [];
    this.lastCycleIndex = -1;
    this.mainPatternPhaseOffset = 0;

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
   * Render fireflies on canvas with twinkling emergence effect
   */
  private renderFireflies(time: number): void {
    if (!this.currentPattern || !this.afterglowCtx || !this.afterglowCanvas) return;

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Track cycles for position randomization
    const currentCycleIndex = Math.floor(time / COHERENCE_PERIOD);

    // Randomize pattern positions at the start of each new cycle
    if (currentCycleIndex !== this.lastCycleIndex) {
      this.lastCycleIndex = currentCycleIndex;
      this.randomizePatternPositions();
      // Clear afterglow buffer completely so old positions don't linger
      if (this.afterglowCtx) {
        this.afterglowCtx.fillStyle = 'rgb(10, 8, 20)';
        this.afterglowCtx.fillRect(0, 0, width, height);
      }
    }

    // Main pattern has its own phase offset (so it doesn't always emerge first)
    const mainOffsetTime = (time + this.mainPatternPhaseOffset) % COHERENCE_PERIOD;
    let wavePosition: number;
    if (mainOffsetTime < SWEEP_DURATION) {
      // Wave is actively sweeping
      wavePosition = mainOffsetTime / SWEEP_DURATION;
    } else {
      // Wave is off - no triggering during the dark pause
      wavePosition = -1;
    }

    // Fade the afterglow buffer each frame (higher alpha = faster fade)
    this.afterglowCtx.fillStyle = 'rgba(10, 8, 20, 0.15)';
    this.afterglowCtx.fillRect(0, 0, width, height);

    // Update each firefly using state-based timing
    for (const firefly of this.fireflies) {
      // Check if coherence wave should trigger this firefly
      const distanceFromWave = Math.abs(firefly.pathPosition - wavePosition);
      const isNearWave = distanceFromWave < 0.08;

      // Trigger firefly when wave passes and it's currently dark
      if (isNearWave && firefly.state === 'dark' && !firefly.triggered) {
        firefly.triggered = true;
        firefly.state = 'fading-in';
        firefly.stateStartTime = time;
        firefly.stateDuration = this.getPatternFireflyDuration('fading-in');
      }

      // Update brightness based on current state
      const timeInState = time - firefly.stateStartTime;
      const progress = Math.min(1, timeInState / firefly.stateDuration);

      switch (firefly.state) {
        case 'dark':
          firefly.brightness = 0;
          break;
        case 'fading-in':
          // Ease in (slow start, faster end) - can reach full brightness
          firefly.brightness = progress * progress;
          break;
        case 'bright':
          // Slight flicker while bright
          firefly.brightness = 0.85 + Math.sin(time * 3 + firefly.x * 10) * 0.15;
          break;
        case 'fading-out':
          // Ease out (fast start, slow end)
          firefly.brightness = (1 - progress) * (1 - progress);
          break;
      }

      // Transition to next state when duration elapsed
      if (timeInState >= firefly.stateDuration) {
        const nextState = this.getNextState(firefly.state) as FireflyState['state'];
        firefly.state = nextState;
        firefly.stateStartTime = time;
        firefly.stateDuration = this.getPatternFireflyDuration(nextState);
        // Reset triggered when going back to dark so it can be triggered again
        if (nextState === 'dark') {
          firefly.triggered = false;
        }
      }

      // Track peak times for afterglow
      if (firefly.brightness > 0.7) {
        firefly.peakTime = time;
      }

      // Update afterglow (decays over time since last peak)
      const timeSincePeak = time - firefly.peakTime;
      firefly.afterglow = Math.max(0, 1 - timeSincePeak / AFTERGLOW_DURATION) * 0.6;

      // Draw afterglow to buffer if significant (subtle, same color as random fireflies)
      if (firefly.afterglow > 0.1) {
        const ax = firefly.x * width;
        const ay = firefly.y * height;
        const glowRadius = 4 + firefly.afterglow * 4;

        const gradient = this.afterglowCtx.createRadialGradient(ax, ay, 0, ax, ay, glowRadius);
        const alpha = Math.floor(firefly.afterglow * 40);
        gradient.addColorStop(0, '#ffee88' + alpha.toString(16).padStart(2, '0'));
        gradient.addColorStop(1, 'transparent');

        this.afterglowCtx.fillStyle = gradient;
        this.afterglowCtx.beginPath();
        this.afterglowCtx.arc(ax, ay, glowRadius, 0, Math.PI * 2);
        this.afterglowCtx.fill();
      }
    }

    // Update distraction pattern fireflies (patterns that don't match options)
    for (const pattern of this.distractionPatternFireflies) {
      // Each distraction pattern has its own phase offset for emergence timing
      const offsetTime = time + pattern.phaseOffset;
      const patternCycleTime = offsetTime % COHERENCE_PERIOD;
      let patternWavePosition: number;
      if (patternCycleTime < SWEEP_DURATION) {
        patternWavePosition = patternCycleTime / SWEEP_DURATION;
      } else {
        patternWavePosition = -1;
      }

      for (const firefly of pattern.fireflies) {
        // Check if coherence wave should trigger this firefly
        const distanceFromWave = Math.abs(firefly.pathPosition - patternWavePosition);
        const isNearWave = distanceFromWave < 0.08;

        // Trigger firefly when wave passes and it's currently dark
        if (isNearWave && firefly.state === 'dark' && !firefly.triggered) {
          firefly.triggered = true;
          firefly.state = 'fading-in';
          firefly.stateStartTime = time;
          firefly.stateDuration = this.getPatternFireflyDuration('fading-in');
        }

        // Update brightness based on current state
        const timeInState = time - firefly.stateStartTime;
        const progress = Math.min(1, timeInState / firefly.stateDuration);

        switch (firefly.state) {
          case 'dark':
            firefly.brightness = 0;
            break;
          case 'fading-in':
            firefly.brightness = progress * progress;
            break;
          case 'bright':
            firefly.brightness = 0.85 + Math.sin(time * 3 + firefly.x * 10) * 0.15;
            break;
          case 'fading-out':
            firefly.brightness = (1 - progress) * (1 - progress);
            break;
        }

        // Transition to next state when duration elapsed
        if (timeInState >= firefly.stateDuration) {
          const nextState = this.getNextState(firefly.state) as FireflyState['state'];
          firefly.state = nextState;
          firefly.stateStartTime = time;
          firefly.stateDuration = this.getPatternFireflyDuration(nextState);
          if (nextState === 'dark') {
            firefly.triggered = false;
          }
        }

        if (firefly.brightness > 0.7) {
          firefly.peakTime = time;
        }

        const timeSincePeak = time - firefly.peakTime;
        firefly.afterglow = Math.max(0, 1 - timeSincePeak / AFTERGLOW_DURATION) * 0.6;

        // Draw afterglow to buffer (subtle, same color as random fireflies)
        if (firefly.afterglow > 0.1) {
          const ax = firefly.x * width;
          const ay = firefly.y * height;
          const glowRadius = 4 + firefly.afterglow * 4;

          const gradient = this.afterglowCtx.createRadialGradient(ax, ay, 0, ax, ay, glowRadius);
          const alpha = Math.floor(firefly.afterglow * 40);
          gradient.addColorStop(0, '#ffee88' + alpha.toString(16).padStart(2, '0'));
          gradient.addColorStop(1, 'transparent');

          this.afterglowCtx.fillStyle = gradient;
          this.afterglowCtx.beginPath();
          this.afterglowCtx.arc(ax, ay, glowRadius, 0, Math.PI * 2);
          this.afterglowCtx.fill();
        }
      }
    }

    // Update distraction fireflies (organic state-based timing)
    for (const firefly of this.distractionFireflies) {
      const timeInState = time - firefly.stateStartTime;
      const progress = Math.min(1, timeInState / firefly.stateDuration);

      // Update brightness based on current state
      switch (firefly.state) {
        case 'dark':
          firefly.brightness = 0;
          break;
        case 'fading-in':
          // Ease in (slow start, faster end) - can reach full brightness
          firefly.brightness = progress * progress;
          break;
        case 'bright':
          // Slight flicker while bright - peak around 0.85-1.0
          firefly.brightness = 0.85 + Math.sin(time * 3 + firefly.x * 10) * 0.15;
          break;
        case 'fading-out':
          // Ease out (fast start, slow end) - starts from full brightness
          firefly.brightness = (1 - progress) * (1 - progress);
          break;
      }

      // Transition to next state when duration elapsed
      if (timeInState >= firefly.stateDuration) {
        firefly.state = this.getNextState(firefly.state);
        firefly.stateStartTime = time;
        firefly.stateDuration = this.getRandomStateDuration(firefly.state);
      }
    }

    // Draw afterglow buffer first (background layer)
    ctx.drawImage(this.afterglowCanvas, 0, 0);

    // Draw distraction fireflies first (behind main fireflies)
    for (const firefly of this.distractionFireflies) {
      if (firefly.brightness < 0.05) continue;

      const x = firefly.x * width;
      const y = firefly.y * height;

      const glowRadius = 4 + firefly.brightness * 6;
      const glowAlpha = Math.floor(firefly.brightness * 120);

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
      gradient.addColorStop(0, '#ffffcc' + glowAlpha.toString(16).padStart(2, '0'));
      gradient.addColorStop(0.5, '#ffee88' + Math.floor(glowAlpha * 0.4).toString(16).padStart(2, '0'));
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // Bright core (when very bright)
      if (firefly.brightness > 0.5) {
        const coreRadius = 2 + firefly.brightness * 2;
        ctx.fillStyle = `rgba(255, 255, 255, ${firefly.brightness})`;
        ctx.beginPath();
        ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw distraction pattern fireflies (same brightness as random fireflies)
    for (const pattern of this.distractionPatternFireflies) {
      for (const firefly of pattern.fireflies) {
        if (firefly.brightness < 0.05) continue;

        const x = firefly.x * width;
        const y = firefly.y * height;

        const glowRadius = 4 + firefly.brightness * 6;
        const glowAlpha = Math.floor(firefly.brightness * 120);

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
        gradient.addColorStop(0, '#ffffcc' + glowAlpha.toString(16).padStart(2, '0'));
        gradient.addColorStop(0.5, '#ffee88' + Math.floor(glowAlpha * 0.4).toString(16).padStart(2, '0'));
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Bright core (when very bright)
        if (firefly.brightness > 0.5) {
          const coreRadius = 2 + firefly.brightness * 2;
          ctx.fillStyle = `rgba(255, 255, 255, ${firefly.brightness})`;
          ctx.beginPath();
          ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw main trajectory fireflies on top (same brightness as distraction fireflies)
    for (const firefly of this.fireflies) {
      if (firefly.brightness < 0.05) continue;

      const x = firefly.x * width;
      const y = firefly.y * height;

      // Same glow size as random distraction fireflies
      const glowRadius = 4 + firefly.brightness * 6;
      const glowAlpha = Math.floor(firefly.brightness * 120);

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
      gradient.addColorStop(0, '#ffffcc' + glowAlpha.toString(16).padStart(2, '0'));
      gradient.addColorStop(0.5, '#ffee88' + Math.floor(glowAlpha * 0.4).toString(16).padStart(2, '0'));
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // Bright core (when very bright)
      if (firefly.brightness > 0.5) {
        const coreRadius = 2 + firefly.brightness * 2;
        ctx.fillStyle = `rgba(255, 255, 255, ${firefly.brightness})`;
        ctx.beginPath();
        ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
        ctx.fill();
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
