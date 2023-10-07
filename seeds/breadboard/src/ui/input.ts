/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Schema } from "jsonschema";

export type InputArgs = {
  schema: Schema;
};

export type InputData = Record<string, string>;

export type InputOptios = {
  remember?: boolean;
  secret?: boolean;
};

export class Input extends HTMLElement {
  args: InputArgs;
  id: string;
  remember: boolean;
  secret: boolean;

  constructor(
    id: string,
    args: InputArgs,
    { remember = false, secret = false }: InputOptios = {
      remember: false,
      secret: false,
    }
  ) {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host {
          display: block;
        }
        * {
          white-space: pre-wrap;
          font-family: var(--bb-font-family, Fira Code,monospace);
          font-size: var(--bb-font-size, 1rem);
        }
        input {
          width: var(--bb-input-width, 80%);
        }
      </style>
    `;
    this.args = args;
    this.id = id;
    this.remember = remember;
    this.secret = secret;
  }

  #getLocalStorageKey() {
    return `bb-remember-${this.id}`;
  }

  #getRememberedValues(): InputData {
    if (!this.remember) return {};
    const key = this.#getLocalStorageKey();
    const data = localStorage.getItem(key);
    if (data) {
      try {
        return JSON.parse(data);
      } catch (e) {
        console.warn(`Unable to parse remembered values for ${key}`);
      }
    }
    return {};
  }

  #rememberValues(data: InputData) {
    if (!this.remember) return;
    const key = this.#getLocalStorageKey();
    const json = JSON.stringify(data);
    localStorage.setItem(key, json);
    return;
  }

  async ask() {
    const schema = this.args.schema;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const root = this.shadowRoot!;
    const input = document.createElement("div");
    input.id = "input";
    root.append(input);
    if (!schema || !schema.properties) {
      input.textContent =
        "No input schema detected, unable to provide useful interaction.";

      return {};
    }
    const properties = schema.properties;
    const values = this.#getRememberedValues();
    const form = input.appendChild(document.createElement("form"));
    Object.entries(properties).forEach(([key, property]) => {
      const label = form.appendChild(document.createElement("label"));
      label.textContent = `${property.title}: `;
      const input = label.appendChild(document.createElement("input"));
      input.name = key;
      input.type = this.secret ? "password" : "text";
      input.autocomplete = this.secret ? "off" : "on";
      input.placeholder = property.description || "";
      input.autofocus = true;
      input.value = values[key] ?? "";
      form.append("\n");
      window.setTimeout(() => input.focus(), 1);
    });
    return new Promise((resolve) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data: InputData = {};
        Object.entries(properties).forEach(([key, property]) => {
          const input = form[key];
          if (input.value) {
            data[key] = input.value;
            if (!this.secret)
              root.append(`${property.title}: ${input.value}\n`);
          }
        });
        this.#rememberValues(data);
        input.remove();
        resolve(data);
      });
    });
  }
}
