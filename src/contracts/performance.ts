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

export const perfReportSchema = z.object({
  functionName: z.string(),
  observedCycles: z.number().nonnegative(),
  maxCycles: z.number().positive().optional(),
  constantTime: z.boolean().optional(),
  regression: z.boolean().optional(),
});

export const perfReportResultSchema = z.object({ report: perfReportSchema });
export const optionalPerfReportResultSchema = z.object({
  report: perfReportSchema.nullable(),
});

export type PerfReport = z.infer<typeof perfReportSchema>;

