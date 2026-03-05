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

export const errorCodeSchema = z.enum([
  "CREATE_SPEC_FAILED",
  "SPEC_NOT_FOUND",
  "SPEC_VERSION_NOT_FOUND",
  "VALIDATION_FAILED",
  "JOB_NOT_FOUND",
  "JOB_NOT_CANCELLABLE",
  "START_VERIFICATION_FAILED",
  "SOLVER_UNAVAILABLE",
  "SOLVER_TIMEOUT",
  "SOLVER_UNKNOWN",
  "VERIFICATION_FAILED",
  "INTERNAL_ERROR",
]);

export const contractErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  retryable: z.boolean().default(false),
  details: z.unknown().optional(),
});

export const errorResultSchema = z.object({ error: contractErrorSchema });

export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type ContractError = z.infer<typeof contractErrorSchema>;

export function toolOutputSchema<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.partial().extend({ error: contractErrorSchema.optional() });
}

export function contractError(
  code: ErrorCode,
  message: string,
  options: { retryable?: boolean; details?: unknown } = {},
): ContractError {
  return contractErrorSchema.parse({
    code,
    message,
    retryable: options.retryable ?? false,
    details: options.details,
  });
}

