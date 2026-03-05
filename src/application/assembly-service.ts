/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 23:37
 * Last Updated: 2026-03-05 23:37
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

export interface InstructionCatalog {
  get(opcode: string): Promise<{ opcode: string; known: boolean; summary: string }>;
  list(): Promise<string[]>;
}

export class AssemblyService {
  constructor(private readonly catalog: InstructionCatalog) {}

  analyzeFunction(source: string) {
    const lines = source.split("\n").map((line) => line.trim()).filter(Boolean);
    return {
      lineCount: lines.length,
      basicBlocks: lines.filter((line) => line.endsWith(":")).map((line) => line.slice(0, -1)),
      branchCount: lines.filter((line) => /^(B|BL|CBZ|CBNZ|RET)\b/i.test(line)).length,
    };
  }

  instruction(opcode: string) {
    return this.catalog.get(opcode);
  }

  summarizeRegisterEffects(source: string) {
    const touchedRegisters = [...new Set([...source.matchAll(/\bx([0-9]+)\b/gi)].map((match) => `x${match[1]}`))];
    return { touchedRegisters, readsMemory: /\bLDR\b/i.test(source), writesMemory: /\bSTR\b/i.test(source) };
  }

  extractLoopCandidates(source: string) {
    return source.split("\n").map((text, index) => ({ line: index + 1, text })).filter((entry) => /loop|b\.|cbnz|cbz/i.test(entry.text));
  }

  listInstructions() {
    return this.catalog.list();
  }
}

