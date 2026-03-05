/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 22:36
 * Last Updated: 2026-03-05 22:36
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

import { readJsonFile } from "../shared/file-store.js";
import type { InstructionCatalog } from "../application/assembly-service.js";

export class FileInstructionCatalog implements InstructionCatalog {
  constructor(private readonly filePath: string) {}

  async get(opcode: string) {
    const catalog = await readJsonFile<Record<string, string>>(this.filePath, {});
    const key = opcode.toUpperCase();
    return {
      opcode: key,
      known: Boolean(catalog[key]),
      summary: catalog[key] ?? "Unknown opcode",
    };
  }

  async list() {
    return Object.keys(await readJsonFile<Record<string, string>>(this.filePath, {})).sort();
  }
}

