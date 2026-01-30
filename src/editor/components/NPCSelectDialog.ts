/**
 * NPCSelectDialog - Dialog wrapper for NPCSelector
 */

import { createNPCSelector, NPCOption } from './NPCSelector';

export interface NPCSelectDialogConfig {
  title?: string;
  npcs: NPCOption[];
  onSelect: (npcId: string) => void;
  onCancel?: () => void;
}

/**
 * Shows a dialog containing an NPC selector dropdown.
 */
export function showNPCSelectDialog(config: NPCSelectDialogConfig): void {
  const { title = 'Select NPC', npcs, onSelect, onCancel } = config;

  if (npcs.length === 0) {
    alert('No NPCs available. Create an NPC first in the NPCs panel.');
    onCancel?.();
    return;
  }

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

  const titleEl = document.createElement('h3');
  titleEl.textContent = title;
  titleEl.style.cssText = 'margin: 0 0 16px 0; color: #cdd6f4; font-size: 18px;';
  dialog.appendChild(titleEl);

  const selector = createNPCSelector({
    npcs,
    placeholder: '-- Select NPC --',
    onChange: (npcId) => {
      if (npcId) {
        onSelect(npcId);
        overlay.remove();
      }
    },
  });
  dialog.appendChild(selector);

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
    margin-top: 12px;
  `;
  cancelBtn.onclick = () => {
    onCancel?.();
    overlay.remove();
  };
  dialog.appendChild(cancelBtn);

  overlay.appendChild(dialog);
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      onCancel?.();
      overlay.remove();
    }
  };
  document.body.appendChild(overlay);
}
