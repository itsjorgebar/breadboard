/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Edge,
  NodeDescriptor,
  InputValues,
  OutputValues,
} from "./types.js";

import type {
  Breadboard,
  Kit,
  KitConstructor,
  OptionalIdConfiguration,
  BreadboardNode,
} from "./types.js";

import { BoardRunner } from "./runner.js";
import { Node } from "./node.js";
import { asComposeTimeKit } from "./kits/ctors.js";

/**
 * This is the heart of the Breadboard library.
 * Just like for hardware makers, the `Board` is the place where wiring of
 * a prototype happens.
 *
 * To start making, create a new breadboard:
 *
 * ```js
 * const board = new Board();
 * ```
 *
 * For more information on how to use Breadboard, start with [Chapter 1: Hello, world?](https://github.com/breadboard-ai/breadboard/tree/main/packages/breadboard/docs/tutorial#chapter-7-probes) of the tutorial.
 */
export class Board extends BoardRunner implements Breadboard {
  #closureStack: Board[] = [];
  #topClosure: Board | undefined;
  #acrossBoardsEdges: { edge: Edge; from: Board; to: Board }[] = [];

  /**
   * Core nodes. Breadboard won't function without these.
   * These are always included.
   */

  /**
   * Places an `input` node on the board.
   *
   * An `input` node is a node that asks for inputs from the user.
   *
   * See [`input` node reference](https://github.com/breadboard-ai/breadboard/blob/main/packages/breadboard/docs/nodes.md#input) for more information.
   *
   * @param config - optional configuration for the node.
   * @returns - a `Node` object that represents the placed node.
   */
  input<In = InputValues, Out = OutputValues>(
    config: OptionalIdConfiguration = {}
  ): BreadboardNode<In, Out> {
    const { $id, ...rest } = config;
    return new Node(this, undefined, "input", { ...rest }, $id);
  }

  /**
   * Places an `output` node on the board.
   *
   * An `output` node is a node that provides outputs to the user.
   *
   * See [`output` node reference](https://github.com/breadboard-ai/breadboard/blob/main/packages/breadboard/docs/nodes.md#output) for more information.
   *
   * @param config - optional configuration for the node.
   * @returns - a `Node` object that represents the placed node.
   */
  output<In = InputValues, Out = OutputValues>(
    config: OptionalIdConfiguration = {}
  ): BreadboardNode<In, Out> {
    const { $id, ...rest } = config;
    return new Node(this, undefined, "output", { ...rest }, $id);
  }

  addEdge(edge: Edge) {
    this.edges.push(edge);
  }

  addNode(node: NodeDescriptor): void {
    this.nodes.push(node);
  }

  /**
   * Adds a new kit to the board.
   *
   * Kits are collections of nodes that are bundled together for a specific
   * purpose. For example, the [Core Kit](https://github.com/breadboard-ai/breadboard/tree/main/packages/core) provides a nodes that
   * are useful for making boards.
   *
   * Typically, kits are distributed as NPM packages. To add a kit to the board,
   * simply install it using `npm` or `yarn`, and then add it to the board:
   *
   * ```js
   * import { Board } from "@google-labs/breadboard";
   * import { Core } from "@google-labs/core-kit";
   *
   * const board = new Board();
   * const kit = board.addKit(Core);
   * ```
   *
   * @param ctr - the kit constructor.
   * @returns - the kit object, which is associated with
   * the board and can be used to place nodes on that board.
   */
  addKit<T extends Kit>(ctr: KitConstructor<T>): T {
    const kit = asComposeTimeKit(ctr, this);
    this.kits.push(kit);
    return kit as T;
  }

  /**
   * Used in the context of board.lambda(): Returns the board that is currently
   * being constructed, according to the nesting level of board.lambda() calls
   * with JS functions.
   *
   * Only called by Node constructor, when adding nodes.
   */
  currentBoardToAddTo(): Breadboard {
    const closureStack = this.#topClosure
      ? this.#topClosure.#closureStack
      : this.#closureStack;
    if (closureStack.length === 0) return this;
    else return closureStack[closureStack.length - 1];
  }

  /**
   *
   */
  addEdgeAcrossBoards(edge: Edge, from: Board, to: Board) {
    if (edge.out === "*")
      throw new Error("Across board wires: * wires not supported");

    if (!edge.constant)
      throw new Error("Across board wires: Must be constant for now");

    if (to !== this)
      throw new Error("Across board wires: Must be invoked on to board");

    const closureStack = this.#topClosure
      ? this.#topClosure.#closureStack
      : this.#closureStack;
    if (from !== this.#topClosure && !closureStack.includes(from))
      throw new Error("Across board wires: From must be parent of to");

    this.#acrossBoardsEdges.push({ edge, from, to });
  }
}
