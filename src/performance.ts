/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 22:39
 * Last Updated: 2026-03-05 22:39
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

import { resolve } from "node:path";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toolOutputSchema } from "./contracts/errors.js";
import { optionalPerfReportResultSchema, perfReportResultSchema } from "./contracts/performance.js";
import { PerformanceService } from "./application/performance-service.js";
import { FilePerformanceReportStore } from "./infrastructure/file-performance-report-store.js";
import { runStdio, structuredResult } from "./shared/runtime.js";

const service = new PerformanceService(new FilePerformanceReportStore(resolve(process.cwd(), "data/performance-reports.json")));
const server = new McpServer({ name: "arm-performance-server", version: "1.2.0" });

server.registerTool("check_timing_constraints", { description: "Check whether a function exceeds a cycle budget.", inputSchema: z.object({ functionName: z.string(), observedCycles: z.number().nonnegative(), maxCycles: z.number().positive() }), outputSchema: toolOutputSchema(perfReportResultSchema) }, async ({ functionName, observedCycles, maxCycles }) => structuredResult("Timing checked", { report: await service.checkTiming(functionName, observedCycles, maxCycles) }));

server.registerTool("verify_constant_time", { description: "Check for obvious secret-dependent branches or memory access.", inputSchema: z.object({ functionName: z.string(), branchOnSecret: z.boolean(), memoryOnSecret: z.boolean() }), outputSchema: toolOutputSchema(perfReportResultSchema) }, async ({ functionName, branchOnSecret, memoryOnSecret }) => structuredResult("Constant-time checked", { report: await service.verifyConstantTime(functionName, branchOnSecret, memoryOnSecret) }));

server.registerTool("compare_performance_profiles", { description: "Compare a baseline and candidate cycle count.", inputSchema: z.object({ functionName: z.string(), baselineCycles: z.number().nonnegative(), candidateCycles: z.number().nonnegative() }), outputSchema: toolOutputSchema(perfReportResultSchema) }, async ({ functionName, baselineCycles, candidateCycles }) => structuredResult("Compared profiles", { report: await service.compare(functionName, baselineCycles, candidateCycles) }));

server.registerTool("detect_performance_regression", { description: "Return the most recent stored regression state.", inputSchema: z.object({ functionName: z.string() }), outputSchema: toolOutputSchema(optionalPerfReportResultSchema) }, async ({ functionName }) => structuredResult("Regression lookup", { report: await service.get(functionName) }));

server.registerResource("perf-report", new ResourceTemplate("perf://functions/{functionName}/report", { list: async () => ({ resources: [] }) }), { title: "Performance report", description: "Latest performance or side-channel report", mimeType: "application/json" }, async (uri, { functionName }) => ({ contents: [{ uri: uri.href, text: JSON.stringify(await service.get(String(functionName)), null, 2) }] }));

server.registerPrompt("analyze_perf_delta", { description: "Explain timing regressions or constant-time risk.", argsSchema: { functionName: z.string() } }, ({ functionName }) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text: `Analyze the latest performance and side-channel report for ${functionName}. Explain regressions, timing violations, and constant-time risk.` } }] }));

runStdio(server).catch((error) => {
  console.error("performance server failed:", error);
  process.exit(1);
});

