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

export const solverStatusSchema = z.enum(["sat", "unsat", "unknown"]);
export const jobStatusSchema = z.enum(["queued", "running", "passed", "failed", "cancelled"]);

export const verificationJobSchema = z.object({
  jobId: z.string(),
  functionName: z.string(),
  specVersion: z.number().int().positive(),
  status: jobStatusSchema,
  createdAt: z.string(),
  engine: z.string(),
  solverStatus: solverStatusSchema.optional(),
  failureReason: z.string().optional(),
  counterexample: z.string().optional(),
});

export const startVerificationInputSchema = z.object({
  functionName: z.string(),
  specVersion: z.number().int().positive(),
});

export const verificationJobResultSchema = z.object({ job: verificationJobSchema });
export const verificationExplanationSchema = z.object({
  jobId: z.string(),
  status: jobStatusSchema,
  engine: z.string(),
  explanation: z.string(),
  counterexample: z.string().optional(),
});

export type VerificationJob = z.infer<typeof verificationJobSchema>;
export type StartVerificationInput = z.infer<typeof startVerificationInputSchema>;
export type VerificationExplanation = z.infer<typeof verificationExplanationSchema>;
export type SolverStatus = z.infer<typeof solverStatusSchema>;

