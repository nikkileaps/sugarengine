/**
 * NodeCanvas - Pannable, zoomable canvas for node-based editing
 *
 * Supports:
 * - Pan by dragging the background
 * - Zoom with scroll wheel
 * - Node rendering via callback
 * - Connection lines between nodes
 */

export interface NodePosition {
  x: number;
  y: number;
}

export interface CanvasNode {
  id: string;
  position: NodePosition;
  width?: number;
  height?: number;
}

export interface CanvasConnection {
  fromId: string;
  toId: string;
  fromPort?: string;  // For multiple output ports (e.g., choices)
  color?: string;
}

export interface NodeCanvasConfig {
  onNodeSelect?: (nodeId: string) => void;
  onNodeMove?: (nodeId: string, position: NodePosition) => void;
  onCanvasClick?: () => void;
  renderNode: (node: CanvasNode, element: HTMLElement) => void;
}

export class NodeCanvas {
  private element: HTMLElement;
  private viewport: HTMLElement;
  private nodesContainer: HTMLElement;
  private connectionsCanvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private nodes: Map<string, CanvasNode> = new Map();
  private nodeElements: Map<string, HTMLElement> = new Map();
  private connections: CanvasConnection[] = [];
  private selectedNodeId: string | null = null;

  // Transform state
  private panX = 0;
  private panY = 0;
  private zoom = 1;

  // Interaction state
  private isPanning = false;
  private isDraggingNode = false;
  private dragNodeId: string | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragNodeStartX = 0;
  private dragNodeStartY = 0;

  private config: NodeCanvasConfig;

  constructor(config: NodeCanvasConfig) {
    this.config = config;

    // Main container
    this.element = document.createElement('div');
    this.element.className = 'node-canvas';
    this.element.style.cssText = `
      flex: 1;
      position: relative;
      overflow: hidden;
      background: #1e1e2e;
      cursor: grab;
    `;

    // Grid background pattern
    this.element.style.backgroundImage = `
      radial-gradient(circle, #313244 1px, transparent 1px)
    `;
    this.element.style.backgroundSize = '20px 20px';

    // Viewport (transforms with pan/zoom)
    this.viewport = document.createElement('div');
    this.viewport.className = 'node-canvas-viewport';
    this.viewport.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: 0 0;
    `;
    this.element.appendChild(this.viewport);

    // Connections canvas (SVG might be better, but canvas is simpler for now)
    this.connectionsCanvas = document.createElement('canvas');
    this.connectionsCanvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
    `;
    this.viewport.appendChild(this.connectionsCanvas);
    this.ctx = this.connectionsCanvas.getContext('2d')!;

    // Nodes container
    this.nodesContainer = document.createElement('div');
    this.nodesContainer.className = 'node-canvas-nodes';
    this.nodesContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
    `;
    this.viewport.appendChild(this.nodesContainer);

    // Event listeners
    this.setupEventListeners();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  setNodes(nodes: CanvasNode[]): void {
    this.nodes.clear();
    for (const node of nodes) {
      this.nodes.set(node.id, node);
    }
    this.renderNodes();
  }

  setConnections(connections: CanvasConnection[]): void {
    this.connections = connections;
    this.renderConnections();
  }

  setSelectedNode(nodeId: string | null): void {
    this.selectedNodeId = nodeId;
    this.updateNodeSelection();
  }

  centerOnNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const rect = this.element.getBoundingClientRect();
    this.panX = rect.width / 2 - node.position.x * this.zoom - (node.width ?? 200) / 2 * this.zoom;
    this.panY = rect.height / 2 - node.position.y * this.zoom - (node.height ?? 100) / 2 * this.zoom;
    this.updateTransform();
    this.renderConnections();
  }

  fitToContent(): void {
    if (this.nodes.size === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of this.nodes.values()) {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + (node.width ?? 200));
      maxY = Math.max(maxY, node.position.y + (node.height ?? 100));
    }

    const rect = this.element.getBoundingClientRect();
    const padding = 50;
    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;

    this.zoom = Math.min(
      rect.width / contentWidth,
      rect.height / contentHeight,
      1.5  // Max zoom
    );
    this.zoom = Math.max(this.zoom, 0.3);  // Min zoom

    this.panX = (rect.width - contentWidth * this.zoom) / 2 - minX * this.zoom + padding * this.zoom;
    this.panY = (rect.height - contentHeight * this.zoom) / 2 - minY * this.zoom + padding * this.zoom;

    this.updateTransform();
    this.renderConnections();
  }

  private setupEventListeners(): void {
    // Mouse down - start pan or node drag
    this.element.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;

      const target = e.target as HTMLElement;
      const nodeEl = target.closest('[data-node-id]') as HTMLElement;

      if (nodeEl) {
        // Start node drag
        const nodeId = nodeEl.dataset.nodeId!;
        const node = this.nodes.get(nodeId);
        if (!node) return;

        this.isDraggingNode = true;
        this.dragNodeId = nodeId;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragNodeStartX = node.position.x;
        this.dragNodeStartY = node.position.y;

        this.config.onNodeSelect?.(nodeId);
        this.setSelectedNode(nodeId);
        this.element.style.cursor = 'grabbing';
      } else {
        // Start pan
        this.isPanning = true;
        this.dragStartX = e.clientX - this.panX;
        this.dragStartY = e.clientY - this.panY;
        this.element.style.cursor = 'grabbing';
        this.config.onCanvasClick?.();
      }
    });

    // Mouse move - pan or drag node
    this.element.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        this.panX = e.clientX - this.dragStartX;
        this.panY = e.clientY - this.dragStartY;
        this.updateTransform();
        this.renderConnections();
      } else if (this.isDraggingNode && this.dragNodeId) {
        const node = this.nodes.get(this.dragNodeId);
        if (!node) return;

        const dx = (e.clientX - this.dragStartX) / this.zoom;
        const dy = (e.clientY - this.dragStartY) / this.zoom;

        node.position.x = this.dragNodeStartX + dx;
        node.position.y = this.dragNodeStartY + dy;

        const nodeEl = this.nodeElements.get(this.dragNodeId);
        if (nodeEl) {
          nodeEl.style.left = `${node.position.x}px`;
          nodeEl.style.top = `${node.position.y}px`;
        }

        this.renderConnections();
      }
    });

    // Mouse up - end pan or drag
    window.addEventListener('mouseup', () => {
      if (this.isDraggingNode && this.dragNodeId) {
        const node = this.nodes.get(this.dragNodeId);
        if (node) {
          this.config.onNodeMove?.(this.dragNodeId, { ...node.position });
        }
      }

      this.isPanning = false;
      this.isDraggingNode = false;
      this.dragNodeId = null;
      this.element.style.cursor = 'grab';
    });

    // Wheel - zoom
    this.element.addEventListener('wheel', (e) => {
      e.preventDefault();

      const rect = this.element.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Point in canvas space before zoom
      const canvasX = (mouseX - this.panX) / this.zoom;
      const canvasY = (mouseY - this.panY) / this.zoom;

      // Apply zoom
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom = Math.max(0.2, Math.min(3, this.zoom * zoomFactor));

      // Adjust pan to keep mouse point stationary
      this.panX = mouseX - canvasX * this.zoom;
      this.panY = mouseY - canvasY * this.zoom;

      this.updateTransform();
      this.renderConnections();
    });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      this.resizeConnectionsCanvas();
      this.renderConnections();
    });
    resizeObserver.observe(this.element);
  }

  private updateTransform(): void {
    this.viewport.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;

    // Update background grid to match zoom
    const gridSize = 20 * this.zoom;
    this.element.style.backgroundSize = `${gridSize}px ${gridSize}px`;
    this.element.style.backgroundPosition = `${this.panX}px ${this.panY}px`;
  }

  private resizeConnectionsCanvas(): void {
    // Make canvas large enough to cover all content
    let maxX = 0, maxY = 0;
    for (const node of this.nodes.values()) {
      maxX = Math.max(maxX, node.position.x + (node.width ?? 200) + 500);
      maxY = Math.max(maxY, node.position.y + (node.height ?? 100) + 500);
    }

    this.connectionsCanvas.width = Math.max(maxX, 2000);
    this.connectionsCanvas.height = Math.max(maxY, 2000);
  }

  private renderNodes(): void {
    this.nodesContainer.innerHTML = '';
    this.nodeElements.clear();

    for (const node of this.nodes.values()) {
      const nodeEl = document.createElement('div');
      nodeEl.className = 'canvas-node';
      nodeEl.dataset.nodeId = node.id;
      nodeEl.style.cssText = `
        position: absolute;
        left: ${node.position.x}px;
        top: ${node.position.y}px;
        min-width: 180px;
        background: #181825;
        border: 2px solid #313244;
        border-radius: 8px;
        cursor: move;
        user-select: none;
      `;

      // Let the config render the node content
      this.config.renderNode(node, nodeEl);

      this.nodesContainer.appendChild(nodeEl);
      this.nodeElements.set(node.id, nodeEl);

      // Store actual dimensions after render
      requestAnimationFrame(() => {
        node.width = nodeEl.offsetWidth;
        node.height = nodeEl.offsetHeight;
        this.renderConnections();
      });
    }

    this.updateNodeSelection();
    this.resizeConnectionsCanvas();
  }

  private updateNodeSelection(): void {
    for (const [nodeId, nodeEl] of this.nodeElements) {
      if (nodeId === this.selectedNodeId) {
        nodeEl.style.borderColor = '#89b4fa';
        nodeEl.style.boxShadow = '0 0 0 2px #89b4fa44';
      } else {
        nodeEl.style.borderColor = '#313244';
        nodeEl.style.boxShadow = 'none';
      }
    }
  }

  private renderConnections(): void {
    this.ctx.clearRect(0, 0, this.connectionsCanvas.width, this.connectionsCanvas.height);

    for (const conn of this.connections) {
      const fromNode = this.nodes.get(conn.fromId);
      const toNode = this.nodes.get(conn.toId);
      if (!fromNode || !toNode) continue;

      const fromEl = this.nodeElements.get(conn.fromId);
      const toEl = this.nodeElements.get(conn.toId);
      if (!fromEl || !toEl) continue;

      // Calculate connection points
      const fromX = fromNode.position.x + (fromNode.width ?? 180);
      const fromY = fromNode.position.y + (fromNode.height ?? 50) / 2;
      const toX = toNode.position.x;
      const toY = toNode.position.y + (toNode.height ?? 50) / 2;

      // Draw bezier curve
      this.ctx.beginPath();
      this.ctx.strokeStyle = conn.color ?? '#45475a';
      this.ctx.lineWidth = 2;

      const controlOffset = Math.min(100, Math.abs(toX - fromX) / 2);
      this.ctx.moveTo(fromX, fromY);
      this.ctx.bezierCurveTo(
        fromX + controlOffset, fromY,
        toX - controlOffset, toY,
        toX, toY
      );
      this.ctx.stroke();

      // Draw arrow at end
      const angle = Math.atan2(toY - (toY), toX - (toX - controlOffset));
      const arrowSize = 8;
      this.ctx.beginPath();
      this.ctx.fillStyle = conn.color ?? '#45475a';
      this.ctx.moveTo(toX, toY);
      this.ctx.lineTo(
        toX - arrowSize * Math.cos(angle - Math.PI / 6),
        toY - arrowSize * Math.sin(angle - Math.PI / 6)
      );
      this.ctx.lineTo(
        toX - arrowSize * Math.cos(angle + Math.PI / 6),
        toY - arrowSize * Math.sin(angle + Math.PI / 6)
      );
      this.ctx.closePath();
      this.ctx.fill();
    }
  }
}
