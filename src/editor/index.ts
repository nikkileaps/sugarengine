/**
 * Sugar Engine Editor
 *
 * Development tooling for composing game content:
 * - NPC placement and configuration
 * - Trigger zone editing
 * - Dialogue tree authoring
 * - Quest design
 * - Live preview and testing
 */

export class Editor {
  private enabled = false;

  constructor() {}

  init(_container: HTMLElement): void {
    this.createToggleButton();
  }

  private createToggleButton(): void {
    const button = document.createElement('button');
    button.textContent = '⚙️';
    button.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      width: 40px;
      height: 40px;
      border-radius: 8px;
      border: none;
      background: rgba(0, 0, 0, 0.6);
      color: white;
      font-size: 20px;
      cursor: pointer;
      z-index: 10000;
      transition: background 0.2s;
    `;
    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(0, 0, 0, 0.8)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = 'rgba(0, 0, 0, 0.6)';
    });
    button.addEventListener('click', () => this.toggle());
    document.body.appendChild(button);
  }

  toggle(): void {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.show();
    } else {
      this.hide();
    }
  }

  private show(): void {
    console.log('Editor opened - TODO: implement editor panel');
    // TODO: Create and show editor panel
  }

  private hide(): void {
    console.log('Editor closed');
    // TODO: Hide editor panel
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
