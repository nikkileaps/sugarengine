/**
 * BehaviorTreeCanvas - Visual behavior tree editor for NPCs
 *
 * Displays behavior trees as a hierarchical tree with parent→children flow.
 */

import { useEffect, useRef, useState } from 'react';
import type {
  BTNode,
  BTNodeType,
  BTControlNode,
  BTParallelNode,
  BTDecoratorNode,
  BTConditionNode,
  BTActionNode,
  BTCondition,
  BTAction,
  BTConditionType,
  BTActionType,
} from '../../../engine/behavior/types';
import {
  Stack,
  Group,
  Button,
  Text,
  Badge,
  ScrollArea,
  Select,
  TextInput,
  NumberInput,
  Menu,
} from '@mantine/core';
import { NodeCanvas, CanvasNode, CanvasConnection } from '../../components';

// Quest type with stages and beat nodes for condition editing
type BTQuestRef = {
  id: string;
  name: string;
  stages: { id: string; description: string; objectives: { id: string; description: string }[] }[];
};

// Node type colors
const NODE_COLORS: Record<string, string> = {
  selector: '#89b4fa',
  sequence: '#89b4fa',
  parallel: '#89b4fa',
  inverter: '#fab387',
  repeater: '#fab387',
  succeeder: '#fab387',
  untilFail: '#fab387',
  condition: '#f9e2af',
  action: '#a6e3a1',
};

// Node type icons
const NODE_ICONS: Record<string, string> = {
  selector: 'S',
  sequence: '→',
  parallel: '‖',
  inverter: '!',
  repeater: '↻',
  succeeder: '✓',
  untilFail: '⟲',
  condition: '?',
  action: '▶',
};

interface BehaviorTreeCanvasProps {
  tree: BTNode | undefined;
  onChange: (tree: BTNode | undefined) => void;
  dialogues: { id: string; name: string }[];
  items: { id: string; name: string }[];
  quests: BTQuestRef[];
  onClose: () => void;
}

interface FlatNode {
  node: BTNode;
  parentId: string | null;
  childIndex: number;
}

export function BehaviorTreeCanvas({
  tree,
  onChange,
  dialogues,
  items,
  quests,
  onClose,
}: BehaviorTreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<NodeCanvas | null>(null);
  const treeRef = useRef<BTNode | undefined>(tree);
  const selectedNodeIdRef = useRef<string | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  treeRef.current = tree;
  selectedNodeIdRef.current = selectedNodeId;

  // Layout constants
  const NODE_SPACING_X = 300;
  const NODE_SPACING_Y = 140;

  // Flatten tree into array of nodes with parent references
  const flattenTree = (root: BTNode | undefined): FlatNode[] => {
    if (!root) return [];

    const flat: FlatNode[] = [];
    const visit = (node: BTNode, parentId: string | null, childIndex: number) => {
      flat.push({ node, parentId, childIndex });

      if (node.type === 'selector' || node.type === 'sequence' || node.type === 'parallel') {
        const controlNode = node as BTControlNode | BTParallelNode;
        controlNode.children.forEach((child, idx) => visit(child, node.id, idx));
      } else if (node.type === 'inverter' || node.type === 'repeater' || node.type === 'succeeder' || node.type === 'untilFail') {
        const decoratorNode = node as BTDecoratorNode;
        visit(decoratorNode.child, node.id, 0);
      }
    };

    visit(root, null, 0);
    return flat;
  };

  // Auto-layout tree nodes
  const computeLayout = (root: BTNode): Map<string, { x: number; y: number }> => {
    const positions = new Map<string, { x: number; y: number }>();
    const depths = new Map<string, number>();
    const siblingCounts = new Map<number, number>();

    const computeDepth = (node: BTNode, depth: number) => {
      depths.set(node.id, depth);

      if (node.type === 'selector' || node.type === 'sequence' || node.type === 'parallel') {
        (node as BTControlNode | BTParallelNode).children.forEach(child => computeDepth(child, depth + 1));
      } else if (node.type === 'inverter' || node.type === 'repeater' || node.type === 'succeeder' || node.type === 'untilFail') {
        computeDepth((node as BTDecoratorNode).child, depth + 1);
      }
    };

    computeDepth(root, 0);

    // Position nodes by depth
    const flat = flattenTree(root);
    for (const { node } of flat) {
      const depth = depths.get(node.id) ?? 0;
      const lane = siblingCounts.get(depth) ?? 0;
      siblingCounts.set(depth, lane + 1);

      positions.set(node.id, {
        x: 50 + depth * NODE_SPACING_X,
        y: 50 + lane * NODE_SPACING_Y,
      });
    }

    return positions;
  };

  // Get positions, auto-laying out any nodes that don't have one yet
  const getPositions = (): Map<string, { x: number; y: number }> => {
    const positions = new Map(nodePositions);
    if (!tree) return positions;

    const flat = flattenTree(tree);
    const needsLayout = flat.filter(f => !positions.has(f.node.id));
    if (needsLayout.length === 0) return positions;

    // Compute layout for the whole tree, use it for missing nodes
    const layout = computeLayout(tree);
    for (const f of needsLayout) {
      const pos = layout.get(f.node.id);
      if (pos) positions.set(f.node.id, pos);
    }

    return positions;
  };

  // Update canvas with current data
  const updateCanvas = () => {
    if (!canvasRef.current || !tree) return;

    const flat = flattenTree(tree);
    const positions = getPositions();
    const canvasNodes: CanvasNode[] = flat.map(({ node }) => ({
      id: node.id,
      position: positions.get(node.id) || { x: 50, y: 50 },
    }));

    const connections: CanvasConnection[] = [];
    for (const { node, parentId } of flat) {
      if (parentId) {
        connections.push({
          fromId: parentId,
          toId: node.id,
          color: '#45475a',
        });
      }
    }

    canvasRef.current.setNodes(canvasNodes);
    canvasRef.current.setConnections(connections);
  };

  // Track the tree ID so we know when to recreate vs update the canvas
  const currentTreeIdRef = useRef<string | null>(null);

  // Create or update canvas when tree changes
  useEffect(() => {
    if (!containerRef.current) return;
    if (!tree) {
      // No tree - clear canvas
      if (canvasRef.current) {
        containerRef.current.innerHTML = '';
        canvasRef.current = null;
        currentTreeIdRef.current = null;
      }
      return;
    }

    // If canvas exists and root hasn't changed, just update data
    if (canvasRef.current && currentTreeIdRef.current === tree.id) {
      updateCanvas();
      return;
    }

    // Create new canvas
    containerRef.current.innerHTML = '';
    currentTreeIdRef.current = tree.id;

    const positions = getPositions();
    setNodePositions(positions);

    const canvas = new NodeCanvas({
      onNodeSelect: (nodeId) => setSelectedNodeId(nodeId),
      onNodeMove: (nodeId, pos) => {
        setNodePositions(prev => {
          const updated = new Map(prev);
          updated.set(nodeId, pos);
          return updated;
        });
      },
      onCanvasClick: () => setSelectedNodeId(null),
      renderNode: (canvasNode, element) => {
        const currentTree = treeRef.current;
        if (!currentTree) return;

        const flat = flattenTree(currentTree);
        const flatNode = flat.find(f => f.node.id === canvasNode.id);
        if (!flatNode) {
          element.innerHTML = '<div style="padding: 12px; color: #f38ba8;">Node not found</div>';
          return;
        }

        const node = flatNode.node;
        const isSelected = node.id === selectedNodeIdRef.current;
        const nodeColor = NODE_COLORS[node.type] || '#89b4fa';
        const nodeIcon = NODE_ICONS[node.type] || '?';

        element.style.minWidth = '180px';
        element.style.maxWidth = '240px';
        element.style.background = '#181825';
        element.style.border = `2px solid ${isSelected ? '#89b4fa' : '#313244'}`;
        element.style.borderRadius = '8px';
        element.style.overflow = 'hidden';

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
          padding: 8px 12px;
          background: ${nodeColor}22;
          border-bottom: 1px solid #313244;
          display: flex;
          align-items: center;
          gap: 8px;
        `;

        const icon = document.createElement('span');
        icon.textContent = nodeIcon;
        icon.style.cssText = `
          font-size: 14px;
          font-weight: 700;
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: ${nodeColor}44;
          color: ${nodeColor};
          border-radius: 4px;
        `;
        header.appendChild(icon);

        const typeLabel = document.createElement('span');
        typeLabel.textContent = node.type;
        typeLabel.style.cssText = `
          font-size: 11px;
          padding: 2px 6px;
          background: ${nodeColor}22;
          color: ${nodeColor};
          border-radius: 3px;
          text-transform: uppercase;
        `;
        header.appendChild(typeLabel);

        element.appendChild(header);

        // Content - show name or brief details
        const content = document.createElement('div');
        content.style.cssText = 'padding: 12px; font-size: 12px; color: #cdd6f4; line-height: 1.4;';

        if (node.name) {
          content.textContent = node.name;
        } else if (node.type === 'condition') {
          const condNode = node as BTConditionNode;
          content.textContent = `${condNode.condition.type}`;
        } else if (node.type === 'action') {
          const actNode = node as BTActionNode;
          content.textContent = `${actNode.action.type}`;
        } else if (node.type === 'parallel') {
          const parNode = node as BTParallelNode;
          content.textContent = `Policy: ${parNode.policy}`;
        } else if (node.type === 'repeater') {
          const repNode = node as BTDecoratorNode;
          content.textContent = repNode.count ? `Count: ${repNode.count}` : 'Repeater';
        } else {
          content.textContent = node.type;
        }

        element.appendChild(content);

        // Badges for child count
        if (node.type === 'selector' || node.type === 'sequence' || node.type === 'parallel') {
          const controlNode = node as BTControlNode | BTParallelNode;
          if (controlNode.children.length > 0) {
            const badges = document.createElement('div');
            badges.style.cssText = 'padding: 8px 12px; border-top: 1px solid #313244; display: flex; gap: 4px;';

            const badge = document.createElement('span');
            badge.textContent = `${controlNode.children.length} children`;
            badge.style.cssText = 'font-size: 9px; padding: 2px 4px; background: #89b4fa22; color: #89b4fa; border-radius: 2px;';
            badges.appendChild(badge);

            element.appendChild(badges);
          }
        }
      },
      showPorts: true,
    });

    containerRef.current.appendChild(canvas.getElement());
    canvasRef.current = canvas;

    // Set initial nodes directly
    const canvasNodes: CanvasNode[] = flattenTree(tree).map(({ node }) => ({
      id: node.id,
      position: positions.get(node.id) || { x: 50, y: 50 },
    }));

    const connections: CanvasConnection[] = [];
    for (const { node, parentId } of flattenTree(tree)) {
      if (parentId) {
        connections.push({ fromId: parentId, toId: node.id, color: '#45475a' });
      }
    }

    canvas.setNodes(canvasNodes);
    canvas.setConnections(connections);
    setTimeout(() => canvas.fitToContent(), 100);
  }, [tree?.id]);

  // Update canvas when tree children or positions change
  useEffect(() => {
    if (!canvasRef.current || !tree) return;

    const positions = getPositions();
    // Sync any new positions into state
    if (positions.size !== nodePositions.size) {
      setNodePositions(positions);
    }

    const flat = flattenTree(tree);
    const canvasNodes: CanvasNode[] = flat.map(({ node }) => ({
      id: node.id,
      position: positions.get(node.id) || { x: 50, y: 50 },
    }));

    const connections: CanvasConnection[] = [];
    for (const { node, parentId } of flat) {
      if (parentId) {
        connections.push({ fromId: parentId, toId: node.id, color: '#45475a' });
      }
    }

    canvasRef.current.setNodes(canvasNodes);
    canvasRef.current.setConnections(connections);
  }, [tree, nodePositions]);

  // Update selection
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.setSelectedNode(selectedNodeId);
    }
  }, [selectedNodeId]);

  const selectedNode = selectedNodeId && tree
    ? flattenTree(tree).find(f => f.node.id === selectedNodeId)?.node
    : null;

  const handleAddNode = (nodeType: BTNodeType, subtype?: string) => {
    const id = `bt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    let newNode: BTNode;

    if (nodeType === 'selector' || nodeType === 'sequence') {
      newNode = { id, type: nodeType, children: [], name: `New ${nodeType}` };
    } else if (nodeType === 'parallel') {
      newNode = { id, type: 'parallel', children: [], policy: 'requireAll', name: 'New parallel' };
    } else if (nodeType === 'inverter' || nodeType === 'succeeder' || nodeType === 'untilFail') {
      // Decorator needs a dummy child initially
      const childId = `bt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const dummyChild: BTActionNode = { id: childId, type: 'action', action: { type: 'wait', seconds: 1 } };
      newNode = { id, type: nodeType, child: dummyChild, name: `New ${nodeType}` };
    } else if (nodeType === 'repeater') {
      const childId = `bt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const dummyChild: BTActionNode = { id: childId, type: 'action', action: { type: 'wait', seconds: 1 } };
      newNode = { id, type: 'repeater', child: dummyChild, count: 3, name: 'New repeater' };
    } else if (nodeType === 'condition') {
      const condType = (subtype as BTConditionType) || 'hasFlag';
      let condition: BTCondition;
      if (condType === 'hasItem') {
        condition = { type: 'hasItem', itemId: '' };
      } else if (condType === 'hasFlag') {
        condition = { type: 'hasFlag', flag: '' };
      } else if (condType === 'questStage') {
        condition = { type: 'questStage', questId: '', stageId: '', state: 'active' };
      } else {
        condition = { type: 'custom', check: '' };
      }
      newNode = { id, type: 'condition', condition, name: `Check ${condType}` };
    } else if (nodeType === 'action') {
      const actType = (subtype as BTActionType) || 'wait';
      let action: BTAction;
      if (actType === 'dialogue') {
        action = { type: 'dialogue', dialogueId: '' };
      } else if (actType === 'moveTo') {
        action = { type: 'moveTo', target: { x: 0, y: 0, z: 0 } };
      } else if (actType === 'wait') {
        action = { type: 'wait', seconds: 1 };
      } else if (actType === 'setFlag') {
        action = { type: 'setFlag', flag: '', value: true };
      } else if (actType === 'emitEvent') {
        action = { type: 'emitEvent', event: '' };
      } else {
        action = { type: 'custom', handler: '' };
      }
      newNode = { id, type: 'action', action, name: `Do ${actType}` };
    } else {
      return; // Unknown type
    }

    if (!tree) {
      // No tree yet - this becomes the root
      const newPositions = new Map(nodePositions);
      newPositions.set(id, { x: 50, y: 50 });
      // For decorators/repeaters, also position the dummy child
      if (newNode.type === 'inverter' || newNode.type === 'repeater' || newNode.type === 'succeeder' || newNode.type === 'untilFail') {
        const dec = newNode as BTDecoratorNode;
        newPositions.set(dec.child.id, { x: 50 + NODE_SPACING_X, y: 50 });
      }
      setNodePositions(newPositions);
      onChange(newNode);
      setSelectedNodeId(id);
      return;
    }

    // Determine the parent to add to
    let parentId: string | null = null;
    if (selectedNode && (selectedNode.type === 'selector' || selectedNode.type === 'sequence' || selectedNode.type === 'parallel')) {
      parentId = selectedNode.id;
    } else if (tree.type === 'selector' || tree.type === 'sequence' || tree.type === 'parallel') {
      parentId = tree.id;
    }

    if (!parentId) return;

    const updated = addChildToNode(tree, parentId, newNode);

    // Position the new node below the last sibling at the parent's depth
    const parentPos = nodePositions.get(parentId) || { x: 50, y: 50 };
    let maxY = 0;
    for (const pos of nodePositions.values()) {
      maxY = Math.max(maxY, pos.y);
    }
    const newPositions = new Map(nodePositions);
    newPositions.set(id, { x: parentPos.x + NODE_SPACING_X, y: maxY + NODE_SPACING_Y });
    // For decorators/repeaters, also position the dummy child
    if (newNode.type === 'inverter' || newNode.type === 'repeater' || newNode.type === 'succeeder' || newNode.type === 'untilFail') {
      const dec = newNode as BTDecoratorNode;
      newPositions.set(dec.child.id, { x: parentPos.x + NODE_SPACING_X * 2, y: maxY + NODE_SPACING_Y });
    }
    setNodePositions(newPositions);
    onChange(updated);
    setSelectedNodeId(id);
  };

  const handleNodeChange = (updated: BTNode) => {
    if (!tree) return;
    const newTree = updateNodeInTree(tree, updated.id, () => updated);
    onChange(newTree);
  };

  const handleDeleteNode = (nodeId: string) => {
    if (!tree) return;
    if (tree.id === nodeId) {
      // Deleting root
      onChange(undefined);
      setSelectedNodeId(null);
      return;
    }

    const newTree = removeNodeFromTree(tree, nodeId);
    onChange(newTree);
    setSelectedNodeId(null);
  };

  const nodeCount = tree ? flattenTree(tree).length : 0;

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
            Behavior Tree
          </Text>
          <Badge size="sm" variant="light">
            {nodeCount} node{nodeCount !== 1 ? 's' : ''}
          </Badge>
        </Group>

        <Group gap="xs">
          <Menu shadow="md" width={220}>
            <Menu.Target>
              <Button size="xs" variant="subtle">+ Add Node</Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Control</Menu.Label>
              <Menu.Item onClick={() => handleAddNode('selector')}>S Selector (OR)</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('sequence')}>→ Sequence (AND)</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('parallel')}>‖ Parallel</Menu.Item>
              <Menu.Divider />
              <Menu.Label>Decorator</Menu.Label>
              <Menu.Item onClick={() => handleAddNode('inverter')}>! Inverter</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('repeater')}>↻ Repeater</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('succeeder')}>✓ Succeeder</Menu.Item>
              <Menu.Divider />
              <Menu.Label>Condition</Menu.Label>
              <Menu.Item onClick={() => handleAddNode('condition', 'questStage')}>Quest Stage</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('condition', 'hasItem')}>Has Item</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('condition', 'hasFlag')}>Has Flag</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('condition', 'custom')}>Custom</Menu.Item>
              <Menu.Divider />
              <Menu.Label>Action</Menu.Label>
              <Menu.Item onClick={() => handleAddNode('action', 'dialogue')}>Start Dialogue</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('action', 'moveTo')}>Move To</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('action', 'wait')}>Wait</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('action', 'setFlag')}>Set Flag</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('action', 'emitEvent')}>Emit Event</Menu.Item>
              <Menu.Item onClick={() => handleAddNode('action', 'custom')}>Custom</Menu.Item>
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
        {!tree && (
          <Stack align="center" justify="center" h="100%" gap="md" style={{ position: 'absolute', inset: 0 }}>
            <Text size="xl">🌳</Text>
            <Text c="dimmed">No behavior tree yet</Text>
            <Text size="sm" c="dimmed" ta="center" maw={300}>
              Use the "+ Add Node" button to create the root node of your behavior tree.
            </Text>
          </Stack>
        )}

        {/* Node Editor Panel */}
        {selectedNode && (
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 340, zIndex: 10 }}>
            <NodeEditorPanel
              node={selectedNode}
              dialogues={dialogues}
              items={items}
              quests={quests}
              onChange={handleNodeChange}
              onDelete={() => handleDeleteNode(selectedNode.id)}
              onClose={() => setSelectedNodeId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Helper: Update a node in the tree
function updateNodeInTree(root: BTNode, nodeId: string, updater: (node: BTNode) => BTNode): BTNode {
  if (root.id === nodeId) {
    return updater(root);
  }

  if (root.type === 'selector' || root.type === 'sequence' || root.type === 'parallel') {
    const controlNode = root as BTControlNode | BTParallelNode;
    return {
      ...root,
      children: controlNode.children.map(child => updateNodeInTree(child, nodeId, updater)),
    } as BTNode;
  }

  if (root.type === 'inverter' || root.type === 'repeater' || root.type === 'succeeder' || root.type === 'untilFail') {
    const decoratorNode = root as BTDecoratorNode;
    return {
      ...root,
      child: updateNodeInTree(decoratorNode.child, nodeId, updater),
    } as BTNode;
  }

  return root;
}

// Helper: Add a child to a control node
function addChildToNode(root: BTNode, parentId: string, child: BTNode): BTNode {
  if (root.id === parentId) {
    if (root.type === 'selector' || root.type === 'sequence' || root.type === 'parallel') {
      const controlNode = root as BTControlNode | BTParallelNode;
      return {
        ...root,
        children: [...controlNode.children, child],
      } as BTNode;
    }
  }

  if (root.type === 'selector' || root.type === 'sequence' || root.type === 'parallel') {
    const controlNode = root as BTControlNode | BTParallelNode;
    return {
      ...root,
      children: controlNode.children.map(c => addChildToNode(c, parentId, child)),
    } as BTNode;
  }

  if (root.type === 'inverter' || root.type === 'repeater' || root.type === 'succeeder' || root.type === 'untilFail') {
    const decoratorNode = root as BTDecoratorNode;
    return {
      ...root,
      child: addChildToNode(decoratorNode.child, parentId, child),
    } as BTNode;
  }

  return root;
}

// Helper: Remove a node from the tree
function removeNodeFromTree(root: BTNode, nodeId: string): BTNode | undefined {
  if (root.id === nodeId) {
    return undefined;
  }

  if (root.type === 'selector' || root.type === 'sequence' || root.type === 'parallel') {
    const controlNode = root as BTControlNode | BTParallelNode;
    const newChildren = controlNode.children
      .map(child => removeNodeFromTree(child, nodeId))
      .filter((child): child is BTNode => child !== undefined);
    return { ...root, children: newChildren } as BTNode;
  }

  if (root.type === 'inverter' || root.type === 'repeater' || root.type === 'succeeder' || root.type === 'untilFail') {
    const decoratorNode = root as BTDecoratorNode;
    const newChild = removeNodeFromTree(decoratorNode.child, nodeId);
    if (!newChild) {
      // Decorator lost its child - we need to keep a dummy
      const dummyId = `bt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const dummyChild: BTActionNode = { id: dummyId, type: 'action', action: { type: 'wait', seconds: 1 } };
      return { ...root, child: dummyChild } as BTNode;
    }
    return { ...root, child: newChild } as BTNode;
  }

  return root;
}

// Node editor panel
interface NodeEditorPanelProps {
  node: BTNode;
  dialogues: { id: string; name: string }[];
  items: { id: string; name: string }[];
  quests: BTQuestRef[];
  onChange: (node: BTNode) => void;
  onDelete: () => void;
  onClose: () => void;
}

function NodeEditorPanel({
  node,
  dialogues,
  items,
  quests,
  onChange,
  onDelete,
  onClose,
}: NodeEditorPanelProps) {
  const nodeColor = NODE_COLORS[node.type] || '#89b4fa';

  const handleChange = <K extends keyof BTNode>(field: K, value: BTNode[K]) => {
    onChange({ ...node, [field]: value });
  };

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
            {node.type}
          </Text>
          <Badge size="xs" color={nodeColor} variant="light">
            {node.type}
          </Badge>
        </Group>
        <Button size="xs" variant="subtle" onClick={onClose}>
          ✕
        </Button>
      </Group>

      <ScrollArea style={{ flex: 1 }}>
        <Stack gap="md" p="sm">
          {/* Name field (all nodes) */}
          <TextInput
            label="Name"
            value={node.name || ''}
            onChange={(e) => handleChange('name', e.currentTarget.value || undefined)}
            placeholder="Optional node name"
          />

          {/* Parallel policy */}
          {node.type === 'parallel' && (
            <Select
              label="Policy"
              data={[
                { value: 'requireAll', label: 'Require All (AND)' },
                { value: 'requireOne', label: 'Require One (OR)' },
              ]}
              value={(node as BTParallelNode).policy}
              onChange={(value) => onChange({ ...node, policy: value as 'requireAll' | 'requireOne' } as BTNode)}
            />
          )}

          {/* Repeater count */}
          {node.type === 'repeater' && (
            <NumberInput
              label="Count"
              value={(node as BTDecoratorNode).count || 1}
              onChange={(value) => onChange({ ...node, count: Number(value) || 1 } as BTNode)}
              min={1}
            />
          )}

          {/* Condition fields */}
          {node.type === 'condition' && (
            <ConditionEditor
              condition={(node as BTConditionNode).condition}
              onChange={(condition) => onChange({ ...node, condition } as BTNode)}
              dialogues={dialogues}
              items={items}
              quests={quests}
            />
          )}

          {/* Action fields */}
          {node.type === 'action' && (
            <ActionEditor
              action={(node as BTActionNode).action}
              onChange={(action) => onChange({ ...node, action } as BTNode)}
              dialogues={dialogues}
              items={items}
            />
          )}

          {/* Delete button */}
          <Button color="red" variant="subtle" onClick={onDelete} fullWidth mt="md">
            Delete Node
          </Button>
        </Stack>
      </ScrollArea>
    </Stack>
  );
}

// Condition editor
interface ConditionEditorProps {
  condition: BTCondition;
  onChange: (condition: BTCondition) => void;
  dialogues: { id: string; name: string }[];
  items: { id: string; name: string }[];
  quests: BTQuestRef[];
}

function ConditionEditor({ condition, onChange, items, quests }: ConditionEditorProps) {
  const handleTypeChange = (type: BTConditionType) => {
    if (type === 'hasItem') {
      onChange({ type: 'hasItem', itemId: '' });
    } else if (type === 'hasFlag') {
      onChange({ type: 'hasFlag', flag: '' });
    } else if (type === 'questStage') {
      onChange({ type: 'questStage', questId: '', stageId: '', state: 'active' });
    } else if (type === 'timeOfDay') {
      onChange({ type: 'timeOfDay', value: '' });
    } else if (type === 'atLocation') {
      onChange({ type: 'atLocation', locationId: '' });
    } else {
      onChange({ type: 'custom', check: '' });
    }
  };

  return (
    <Stack gap="sm">
      <Select
        label="Condition Type"
        data={[
          { value: 'questStage', label: 'Quest Stage' },
          { value: 'hasItem', label: 'Has Item' },
          { value: 'hasFlag', label: 'Has Flag' },
          { value: 'timeOfDay', label: 'Time of Day' },
          { value: 'atLocation', label: 'At Location' },
          { value: 'custom', label: 'Custom' },
        ]}
        value={condition.type}
        onChange={(value) => handleTypeChange(value as BTConditionType)}
      />

      {condition.type === 'hasItem' && (
        <>
          <Select
            label="Item"
            data={items.map(i => ({ value: i.id, label: i.name }))}
            value={condition.itemId || null}
            onChange={(value) => onChange({ ...condition, itemId: value || '' })}
            searchable
            clearable
          />
          <NumberInput
            label="Count (optional)"
            value={condition.count || 1}
            onChange={(value) => onChange({ ...condition, count: Number(value) || undefined })}
            min={1}
          />
        </>
      )}

      {condition.type === 'hasFlag' && (
        <>
          <TextInput
            label="Flag"
            value={condition.flag}
            onChange={(e) => onChange({ ...condition, flag: e.currentTarget.value })}
            placeholder="flag-name"
          />
          <TextInput
            label="Value (optional)"
            value={String(condition.value ?? '')}
            onChange={(e) => onChange({ ...condition, value: e.currentTarget.value || undefined })}
            placeholder="true/false or any value"
          />
        </>
      )}

      {condition.type === 'questStage' && (() => {
        const selectedQuest = quests.find(q => q.id === condition.questId);
        const selectedStage = selectedQuest?.stages.find(s => s.id === condition.stageId);
        return (
          <>
            <Select
              label="Quest"
              data={quests.map(q => ({ value: q.id, label: q.name }))}
              value={condition.questId || null}
              onChange={(value) => onChange({ ...condition, questId: value || '', stageId: '', nodeId: undefined })}
              searchable
              clearable
            />
            {selectedQuest && (
              <Select
                label="Stage"
                data={selectedQuest.stages.map(s => ({ value: s.id, label: s.description || s.id }))}
                value={condition.stageId || null}
                onChange={(value) => onChange({ ...condition, stageId: value || '', nodeId: undefined })}
                searchable
                clearable
              />
            )}
            {selectedStage && selectedStage.objectives.length > 0 && (
              <Select
                label="Beat Node (optional)"
                description="Check a specific node within the stage"
                data={selectedStage.objectives.map(o => ({ value: o.id, label: o.description || o.id }))}
                value={condition.nodeId || null}
                onChange={(value) => onChange({ ...condition, nodeId: value || undefined })}
                searchable
                clearable
              />
            )}
            <Select
              label="State"
              data={[
                { value: 'active', label: 'Active' },
                { value: 'completed', label: 'Completed' },
              ]}
              value={condition.state}
              onChange={(value) => onChange({ ...condition, state: value as 'active' | 'completed' })}
            />
          </>
        );
      })()}

      {condition.type === 'timeOfDay' && (
        <TextInput
          label="Time"
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.currentTarget.value })}
          placeholder="morning, afternoon, evening, night"
        />
      )}

      {condition.type === 'atLocation' && (
        <>
          <TextInput
            label="Location ID"
            value={condition.locationId}
            onChange={(e) => onChange({ ...condition, locationId: e.currentTarget.value })}
            placeholder="location-id"
          />
          <NumberInput
            label="Radius (optional)"
            value={condition.radius || 5}
            onChange={(value) => onChange({ ...condition, radius: Number(value) || undefined })}
            min={0}
          />
        </>
      )}

      {condition.type === 'custom' && (
        <TextInput
          label="Check"
          value={condition.check}
          onChange={(e) => onChange({ ...condition, check: e.currentTarget.value })}
          placeholder="custom-check-name"
        />
      )}
    </Stack>
  );
}

// Action editor
interface ActionEditorProps {
  action: BTAction;
  onChange: (action: BTAction) => void;
  dialogues: { id: string; name: string }[];
  items: { id: string; name: string }[];
}

function ActionEditor({ action, onChange, dialogues }: ActionEditorProps) {
  const handleTypeChange = (type: BTActionType) => {
    if (type === 'dialogue') {
      onChange({ type: 'dialogue', dialogueId: '' });
    } else if (type === 'moveTo') {
      onChange({ type: 'moveTo', target: { x: 0, y: 0, z: 0 } });
    } else if (type === 'wait') {
      onChange({ type: 'wait', seconds: 1 });
    } else if (type === 'animate') {
      onChange({ type: 'animate', animation: '' });
    } else if (type === 'lookAt') {
      onChange({ type: 'lookAt', target: '' });
    } else if (type === 'setFlag') {
      onChange({ type: 'setFlag', flag: '', value: true });
    } else if (type === 'emitEvent') {
      onChange({ type: 'emitEvent', event: '' });
    } else {
      onChange({ type: 'custom', handler: '' });
    }
  };

  return (
    <Stack gap="sm">
      <Select
        label="Action Type"
        data={[
          { value: 'dialogue', label: 'Start Dialogue' },
          { value: 'moveTo', label: 'Move To' },
          { value: 'wait', label: 'Wait' },
          { value: 'animate', label: 'Animate' },
          { value: 'lookAt', label: 'Look At' },
          { value: 'setFlag', label: 'Set Flag' },
          { value: 'emitEvent', label: 'Emit Event' },
          { value: 'custom', label: 'Custom' },
        ]}
        value={action.type}
        onChange={(value) => handleTypeChange(value as BTActionType)}
      />

      {action.type === 'dialogue' && (
        <Select
          label="Dialogue"
          data={dialogues.map(d => ({ value: d.id, label: d.name }))}
          value={action.dialogueId || null}
          onChange={(value) => onChange({ ...action, dialogueId: value || '' })}
          searchable
          clearable
        />
      )}

      {action.type === 'moveTo' && (
        <Group gap="xs">
          <NumberInput
            label="X"
            value={typeof action.target === 'object' ? action.target.x : 0}
            onChange={(value) => {
              const pos = typeof action.target === 'object' ? action.target : { x: 0, y: 0, z: 0 };
              onChange({ ...action, target: { ...pos, x: Number(value) || 0 } });
            }}
            style={{ flex: 1 }}
          />
          <NumberInput
            label="Y"
            value={typeof action.target === 'object' ? action.target.y : 0}
            onChange={(value) => {
              const pos = typeof action.target === 'object' ? action.target : { x: 0, y: 0, z: 0 };
              onChange({ ...action, target: { ...pos, y: Number(value) || 0 } });
            }}
            style={{ flex: 1 }}
          />
          <NumberInput
            label="Z"
            value={typeof action.target === 'object' ? action.target.z : 0}
            onChange={(value) => {
              const pos = typeof action.target === 'object' ? action.target : { x: 0, y: 0, z: 0 };
              onChange({ ...action, target: { ...pos, z: Number(value) || 0 } });
            }}
            style={{ flex: 1 }}
          />
        </Group>
      )}

      {action.type === 'wait' && (
        <NumberInput
          label="Seconds"
          value={action.seconds}
          onChange={(value) => onChange({ ...action, seconds: Number(value) || 1 })}
          min={0}
          step={0.1}
        />
      )}

      {action.type === 'animate' && (
        <TextInput
          label="Animation"
          value={action.animation}
          onChange={(e) => onChange({ ...action, animation: e.currentTarget.value })}
          placeholder="animation-name"
        />
      )}

      {action.type === 'lookAt' && (
        <TextInput
          label="Target"
          value={action.target}
          onChange={(e) => onChange({ ...action, target: e.currentTarget.value })}
          placeholder="target-id or player"
        />
      )}

      {action.type === 'setFlag' && (
        <>
          <TextInput
            label="Flag"
            value={action.flag}
            onChange={(e) => onChange({ ...action, flag: e.currentTarget.value })}
            placeholder="flag-name"
          />
          <TextInput
            label="Value"
            value={String(action.value ?? 'true')}
            onChange={(e) => onChange({ ...action, value: e.currentTarget.value })}
            placeholder="true/false or any value"
          />
        </>
      )}

      {action.type === 'emitEvent' && (
        <TextInput
          label="Event"
          value={action.event}
          onChange={(e) => onChange({ ...action, event: e.currentTarget.value })}
          placeholder="event-name"
        />
      )}

      {action.type === 'custom' && (
        <TextInput
          label="Handler"
          value={action.handler}
          onChange={(e) => onChange({ ...action, handler: e.currentTarget.value })}
          placeholder="custom-handler-name"
        />
      )}
    </Stack>
  );
}
