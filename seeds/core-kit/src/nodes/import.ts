/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Board } from "@google-labs/breadboard";
import { SchemaBuilder } from "@google-labs/breadboard/kits";
import type {
  InputValues,
  BreadboardCapability,
  NodeHandlerContext,
  GraphDescriptor,
} from "@google-labs/breadboard";
import { LambdaNodeOutputs } from "./lambda.js";

export type ImportNodeInputs = InputValues & {
  path?: string;
  graph?: GraphDescriptor;
  args: InputValues;
};

export default {
  describe: async (inputs?: InputValues) => {
    return {
      inputSchema: new SchemaBuilder()
        .addInputs(inputs)
        .addProperties({
          path: {
            title: "path",
            description: "The path to the board to import.",
            type: "string",
          },
          graph: {
            title: "graph",
            description: "The graph descriptor of the board to import.",
            type: "object",
          },
        })
        .setAdditionalProperties(true)
        .build(),
      outputSchema: new SchemaBuilder().addProperties({
        board: {
          title: "board",
          description: "The imported board.",
          type: "object",
        },
      }),
    };
  },
  invoke: async (
    inputs: InputValues,
    context: NodeHandlerContext
  ): Promise<LambdaNodeOutputs> => {
    const { path, graph, ...args } = inputs as ImportNodeInputs;

    const board = graph
      ? (graph as Board).runOnce // TODO: Hack! Use JSON schema or so instead.
        ? ({ ...graph } as Board)
        : await Board.fromGraphDescriptor(graph)
      : path
      ? await Board.load(path, {
          base: context.board.url,
          outerGraph: context.parent,
        })
      : undefined;
    if (!board) throw Error("No board provided");
    board.args = args;

    return { board: { kind: "board", board } as BreadboardCapability };
  },
};