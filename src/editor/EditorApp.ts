/**
 * EditorApp - Main editor interface
 *
 * This is the primary interface when developing a game.
 * The game itself is previewed in a separate window.
 */

import { Toolbar } from './Toolbar';
import { PreviewManager } from './PreviewManager';

export class EditorApp {
  private container: HTMLElement;
  private toolbar: Toolbar;
  private previewManager: PreviewManager;
  private mainContent!: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.innerHTML = '';

    // Set up editor styles
    this.setupStyles();

    // Create layout
    this.createLayout();

    // Initialize subsystems
    this.previewManager = new PreviewManager();
    this.toolbar = new Toolbar({
      onPreview: () => this.previewManager.openPreview(),
      onPublish: () => this.handlePublish(),
    });

    // Mount toolbar
    this.container.insertBefore(this.toolbar.getElement(), this.mainContent);
  }

  private setupStyles(): void {
    this.container.style.cssText = `
      width: 100vw;
      height: 100vh;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      background: #1e1e2e;
      color: #cdd6f4;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
    `;
  }

  private createLayout(): void {
    // Main content area (will contain panels, viewport, etc.)
    this.mainContent = document.createElement('div');
    this.mainContent.style.cssText = `
      flex: 1;
      display: flex;
      overflow: hidden;
    `;

    // Placeholder content
    const placeholder = document.createElement('div');
    placeholder.style.cssText = `
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 20px;
      color: #6c7086;
    `;
    placeholder.innerHTML = `
      <div style="font-size: 48px;">🎮</div>
      <div style="font-size: 24px; font-weight: 600;">Sugar Engine Editor</div>
      <div style="font-size: 14px; max-width: 400px; text-align: center; line-height: 1.6;">
        Click <strong>Preview</strong> to playtest your game in a new window.<br>
        Click <strong>Publish</strong> to deploy to Netlify.
      </div>
    `;

    this.mainContent.appendChild(placeholder);
    this.container.appendChild(this.mainContent);
  }

  private async handlePublish(): Promise<void> {
    // For now, just build and show instructions
    const confirmed = confirm(
      'This will build your game for production.\n\n' +
      'After building, you can:\n' +
      '1. Drag the "dist" folder to Netlify\n' +
      '2. Or use "netlify deploy" CLI\n\n' +
      'Proceed with build?'
    );

    if (confirmed) {
      alert(
        'To build for production, run:\n\n' +
        'npm run build\n\n' +
        'Then deploy the "dist" folder to Netlify.'
      );
    }
  }
}
