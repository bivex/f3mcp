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

export const clauseSectionSchema = z.enum(["preconditions", "postconditions", "invariants"]);

export const specSchema = z.object({
  functionName: z.string(),
  version: z.number().int().positive(),
  preconditions: z.array(z.string()),
  postconditions: z.array(z.string()),
  invariants: z.array(z.string()),
  updatedAt: z.string(),
});

export const specCreateInputSchema = z.object({
  functionName: z.string(),
  preconditions: z.array(z.string()).default([]),
  postconditions: z.array(z.string()).default([]),
  invariants: z.array(z.string()).default([]),
});

export const specUpdateInputSchema = z.object({
  functionName: z.string(),
  preconditions: z.array(z.string()).optional(),
  postconditions: z.array(z.string()).optional(),
  invariants: z.array(z.string()).optional(),
});

export const specResultSchema = z.object({ spec: specSchema });
export const specValidationSchema = z.object({
  functionName: z.string(),
  valid: z.boolean(),
  issues: z.array(z.string()),
});
export const specVersionListSchema = z.object({
  functionName: z.string(),
  versions: z.array(specSchema),
});
export const specClauseValidationInputSchema = z.object({
  clause: z.string(),
  section: clauseSectionSchema.default("postconditions"),
});
export const specClauseValidationSchema = z.object({
  clause: z.string(),
  section: clauseSectionSchema,
  valid: z.boolean(),
  issue: z.string().optional(),
  examples: z.array(z.string()).optional(),
  hint: z.string().optional(),
});
const specDiffSectionSchema = z.object({
  added: z.array(z.string()),
  removed: z.array(z.string()),
  unchanged: z.array(z.string()),
});
export const specVersionDiffInputSchema = z.object({
  functionName: z.string(),
  fromVersion: z.number().int().positive(),
  toVersion: z.number().int().positive(),
});
export const specVersionDiffSchema = z.object({
  functionName: z.string(),
  fromVersion: z.number().int().positive(),
  toVersion: z.number().int().positive(),
  changed: z.boolean(),
  changedSections: z.array(clauseSectionSchema),
  diff: z.object({
    preconditions: specDiffSectionSchema,
    postconditions: specDiffSectionSchema,
    invariants: specDiffSectionSchema,
  }),
});

export type Spec = z.infer<typeof specSchema>;
export type CreateSpecInput = z.infer<typeof specCreateInputSchema>;
export type UpdateSpecInput = z.infer<typeof specUpdateInputSchema>;

