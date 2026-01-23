/**
 * PreviewManager
 *
 * Handles opening the game preview in a new window.
 */

export class PreviewManager {
  private previewWindow: Window | null = null;

  constructor() {}

  openPreview(): void {
    // If window already exists and is open, focus it
    if (this.previewWindow && !this.previewWindow.closed) {
      this.previewWindow.focus();
      return;
    }

    // Open preview in new window
    // The preview page is a separate entry point that just runs the game
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
