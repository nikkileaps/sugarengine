/**
 * FadeOverlay - Simple black fade transition overlay
 *
 * Used for cinematic transitions like title screen -> gameplay
 */

export class FadeOverlay {
  private overlay: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: black;
      opacity: 0;
      pointer-events: none;
      z-index: 9999;
    `;
    container.appendChild(this.overlay);
  }

  /**
   * Fade the screen to black
   */
  fadeToBlack(durationMs: number = 500): Promise<void> {
    return new Promise((resolve) => {
      this.overlay.style.transition = `opacity ${durationMs}ms ease-in-out`;
      // Force reflow to ensure transition applies
      this.overlay.offsetHeight;
      this.overlay.style.opacity = '1';
      setTimeout(resolve, durationMs);
    });
  }

  /**
   * Fade from black back to visible
   */
  fadeFromBlack(durationMs: number = 500): Promise<void> {
    return new Promise((resolve) => {
      this.overlay.style.transition = `opacity ${durationMs}ms ease-in-out`;
      // Force reflow to ensure transition applies
      this.overlay.offsetHeight;
      this.overlay.style.opacity = '0';
      setTimeout(resolve, durationMs);
    });
  }

  /**
   * Set opacity directly (no animation)
   */
  setOpacity(opacity: number): void {
    this.overlay.style.transition = 'none';
    this.overlay.style.opacity = String(opacity);
  }

  /**
   * Check if currently faded to black
   */
  isBlack(): boolean {
    return this.overlay.style.opacity === '1';
  }

  /**
   * Clean up the overlay element
   */
  dispose(): void {
    this.overlay.remove();
  }
}
