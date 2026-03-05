/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 22:37
 * Last Updated: 2026-03-05 22:37
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

import { readJsonFile, writeJsonFile } from "../shared/file-store.js";
import type { VerificationJob } from "../contracts/verification.js";
import type { VerificationJobRepository } from "../application/verification-service.js";

export class FileVerificationJobRepository implements VerificationJobRepository {
  constructor(private readonly filePath: string) {}

  async findByFunctionAndVersion(functionName: string, specVersion: number) {
    return (await this.readJobs()).find((job) => job.functionName === functionName && job.specVersion === specVersion && job.status !== "cancelled") ?? null;
  }

  async save(job: VerificationJob) {
    const jobs = await this.readJobs();
    const index = jobs.findIndex((entry) => entry.jobId === job.jobId);
    if (index >= 0) jobs[index] = job;
    else jobs.push(job);
    await writeJsonFile(this.filePath, jobs);
    return job;
  }

  async get(jobId: string) {
    return (await this.readJobs()).find((job) => job.jobId === jobId) ?? null;
  }

  list() {
    return this.readJobs();
  }

  private readJobs() {
    return readJsonFile<VerificationJob[]>(this.filePath, []);
  }
}

