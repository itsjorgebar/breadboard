/**
 * @license
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  InspectableEdge,
  InspectableNode,
  Schema,
} from "@google-labs/breadboard";
import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";
import * as PIXI from "pixi.js";
import * as Dagre from "@dagrejs/dagre";

type Port = {
  name: string;
  type: Schema["type"];
  active: boolean;
};

class InteractionTracker {
  static #instance: InteractionTracker;
  static instance() {
    if (!this.#instance) {
      this.#instance = new InteractionTracker();
    }

    return this.#instance;
  }

  private constructor() {
    // Constructor only callable by Singleton function.
  }

  public activeDisplayObject: PIXI.DisplayObject | null = null;
}

const GRAPH_NODE_DRAWN = "graphnodedrawn";
const GRAPH_NODE_MOVED = "graphnodemoved";
const GRAPH_INITIAL_DRAW = "graphinitialdraw";

class GraphNodePort extends PIXI.Graphics {
  #isDirty = true;
  #radius = 3;
  #borderInactiveColor = 0xbbbbbb;
  #borderActiveColor = 0x475d3f;
  #activeColor = 0xaced8f;
  #inactiveColor = 0xdddddd;
  #active = false;

  constructor() {
    super();

    this.eventMode = "static";
    this.cursor = "pointer";
    this.on("pointerdown", () => {
      InteractionTracker.instance().activeDisplayObject = this;
    });
  }

  set radius(radius: number) {
    this.#radius = radius;
    this.#isDirty = true;
  }

  get radius() {
    return this.#radius;
  }

  set active(active: boolean) {
    this.#active = active;
    this.#isDirty = true;
  }

  get active() {
    return this.#active;
  }

  render(renderer: PIXI.Renderer): void {
    if (this.#isDirty) {
      this.#isDirty = false;
      this.#draw();
    }
    super.render(renderer);
  }

  #draw() {
    // Adjust the hit area so it's a bit bigger.
    this.hitArea = new PIXI.Rectangle(
      -this.#radius * 2,
      -this.#radius * 2,
      this.#radius * 4,
      this.#radius * 4
    );

    this.lineStyle({
      color: this.#active ? this.#borderActiveColor : this.#borderInactiveColor,
      width: 1,
    });
    this.beginFill(this.#active ? this.#activeColor : this.#inactiveColor);
    this.drawCircle(0, 0, this.#radius);
    this.endFill();
  }
}

class GraphEdge extends PIXI.Graphics {
  #isDirty = true;
  #edge: InspectableEdge | null = null;
  #edgeColor = 0xaaaaaa;
  #padding = 25;

  constructor(private fromNode: GraphNode, private toNode: GraphNode) {
    super();
  }

  set edge(edge: InspectableEdge | null) {
    this.#edge = edge;
    this.#isDirty = true;
  }

  get edge() {
    return this.#edge;
  }

  render(renderer: PIXI.Renderer) {
    if (this.#isDirty) {
      this.#draw();
    }
    super.render(renderer);
  }

  #draw() {
    if (!this.#edge) {
      return;
    }

    const outLocation = this.fromNode.outPortLocation(this.#edge.out)?.clone();
    const inLocation = this.toNode.inPortLocation(this.#edge.in)?.clone();
    if (!(outLocation && inLocation)) {
      return;
    }

    this.clear();

    // Convert to graph-centric values.
    outLocation.x += this.fromNode.position.x;
    outLocation.y += this.fromNode.position.y;

    inLocation.x += this.toNode.position.x;
    inLocation.y += this.toNode.position.y;

    const midX = Math.round((inLocation.x - outLocation.x) / 2);
    const midY = Math.round((inLocation.y - outLocation.y) / 2);

    this.lineStyle(2, this.#edgeColor);
    this.moveTo(outLocation.x, outLocation.y);

    if (this.fromNode === this.toNode) {
      // Loopback
      this.lineTo(outLocation.x + this.#padding, outLocation.y);
      this.lineTo(
        outLocation.x + this.#padding,
        outLocation.y + this.fromNode.height / 2 + this.#padding
      );
      this.lineTo(
        inLocation.x - this.#padding,
        outLocation.y + this.fromNode.height / 2 + this.#padding
      );
      this.lineTo(inLocation.x - this.#padding, inLocation.y);
      this.lineTo(inLocation.x, inLocation.y);
      return;
    }

    const curve = 5;
    let curveY = outLocation.y > inLocation.y ? -curve : curve;
    let curveX = curve;
    if (Math.abs(outLocation.y - inLocation.y) < 4 * curve) {
      curveY = 0;
    }

    if (midX > this.#padding) {
      this.lineTo(outLocation.x + midX - curve, outLocation.y);
      this.quadraticCurveTo(
        outLocation.x + midX,
        outLocation.y,
        outLocation.x + midX,
        outLocation.y + curveY
      );
      this.lineTo(outLocation.x + midX, inLocation.y - curveY);
      this.quadraticCurveTo(
        outLocation.x + midX,
        inLocation.y,
        outLocation.x + midX + curveX,
        inLocation.y
      );
      this.lineTo(inLocation.x, inLocation.y);
    } else {
      // Ensure the edge won't come back on itself in the middle.
      if (
        inLocation.x - this.#padding + curveX >
        outLocation.x + this.#padding - curveX
      ) {
        curveX = 0;
      }

      this.lineTo(outLocation.x + this.#padding - curveX, outLocation.y);
      this.quadraticCurveTo(
        outLocation.x + this.#padding,
        outLocation.y,
        outLocation.x + this.#padding,
        outLocation.y + curveY
      );
      this.lineTo(outLocation.x + this.#padding, outLocation.y + midY - curveY);
      this.quadraticCurveTo(
        outLocation.x + this.#padding,
        outLocation.y + midY,
        outLocation.x + this.#padding - curveX,
        outLocation.y + midY
      );
      this.lineTo(inLocation.x - this.#padding + curveX, outLocation.y + midY);
      this.quadraticCurveTo(
        inLocation.x - this.#padding,
        outLocation.y + midY,
        inLocation.x - this.#padding,
        outLocation.y + midY + curveY
      );
      this.lineTo(inLocation.x - this.#padding, inLocation.y - curveY);
      this.quadraticCurveTo(
        inLocation.x - this.#padding,
        inLocation.y,
        inLocation.x - this.#padding + curveX,
        inLocation.y
      );
      this.lineTo(inLocation.x, inLocation.y);
    }
  }
}

export class GraphNode extends PIXI.Graphics {
  #width = 0;
  #height = 0;

  #isDirty = true;
  #id = "";
  #type = "";
  #title = "";
  #titleText: PIXI.Text | null = null;
  #borderRadius = 3;
  #color = 0x333333;
  #titleTextColor = 0x333333;
  #portTextColor = 0x333333;
  #textSize = 12;
  #backgroundColor = 0x333333;
  #padding = 10;
  #portLabelVerticalPadding = 5;
  #portLabelHorizontalPadding = 20;
  #portPadding = 6;
  #portRadius = 3;
  #inPorts: Map<Port, PIXI.Text | null> = new Map();
  #outPorts: Map<Port, PIXI.Text | null> = new Map();
  #inPortLocations: Map<string, PIXI.ObservablePoint<unknown>> = new Map();
  #outPortLocations: Map<string, PIXI.ObservablePoint<unknown>> = new Map();

  constructor(id: string, type: string) {
    super();

    this.id = id;
    this.type = type;

    switch (type) {
      case "input":
        this.color = 0xc9daf8;
        this.titleTextColor = 0x2c5598;
        break;

      case "secrets":
        this.color = 0xf4cccc;
        this.titleTextColor = 0xac342a;
        break;

      case "output":
        this.color = 0xb6d7a8;
        this.titleTextColor = 0x2a5a15;
        break;

      case "slot":
      case "passthrough":
        this.color = 0xead1dc;
        this.titleTextColor = 0x87365e;
        break;

      default:
        this.color = 0xfff2cc;
        this.titleTextColor = 0xb3772c;
        break;
    }

    this.backgroundColor = 0xffffff;
    this.portTextColor = 0x333333;

    this.eventMode = "static";
    this.cursor = "pointer";
    this.on("pointerdown", () => {
      // Another active display object (likely a graph node port) is already
      // active, so don't override it.
      if (InteractionTracker.instance().activeDisplayObject) {
        return;
      }

      InteractionTracker.instance().activeDisplayObject = this;
    });
  }

  #clearOldTitle() {
    if (!this.#titleText) {
      return;
    }

    this.#titleText.removeFromParent();
    this.#titleText.destroy();
    this.#titleText = null;
  }

  get id() {
    return this.#id;
  }

  set id(id: string) {
    this.#id = id;
    this.#title = `${this.#type} (${id})`;
    this.#clearOldTitle();

    this.#isDirty = true;
  }

  get type() {
    return this.#type;
  }

  set type(type: string) {
    this.#type = type;
    this.#title = `${type} (${this.id})`;
    this.#clearOldTitle();

    this.#isDirty = true;
  }

  set borderRadius(borderRadius: number) {
    this.#borderRadius = borderRadius;
    this.#isDirty = true;
  }

  get borderRadius() {
    return this.#borderRadius;
  }

  set color(color: number) {
    this.#color = color;
    this.#isDirty = true;
  }

  get color() {
    return this.#color;
  }

  set titleTextColor(titleTextColor: number) {
    this.#titleTextColor = titleTextColor;
    this.#isDirty = true;
  }

  get titleTextColor() {
    return this.#titleTextColor;
  }

  set portTextColor(portTextColor: number) {
    this.#portTextColor = portTextColor;
    this.#isDirty = true;
  }

  get portTextColor() {
    return this.#portTextColor;
  }

  set textSize(textSize: number) {
    this.#textSize = textSize;
    this.#isDirty = true;
  }

  get textSize() {
    return this.#textSize;
  }

  set backgroundColor(backgroundColor: number) {
    this.#backgroundColor = backgroundColor;
    this.#isDirty = true;
  }

  get backgroundColor() {
    return this.#backgroundColor;
  }

  set padding(padding: number) {
    this.#padding = padding;
    this.#isDirty = true;
  }

  get padding() {
    return this.#padding;
  }

  set portLabelVerticalPadding(portLabelVerticalPadding: number) {
    this.#portLabelVerticalPadding = portLabelVerticalPadding;
    this.#isDirty = true;
  }

  get portLabelVerticalPadding() {
    return this.#portLabelVerticalPadding;
  }

  render(renderer: PIXI.Renderer): void {
    if (this.#isDirty) {
      this.#isDirty = false;
      this.#draw();

      // We use this to trigger the edge drawing.
      this.emit(GRAPH_NODE_DRAWN);
    }
    super.render(renderer);
  }

  addInput(name: string, type?: string | string[] | undefined, active = false) {
    this.#inPorts.set({ name, type, active }, null);
    this.#isDirty = true;
  }

  addOutput(
    name: string,
    type?: string | string[] | undefined,
    active = false
  ) {
    this.#outPorts.set({ name, type, active }, null);
    this.#isDirty = true;
  }

  #createTitleTextIfNeeded() {
    if (this.#titleText) {
      return;
    }

    this.#titleText = new PIXI.Text(this.#title, {
      fontFamily: "Arial",
      fontSize: this.#textSize,
      fill: this.#titleTextColor,
      align: "left",
    });
  }

  #createPortTextsIfNeeded() {
    this.#createPortTextLabels(this.#inPorts, "left");
    this.#createPortTextLabels(this.#outPorts, "right");
  }

  #createPortTextLabels(
    ports: Map<Port, PIXI.Text | null>,
    align: "left" | "right"
  ) {
    for (const [port, text] of ports) {
      if (text !== null) {
        continue;
      }

      const textLabel = new PIXI.Text(port.name, {
        fontFamily: "Arial",
        fontSize: this.#textSize,
        fill: this.#portTextColor,
        align,
      });

      ports.set(port, textLabel);
    }
  }

  /**
   * Ensure that we have an even number of pixels just so we don't get fuzzy
   * rendering on half pixels.
   */
  #enforceEvenDimensions() {
    if (this.#width % 2 === 1) {
      this.#width++;
    }

    if (this.#height % 2 === 1) {
      this.#height++;
    }
  }

  #updateDimensions() {
    const portRowHeight = this.#textSize + 2 * this.#portLabelVerticalPadding;
    const portCount = Math.max(this.#inPorts.size, this.#outPorts.size);

    // Height calculations.
    let height = this.#padding + (this.#titleText?.height || 0) + this.#padding;
    height += this.#padding + portCount * portRowHeight + this.#padding;

    // Width calculations.
    let width = this.#padding + (this.#titleText?.width || 0) + this.#padding;
    const inPortLabels = Array.from(this.#inPorts.values());
    const outPortLabels = Array.from(this.#outPorts.values());
    for (let p = 0; p < portCount; p++) {
      const inPortWidth = inPortLabels[p]?.width || 0;
      const outPortWidth = outPortLabels[p]?.width || 0;

      width = Math.max(
        width,
        this.#padding + // Left hand side.
          2 * this.#portRadius + // Left hand port diameter.
          this.#portPadding + // Left hand port padding on right.
          inPortWidth + // Left label at this row.
          2 * this.#portLabelHorizontalPadding + // Port label padding for both sides.
          outPortWidth + // Right label at this row.
          this.#portPadding + // Right hand port padding on right.
          2 * this.#portRadius + // Right hand port diameter.
          this.#padding // Right hand side padding.
      );
    }

    this.#width = width;
    this.#height = height;
  }

  #draw() {
    this.#createPortTextsIfNeeded();
    this.#createTitleTextIfNeeded();
    this.#updateDimensions();
    this.#enforceEvenDimensions();

    this.clear();

    this.#drawBackground();
    const portStartY = this.#drawTitle();
    this.#drawInPorts(portStartY);
    this.#drawOutPorts(portStartY);
  }

  #drawBackground() {
    this.beginFill(0xbbbbbb);
    this.drawRoundedRect(
      -1,
      -1,
      this.#width + 2,
      this.#height + 2,
      this.#borderRadius + 1
    );
    this.endFill();

    this.beginFill(this.#backgroundColor);
    this.drawRoundedRect(0, 0, this.#width, this.#height, this.#borderRadius);
    this.endFill();
  }

  #drawTitle() {
    let portStartY = 0;
    if (this.#titleText) {
      const titleHeight =
        this.#padding + this.#titleText.height + this.#padding;
      this.beginFill(this.#color);
      this.drawRoundedRect(0, 0, this.#width, titleHeight, this.#borderRadius);
      this.drawRect(
        0,
        titleHeight - 2 * this.#borderRadius,
        this.#width,
        2 * this.#borderRadius
      );
      this.endFill();

      this.#titleText.eventMode = "none";
      this.#titleText.x = this.#padding;
      this.#titleText.y = this.#padding;
      this.addChild(this.#titleText);

      // Move the labels a padding's distance from the bottom of the title.
      portStartY += titleHeight + this.#padding;
    }

    return portStartY;
  }

  #drawInPorts(portStartY = 0) {
    this.#inPortLocations.clear();
    const portRowHeight = this.#textSize + 2 * this.#portLabelVerticalPadding;

    let portY = portStartY;
    for (const [port, label] of this.#inPorts) {
      if (!label) {
        console.warn(`No label for ${port.name}`);
        continue;
      }

      const nodePort = new GraphNodePort();
      nodePort.radius = this.#portRadius;
      nodePort.x = this.#padding + this.#portRadius;
      nodePort.y = portY + label.height * 0.5;
      nodePort.active = port.active;
      this.addChild(nodePort);
      this.#inPortLocations.set(port.name, nodePort.position);

      label.x = nodePort.x + this.#portRadius + this.#portPadding;
      label.y = portY;
      this.addChild(label);

      portY += portRowHeight;
    }
  }

  #drawOutPorts(portStartY = 0) {
    this.#outPortLocations.clear();
    const portRowHeight = this.#textSize + 2 * this.#portLabelVerticalPadding;

    let portY = portStartY;
    for (const [port, label] of this.#outPorts) {
      if (!label) {
        console.warn(`No label for ${port.name}`);
        continue;
      }

      const nodePort = new GraphNodePort();
      nodePort.radius = this.#portRadius;
      nodePort.x = this.#width - this.#padding - this.#portRadius;
      nodePort.y = portY + label.height * 0.5;
      nodePort.active = port.active;
      this.addChild(nodePort);
      this.#outPortLocations.set(port.name, nodePort.position);

      label.x = nodePort.x - this.#portRadius - this.#portPadding - label.width;
      label.y = portY;
      this.addChild(label);

      portY += portRowHeight;
    }
  }

  inPortLocation(name: string): PIXI.ObservablePoint<unknown> | null {
    return this.#inPortLocations.get(name) || null;
  }

  outPortLocation(name: string): PIXI.ObservablePoint<unknown> | null {
    return this.#outPortLocations.get(name) || null;
  }
}

export class Graph extends PIXI.Container {
  #isDirty = true;
  #edgeContainer = new PIXI.Container();
  #edgeGraphics = new Map<InspectableEdge, GraphEdge>();
  #edges: InspectableEdge[] | null = null;
  #nodes: InspectableNode[] | null = null;
  #nodeById = new Map<string, GraphNode>();
  #onChildMovedBound = this.#onChildMoved.bind(this);

  constructor() {
    super();

    // The alpha is set super low so that rendering and layout happen, albeit
    // in a hard-to-perceive way. When the GraphRenderer receives the
    // GRAPH_INITIAL_DRAW event it will bring up the alpha.
    this.alpha = 0.0001;
    this.eventMode = "static";
    this.sortableChildren = true;
  }

  layout() {
    if (!this.#edges) {
      return;
    }

    // TODO: Restore updates when the user has dragged.
    const g = new Dagre.graphlib.Graph();
    g.setGraph({ marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));

    for (const node of this.children) {
      if (!(node instanceof GraphNode)) {
        continue;
      }

      g.setNode(node.id, { width: node.width, height: node.height });
    }

    for (const edge of this.#edges) {
      g.setEdge(edge.from.descriptor.id, edge.to.descriptor.id);
    }

    Dagre.layout(g);
    const nodes = g.nodes();
    for (let i = 0; i < nodes.length; i++) {
      const id = nodes[i];
      const graphNode = this.#nodeById.get(id);
      if (!graphNode) {
        continue;
      }

      graphNode.x = g.node(id).x;
      graphNode.y = g.node(id).y;

      // Have the last node take responsibility for notifying the graph so that
      // the edges get redrawn.
      if (i === nodes.length - 1) {
        graphNode.emit(GRAPH_NODE_MOVED);
      }
    }
  }

  render(renderer: PIXI.Renderer) {
    if (this.#isDirty) {
      this.#isDirty = false;
      this.#drawEdges();
      this.#drawNodes().then(() => {
        super.render(renderer);
      });
    } else {
      super.render(renderer);
    }
  }

  set edges(edges: InspectableEdge[] | null) {
    this.#edges = edges;
    this.#isDirty = true;
  }

  get edges() {
    return this.#edges;
  }

  set nodes(nodes: InspectableNode[] | null) {
    this.#nodes = nodes;
    this.#isDirty = true;
  }

  get nodes() {
    return this.#nodes;
  }

  #onChildMoved() {
    this.#drawEdges();
  }

  async #drawNodes() {
    if (!this.#nodes) {
      return;
    }

    const portIsActive = (
      type: "in" | "out",
      nodeId: string,
      portName: string
    ) => {
      if (!this.#edges) {
        return;
      }

      return (
        this.#edges.findIndex((edge) => {
          if (type === "in") {
            return edge.to.descriptor.id === nodeId && edge.in === portName;
          } else {
            return edge.from.descriptor.id === nodeId && edge.out === portName;
          }
        }) !== -1
      );
    };

    // Wait for all nodes to render then do a layout pass.
    await Promise.all(
      this.#nodes.map(async (node) => {
        const graphNode = new GraphNode(
          node.descriptor.id,
          node.descriptor.type
        );
        this.addChild(graphNode);

        const { inputs, outputs } = await node.ports();
        for (const port of inputs.ports) {
          const value = port.schema || {};
          graphNode.addInput(
            port.name,
            value.type,
            portIsActive("in", node.descriptor.id, port.name)
          );
        }

        for (const port of outputs.ports) {
          const value = port.schema || {};
          graphNode.addOutput(
            port.name,
            value.type,
            portIsActive("out", node.descriptor.id, port.name)
          );
        }

        this.#nodeById.set(node.descriptor.id, graphNode);

        graphNode.on(GRAPH_NODE_MOVED, this.#onChildMovedBound);

        return new Promise<void>((resolve) => {
          const onDrawn = () => {
            graphNode.off(GRAPH_NODE_DRAWN, onDrawn);
            resolve();
          };
          graphNode.on(GRAPH_NODE_DRAWN, onDrawn);
        });
      })
    );

    this.layout();
    this.emit(GRAPH_INITIAL_DRAW);
  }

  #drawEdges() {
    if (!this.#edges) {
      return;
    }

    // TODO: Move over to individual graphics for edges.
    for (const edge of this.#edges) {
      let edgeGraphic = this.#edgeGraphics.get(edge);
      if (!edgeGraphic) {
        const fromNode = this.#nodeById.get(edge.from.descriptor.id);
        const toNode = this.#nodeById.get(edge.to.descriptor.id);

        // Only create the edge when the nodes are present.
        if (!(fromNode && toNode)) {
          continue;
        }
        edgeGraphic = new GraphEdge(fromNode, toNode);

        this.#edgeGraphics.set(edge, edgeGraphic);
        this.#edgeContainer.addChild(edgeGraphic);
      }

      edgeGraphic.edge = edge;
    }

    this.addChildAt(this.#edgeContainer, 0);
  }
}

@customElement("bb-graph-renderer")
export class GraphRenderer extends LitElement {
  #app = new PIXI.Application({
    background: "rgb(244, 247, 252)",
    resizeTo: this,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio,
    eventMode: "static",
    eventFeatures: {
      globalMove: true,
      move: true,
      click: true,
      wheel: true,
    },
  });
  #padding = 50;
  #container = new PIXI.Container();
  #background: PIXI.TilingSprite | null = null;

  static styles = css`
    :host {
      display: block;
      overflow: hidden;
    }
  `;

  constructor(
    private minScale = 0.5,
    private maxScale = 3,
    private zoomFactor = 100
  ) {
    super();

    PIXI.Texture.fromURL("/images/pattern.png").then((texture) => {
      this.#background = new PIXI.TilingSprite(texture);
      this.#background.width = this.#app.renderer.width;
      this.#background.height = this.#app.renderer.height;
      this.#background.visible = false;

      this.#app.stage.addChildAt(this.#background, 0);
    });

    this.#app.stage.addChild(this.#container);
    this.#app.stage.eventMode = "static";

    this.#app.stage.on(
      "pointerdown",
      function (this: GraphRenderer, evt) {
        const pointerTarget = InteractionTracker.instance().activeDisplayObject;
        const target = pointerTarget || this.#container;

        let onPointerMove: (evt: PointerEvent) => void;
        if (target instanceof GraphNodePort) {
          onPointerMove = () => {};
        } else {
          const zIndex = target.parent.children.length;
          const dragStart = this.#app.stage.toLocal(evt.global);
          const originalPosition = target.position.clone();

          let tilePosition: PIXI.ObservablePoint<unknown> | null = null;
          if (this.#background && target === this.#container) {
            tilePosition = this.#background.tilePosition.clone();
          }

          onPointerMove = () => {
            if (!dragStart) {
              return;
            }

            const dragPosition = this.#app.stage.toLocal(evt.global);
            let dragDeltaX = dragPosition.x - dragStart.x;
            let dragDeltaY = dragPosition.y - dragStart.y;

            if (target !== this.#container) {
              dragDeltaX /= this.#container.scale.x;
              dragDeltaY /= this.#container.scale.y;
            }

            target.x = originalPosition.x + dragDeltaX;
            target.y = originalPosition.y + dragDeltaY;
            target.zIndex = zIndex;

            // For container moves we update the background position.
            if (
              this.#background &&
              target === this.#container &&
              tilePosition
            ) {
              this.#background.tilePosition.x = tilePosition.x + dragDeltaX;
              this.#background.tilePosition.y = tilePosition.y + dragDeltaY;
            } else {
              target.emit(GRAPH_NODE_MOVED);
            }
          };
        }

        const onPointerUp = () => {
          if (target.zIndex) {
            target.zIndex = Math.max(0, target.parent.children.length - 1);
          }

          InteractionTracker.instance().activeDisplayObject = null;
          document.removeEventListener("pointermove", onPointerMove);
        };

        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", onPointerUp, { once: true });
      },
      this
    );

    this.#app.stage.on(
      "wheel",
      function (this: GraphRenderer, evt) {
        let delta = 1 + evt.deltaY / this.zoomFactor;
        const newScale = this.#container.scale.x * delta;
        if (newScale < this.minScale || newScale > this.maxScale) {
          delta = 1;
        }

        const pivot = this.#app.stage.toLocal(evt.global);
        const matrix = this.#scaleContainerAroundPoint(delta, pivot);

        if (!this.#background) {
          return;
        }

        this.#background.tileTransform.setFromMatrix(matrix);
      },
      this
    );
  }

  #scaleContainerAroundPoint(delta: number, pivot: PIXI.IPointData) {
    const m = new PIXI.Matrix();
    m.identity()
      .scale(this.#container.scale.x, this.#container.scale.y)
      .translate(this.#container.x, this.#container.y);

    // Update with the mousewheel position & delta.
    m.translate(-pivot.x, -pivot.y)
      .scale(delta, delta)
      .translate(pivot.x, pivot.y);

    // Apply back to the container.
    this.#container.transform.setFromMatrix(m);
    return m;
  }

  addGraph(graph: Graph) {
    graph.on(GRAPH_INITIAL_DRAW, () => {
      const graphBounds = graph.getBounds();
      const rendererBounds = this.getBoundingClientRect();

      // Dagre isn't guaranteed to start the layout at 0, 0, so we adjust things
      // back here so that the scaling calculations work out.
      graph.position.set(-graphBounds.left, -graphBounds.top);
      this.#container.position.set(
        (rendererBounds.width - graphBounds.width) * 0.5,
        (rendererBounds.height - graphBounds.height) * 0.5
      );

      const delta = Math.min(
        (rendererBounds.width - 2 * this.#padding) / graphBounds.width,
        (rendererBounds.height - 2 * this.#padding) / graphBounds.height,
        1
      );

      const pivot = {
        x: rendererBounds.width / 2,
        y: rendererBounds.height / 2,
      };

      this.#scaleContainerAroundPoint(delta, pivot);

      if (this.#background) {
        this.#background.visible = true;
      }

      graph.alpha = 1;
    });

    this.#container.addChild(graph);
  }

  removeGraph(graph: Graph) {
    graph.removeFromParent();
    graph.destroy();
  }

  connectedCallback(): void {
    super.connectedCallback();

    this.#app.resize();
    this.#app.renderer.addListener("resize", () => {
      if (!this.#background) {
        return;
      }

      this.#background.width = this.#app.renderer.width;
      this.#background.height = this.#app.renderer.height;
    });
  }

  render() {
    return html`${this.#app.view}`;
  }
}