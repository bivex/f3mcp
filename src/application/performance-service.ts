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

import type { PerfReport } from "../contracts/performance.js";

export interface PerformanceReportStore {
  upsert(report: PerfReport): Promise<PerfReport>;
  get(functionName: string): Promise<PerfReport | null>;
}

export class PerformanceService {
  constructor(private readonly store: PerformanceReportStore) {}

  checkTiming(functionName: string, observedCycles: number, maxCycles: number) {
    return this.store.upsert({
      functionName,
      observedCycles,
      maxCycles,
      regression: observedCycles > maxCycles,
    });
  }

  verifyConstantTime(functionName: string, branchOnSecret: boolean, memoryOnSecret: boolean) {
    return this.store.upsert({
      functionName,
      observedCycles: 0,
      constantTime: !(branchOnSecret || memoryOnSecret),
    });
  }

  compare(functionName: string, baselineCycles: number, candidateCycles: number) {
    return this.store.upsert({
      functionName,
      observedCycles: candidateCycles,
      regression: candidateCycles > baselineCycles,
    });
  }

  get(functionName: string) {
    return this.store.get(functionName);
  }
}

