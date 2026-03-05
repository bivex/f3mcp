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

import type { Spec } from "../contracts/specification.js";
import type { VerificationExplanation, VerificationJob } from "../contracts/verification.js";
import { contractError } from "../contracts/errors.js";

export interface VerificationSpecReader {
  getVersion(functionName: string, version: number): Promise<Spec | null>;
}

export interface VerificationJobRepository {
  findByFunctionAndVersion(functionName: string, specVersion: number): Promise<VerificationJob | null>;
  save(job: VerificationJob): Promise<VerificationJob>;
  get(jobId: string): Promise<VerificationJob | null>;
  list(): Promise<VerificationJob[]>;
}

export interface ProofEngine {
  verify(spec: Spec): Promise<Pick<VerificationJob, "engine" | "solverStatus" | "status" | "failureReason" | "counterexample">>;
}

export class VerificationService {
  constructor(
    private readonly specs: VerificationSpecReader,
    private readonly jobs: VerificationJobRepository,
    private readonly engine: ProofEngine,
  ) {}

  async start(functionName: string, specVersion: number) {
    const existing = await this.jobs.findByFunctionAndVersion(functionName, specVersion);
    if (existing) return existing;

    const spec = await this.specs.getVersion(functionName, specVersion);
    if (!spec) throw contractError("SPEC_VERSION_NOT_FOUND", `No spec version ${specVersion} found for ${functionName}`);

    const proof = await this.engine.verify(spec);
    const job: VerificationJob = {
      jobId: `job_${Math.random().toString(36).slice(2, 10)}`,
      functionName,
      specVersion,
      createdAt: new Date().toISOString(),
      ...proof,
    };
    return this.jobs.save(job);
  }

  get(jobId: string) {
    return this.jobs.get(jobId);
  }

  async waitForCompletion(jobId: string, timeoutMs = 5_000, pollIntervalMs = 100) {
    const startedAt = Date.now();
    let job = await this.jobs.get(jobId);
    if (!job) return null;

    while (!isTerminalStatus(job.status) && Date.now() - startedAt < timeoutMs) {
      await sleep(Math.min(pollIntervalMs, timeoutMs));
      job = await this.jobs.get(jobId);
      if (!job) return null;
    }

    return {
      job,
      completed: isTerminalStatus(job.status),
      waitedMs: Math.max(0, Date.now() - startedAt),
    };
  }

  async cancel(jobId: string) {
    const job = await this.jobs.get(jobId);
    if (!job) return null;
    if (job.status === "passed" || job.status === "failed") {
      throw contractError("JOB_NOT_CANCELLABLE", `Job ${jobId} is already ${job.status}`);
    }
    return this.jobs.save({ ...job, status: "cancelled" });
  }

  async explain(jobId: string): Promise<VerificationExplanation | null> {
    const job = await this.jobs.get(jobId);
    if (!job) return null;
    return {
      jobId,
      status: job.status,
      engine: job.engine,
      explanation: job.failureReason ?? "Verification passed with no counterexample.",
      counterexample: job.counterexample,
    };
  }

  list() {
    return this.jobs.list();
  }

  async getCounterexampleExcerpt(jobId: string, maxLines = 8) {
    const job = await this.jobs.get(jobId);
    if (!job) return null;

    const lines = (job.counterexample ?? "")
      .split(/\r?\n/u)
      .map((line) => line.trimEnd())
      .filter(Boolean);

    return {
      jobId,
      status: job.status,
      hasCounterexample: lines.length > 0,
      excerpt: lines.slice(0, maxLines).join("\n") || undefined,
      linesShown: Math.min(lines.length, maxLines),
      totalLines: lines.length,
    };
  }
}

function isTerminalStatus(status: VerificationJob["status"]) {
  return status === "passed" || status === "failed" || status === "cancelled";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

