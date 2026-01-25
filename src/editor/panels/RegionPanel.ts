/**
 * RegionPanel - Editor for region entity spawns
 *
 * Features:
 * - Region list with entity counts
 * - Entity spawn management (NPCs, Items, Inspectables, Triggers)
 * - Position editing for each spawn
 * - Component preview (shows what components will be created)
 * - Availability gating (fromEpisode/untilEpisode)
 */

import { BasePanel } from './BasePanel';
import { editorStore } from '../store';
import { generateUUID, shortId } from '../utils';
import type { FieldDefinition } from '../components';
import type {
  RegionData,
  NPCDefinition,
  PickupDefinition,
  InspectableDefinition,
  TriggerDefinition,
  Vec3,
} from '../../engine/loaders/RegionLoader';

type SpawnType = 'npc' | 'pickup' | 'inspectable' | 'trigger';

interface SpawnEntry {
  id: string;
  type: SpawnType;
  position: Vec3;
  data: NPCDefinition | PickupDefinition | InspectableDefinition | TriggerDefinition;
}

// Available references for spawn editing
let availableNPCs: { id: string; name: string }[] = [];
let availableItems: { id: string; name: string }[] = [];
let availableInspections: { id: string; displayName?: string }[] = [];
let availableEpisodes: { id: string; name: string }[] = [];

export function setAvailableNPCsForRegion(npcs: typeof availableNPCs): void {
  availableNPCs = npcs;
}

export function setAvailableItemsForRegion(items: typeof availableItems): void {
  availableItems = items;
}

export function setAvailableInspectionsForRegion(inspections: typeof availableInspections): void {
  availableInspections = inspections;
}

export function setAvailableEpisodesForRegion(episodes: typeof availableEpisodes): void {
  availableEpisodes = episodes;
}

const REGION_FIELDS: FieldDefinition[] = [
  { key: 'id', label: 'ID', type: 'text', required: true, readonly: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'geometryPath', label: 'Geometry Path', type: 'text', required: true, placeholder: 'cafe-nollie' },
  { key: 'playerSpawnX', label: 'Spawn X', type: 'number' },
  { key: 'playerSpawnY', label: 'Spawn Y', type: 'number' },
  { key: 'playerSpawnZ', label: 'Spawn Z', type: 'number' },
  { key: 'fromEpisode', label: 'Available From Episode', type: 'text', placeholder: 'episode-uuid' },
  { key: 'untilEpisode', label: 'Available Until Episode', type: 'text', placeholder: 'episode-uuid' },
];

export class RegionPanel extends BasePanel {
  private regions: Map<string, RegionData> = new Map();
  private currentRegionId: string | null = null;
  private selectedSpawnId: string | null = null;

  constructor() {
    super({
      title: 'Regions',
      inspectorTitle: 'Region Properties',
      inspectorFields: REGION_FIELDS,
      onCreate: () => this.createNewRegion(),
    });

    this.renderCenterPlaceholder();
  }

  addRegion(region: RegionData): void {
    const id = region.id || generateUUID();
    region.id = id;
    this.regions.set(id, region);
    this.updateEntryList();
  }

  getRegions(): RegionData[] {
    return Array.from(this.regions.values());
  }

  clear(): void {
    this.regions.clear();
    this.currentRegionId = null;
    this.selectedSpawnId = null;
    this.updateEntryList();
    this.clearInspector();
    this.renderCenterPlaceholder();
  }

  private updateEntryList(): void {
    const items = Array.from(this.regions.values()).map(r => {
      const spawnCount = this.getSpawnCount(r);
      const geometryPath = r.geometry?.path || 'no geometry';
      return {
        id: r.id,
        name: r.name,
        subtitle: `${spawnCount} spawns · ${geometryPath}`,
        icon: '🗺️',
      };
    });
    this.setEntries(items);
  }

  private getSpawnCount(region: RegionData): number {
    return (
      (region.npcs?.length || 0) +
      (region.pickups?.length || 0) +
      (region.inspectables?.length || 0) +
      (region.triggers?.length || 0)
    );
  }

  private getSpawns(region: RegionData): SpawnEntry[] {
    const spawns: SpawnEntry[] = [];

    for (const npc of region.npcs || []) {
      spawns.push({
        id: npc.id,
        type: 'npc',
        position: npc.position,
        data: npc,
      });
    }

    for (const pickup of region.pickups || []) {
      spawns.push({
        id: pickup.id,
        type: 'pickup',
        position: pickup.position,
        data: pickup,
      });
    }

    for (const inspectable of region.inspectables || []) {
      spawns.push({
        id: inspectable.id,
        type: 'inspectable',
        position: inspectable.position,
        data: inspectable,
      });
    }

    for (const trigger of region.triggers || []) {
      const center: Vec3 = {
        x: (trigger.bounds.min[0] + trigger.bounds.max[0]) / 2,
        y: (trigger.bounds.min[1] + trigger.bounds.max[1]) / 2,
        z: (trigger.bounds.min[2] + trigger.bounds.max[2]) / 2,
      };
      spawns.push({
        id: trigger.id,
        type: 'trigger',
        position: center,
        data: trigger,
      });
    }

    return spawns;
  }

  private renderCenterPlaceholder(): void {
    const placeholder = document.createElement('div');
    placeholder.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #6c7086;
      gap: 12px;
    `;
    placeholder.innerHTML = `
      <div style="font-size: 48px;">🗺️</div>
      <div style="font-size: 16px;">Select a region to edit</div>
      <div style="font-size: 13px; max-width: 300px; text-align: center; line-height: 1.5;">
        Regions define where entities spawn when players enter an area.
      </div>
    `;
    this.setCenterContent(placeholder);
  }

  private renderRegionDetail(region: RegionData): void {
    const detail = document.createElement('div');
    detail.style.cssText = `
      flex: 1;
      overflow: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const title = document.createElement('h2');
    title.textContent = region.name;
    title.style.cssText = `
      margin: 0;
      font-size: 24px;
      color: #cdd6f4;
    `;
    header.appendChild(title);

    const addButton = document.createElement('button');
    addButton.textContent = '+ Add Spawn';
    addButton.style.cssText = `
      padding: 8px 16px;
      background: #89b4fa;
      color: #1e1e2e;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      font-weight: 500;
    `;
    addButton.onclick = () => this.showAddSpawnDialog(region);
    header.appendChild(addButton);

    detail.appendChild(header);

    // Player spawn section
    const spawnSection = this.createSection('Player Spawn', '📍');
    const spawnInfo = document.createElement('div');
    spawnInfo.style.cssText = `
      display: flex;
      gap: 16px;
      padding: 12px;
      background: #1e1e2e;
      border-radius: 6px;
    `;
    spawnInfo.innerHTML = `
      <div><strong>X:</strong> ${region.playerSpawn.x.toFixed(1)}</div>
      <div><strong>Y:</strong> ${region.playerSpawn.y.toFixed(1)}</div>
      <div><strong>Z:</strong> ${region.playerSpawn.z.toFixed(1)}</div>
    `;
    spawnSection.appendChild(spawnInfo);
    detail.appendChild(spawnSection);

    // Entity spawns by type
    const spawns = this.getSpawns(region);
    const spawnsByType = new Map<SpawnType, SpawnEntry[]>();

    for (const spawn of spawns) {
      if (!spawnsByType.has(spawn.type)) {
        spawnsByType.set(spawn.type, []);
      }
      spawnsByType.get(spawn.type)!.push(spawn);
    }

    const typeConfig: Record<SpawnType, { icon: string; title: string; components: string[] }> = {
      npc: {
        icon: '👤',
        title: 'NPCs',
        components: ['Position', 'NPC', 'Renderable', 'WorldLabel'],
      },
      pickup: {
        icon: '📦',
        title: 'Items',
        components: ['Position', 'ItemPickup', 'Renderable'],
      },
      inspectable: {
        icon: '🔍',
        title: 'Inspectables',
        components: ['Position', 'Inspectable', 'Renderable'],
      },
      trigger: {
        icon: '⚡',
        title: 'Triggers',
        components: ['TriggerZone'],
      },
    };

    for (const [type, entries] of spawnsByType) {
      const config = typeConfig[type];
      const section = this.createSection(`${config.title} (${entries.length})`, config.icon);

      for (const spawn of entries) {
        const spawnEl = this.createSpawnElement(spawn, region, config.components);
        section.appendChild(spawnEl);
      }

      detail.appendChild(section);
    }

    // Show empty state if no spawns
    if (spawns.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.style.cssText = `
        padding: 32px;
        text-align: center;
        color: #6c7086;
        background: #181825;
        border-radius: 8px;
        border: 1px dashed #313244;
      `;
      emptyState.innerHTML = `
        <div style="font-size: 32px; margin-bottom: 12px;">📭</div>
        <div style="font-size: 14px;">No entity spawns in this region</div>
        <div style="font-size: 12px; margin-top: 8px;">Click "Add Spawn" to place NPCs, items, and more</div>
      `;
      detail.appendChild(emptyState);
    }

    this.setCenterContent(detail);
  }

  private createSection(title: string, icon: string): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = `
      background: #181825;
      border-radius: 8px;
      padding: 16px;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    `;
    header.innerHTML = `
      <span style="font-size: 16px;">${icon}</span>
      <h3 style="margin: 0; font-size: 14px; color: #cdd6f4;">${title}</h3>
    `;
    section.appendChild(header);

    return section;
  }

  private createSpawnElement(spawn: SpawnEntry, region: RegionData, components: string[]): HTMLElement {
    const el = document.createElement('div');
    const isSelected = spawn.id === this.selectedSpawnId;
    el.style.cssText = `
      padding: 12px;
      background: ${isSelected ? '#313244' : '#1e1e2e'};
      border-radius: 6px;
      margin-bottom: 8px;
      cursor: pointer;
      border: 1px solid ${isSelected ? '#89b4fa' : 'transparent'};
    `;

    el.onclick = () => {
      this.selectedSpawnId = spawn.id;
      this.renderRegionDetail(region);
    };

    // Name and ID
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    `;

    const name = document.createElement('span');
    name.style.cssText = 'font-size: 13px; color: #cdd6f4; font-weight: 500;';
    name.textContent = this.getSpawnName(spawn);
    header.appendChild(name);

    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; gap: 4px;';

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = 'Delete spawn';
    deleteBtn.style.cssText = `
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 12px;
      opacity: 0.6;
      padding: 4px;
    `;
    deleteBtn.onmouseenter = () => deleteBtn.style.opacity = '1';
    deleteBtn.onmouseleave = () => deleteBtn.style.opacity = '0.6';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      this.deleteSpawn(region, spawn);
    };
    actions.appendChild(deleteBtn);

    header.appendChild(actions);
    el.appendChild(header);

    // Position
    const posInfo = document.createElement('div');
    posInfo.style.cssText = 'font-size: 11px; color: #6c7086; margin-bottom: 6px;';
    posInfo.textContent = `Position: (${spawn.position.x.toFixed(1)}, ${spawn.position.y.toFixed(1)}, ${spawn.position.z.toFixed(1)})`;
    el.appendChild(posInfo);

    // Components preview
    const compPreview = document.createElement('div');
    compPreview.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px;';
    for (const comp of components) {
      const badge = document.createElement('span');
      badge.textContent = comp;
      badge.style.cssText = `
        font-size: 10px;
        padding: 2px 6px;
        background: #89b4fa22;
        color: #89b4fa;
        border-radius: 3px;
      `;
      compPreview.appendChild(badge);
    }
    el.appendChild(compPreview);

    // Expanded details if selected
    if (isSelected) {
      const details = this.createSpawnDetails(spawn, region);
      el.appendChild(details);
    }

    return el;
  }

  private getSpawnName(spawn: SpawnEntry): string {
    switch (spawn.type) {
      case 'npc': {
        const npcData = spawn.data as NPCDefinition;
        const npc = availableNPCs.find(n => n.id === npcData.id);
        return npc?.name || `NPC ${shortId(npcData.id)}`;
      }
      case 'pickup': {
        const pickupData = spawn.data as PickupDefinition;
        const item = availableItems.find(i => i.id === pickupData.itemId);
        return item?.name || `Item ${shortId(pickupData.itemId)}`;
      }
      case 'inspectable': {
        const inspData = spawn.data as InspectableDefinition;
        const insp = availableInspections.find(i => i.id === inspData.inspectionId);
        return insp?.displayName || `Inspection ${shortId(inspData.inspectionId)}`;
      }
      case 'trigger': {
        const triggerData = spawn.data as TriggerDefinition;
        return `Trigger: ${triggerData.event.type}`;
      }
    }
  }

  private createSpawnDetails(spawn: SpawnEntry, region: RegionData): HTMLElement {
    const details = document.createElement('div');
    details.style.cssText = `
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #313244;
    `;

    // Position editors
    const posRow = document.createElement('div');
    posRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 12px;';

    for (const axis of ['x', 'y', 'z'] as const) {
      const field = document.createElement('div');
      field.style.cssText = 'flex: 1;';

      const label = document.createElement('label');
      label.textContent = axis.toUpperCase();
      label.style.cssText = 'display: block; font-size: 10px; color: #6c7086; margin-bottom: 4px;';
      field.appendChild(label);

      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.1';
      input.value = spawn.position[axis].toString();
      input.style.cssText = `
        width: 100%;
        padding: 6px 8px;
        background: #181825;
        border: 1px solid #313244;
        border-radius: 4px;
        color: #cdd6f4;
        font-size: 12px;
      `;
      // Stop click from bubbling to parent (which would re-render and destroy this input)
      input.onclick = (e) => e.stopPropagation();
      input.onchange = () => {
        spawn.position[axis] = parseFloat(input.value) || 0;
        this.updateSpawnData(region, spawn);
      };
      field.appendChild(input);

      posRow.appendChild(field);
    }
    details.appendChild(posRow);

    // Type-specific fields
    this.addTypeSpecificFields(details, spawn, region);

    return details;
  }

  private addTypeSpecificFields(container: HTMLElement, spawn: SpawnEntry, region: RegionData): void {
    switch (spawn.type) {
      case 'npc': {
        const npcData = spawn.data as NPCDefinition;

        // NPC selector
        this.addSelectField(container, 'NPC', npcData.id, availableNPCs.map(n => ({
          value: n.id,
          label: n.name,
        })), (value) => {
          npcData.id = value;
          this.updateSpawnData(region, spawn);
        });
        break;
      }

      case 'pickup': {
        const pickupData = spawn.data as PickupDefinition;

        // Item selector
        this.addSelectField(container, 'Item', pickupData.itemId, availableItems.map(i => ({
          value: i.id,
          label: i.name,
        })), (value) => {
          pickupData.itemId = value;
          this.updateSpawnData(region, spawn);
        });

        // Quantity
        this.addNumberField(container, 'Quantity', pickupData.quantity || 1, (value) => {
          pickupData.quantity = value;
          this.updateSpawnData(region, spawn);
        });
        break;
      }

      case 'inspectable': {
        const inspData = spawn.data as InspectableDefinition;

        // Inspection selector
        this.addSelectField(container, 'Inspection', inspData.inspectionId, availableInspections.map(i => ({
          value: i.id,
          label: i.displayName || i.id,
        })), (value) => {
          inspData.inspectionId = value;
          this.updateSpawnData(region, spawn);
        });

        // Prompt text
        this.addTextField(container, 'Prompt Text', inspData.promptText || '', (value) => {
          inspData.promptText = value || undefined;
          this.updateSpawnData(region, spawn);
        });
        break;
      }

      case 'trigger': {
        const triggerData = spawn.data as TriggerDefinition;

        // Event type
        this.addTextField(container, 'Event Type', triggerData.event.type, (value) => {
          triggerData.event.type = value;
          this.updateSpawnData(region, spawn);
        });

        // Event target
        this.addTextField(container, 'Event Target', triggerData.event.target || '', (value) => {
          triggerData.event.target = value || undefined;
          this.updateSpawnData(region, spawn);
        });
        break;
      }
    }
  }

  private addSelectField(
    container: HTMLElement,
    label: string,
    value: string,
    options: { value: string; label: string }[],
    onChange: (value: string) => void
  ): void {
    const field = document.createElement('div');
    field.style.cssText = 'margin-bottom: 8px;';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'display: block; font-size: 11px; color: #6c7086; margin-bottom: 4px;';
    field.appendChild(labelEl);

    const select = document.createElement('select');
    select.style.cssText = `
      width: 100%;
      padding: 6px 8px;
      background: #181825;
      border: 1px solid #313244;
      border-radius: 4px;
      color: #cdd6f4;
      font-size: 12px;
    `;

    for (const opt of options) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      option.selected = opt.value === value;
      select.appendChild(option);
    }

    // Stop click from bubbling to parent
    select.onclick = (e) => e.stopPropagation();
    select.onchange = () => onChange(select.value);
    field.appendChild(select);
    container.appendChild(field);
  }

  private addTextField(
    container: HTMLElement,
    label: string,
    value: string,
    onChange: (value: string) => void
  ): void {
    const field = document.createElement('div');
    field.style.cssText = 'margin-bottom: 8px;';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'display: block; font-size: 11px; color: #6c7086; margin-bottom: 4px;';
    field.appendChild(labelEl);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.style.cssText = `
      width: 100%;
      padding: 6px 8px;
      background: #181825;
      border: 1px solid #313244;
      border-radius: 4px;
      color: #cdd6f4;
      font-size: 12px;
    `;
    // Stop click from bubbling to parent
    input.onclick = (e) => e.stopPropagation();
    input.onchange = () => onChange(input.value);
    field.appendChild(input);
    container.appendChild(field);
  }

  private addNumberField(
    container: HTMLElement,
    label: string,
    value: number,
    onChange: (value: number) => void
  ): void {
    const field = document.createElement('div');
    field.style.cssText = 'margin-bottom: 8px;';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'display: block; font-size: 11px; color: #6c7086; margin-bottom: 4px;';
    field.appendChild(labelEl);

    const input = document.createElement('input');
    input.type = 'number';
    input.value = value.toString();
    input.style.cssText = `
      width: 100%;
      padding: 6px 8px;
      background: #181825;
      border: 1px solid #313244;
      border-radius: 4px;
      color: #cdd6f4;
      font-size: 12px;
    `;
    // Stop click from bubbling to parent
    input.onclick = (e) => e.stopPropagation();
    input.onchange = () => onChange(parseInt(input.value) || 0);
    field.appendChild(input);
    container.appendChild(field);
  }

  private updateSpawnData(region: RegionData, spawn: SpawnEntry): void {
    // Update the spawn position in the original data
    switch (spawn.type) {
      case 'npc': {
        const npc = region.npcs?.find(n => n.id === spawn.id);
        if (npc) {
          npc.position = spawn.position;
          Object.assign(npc, spawn.data);
        }
        break;
      }
      case 'pickup': {
        const pickup = region.pickups?.find(p => p.id === spawn.id);
        if (pickup) {
          pickup.position = spawn.position;
          Object.assign(pickup, spawn.data);
        }
        break;
      }
      case 'inspectable': {
        const insp = region.inspectables?.find(i => i.id === spawn.id);
        if (insp) {
          insp.position = spawn.position;
          Object.assign(insp, spawn.data);
        }
        break;
      }
      case 'trigger': {
        const trigger = region.triggers?.find(t => t.id === spawn.id);
        if (trigger) {
          // Update bounds center
          const halfSize = {
            x: (trigger.bounds.max[0] - trigger.bounds.min[0]) / 2,
            y: (trigger.bounds.max[1] - trigger.bounds.min[1]) / 2,
            z: (trigger.bounds.max[2] - trigger.bounds.min[2]) / 2,
          };
          trigger.bounds.min = [
            spawn.position.x - halfSize.x,
            spawn.position.y - halfSize.y,
            spawn.position.z - halfSize.z,
          ];
          trigger.bounds.max = [
            spawn.position.x + halfSize.x,
            spawn.position.y + halfSize.y,
            spawn.position.z + halfSize.z,
          ];
          Object.assign(trigger, spawn.data);
        }
        break;
      }
    }

    editorStore.setDirty(true);
    this.renderRegionDetail(region);
  }

  private deleteSpawn(region: RegionData, spawn: SpawnEntry): void {
    switch (spawn.type) {
      case 'npc':
        region.npcs = region.npcs?.filter(n => n.id !== spawn.id) || [];
        break;
      case 'pickup':
        region.pickups = region.pickups?.filter(p => p.id !== spawn.id) || [];
        break;
      case 'inspectable':
        region.inspectables = region.inspectables?.filter(i => i.id !== spawn.id) || [];
        break;
      case 'trigger':
        region.triggers = region.triggers?.filter(t => t.id !== spawn.id) || [];
        break;
    }

    if (this.selectedSpawnId === spawn.id) {
      this.selectedSpawnId = null;
    }

    editorStore.setDirty(true);
    this.updateEntryList();
    this.renderRegionDetail(region);
  }

  private showAddSpawnDialog(region: RegionData): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #1e1e2e;
      border-radius: 12px;
      padding: 24px;
      width: 320px;
    `;

    const title = document.createElement('h3');
    title.textContent = 'Add Entity Spawn';
    title.style.cssText = 'margin: 0 0 16px 0; color: #cdd6f4; font-size: 18px;';
    dialog.appendChild(title);

    const types: { type: SpawnType; icon: string; label: string }[] = [
      { type: 'npc', icon: '👤', label: 'NPC' },
      { type: 'pickup', icon: '📦', label: 'Item Pickup' },
      { type: 'inspectable', icon: '🔍', label: 'Inspectable' },
      { type: 'trigger', icon: '⚡', label: 'Trigger Zone' },
    ];

    for (const { type, icon, label } of types) {
      const btn = document.createElement('button');
      btn.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 12px 16px;
        background: #181825;
        border: 1px solid #313244;
        border-radius: 8px;
        color: #cdd6f4;
        font-size: 14px;
        cursor: pointer;
        margin-bottom: 8px;
        text-align: left;
      `;
      btn.innerHTML = `<span style="font-size: 20px;">${icon}</span>${label}`;
      btn.onclick = () => {
        this.addSpawn(region, type);
        overlay.remove();
      };
      dialog.appendChild(btn);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      width: 100%;
      padding: 10px;
      background: transparent;
      border: 1px solid #313244;
      border-radius: 6px;
      color: #6c7086;
      font-size: 13px;
      cursor: pointer;
      margin-top: 8px;
    `;
    cancelBtn.onclick = () => overlay.remove();
    dialog.appendChild(cancelBtn);

    overlay.appendChild(dialog);
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };
    document.body.appendChild(overlay);
  }

  private addSpawn(region: RegionData, type: SpawnType): void {
    const id = generateUUID();
    const defaultPos: Vec3 = { x: 0, y: 0, z: 0 };

    switch (type) {
      case 'npc':
        if (!region.npcs) region.npcs = [];
        region.npcs.push({
          id,
          position: { ...defaultPos },
        });
        break;

      case 'pickup':
        if (!region.pickups) region.pickups = [];
        region.pickups.push({
          id,
          itemId: availableItems[0]?.id || '',
          position: { ...defaultPos },
          quantity: 1,
        });
        break;

      case 'inspectable':
        if (!region.inspectables) region.inspectables = [];
        region.inspectables.push({
          id,
          inspectionId: availableInspections[0]?.id || '',
          position: { ...defaultPos },
        });
        break;

      case 'trigger':
        if (!region.triggers) region.triggers = [];
        region.triggers.push({
          id,
          type: 'box',
          bounds: {
            min: [-1, 0, -1],
            max: [1, 2, 1],
          },
          event: {
            type: 'custom',
          },
        });
        break;
    }

    this.selectedSpawnId = id;
    editorStore.setDirty(true);
    this.updateEntryList();
    this.renderRegionDetail(region);
  }

  private createNewRegion(): void {
    const id = generateUUID();
    const region: RegionData = {
      id,
      name: 'New Region',
      geometry: { path: '' },
      playerSpawn: { x: 0, y: 0, z: 0 },
      npcs: [],
      triggers: [],
      pickups: [],
      inspectables: [],
    };
    this.addRegion(region);
    editorStore.selectEntry(id);
    this.onEntrySelect(id);
  }

  protected onEntrySelect(id: string): void {
    this.currentRegionId = id;
    this.selectedSpawnId = null;

    const region = this.regions.get(id);
    if (region) {
      this.setInspectorData({
        id: region.id,
        name: region.name,
        geometryPath: region.geometry?.path ?? '',
        playerSpawnX: region.playerSpawn.x,
        playerSpawnY: region.playerSpawn.y,
        playerSpawnZ: region.playerSpawn.z,
        fromEpisode: region.availability?.fromEpisode ?? '',
        untilEpisode: region.availability?.untilEpisode ?? '',
      });
      this.renderRegionDetail(region);
      this.entryList.setSelected(id);
    } else {
      this.clearInspector();
      this.renderCenterPlaceholder();
    }
  }

  protected onFieldChange(key: string, value: unknown): void {
    if (!this.currentRegionId) return;

    const region = this.regions.get(this.currentRegionId);
    if (!region) return;

    if (key === 'geometryPath') {
      if (!region.geometry) {
        region.geometry = { path: '' };
      }
      region.geometry.path = value as string;
    } else if (key === 'playerSpawnX') {
      region.playerSpawn.x = value as number;
    } else if (key === 'playerSpawnY') {
      region.playerSpawn.y = value as number;
    } else if (key === 'playerSpawnZ') {
      region.playerSpawn.z = value as number;
    } else if (key === 'fromEpisode' || key === 'untilEpisode') {
      if (!region.availability) {
        region.availability = {};
      }
      region.availability[key] = value as string || undefined;
    } else {
      (region as unknown as Record<string, unknown>)[key] = value;
    }

    editorStore.setDirty(true);
    this.updateEntryList();
    this.renderRegionDetail(region);
  }
}
