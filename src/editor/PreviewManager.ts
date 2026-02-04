/**
 * PreviewManager
 *
 * Handles opening the game preview in a new window.
 * Supports two modes:
 * - Development: sends project data via postMessage
 * - Production: loads from published files
 */

export interface ProjectData {
  version: number;
  meta?: {
    gameId: string;
    name: string;
  };
  seasons?: unknown[];
  episodes?: unknown[];
  dialogues: unknown[];
  quests: unknown[];
  npcs: unknown[];
  items: unknown[];
  inspections: unknown[];
  regions?: unknown[];
  playerCaster?: unknown;
  spells?: unknown[];
  resonancePoints?: unknown[];
  vfxDefinitions?: unknown[];
}

export class PreviewManager {
  private previewWindow: Window | null = null;
  private pendingProjectData: ProjectData | null = null;
  private pendingEpisodeId: string | undefined = undefined;

  constructor() {
    // Listen for ready message from preview window
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'PREVIEW_READY') {
        this.sendPendingData();
      }
    });
  }

  openPreview(): void {
    this.openPreviewWithData(null, undefined);
  }

  openPreviewWithData(projectData: ProjectData | null, episodeId?: string): void {
    this.pendingProjectData = projectData;
    this.pendingEpisodeId = episodeId;

    // If window already exists and is open, send update
    if (this.previewWindow && !this.previewWindow.closed) {
      this.sendPendingData();
      this.previewWindow.focus();
      return;
    }

    // Open preview in new window
    const width = 1280;
    const height = 720;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;

    this.previewWindow = window.open(
      '/preview.html',
      'SugarEnginePreview',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes`
    );

    if (this.previewWindow) {
      this.previewWindow.focus();
    }
  }

  private sendPendingData(): void {
    if (!this.previewWindow || this.previewWindow.closed) return;
    if (!this.pendingProjectData) return;

    this.previewWindow.postMessage({
      type: 'LOAD_PROJECT',
      project: this.pendingProjectData,
      episodeId: this.pendingEpisodeId,
    }, '*');
  }

  /**
   * Send updated project data to preview (for hot reload)
   */
  syncChanges(projectData: ProjectData): void {
    if (this.previewWindow && !this.previewWindow.closed) {
      this.previewWindow.postMessage({
        type: 'UPDATE_PROJECT',
        project: projectData,
      }, '*');
    }
  }

  closePreview(): void {
    if (this.previewWindow && !this.previewWindow.closed) {
      this.previewWindow.close();
      this.previewWindow = null;
    }
  }

  isPreviewOpen(): boolean {
    return this.previewWindow !== null && !this.previewWindow.closed;
  }
}
