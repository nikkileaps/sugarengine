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
  onConnect?: (fromNodeId: string, toNodeId: string) => void;
  renderNode: (node: CanvasNode, element: HTMLElement) => void;
  showMinimap?: boolean;
  showPorts?: boolean;
}

export class NodeCanvas {
  private element: HTMLElement;
  private viewport: HTMLElement;
  private nodesContainer: HTMLElement;
  private connectionsCanvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Mini-map
  private minimapContainer: HTMLElement | null = null;
  private minimapCanvas: HTMLCanvasElement | null = null;
  private minimapCtx: CanvasRenderingContext2D | null = null;
  private readonly MINIMAP_SIZE = 150;
  private readonly MINIMAP_PADDING = 10;

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
  private isDraggingMinimap = false;
  private isDraggingConnection = false;
  private dragNodeId: string | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragNodeStartX = 0;
  private dragNodeStartY = 0;

  // Connection drawing state
  private connectionFromNodeId: string | null = null;
  private connectionMouseX = 0;
  private connectionMouseY = 0;

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
      width: 2000px;
      height: 2000px;
    `;
    this.connectionsCanvas.width = 2000;
    this.connectionsCanvas.height = 2000;
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

    // Mini-map (optional)
    if (config.showMinimap !== false) {
      this.createMinimap();
    }

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
    // Mouse down - start pan, node drag, or connection drag
    this.element.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;

      const target = e.target as HTMLElement;

      // Check if clicking on an output port to start connection
      if (target.classList.contains('node-port-output')) {
        e.stopPropagation();
        const nodeId = target.dataset.nodeId!;
        this.isDraggingConnection = true;
        this.connectionFromNodeId = nodeId;
        this.connectionMouseX = e.clientX;
        this.connectionMouseY = e.clientY;
        this.element.style.cursor = 'crosshair';
        return;
      }

      // Check if clicking on an input port (ignore, connections start from output)
      if (target.classList.contains('node-port-input')) {
        return;
      }

      const nodeEl = target.closest('[data-node-id]') as HTMLElement;

      if (nodeEl && !target.classList.contains('node-port')) {
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

    // Mouse move - pan, drag node, or drag connection
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
      } else if (this.isDraggingConnection) {
        this.connectionMouseX = e.clientX;
        this.connectionMouseY = e.clientY;
        this.renderConnections();
      }
    });

    // Mouse up - end pan, drag, or connection
    this.element.addEventListener('mouseup', (e) => {
      // Check if releasing on an input port to complete connection
      if (this.isDraggingConnection && this.connectionFromNodeId) {
        const target = e.target as HTMLElement;
        if (target.classList.contains('node-port-input')) {
          const toNodeId = target.dataset.nodeId!;
          // Don't allow self-connections
          if (toNodeId !== this.connectionFromNodeId) {
            this.config.onConnect?.(this.connectionFromNodeId, toNodeId);
          }
        }
        this.isDraggingConnection = false;
        this.connectionFromNodeId = null;
        this.renderConnections();
        this.element.style.cursor = 'grab';
        return;
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isDraggingNode && this.dragNodeId) {
        const node = this.nodes.get(this.dragNodeId);
        if (node) {
          this.config.onNodeMove?.(this.dragNodeId, { ...node.position });
        }
      }

      // Cancel connection drag if releasing outside
      if (this.isDraggingConnection) {
        this.isDraggingConnection = false;
        this.connectionFromNodeId = null;
        this.renderConnections();
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

      // Add connection ports if enabled
      if (this.config.showPorts !== false) {
        // Input port (left side)
        const inputPort = document.createElement('div');
        inputPort.className = 'node-port node-port-input';
        inputPort.dataset.portType = 'input';
        inputPort.dataset.nodeId = node.id;
        inputPort.style.cssText = `
          position: absolute;
          left: -6px;
          top: 50%;
          transform: translateY(-50%);
          width: 12px;
          height: 12px;
          background: #313244;
          border: 2px solid #45475a;
          border-radius: 50%;
          cursor: crosshair;
          z-index: 10;
          transition: all 0.15s;
        `;
        inputPort.onmouseenter = () => {
          inputPort.style.background = '#89b4fa';
          inputPort.style.borderColor = '#89b4fa';
          inputPort.style.transform = 'translateY(-50%) scale(1.3)';
        };
        inputPort.onmouseleave = () => {
          inputPort.style.background = '#313244';
          inputPort.style.borderColor = '#45475a';
          inputPort.style.transform = 'translateY(-50%) scale(1)';
        };
        nodeEl.appendChild(inputPort);

        // Output port (right side)
        const outputPort = document.createElement('div');
        outputPort.className = 'node-port node-port-output';
        outputPort.dataset.portType = 'output';
        outputPort.dataset.nodeId = node.id;
        outputPort.style.cssText = `
          position: absolute;
          right: -6px;
          top: 50%;
          transform: translateY(-50%);
          width: 12px;
          height: 12px;
          background: #313244;
          border: 2px solid #45475a;
          border-radius: 50%;
          cursor: crosshair;
          z-index: 10;
          transition: all 0.15s;
        `;
        outputPort.onmouseenter = () => {
          outputPort.style.background = '#a6e3a1';
          outputPort.style.borderColor = '#a6e3a1';
          outputPort.style.transform = 'translateY(-50%) scale(1.3)';
        };
        outputPort.onmouseleave = () => {
          outputPort.style.background = '#313244';
          outputPort.style.borderColor = '#45475a';
          outputPort.style.transform = 'translateY(-50%) scale(1)';
        };
        nodeEl.appendChild(outputPort);
      }

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

    // Draw in-progress connection if dragging
    if (this.isDraggingConnection && this.connectionFromNodeId) {
      const fromNode = this.nodes.get(this.connectionFromNodeId);
      if (fromNode) {
        const fromX = fromNode.position.x + (fromNode.width ?? 180);
        const fromY = fromNode.position.y + (fromNode.height ?? 50) / 2;

        // Convert mouse position to canvas coordinates
        const rect = this.element.getBoundingClientRect();
        const toX = (this.connectionMouseX - rect.left - this.panX) / this.zoom;
        const toY = (this.connectionMouseY - rect.top - this.panY) / this.zoom;

        // Draw dashed bezier curve
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#89b4fa';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);

        const controlOffset = Math.min(100, Math.abs(toX - fromX) / 2);
        this.ctx.moveTo(fromX, fromY);
        this.ctx.bezierCurveTo(
          fromX + controlOffset, fromY,
          toX - controlOffset, toY,
          toX, toY
        );
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      }
    }

    // Update mini-map
    this.renderMinimap();
  }

  private createMinimap(): void {
    this.minimapContainer = document.createElement('div');
    this.minimapContainer.style.cssText = `
      position: absolute;
      bottom: ${this.MINIMAP_PADDING}px;
      right: ${this.MINIMAP_PADDING}px;
      width: ${this.MINIMAP_SIZE}px;
      height: ${this.MINIMAP_SIZE}px;
      background: #181825;
      border: 1px solid #313244;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;

    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.width = this.MINIMAP_SIZE;
    this.minimapCanvas.height = this.MINIMAP_SIZE;
    this.minimapCanvas.style.cssText = 'width: 100%; height: 100%;';
    this.minimapCtx = this.minimapCanvas.getContext('2d')!;

    this.minimapContainer.appendChild(this.minimapCanvas);
    this.element.appendChild(this.minimapContainer);

    // Click on minimap to navigate
    this.minimapContainer.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.isDraggingMinimap = true;
      this.navigateFromMinimap(e);
    });

    this.minimapContainer.addEventListener('mousemove', (e) => {
      if (this.isDraggingMinimap) {
        this.navigateFromMinimap(e);
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDraggingMinimap = false;
    });
  }

  private navigateFromMinimap(e: MouseEvent): void {
    if (!this.minimapContainer || this.nodes.size === 0) return;

    const rect = this.minimapContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Calculate content bounds
    const bounds = this.getContentBounds();
    if (!bounds) return;

    const padding = 20;
    const contentWidth = bounds.maxX - bounds.minX + padding * 2;
    const contentHeight = bounds.maxY - bounds.minY + padding * 2;

    // Calculate scale to fit content in minimap
    const scale = Math.min(
      this.MINIMAP_SIZE / contentWidth,
      this.MINIMAP_SIZE / contentHeight
    );

    // Offset to center content in minimap
    const offsetX = (this.MINIMAP_SIZE - contentWidth * scale) / 2;
    const offsetY = (this.MINIMAP_SIZE - contentHeight * scale) / 2;

    // Convert click to canvas coordinates
    const canvasX = (clickX - offsetX) / scale + bounds.minX - padding;
    const canvasY = (clickY - offsetY) / scale + bounds.minY - padding;

    // Center viewport on clicked point
    const viewRect = this.element.getBoundingClientRect();
    this.panX = viewRect.width / 2 - canvasX * this.zoom;
    this.panY = viewRect.height / 2 - canvasY * this.zoom;

    this.updateTransform();
    this.renderConnections();
  }

  private getContentBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (this.nodes.size === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of this.nodes.values()) {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + (node.width ?? 200));
      maxY = Math.max(maxY, node.position.y + (node.height ?? 100));
    }

    return { minX, minY, maxX, maxY };
  }

  private renderMinimap(): void {
    if (!this.minimapCtx || !this.minimapCanvas) return;

    const ctx = this.minimapCtx;
    ctx.clearRect(0, 0, this.MINIMAP_SIZE, this.MINIMAP_SIZE);

    if (this.nodes.size === 0) {
      // Show empty state
      ctx.fillStyle = '#313244';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No nodes', this.MINIMAP_SIZE / 2, this.MINIMAP_SIZE / 2);
      return;
    }

    // Calculate content bounds
    const bounds = this.getContentBounds();
    if (!bounds) return;

    const padding = 20;
    const contentWidth = bounds.maxX - bounds.minX + padding * 2;
    const contentHeight = bounds.maxY - bounds.minY + padding * 2;

    // Calculate scale to fit content in minimap
    const scale = Math.min(
      this.MINIMAP_SIZE / contentWidth,
      this.MINIMAP_SIZE / contentHeight
    );

    // Offset to center content in minimap
    const offsetX = (this.MINIMAP_SIZE - contentWidth * scale) / 2;
    const offsetY = (this.MINIMAP_SIZE - contentHeight * scale) / 2;

    // Draw connections
    ctx.strokeStyle = '#45475a';
    ctx.lineWidth = 1;
    for (const conn of this.connections) {
      const fromNode = this.nodes.get(conn.fromId);
      const toNode = this.nodes.get(conn.toId);
      if (!fromNode || !toNode) continue;

      const fromX = (fromNode.position.x + (fromNode.width ?? 180) - bounds.minX + padding) * scale + offsetX;
      const fromY = (fromNode.position.y + (fromNode.height ?? 50) / 2 - bounds.minY + padding) * scale + offsetY;
      const toX = (toNode.position.x - bounds.minX + padding) * scale + offsetX;
      const toY = (toNode.position.y + (toNode.height ?? 50) / 2 - bounds.minY + padding) * scale + offsetY;

      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
    }

    // Draw nodes
    for (const node of this.nodes.values()) {
      const x = (node.position.x - bounds.minX + padding) * scale + offsetX;
      const y = (node.position.y - bounds.minY + padding) * scale + offsetY;
      const w = (node.width ?? 180) * scale;
      const h = (node.height ?? 50) * scale;

      ctx.fillStyle = node.id === this.selectedNodeId ? '#89b4fa' : '#6c7086';
      ctx.fillRect(x, y, Math.max(w, 4), Math.max(h, 3));
    }

    // Draw viewport rectangle
    const viewRect = this.element.getBoundingClientRect();
    const viewLeft = (-this.panX / this.zoom - bounds.minX + padding) * scale + offsetX;
    const viewTop = (-this.panY / this.zoom - bounds.minY + padding) * scale + offsetY;
    const viewWidth = (viewRect.width / this.zoom) * scale;
    const viewHeight = (viewRect.height / this.zoom) * scale;

    ctx.strokeStyle = '#89b4fa';
    ctx.lineWidth = 2;
    ctx.strokeRect(viewLeft, viewTop, viewWidth, viewHeight);
  }
}
