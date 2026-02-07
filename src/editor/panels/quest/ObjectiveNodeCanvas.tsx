/**
 * ObjectiveNodeCanvas - Node graph editor for quest objectives within a stage
 *
 * Presentation layer only - uses ObjectiveGraph from engine for logic.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Stack,
  Group,
  Button,
  Text,
  Badge,
  Paper,
  ScrollArea,
  Select,
  Textarea,
  TextInput,
  Checkbox,
  ActionIcon,
  NumberInput,
  Menu,
} from '@mantine/core';
import { NodeCanvas, CanvasNode, CanvasConnection } from '../../components';
import {
  QuestStage,
  QuestObjective,
  BeatAction,
  BeatNodeType,
  NarrativeSubtype,
  ConditionOperator,
  ActionType,
} from './QuestPanel';
import { ObjectiveGraph } from '../../../engine/quests';

// Edge color for prerequisite relationships
const EDGE_COLOR = '#89b4fa';

// Objective type icons
const OBJECTIVE_ICONS: Record<string, string> = {
  talk: '💬',
  voiceover: '🎤',
  location: '📍',
  collect: '📦',
  trigger: '⚡',
  custom: '⭐',
};

// Objective type colors (subtype colors for objective nodes)
const OBJECTIVE_COLORS: Record<string, string> = {
  talk: '#89b4fa',
  voiceover: '#cba6f7',
  location: '#a6e3a1',
  collect: '#f9e2af',
  trigger: '#fab387',
  custom: '#f5c2e7',
};

// Node type colors (ADR-016)
const NODE_TYPE_COLORS: Record<string, string> = {
  objective: '#89b4fa',
  narrative: '#cba6f7',
  condition: '#f9e2af',
};

// Beat action types for onEnter/onComplete
const ACTION_TYPES = [
  { value: 'setFlag', label: 'Set Flag' },
  { value: 'giveItem', label: 'Give Item' },
  { value: 'removeItem', label: 'Remove Item' },
  { value: 'playSound', label: 'Play Sound' },
  { value: 'teleportNPC', label: 'Teleport NPC' },
  { value: 'moveNpc', label: 'Move NPC' },
  { value: 'setNPCState', label: 'Set NPC State' },
  { value: 'emitEvent', label: 'Emit Event' },
  { value: 'spawnVFX', label: 'Spawn VFX' },
  { value: 'custom', label: 'Custom' },
];

interface ObjectiveNodeCanvasProps {
  stage: QuestStage;
  npcs: { id: string; name: string }[];
  items: { id: string; name: string }[];
  dialogues: { id: string; name: string }[];
  triggers: { id: string; name: string }[];
  onStageChange: (stage: QuestStage) => void;
  onClose: () => void;
}

export function ObjectiveNodeCanvas({
  stage,
  npcs,
  items,
  dialogues,
  triggers,
  onStageChange,
  onClose,
}: ObjectiveNodeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<NodeCanvas | null>(null);
  const currentStageIdRef = useRef<string | null>(null);
  const stageRef = useRef<QuestStage>(stage);
  const selectedObjectiveIdRef = useRef<string | null>(null);

  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null);

  // Keep refs current
  stageRef.current = stage;
  selectedObjectiveIdRef.current = selectedObjectiveId;

  // Layout constants
  const NODE_SPACING_X = 300;
  const NODE_SPACING_Y = 140;

  // Get positions map (from stage or generate new using ObjectiveGraph)
  const getPositions = (): Map<string, { x: number; y: number }> => {
    const positions = new Map<string, { x: number; y: number }>();

    // Load existing positions
    if (stage.objectivePositions) {
      for (const [id, pos] of Object.entries(stage.objectivePositions)) {
        positions.set(id, pos);
      }
    }

    // Auto-layout objectives without positions using graph depths
    const needsLayout = stage.objectives.filter(obj => !positions.has(obj.id));
    if (needsLayout.length > 0) {
      const graph = ObjectiveGraph.fromObjectives(stage.objectives);
      const depths = graph.computeDepths();
      const depthCounts = new Map<number, number>();

      for (const obj of needsLayout) {
        const depth = depths.get(obj.id) ?? 0;
        const lane = depthCounts.get(depth) ?? 0;
        depthCounts.set(depth, lane + 1);

        positions.set(obj.id, {
          x: 50 + depth * NODE_SPACING_X,
          y: 50 + lane * NODE_SPACING_Y,
        });
      }
    }

    return positions;
  };

  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(getPositions);

  // Save positions to stage
  const savePositions = (positions: Map<string, { x: number; y: number }>) => {
    const positionsObj: Record<string, { x: number; y: number }> = {};
    for (const [id, pos] of positions) {
      positionsObj[id] = pos;
    }
    onStageChange({ ...stageRef.current, objectivePositions: positionsObj });
  };

  // Update the canvas with current data
  const updateCanvas = () => {
    if (!canvasRef.current) return;

    const currentStage = stageRef.current;
    const positions = nodePositions;

    // Create canvas nodes
    const canvasNodes: CanvasNode[] = currentStage.objectives.map((obj) => ({
      id: obj.id,
      position: positions.get(obj.id) || { x: 50, y: 50 },
    }));

    // Create connections (prerequisites -> objective)
    const connections: CanvasConnection[] = [];
    for (const obj of currentStage.objectives) {
      if (obj.prerequisites) {
        for (const prereqId of obj.prerequisites) {
          connections.push({
            fromId: prereqId,
            toId: obj.id,
            color: '#45475a',
          });
        }
      }
    }

    canvasRef.current.setNodes(canvasNodes);
    canvasRef.current.setConnections(connections);
  };

  // Create canvas on mount or when stage changes
  useEffect(() => {
    if (!containerRef.current) return;

    const currentStage = stageRef.current;

    // Only recreate canvas if stage ID changed
    if (canvasRef.current && currentStageIdRef.current === currentStage.id) {
      updateCanvas();
      return;
    }

    // Clear existing canvas
    containerRef.current.innerHTML = '';
    currentStageIdRef.current = currentStage.id;

    // Initialize positions
    const positions = getPositions();
    setNodePositions(positions);

    const canvas = new NodeCanvas({
      onNodeSelect: (nodeId) => setSelectedObjectiveId(nodeId),
      onNodeMove: (nodeId, pos) => {
        setNodePositions(prev => {
          const updated = new Map(prev);
          updated.set(nodeId, pos);
          // Save to stage after a short delay to avoid too many updates
          setTimeout(() => savePositions(updated), 100);
          return updated;
        });
      },
      onCanvasClick: () => setSelectedObjectiveId(null),
      onConnect: (fromId, toId) => {
        // Adding a connection means: toId now has fromId as a prerequisite
        const currentStage = stageRef.current;
        const updatedObjectives = currentStage.objectives.map((obj) => {
          if (obj.id === toId) {
            const prereqs = obj.prerequisites || [];
            if (!prereqs.includes(fromId)) {
              return { ...obj, prerequisites: [...prereqs, fromId] };
            }
          }
          return obj;
        });
        onStageChange({ ...currentStage, objectives: updatedObjectives });
      },
      renderNode: (canvasNode, element) => {
        const currentStage = stageRef.current;
        const obj = currentStage.objectives.find((o) => o.id === canvasNode.id);
        if (!obj) {
          element.innerHTML = '<div style="padding: 12px; color: #f38ba8;">Node not found</div>';
          return;
        }

        const nodeType = obj.nodeType || 'objective';
        const isEntry = !obj.prerequisites || obj.prerequisites.length === 0;
        const isSelected = obj.id === selectedObjectiveIdRef.current;
        const nodeTypeColor = NODE_TYPE_COLORS[nodeType] || '#89b4fa';

        // For objectives, color by subtype; for others, color by node type
        const typeColor = nodeType === 'objective'
          ? (OBJECTIVE_COLORS[obj.type] || '#89b4fa')
          : nodeTypeColor;

        // Determine border color and style
        let borderColor = '#313244';
        if (isSelected) borderColor = '#89b4fa';
        else if (isEntry) borderColor = '#a6e3a1';
        else if (nodeType !== 'objective') borderColor = nodeTypeColor;

        const borderStyle = nodeType === 'condition' ? 'dashed' : 'solid';

        element.style.minWidth = '220px';
        element.style.maxWidth = '280px';
        element.style.background = '#181825';
        element.style.border = `2px ${borderStyle} ${borderColor}`;
        element.style.borderRadius = '8px';
        element.style.overflow = 'hidden';

        // Header
        const header = document.createElement('div');
        const headerBg = isEntry ? '#a6e3a122'
          : nodeType === 'narrative' ? '#cba6f722'
          : nodeType === 'condition' ? '#f9e2af22'
          : '#313244';
        header.style.cssText = `
          padding: 8px 12px;
          background: ${headerBg};
          border-bottom: 1px solid #313244;
          display: flex;
          align-items: center;
          gap: 8px;
        `;

        if (isEntry) {
          const icon = document.createElement('span');
          icon.textContent = '▶';
          icon.style.cssText = 'color: #a6e3a1; font-size: 10px;';
          header.appendChild(icon);
        }

        // Node type badge for narrative/condition, subtype icon for objectives
        if (nodeType === 'narrative') {
          const badge = document.createElement('span');
          badge.textContent = 'N';
          badge.style.cssText = `font-size: 11px; font-weight: 700; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; background: #cba6f733; color: #cba6f7; border-radius: 4px;`;
          header.appendChild(badge);
        } else if (nodeType === 'condition') {
          const badge = document.createElement('span');
          badge.textContent = '?';
          badge.style.cssText = `font-size: 13px; font-weight: 700; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; background: #f9e2af33; color: #f9e2af; border-radius: 4px;`;
          header.appendChild(badge);
        } else {
          const typeIcon = document.createElement('span');
          typeIcon.textContent = OBJECTIVE_ICONS[obj.type] || '⭐';
          typeIcon.style.cssText = 'font-size: 14px;';
          header.appendChild(typeIcon);
        }

        // Type label - shows subtype for objectives, narrativeType/operator for others
        const labelText = nodeType === 'objective'
          ? obj.type
          : nodeType === 'narrative'
            ? (obj.narrativeType || 'narrative')
            : (obj.condition?.operator || 'condition');
        const typeLabel = document.createElement('span');
        typeLabel.textContent = labelText;
        typeLabel.style.cssText = `
          font-size: 11px;
          padding: 2px 6px;
          background: ${typeColor}22;
          color: ${typeColor};
          border-radius: 3px;
          text-transform: uppercase;
        `;
        header.appendChild(typeLabel);

        element.appendChild(header);

        // Content
        const content = document.createElement('div');
        content.style.cssText = 'padding: 12px; font-size: 12px; color: #cdd6f4; line-height: 1.4;';
        content.textContent = obj.description.length > 80
          ? obj.description.slice(0, 80) + '...'
          : obj.description;
        element.appendChild(content);

        // Target info (for objectives) or operand (for conditions) or dialogue (for narrative)
        if (nodeType === 'objective' && obj.target) {
          const targetDiv = document.createElement('div');
          targetDiv.style.cssText = 'padding: 0 12px 8px; font-size: 11px; color: #6c7086;';

          let targetName = obj.target;
          if (obj.type === 'talk' || obj.type === 'voiceover') {
            const npc = npcs.find(n => n.id === obj.target);
            targetName = npc?.name || obj.target;
          }

          targetDiv.textContent = `Target: ${targetName}`;
          element.appendChild(targetDiv);
        } else if (nodeType === 'condition' && obj.condition) {
          const operandDiv = document.createElement('div');
          operandDiv.style.cssText = 'padding: 0 12px 8px; font-size: 11px; color: #6c7086;';
          const negatePrefix = obj.condition.negate ? 'NOT ' : '';
          const operandLabel = obj.condition.operator === 'hasItem'
            ? (items.find(i => i.id === obj.condition!.operand)?.name || obj.condition.operand)
            : obj.condition.operand;
          operandDiv.textContent = `${negatePrefix}${obj.condition.operator}: ${operandLabel || '(not set)'}`;
          element.appendChild(operandDiv);
        } else if (nodeType === 'narrative' && obj.dialogueId) {
          const dlgDiv = document.createElement('div');
          dlgDiv.style.cssText = 'padding: 0 12px 8px; font-size: 11px; color: #6c7086;';
          const dlgName = dialogues.find(d => d.id === obj.dialogueId)?.name || obj.dialogueId;
          dlgDiv.textContent = `Dialogue: ${dlgName}`;
          element.appendChild(dlgDiv);
        }

        // Action preview
        const allActions = [...(obj.onEnter || []), ...(obj.onComplete || [])];
        if (allActions.length > 0) {
          const actionsDiv = document.createElement('div');
          actionsDiv.style.cssText = 'padding: 4px 12px 8px; font-size: 10px; color: #585b70; line-height: 1.5;';
          const previews = allActions.slice(0, 3).map(a => {
            const target = a.target || a.npcId || '';
            return target ? `${a.type}(${target})` : a.type;
          });
          if (allActions.length > 3) previews.push(`+${allActions.length - 3} more`);
          actionsDiv.textContent = previews.join(' · ');
          element.appendChild(actionsDiv);
        }

        // Badges
        const badges = document.createElement('div');
        badges.style.cssText = 'padding: 8px 12px; border-top: 1px solid #313244; display: flex; gap: 4px; flex-wrap: wrap;';

        if (obj.optional) {
          const badge = document.createElement('span');
          badge.textContent = 'OPT';
          badge.style.cssText = 'font-size: 9px; padding: 2px 4px; background: #f9e2af22; color: #f9e2af; border-radius: 2px;';
          badges.appendChild(badge);
        }

        if (obj.autoStart) {
          const badge = document.createElement('span');
          badge.textContent = 'AUTO';
          badge.style.cssText = 'font-size: 9px; padding: 2px 4px; background: #cba6f722; color: #cba6f7; border-radius: 2px;';
          badges.appendChild(badge);
        }

        if (obj.onEnter && obj.onEnter.length > 0) {
          const badge = document.createElement('span');
          badge.textContent = `${obj.onEnter.length} onEnter`;
          badge.style.cssText = 'font-size: 9px; padding: 2px 4px; background: #a6e3a122; color: #a6e3a1; border-radius: 2px;';
          badges.appendChild(badge);
        }

        if (obj.onComplete && obj.onComplete.length > 0) {
          const badge = document.createElement('span');
          badge.textContent = `${obj.onComplete.length} onComplete`;
          badge.style.cssText = 'font-size: 9px; padding: 2px 4px; background: #89b4fa22; color: #89b4fa; border-radius: 2px;';
          badges.appendChild(badge);
        }

        if (badges.childElementCount > 0) {
          element.appendChild(badges);
        }
      },
    });

    containerRef.current.appendChild(canvas.getElement());
    canvasRef.current = canvas;

    // Set initial nodes directly (don't use updateCanvas which relies on state)
    const canvasNodes: CanvasNode[] = currentStage.objectives.map((obj) => ({
      id: obj.id,
      position: positions.get(obj.id) || { x: 50, y: 50 },
    }));

    // Build connections from ObjectiveGraph
    const graph = ObjectiveGraph.fromObjectives(currentStage.objectives);
    const connections: CanvasConnection[] = graph.edges.map(edge => ({
      fromId: edge.fromId,
      toId: edge.toId,
      color: EDGE_COLOR,
    }));

    canvas.setNodes(canvasNodes);
    canvas.setConnections(connections);
    setTimeout(() => canvas.fitToContent(), 100);
  }, [stage.id]);

  // Update canvas when objectives change
  useEffect(() => {
    if (!canvasRef.current) return;

    const currentStage = stageRef.current;

    // Create canvas nodes using current positions
    const canvasNodes: CanvasNode[] = currentStage.objectives.map((obj) => ({
      id: obj.id,
      position: nodePositions.get(obj.id) || { x: 50, y: 50 },
    }));

    // Build connections from ObjectiveGraph
    const graph = ObjectiveGraph.fromObjectives(currentStage.objectives);
    const connections: CanvasConnection[] = graph.edges.map(edge => ({
      fromId: edge.fromId,
      toId: edge.toId,
      color: EDGE_COLOR,
    }));

    canvasRef.current.setNodes(canvasNodes);
    canvasRef.current.setConnections(connections);
  }, [stage.objectives, nodePositions]);

  // Update selection highlighting
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.setSelectedNode(selectedObjectiveId);
    }
  }, [selectedObjectiveId]);

  const selectedObjective = selectedObjectiveId
    ? stage.objectives.find((o) => o.id === selectedObjectiveId)
    : null;

  const handleAddNode = (nodeType: string, subtype: string) => {
    const id = `obj-${Date.now()}`;
    const newObj: QuestObjective = {
      id,
      type: nodeType === 'objective' ? subtype as QuestObjective['type'] : 'custom',
      target: '',
      description: nodeType === 'objective' ? 'New objective'
        : subtype === 'voiceover' ? 'Voiceover'
        : nodeType === 'narrative' ? 'Narrative beat'
        : 'Condition gate',
      nodeType: nodeType as BeatNodeType,
      ...(nodeType === 'narrative' ? {
        narrativeType: (subtype === 'voiceover' ? 'dialogue' : subtype) as NarrativeSubtype,
        autoStart: true,
      } : {}),
      ...(nodeType === 'condition' ? {
        condition: { operator: subtype as ConditionOperator, operand: '' },
      } : {}),
    };

    // Position new node
    let maxY = 0;
    for (const pos of nodePositions.values()) {
      maxY = Math.max(maxY, pos.y);
    }
    const newPos = { x: 50, y: maxY + NODE_SPACING_Y };

    const updatedPositions = new Map(nodePositions);
    updatedPositions.set(id, newPos);
    setNodePositions(updatedPositions);

    const positionsObj: Record<string, { x: number; y: number }> = {};
    for (const [objId, pos] of updatedPositions) {
      positionsObj[objId] = pos;
    }

    onStageChange({
      ...stage,
      objectives: [...stage.objectives, newObj],
      objectivePositions: positionsObj,
    });

    setSelectedObjectiveId(id);
  };

  const handleObjectiveChange = (updated: QuestObjective) => {
    const updatedObjectives = stage.objectives.map((o) =>
      o.id === updated.id ? updated : o
    );
    onStageChange({ ...stage, objectives: updatedObjectives });
  };

  const handleDeleteObjective = (id: string) => {
    // Remove objective and any references to it in prerequisites
    const updatedObjectives = stage.objectives
      .filter((o) => o.id !== id)
      .map((o) => ({
        ...o,
        prerequisites: o.prerequisites?.filter((p) => p !== id),
      }));

    // Remove position
    const updatedPositions = new Map(nodePositions);
    updatedPositions.delete(id);

    const positionsObj: Record<string, { x: number; y: number }> = {};
    for (const [objId, pos] of updatedPositions) {
      positionsObj[objId] = pos;
    }

    onStageChange({
      ...stage,
      objectives: updatedObjectives,
      objectivePositions: positionsObj,
    });

    setSelectedObjectiveId(null);
  };

  const handleRemovePrerequisite = (objectiveId: string, prereqId: string) => {
    const updatedObjectives = stage.objectives.map((o) => {
      if (o.id === objectiveId) {
        return {
          ...o,
          prerequisites: o.prerequisites?.filter((p) => p !== prereqId),
        };
      }
      return o;
    });
    onStageChange({ ...stage, objectives: updatedObjectives });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)' }}>
      {/* Toolbar */}
      <Group
        p="xs"
        style={{ background: '#181825', borderBottom: '1px solid #313244', flexShrink: 0 }}
        justify="space-between"
      >
        <Group gap="sm">
          <Button size="xs" variant="subtle" onClick={onClose}>
            ← Back
          </Button>
          <Text size="sm" fw={600}>
            Stage: {stage.description || stage.id}
          </Text>
          <Badge size="sm" variant="light">
            {stage.objectives.length} node{stage.objectives.length !== 1 ? 's' : ''}
          </Badge>
        </Group>

        <Group gap="xs">
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <Button size="xs" variant="subtle">+ Add Node</Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Objective</Menu.Label>
              <Menu.Item onClick={() => handleAddNode('objective', 'talk')}>💬 Talk to NPC</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('objective', 'location')}>📍 Go to Location</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('objective', 'trigger')}>⚡ Trigger</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('objective', 'custom')}>⭐ Custom</Menu.Item>
              <Menu.Divider />
              <Menu.Label>Narrative</Menu.Label>
              <Menu.Item onClick={() => handleAddNode('narrative', 'voiceover')}>🎤 Voiceover</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('narrative', 'cutscene')}>🎬 Cutscene</Menu.Item>
              <Menu.Divider />
              <Menu.Label>Condition</Menu.Label>
              <Menu.Item onClick={() => handleAddNode('condition', 'hasItem')}>📦 Has Item</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('condition', 'hasFlag')}>🚩 Has Flag</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('condition', 'questComplete')}>✓ Quest Complete</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('condition', 'custom')}>⭐ Custom</Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <Button
            size="xs"
            variant="subtle"
            onClick={() => canvasRef.current?.fitToContent()}
          >
            Fit View
          </Button>
        </Group>
      </Group>

      {/* Canvas and Editor */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <div
          ref={containerRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: 'hidden',
          }}
        />

        {/* Objective Editor Panel */}
        {selectedObjective && (
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 340, zIndex: 10 }}>
            <ObjectiveEditorPanel
              objective={selectedObjective}
              allObjectives={stage.objectives}
              npcs={npcs}
              items={items}
              dialogues={dialogues}
              triggers={triggers}
              onChange={handleObjectiveChange}
              onDelete={() => handleDeleteObjective(selectedObjective.id)}
              onRemovePrerequisite={(prereqId) => handleRemovePrerequisite(selectedObjective.id, prereqId)}
              onClose={() => setSelectedObjectiveId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface ObjectiveEditorPanelProps {
  objective: QuestObjective;
  allObjectives: QuestObjective[];
  npcs: { id: string; name: string }[];
  items: { id: string; name: string }[];
  dialogues: { id: string; name: string }[];
  triggers: { id: string; name: string }[];
  onChange: (objective: QuestObjective) => void;
  onDelete: () => void;
  onRemovePrerequisite: (prereqId: string) => void;
  onClose: () => void;
}

/** Renders fields for a single BeatAction based on its type */
function BeatActionFields({
  action,
  index,
  actions,
  field,
  objective,
  onChange,
  npcs,
  items,
}: {
  action: BeatAction;
  index: number;
  actions: BeatAction[];
  field: 'onEnter' | 'onComplete';
  objective: QuestObjective;
  onChange: (obj: QuestObjective) => void;
  npcs: { id: string; name: string }[];
  items: { id: string; name: string }[];
}) {
  const updateAction = (updated: BeatAction) => {
    const updatedActions = [...actions];
    updatedActions[index] = updated;
    onChange({ ...objective, [field]: updatedActions });
  };

  const inputStyle = { background: '#11111b', border: '1px solid #313244', color: '#cdd6f4' };
  const labelStyle = { color: '#6c7086' };

  switch (action.type) {
    case 'setFlag':
      return (
        <>
          <TextInput size="xs" label="Flag Name" value={action.target || ''}
            onChange={(e) => updateAction({ ...action, target: e.currentTarget.value })}
            styles={{ input: inputStyle, label: labelStyle }} />
          <TextInput size="xs" label="Value" value={String(action.value ?? 'true')}
            onChange={(e) => updateAction({ ...action, value: e.currentTarget.value })}
            styles={{ input: inputStyle, label: labelStyle }} />
        </>
      );
    case 'giveItem':
    case 'removeItem':
      return (
        <>
          <Select size="xs" label="Item"
            data={items.map((i) => ({ value: i.id, label: i.name }))}
            value={action.target || null}
            onChange={(value) => updateAction({ ...action, target: value || '' })}
            searchable styles={{ input: inputStyle, label: labelStyle }} />
          <NumberInput size="xs" label="Count" value={Number(action.value) || 1}
            onChange={(value) => updateAction({ ...action, value: Number(value) || 1 })}
            styles={{ input: { ...inputStyle, width: 80 }, label: labelStyle }} />
        </>
      );
    case 'playSound':
      return (
        <TextInput size="xs" label="Sound Path" value={action.target || ''}
          onChange={(e) => updateAction({ ...action, target: e.currentTarget.value })}
          placeholder="audio/sfx/..." styles={{ input: inputStyle, label: labelStyle }} />
      );
    case 'moveNpc':
    case 'teleportNPC': {
      const pos = (action.value as { x: number; y: number; z: number }) || action.position || { x: 0, y: 0, z: 0 };
      return (
        <>
          <Select size="xs" label="NPC"
            data={npcs.map((n) => ({ value: n.id, label: n.name }))}
            value={action.target || action.npcId || null}
            onChange={(value) => updateAction({ ...action, target: value || '', npcId: value || '' })}
            searchable styles={{ input: inputStyle, label: labelStyle }} />
          <Group gap="xs">
            <NumberInput size="xs" label="X" value={pos.x}
              onChange={(v) => updateAction({ ...action, value: { ...pos, x: Number(v) || 0 }, position: { ...pos, x: Number(v) || 0 } })}
              styles={{ input: { ...inputStyle, width: 60 }, label: labelStyle }} />
            <NumberInput size="xs" label="Y" value={pos.y}
              onChange={(v) => updateAction({ ...action, value: { ...pos, y: Number(v) || 0 }, position: { ...pos, y: Number(v) || 0 } })}
              styles={{ input: { ...inputStyle, width: 60 }, label: labelStyle }} />
            <NumberInput size="xs" label="Z" value={pos.z}
              onChange={(v) => updateAction({ ...action, value: { ...pos, z: Number(v) || 0 }, position: { ...pos, z: Number(v) || 0 } })}
              styles={{ input: { ...inputStyle, width: 60 }, label: labelStyle }} />
          </Group>
        </>
      );
    }
    case 'setNPCState':
      return (
        <>
          <Select size="xs" label="NPC"
            data={npcs.map((n) => ({ value: n.id, label: n.name }))}
            value={action.target || null}
            onChange={(value) => updateAction({ ...action, target: value || '' })}
            searchable styles={{ input: inputStyle, label: labelStyle }} />
          <TextInput size="xs" label="State" value={String(action.value ?? '')}
            onChange={(e) => updateAction({ ...action, value: e.currentTarget.value })}
            placeholder="idle, patrol, etc." styles={{ input: inputStyle, label: labelStyle }} />
        </>
      );
    case 'emitEvent':
      return (
        <TextInput size="xs" label="Event Name" value={action.target || ''}
          onChange={(e) => updateAction({ ...action, target: e.currentTarget.value })}
          styles={{ input: inputStyle, label: labelStyle }} />
      );
    case 'spawnVFX':
      return (
        <TextInput size="xs" label="VFX Name" value={action.target || ''}
          onChange={(e) => updateAction({ ...action, target: e.currentTarget.value })}
          styles={{ input: inputStyle, label: labelStyle }} />
      );
    case 'custom':
      return (
        <>
          <TextInput size="xs" label="Target" value={action.target || ''}
            onChange={(e) => updateAction({ ...action, target: e.currentTarget.value })}
            styles={{ input: inputStyle, label: labelStyle }} />
          <TextInput size="xs" label="Value" value={String(action.value ?? '')}
            onChange={(e) => updateAction({ ...action, value: e.currentTarget.value })}
            styles={{ input: inputStyle, label: labelStyle }} />
        </>
      );
    default:
      return null;
  }
}

/** Reusable action list editor for onEnter/onComplete */
function ActionListEditor({
  label,
  field,
  objective,
  onChange,
  npcs,
  items,
}: {
  label: string;
  field: 'onEnter' | 'onComplete';
  objective: QuestObjective;
  onChange: (obj: QuestObjective) => void;
  npcs: { id: string; name: string }[];
  items: { id: string; name: string }[];
}) {
  const actions = (objective[field] || []) as BeatAction[];

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" fw={500}>{label}</Text>
        <Select
          size="xs"
          placeholder="+ Add"
          data={ACTION_TYPES}
          value={null}
          onChange={(value) => {
            if (!value) return;
            const newAction: BeatAction = { type: value as ActionType };
            onChange({ ...objective, [field]: [...actions, newAction] });
          }}
          styles={{
            input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4', width: 120 },
          }}
        />
      </Group>

      {actions.map((action, index) => (
        <Paper key={index} p="xs" style={{ background: '#181825', border: '1px solid #313244' }}>
          <Stack gap="xs">
            <Group justify="space-between">
              <Select
                size="xs"
                data={ACTION_TYPES}
                value={action.type}
                onChange={(value) => {
                  if (!value) return;
                  const updated = [...actions];
                  updated[index] = { type: value as ActionType };
                  onChange({ ...objective, [field]: updated });
                }}
                styles={{
                  input: { background: '#11111b', border: '1px solid #313244', color: '#cdd6f4', width: 120 },
                }}
              />
              <ActionIcon
                size="xs"
                variant="subtle"
                color="red"
                onClick={() => {
                  const updated = [...actions];
                  updated.splice(index, 1);
                  onChange({ ...objective, [field]: updated.length > 0 ? updated : undefined });
                }}
              >
                ×
              </ActionIcon>
            </Group>

            <BeatActionFields
              action={action}
              index={index}
              actions={actions}
              field={field}
              objective={objective}
              onChange={onChange}
              npcs={npcs}
              items={items}
            />
          </Stack>
        </Paper>
      ))}

      {actions.length === 0 && (
        <Text size="xs" c="dimmed" fs="italic">No actions configured</Text>
      )}
    </Stack>
  );
}

function ObjectiveEditorPanel({
  objective,
  allObjectives,
  npcs,
  items,
  dialogues,
  triggers,
  onChange,
  onDelete,
  onRemovePrerequisite,
  onClose,
}: ObjectiveEditorPanelProps) {
  const isEntry = !objective.prerequisites || objective.prerequisites.length === 0;
  const nodeType = objective.nodeType || 'objective';
  const nodeTypeColor = NODE_TYPE_COLORS[nodeType] || '#89b4fa';

  const handleChange = <K extends keyof QuestObjective>(field: K, value: QuestObjective[K]) => {
    onChange({ ...objective, [field]: value });
  };

  const typeOptions = [
    { value: 'talk', label: '💬 Talk' },
    { value: 'voiceover', label: '🎤 Voiceover' },
    { value: 'location', label: '📍 Location' },
    { value: 'trigger', label: '⚡ Trigger' },
    { value: 'custom', label: '⭐ Custom' },
  ];

  const targetOptions = objective.type === 'talk' || objective.type === 'voiceover'
    ? npcs.map((n) => ({ value: n.id, label: n.name }))
    : objective.type === 'location' || objective.type === 'trigger'
    ? triggers.map((t) => ({ value: t.id, label: t.name }))
    : [];

  const dialogueOptions = dialogues.map((d) => ({ value: d.id, label: d.name }));

  // Get prerequisite objective names
  const prerequisites = objective.prerequisites || [];
  const prereqObjectives = prerequisites
    .map((id) => allObjectives.find((o) => o.id === id))
    .filter((o): o is QuestObjective => o !== undefined);

  return (
    <Stack
      gap={0}
      style={{
        width: '100%',
        borderLeft: '1px solid #313244',
        background: '#1e1e2e',
        height: '100%',
      }}
    >
      <Group
        p="xs"
        justify="space-between"
        style={{ borderBottom: '1px solid #313244', background: '#181825' }}
      >
        <Group gap="xs">
          <Text size="sm" fw={500}>
            {nodeType === 'narrative' ? 'Narrative' : nodeType === 'condition' ? 'Condition' : 'Objective'}
          </Text>
          <Badge size="xs" color={nodeTypeColor} variant="light">
            {nodeType}
          </Badge>
          {isEntry && (
            <Badge size="xs" color="green">Entry</Badge>
          )}
        </Group>
        <Button size="xs" variant="subtle" onClick={onClose}>
          ✕
        </Button>
      </Group>

      <ScrollArea style={{ flex: 1 }}>
        <Stack gap="md" p="sm">
          {/* Node Type Selector */}
          <Select
            label="Node Type"
            data={[
              { value: 'objective', label: 'Objective - player action' },
              { value: 'narrative', label: 'Narrative - auto-trigger' },
              { value: 'condition', label: 'Condition - gate/check' },
            ]}
            value={nodeType}
            onChange={(value) => value && handleChange('nodeType', value as BeatNodeType)}
          />

          <Textarea
            label="Description"
            value={objective.description}
            onChange={(e) => handleChange('description', e.currentTarget.value)}
            placeholder={
              nodeType === 'objective' ? 'What should the player do?'
                : nodeType === 'narrative' ? 'What happens in this beat?'
                : 'What condition must be true?'
            }
            minRows={2}
            autosize
          />

          {/* === Objective-specific fields === */}
          {nodeType === 'objective' && (
            <>
              <Select
                label="Type"
                data={typeOptions}
                value={objective.type}
                onChange={(value) => value && handleChange('type', value as QuestObjective['type'])}
              />

              {targetOptions.length > 0 && (
                <Select
                  label="Target"
                  data={targetOptions}
                  value={objective.target || null}
                  onChange={(value) => handleChange('target', value || '')}
                  placeholder="Select target..."
                  searchable
                  clearable
                />
              )}

              {objective.type !== 'location' && objective.type !== 'trigger' && (
                <Select
                  label="Dialogue"
                  data={dialogueOptions}
                  value={objective.dialogue || null}
                  onChange={(value) => handleChange('dialogue', value || undefined)}
                  placeholder="Select dialogue..."
                  searchable
                  clearable
                  description="Override default NPC dialogue"
                />
              )}

              {objective.dialogue && (
                <Select
                  label="Complete On"
                  data={[
                    { value: 'dialogueEnd', label: 'Dialogue End' },
                    { value: 'interact', label: 'Interaction' },
                  ]}
                  value={objective.completeOn || 'dialogueEnd'}
                  onChange={(value) => handleChange('completeOn', value || 'dialogueEnd')}
                />
              )}
            </>
          )}

          {/* === Narrative-specific fields === */}
          {nodeType === 'narrative' && (
            <>
              <Select
                label="Narrative Type"
                data={[
                  { value: 'dialogue', label: '💬 Dialogue' },
                  { value: 'cutscene', label: '🎬 Cutscene' },
                ]}
                value={objective.narrativeType || 'dialogue'}
                onChange={(value) => handleChange('narrativeType', (value as NarrativeSubtype) || 'dialogue')}
              />

              {(objective.narrativeType === 'dialogue' || !objective.narrativeType) && (
                <Select
                  label="Dialogue"
                  data={dialogueOptions}
                  value={objective.dialogueId || null}
                  onChange={(value) => handleChange('dialogueId', value || undefined)}
                  placeholder="Select dialogue..."
                  searchable
                  clearable
                />
              )}

            </>
          )}

          {/* === Condition-specific fields === */}
          {nodeType === 'condition' && (
            <Stack gap="xs">
              <Select
                label="Operator"
                data={[
                  { value: 'hasItem', label: '📦 Has Item' },
                  { value: 'hasFlag', label: '🚩 Has Flag' },
                  { value: 'questComplete', label: '✓ Quest Complete' },
                  { value: 'stageComplete', label: '✓ Stage Complete' },
                  { value: 'custom', label: '⭐ Custom' },
                ]}
                value={objective.condition?.operator || 'hasFlag'}
                onChange={(value) => {
                  const cond = objective.condition || { operator: 'hasFlag' as ConditionOperator, operand: '' };
                  handleChange('condition', { ...cond, operator: (value as ConditionOperator) || 'hasFlag' });
                }}
              />

              {objective.condition?.operator === 'hasItem' ? (
                <Select
                  label="Item"
                  data={items.map((i) => ({ value: i.id, label: i.name }))}
                  value={objective.condition?.operand || null}
                  onChange={(value) => {
                    const cond = objective.condition || { operator: 'hasItem' as ConditionOperator, operand: '' };
                    handleChange('condition', { ...cond, operand: value || '' });
                  }}
                  placeholder="Select item..."
                  searchable
                  clearable
                />
              ) : (
                <TextInput
                  label="Operand"
                  value={objective.condition?.operand || ''}
                  onChange={(e) => {
                    const cond = objective.condition || { operator: 'hasFlag' as ConditionOperator, operand: '' };
                    handleChange('condition', { ...cond, operand: e.currentTarget.value });
                  }}
                  placeholder={
                    objective.condition?.operator === 'hasFlag' ? 'flag-name'
                      : objective.condition?.operator === 'questComplete' ? 'quest-id'
                      : objective.condition?.operator === 'stageComplete' ? 'questId:stageId'
                      : 'expression'
                  }
                />
              )}

              <Checkbox
                label="Negate (NOT)"
                checked={objective.condition?.negate ?? false}
                onChange={(e) => {
                  const cond = objective.condition || { operator: 'hasFlag' as ConditionOperator, operand: '' };
                  handleChange('condition', { ...cond, negate: e.currentTarget.checked || undefined });
                }}
              />
            </Stack>
          )}

          {/* Common fields */}
          <Group>
            <Checkbox
              label="Optional"
              checked={objective.optional ?? false}
              onChange={(e) => handleChange('optional', e.currentTarget.checked || undefined)}
            />
            <Checkbox
              label="Auto-start"
              checked={objective.autoStart ?? false}
              onChange={(e) => handleChange('autoStart', e.currentTarget.checked || undefined)}
            />
          </Group>

          {/* Prerequisites */}
          <Stack gap="xs">
            <Text size="sm" fw={500}>Prerequisites</Text>
            {prereqObjectives.length === 0 ? (
              <Text size="xs" c="dimmed" fs="italic">
                No prerequisites - this is an entry node
              </Text>
            ) : (
              prereqObjectives.map((prereq) => {
                const prereqNodeType = prereq.nodeType || 'objective';
                const prereqIcon = prereqNodeType === 'narrative' ? 'N'
                  : prereqNodeType === 'condition' ? '?'
                  : OBJECTIVE_ICONS[prereq.type] || '⭐';
                return (
                  <Paper key={prereq.id} p="xs" withBorder style={{ background: '#181825' }}>
                    <Group justify="space-between">
                      <Group gap="xs">
                        <Text size="sm">{prereqIcon}</Text>
                        <Text size="xs">{prereq.description}</Text>
                      </Group>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() => onRemovePrerequisite(prereq.id)}
                        styles={{ root: { padding: '2px 6px' } }}
                      >
                        ✕
                      </Button>
                    </Group>
                  </Paper>
                );
              })
            )}
            <Text size="xs" c="dimmed">
              Drag from another node's output to add prerequisites
            </Text>
          </Stack>

          {/* OnEnter Actions */}
          <ActionListEditor
            label="On Enter Actions"
            field="onEnter"
            objective={objective}
            onChange={onChange}
            npcs={npcs}
            items={items}
          />

          {/* OnComplete Actions */}
          <ActionListEditor
            label="On Complete Actions"
            field="onComplete"
            objective={objective}
            onChange={onChange}
            npcs={npcs}
            items={items}
          />

          {/* Delete button */}
          <Button color="red" variant="subtle" onClick={onDelete} fullWidth mt="md">
            Delete Node
          </Button>
        </Stack>
      </ScrollArea>
    </Stack>
  );
}
