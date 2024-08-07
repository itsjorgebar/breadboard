/**
 * @license
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { code } from "@google-labs/breadboard";

export const pop = code<
  { array: object[] },
  { array?: object[]; item?: unknown }
>((inputs) => {
  const { array } = inputs;
  const [item, ...rest] = array;
  if (item) {
    return { array: rest, item };
  }
  return {};
});
