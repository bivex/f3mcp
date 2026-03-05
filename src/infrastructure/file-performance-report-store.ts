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
import type { PerfReport } from "../contracts/performance.js";
import type { PerformanceReportStore } from "../application/performance-service.js";

export class FilePerformanceReportStore implements PerformanceReportStore {
  constructor(private readonly filePath: string) {}

  async upsert(report: PerfReport) {
    const reports = await readJsonFile<PerfReport[]>(this.filePath, []);
    const index = reports.findIndex((entry) => entry.functionName === report.functionName);
    if (index >= 0) reports[index] = report;
    else reports.push(report);
    await writeJsonFile(this.filePath, reports);
    return report;
  }

  async get(functionName: string) {
    return (await readJsonFile<PerfReport[]>(this.filePath, [])).find((entry) => entry.functionName === functionName) ?? null;
  }
}

