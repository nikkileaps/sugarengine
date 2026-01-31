import * as THREE from 'three';
import { QuestManager } from '../quests/QuestManager';
import type { LODStats } from '../systems';

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
  private renderInfo: HTMLDivElement;
  private lodInfo: HTMLDivElement;
  private customInfo: HTMLDivElement;

  private quests: QuestManager;
  private getPlayerPosition: (() => { x: number; y: number; z: number } | null) | null = null;
  private getRegionInfo: (() => { path: string; name?: string } | null) | null = null;
  private getLODStats: (() => LODStats) | null = null;
  private setForcedLOD: ((level: 0 | 1 | null) => void) | null = null;
  private getForcedLOD: (() => 0 | 1 | null) | null = null;
  private renderer: THREE.WebGLRenderer | null = null;

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

    // Quest info (with hover tooltip)
    this.questInfo = document.createElement('div');
    this.questInfo.style.cssText = 'margin-bottom: 8px; color: #ffcc80; pointer-events: auto; cursor: default;';
    this.container.appendChild(this.questInfo);

    // Render stats
    this.renderInfo = document.createElement('div');
    this.renderInfo.style.cssText = 'color: #ff8080; font-size: 10px;';
    this.container.appendChild(this.renderInfo);

    // LOD stats (clickable to cycle force mode)
    this.lodInfo = document.createElement('div');
    this.lodInfo.style.cssText = 'margin-top: 8px; color: #80ffff; font-size: 10px; display: none; cursor: pointer; pointer-events: auto;';
    this.lodInfo.title = 'Click to cycle: Auto → Force LOD0 → Force LOD1';
    this.lodInfo.addEventListener('click', () => this.cycleForcedLOD());
    this.container.appendChild(this.lodInfo);

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
   * Set function to get LOD stats
   */
  setLODStatsProvider(fn: () => LODStats): void {
    this.getLODStats = fn;
    this.lodInfo.style.display = 'block';
  }

  /**
   * Set functions to control forced LOD level
   */
  setForcedLODControls(
    setter: (level: 0 | 1 | null) => void,
    getter: () => 0 | 1 | null
  ): void {
    this.setForcedLOD = setter;
    this.getForcedLOD = getter;
  }

  /**
   * Cycle through forced LOD modes: Auto → LOD0 → LOD1 → Auto
   */
  private cycleForcedLOD(): void {
    if (!this.setForcedLOD || !this.getForcedLOD) return;

    const current = this.getForcedLOD();
    if (current === null) {
      this.setForcedLOD(0);
    } else if (current === 0) {
      this.setForcedLOD(1);
    } else {
      this.setForcedLOD(null);
    }
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

  /**
   * Set renderer for render stats
   */
  setRenderer(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
    // Disable auto-reset so stats accumulate until we read them
    this.renderer.info.autoReset = false;
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

    // Quest info - show count, hover for details
    const activeQuests = this.quests.getActiveQuests();
    const count = activeQuests.length;
    if (count > 0) {
      // Build tooltip with quest names
      const questNames: string[] = [];
      for (const questState of activeQuests) {
        const loaded = this.quests.getQuestDefinition(questState.questId);
        if (loaded) {
          questNames.push(loaded.definition.name);
        } else {
          questNames.push(`(${questState.questId.slice(0, 8)}...)`);
        }
      }
      this.questInfo.textContent = `Quests: ${count}`;
      this.questInfo.title = questNames.join('\n');
    } else {
      this.questInfo.textContent = `Quests: 0`;
      this.questInfo.title = '';
    }

    // Render stats - only update once per second (with FPS)
    if (this.renderer && this.frameCount === 0) {
      const info = this.renderer.info;
      const triangles = info.render.triangles;
      const calls = info.render.calls;
      const geometries = info.memory.geometries;
      // Show per-frame stats (divide by FPS)
      const trisPerFrame = this.fps > 0 ? Math.round(triangles / this.fps) : triangles;
      const callsPerFrame = this.fps > 0 ? Math.round(calls / this.fps) : calls;
      this.renderInfo.textContent = `Tris: ${trisPerFrame.toLocaleString()} | Calls: ${callsPerFrame} | Geo: ${geometries.toLocaleString()}`;
      // Reset for next second
      info.reset();
    }

    // LOD stats
    if (this.getLODStats) {
      const stats = this.getLODStats();
      const forcedMode = this.getForcedLOD ? this.getForcedLOD() : null;
      const modeLabel = forcedMode === null ? '' : forcedMode === 0 ? ' [FORCE HI]' : ' [FORCE LO]';

      if (stats.totalPatches > 0) {
        this.lodInfo.textContent = `LOD: ${stats.lod0Count}/${stats.totalPatches} hi${modeLabel}`;
      } else {
        this.lodInfo.textContent = `LOD: no patches${modeLabel}`;
      }
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
