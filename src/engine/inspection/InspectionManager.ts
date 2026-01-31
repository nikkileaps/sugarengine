import { InspectionLoader } from './InspectionLoader';
import { InspectionData, LoadedInspection } from './types';
import { InspectionUI } from '../ui/InspectionUI';

/**
 * Manages inspection flow - loading and displaying inspection content
 */
export class InspectionManager {
  private loader: InspectionLoader;
  private inspectionUI: InspectionUI;

  private currentInspection: LoadedInspection | null = null;
  private isActive = false;

  private onInspectionStart: (() => void) | null = null;
  private onInspectionEnd: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.loader = new InspectionLoader();
    this.inspectionUI = new InspectionUI(container);
  }

  /**
   * Set callback for when inspection starts
   */
  setOnStart(handler: () => void): void {
    this.onInspectionStart = handler;
  }

  /**
   * Set callback for when inspection ends
   */
  setOnEnd(handler: () => void): void {
    this.onInspectionEnd = handler;
  }

  /**
   * Start an inspection by ID
   */
  async start(inspectionId: string): Promise<void> {
    if (this.isActive) {
      this.end();
    }

    try {
      this.currentInspection = await this.loader.load(inspectionId);
    } catch (error) {
      console.error(`Failed to load inspection: ${inspectionId}`, error);
      return;
    }

    this.isActive = true;

    if (this.onInspectionStart) {
      this.onInspectionStart();
    }

    // Show inspection content
    this.inspectionUI.show(this.currentInspection.data, () => {
      this.end();
    });
  }

  /**
   * End the current inspection
   */
  end(): void {
    if (!this.isActive) return; // Prevent re-entry

    this.isActive = false;
    this.inspectionUI.hide();
    this.currentInspection = null;

    if (this.onInspectionEnd) {
      this.onInspectionEnd();
    }
  }

  /**
   * Check if inspection is currently active
   */
  isInspectionActive(): boolean {
    return this.isActive;
  }

  /**
   * Get current inspection data
   */
  getCurrentInspection(): InspectionData | null {
    return this.currentInspection?.data ?? null;
  }

  /**
   * Preload inspections for faster access
   */
  async preload(inspectionIds: string[]): Promise<void> {
    await this.loader.preloadAll(inspectionIds);
  }

  /**
   * Register an inspection directly (for development mode)
   */
  registerInspection(inspectionId: string, data: InspectionData): void {
    this.loader.register(inspectionId, data);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.inspectionUI.dispose();
  }
}
