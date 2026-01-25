import { QuestManager } from '../quests/QuestManager';

/**
 * Debug HUD for Preview mode - shows quest state, player position, and other dev info.
 * Not intended for players, only for developers testing the game.
 */
export class DebugHUD {
  private container: HTMLDivElement;
  private regionInfo: HTMLDivElement;
  private questInfo: HTMLDivElement;
  private positionInfo: HTMLDivElement;
  private fpsInfo: HTMLDivElement;
  private customInfo: HTMLDivElement;

  private quests: QuestManager;
  private getPlayerPosition: (() => { x: number; y: number; z: number } | null) | null = null;
  private getRegionInfo: (() => { path: string; name?: string } | null) | null = null;

  private lastFrameTime = performance.now();
  private frameCount = 0;
  private fps = 0;

  constructor(parentContainer: HTMLElement, quests: QuestManager) {
    this.quests = quests;

    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: absolute;
      top: 12px;
      right: 12px;
      background: rgba(0, 0, 0, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 12px;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      font-size: 11px;
      color: #a0ffa0;
      min-width: 200px;
      max-width: 280px;
      z-index: 1000;
      pointer-events: none;
    `;

    // Header
    const header = document.createElement('div');
    header.textContent = 'DEBUG';
    header.style.cssText = `
      font-weight: bold;
      font-size: 10px;
      color: #ff9900;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      letter-spacing: 1px;
    `;
    this.container.appendChild(header);

    // FPS
    this.fpsInfo = document.createElement('div');
    this.fpsInfo.style.cssText = 'margin-bottom: 8px; color: #80ff80;';
    this.container.appendChild(this.fpsInfo);

    // Position
    this.positionInfo = document.createElement('div');
    this.positionInfo.style.cssText = 'margin-bottom: 8px; color: #80c0ff;';
    this.container.appendChild(this.positionInfo);

    // Region info
    this.regionInfo = document.createElement('div');
    this.regionInfo.style.cssText = 'margin-bottom: 8px; color: #c080ff;';
    this.container.appendChild(this.regionInfo);

    // Quest info
    this.questInfo = document.createElement('div');
    this.questInfo.style.cssText = 'color: #ffcc80;';
    this.container.appendChild(this.questInfo);

    // Custom info slot
    this.customInfo = document.createElement('div');
    this.customInfo.style.cssText = 'margin-top: 8px; color: #c0c0c0; display: none;';
    this.container.appendChild(this.customInfo);

    parentContainer.appendChild(this.container);

    // Start update loop
    this.update();
  }

  /**
   * Set function to get player position
   */
  setPlayerPositionProvider(fn: () => { x: number; y: number; z: number } | null): void {
    this.getPlayerPosition = fn;
  }

  /**
   * Set function to get current region info
   */
  setRegionInfoProvider(fn: () => { path: string; name?: string } | null): void {
    this.getRegionInfo = fn;
  }

  /**
   * Set custom debug info
   */
  setCustomInfo(text: string | null): void {
    if (text) {
      this.customInfo.textContent = text;
      this.customInfo.style.display = 'block';
    } else {
      this.customInfo.style.display = 'none';
    }
  }

  private update = (): void => {
    // FPS calculation
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFrameTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFrameTime = now;
    }
    this.fpsInfo.textContent = `FPS: ${this.fps}`;

    // Position
    if (this.getPlayerPosition) {
      const pos = this.getPlayerPosition();
      if (pos) {
        this.positionInfo.textContent = `Pos: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;
      } else {
        this.positionInfo.textContent = 'Pos: --';
      }
    } else {
      this.positionInfo.textContent = '';
    }

    // Region info
    if (this.getRegionInfo) {
      const region = this.getRegionInfo();
      if (region) {
        const name = region.name || region.path;
        this.regionInfo.textContent = `Region: ${name}`;
      } else {
        this.regionInfo.textContent = 'Region: (none)';
      }
    } else {
      this.regionInfo.textContent = 'Region: --';
    }

    // Quest info
    const activeQuests = this.quests.getActiveQuests();
    if (activeQuests.length > 0) {
      const lines: string[] = ['Quests:'];
      for (const questState of activeQuests) {
        const loaded = this.quests.getQuestDefinition(questState.questId);
        if (!loaded) continue;

        const questName = loaded.definition.name;
        const stage = loaded.stageMap.get(questState.currentStageId);
        const stageDesc = stage?.description || questState.currentStageId;

        lines.push(`  ${questName}`);
        lines.push(`    Stage: ${stageDesc}`);

        // Show objectives from progress map
        for (const [, obj] of questState.objectiveProgress) {
          const check = obj.completed ? '[x]' : '[ ]';
          lines.push(`    ${check} ${obj.description}`);
        }
      }
      this.questInfo.innerHTML = lines.join('<br>');
    } else {
      this.questInfo.textContent = 'Quests: none';
    }

    requestAnimationFrame(this.update);
  };

  show(): void {
    this.container.style.display = 'block';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  dispose(): void {
    this.container.remove();
  }
}
