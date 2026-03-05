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

import { z } from "zod";

export const functionAnalysisSchema = z.object({
  lineCount: z.number().int().nonnegative(),
  basicBlocks: z.array(z.string()),
  branchCount: z.number().int().nonnegative(),
});

export const instructionSchema = z.object({
  opcode: z.string(),
  known: z.boolean(),
  summary: z.string(),
});

export const registerEffectsSchema = z.object({
  touchedRegisters: z.array(z.string()),
  readsMemory: z.boolean(),
  writesMemory: z.boolean(),
});

export const loopCandidateSchema = z.object({
  line: z.number().int().positive(),
  text: z.string(),
});

