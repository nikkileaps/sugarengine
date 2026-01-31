/**
 * Sugar Engine Editor
 *
 * Narrative design tooling for composing game content:
 * - Dialogue tree authoring
 * - Quest design
 * - NPC database
 * - Item database
 * - Inspection content
 */

// New React-based editor
export { Editor } from './Editor';

// Legacy vanilla editor (for reference during migration)
export { EditorApp } from './EditorApp';
export { Toolbar } from './Toolbar';
export { PreviewManager } from './PreviewManager';

// Components
export * from './components';

// Store
export * from './store';

// Panels
export * from './panels';
