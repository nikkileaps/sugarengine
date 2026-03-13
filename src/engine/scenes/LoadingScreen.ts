/**
 * Simple loading screen overlay shown while assets load.
 * Not menu-based, so doesn't extend Screen.
 */
export class LoadingScreen {
  private element: HTMLDivElement;
  private progressBar: HTMLDivElement;
  private statusText: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.injectStyles();

    this.element = document.createElement('div');
    this.element.className = 'loading-screen';

    const content = document.createElement('div');
    content.className = 'loading-content';

    this.statusText = document.createElement('div');
    this.statusText.className = 'loading-status';
    this.statusText.textContent = 'Loading...';
    content.appendChild(this.statusText);

    const track = document.createElement('div');
    track.className = 'loading-track';

    this.progressBar = document.createElement('div');
    this.progressBar.className = 'loading-bar';
    track.appendChild(this.progressBar);
    content.appendChild(track);

    this.element.appendChild(content);
    container.appendChild(this.element);
  }

  show(): void {
    this.setProgress(0, 0);
    this.element.classList.add('visible');
  }

  hide(): void {
    this.element.classList.remove('visible');
  }

  setProgress(loaded: number, total: number): void {
    if (total === 0) {
      this.statusText.textContent = 'Loading...';
      this.progressBar.style.width = '0%';
    } else {
      const pct = Math.round((loaded / total) * 100);
      this.statusText.textContent = `Loading assets... ${loaded}/${total}`;
      this.progressBar.style.width = `${pct}%`;
    }
  }

  dispose(): void {
    this.element.remove();
  }

  private injectStyles(): void {
    if (document.getElementById('loading-screen-styles')) return;
    const style = document.createElement('style');
    style.id = 'loading-screen-styles';
    style.textContent = `
      .loading-screen {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        display: none;
        justify-content: center;
        align-items: center;
        background: #0a0a0f;
        z-index: 600;
        font-family: 'Segoe UI', system-ui, sans-serif;
        color: #f0e6d8;
      }

      .loading-screen.visible {
        display: flex;
      }

      .loading-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        width: 280px;
      }

      .loading-status {
        font-size: 14px;
        color: rgba(240, 230, 216, 0.7);
      }

      .loading-track {
        width: 100%;
        height: 4px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        overflow: hidden;
      }

      .loading-bar {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #88b4dc, #a8d4f0);
        border-radius: 2px;
        transition: width 0.2s ease-out;
      }
    `;
    document.head.appendChild(style);
  }
}
