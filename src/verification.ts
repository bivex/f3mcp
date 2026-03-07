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

import { delimiter, dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toolOutputSchema } from "./contracts/errors.js";
import { counterexampleExcerptInputSchema, counterexampleExcerptSchema, startVerificationInputSchema, verificationExplanationSchema, verificationJobResultSchema, waitForVerificationInputSchema, waitForVerificationSchema } from "./contracts/verification.js";
import { VerificationService } from "./application/verification-service.js";
import { FileSpecificationRepository } from "./infrastructure/file-specification-repository.js";
import { FileVerificationJobRepository } from "./infrastructure/file-verification-job-repository.js";
import { Z3ProofEngine } from "./infrastructure/z3-proof-engine.js";
import { errorResult, normalizeContractError, runStdio, structuredResult, withTimeout } from "./shared/runtime.js";

const specs = new FileSpecificationRepository(resolve(process.cwd(), "data/specifications.json"));
const jobs = new FileVerificationJobRepository(resolve(process.cwd(), "data/verification-jobs.json"));
const resolveZ3Binary = () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const bundledWindowsZ3 = process.platform === "win32"
    ? resolve(repoRoot, "z3-4.16.0-x64-win", "bin", "z3.exe")
    : undefined;
  const pathEntries = (process.env.PATH ?? process.env.Path ?? "").split(delimiter).filter(Boolean);
  const windowsCandidates = process.platform === "win32"
    ? pathEntries.flatMap((entry) => [resolve(entry, "z3.exe"), resolve(entry, "z3")])
    : [];
  const candidates = [
    process.env.Z3_BINARY,
    bundledWindowsZ3,
    ...windowsCandidates,
    "/opt/homebrew/bin/z3",
    "/usr/local/bin/z3",
    "z3.exe",
    "z3",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (candidate === "z3" || existsSync(candidate)) return candidate;
  }

  return process.platform === "win32" ? "z3.exe" : "z3";
};

const verification = new VerificationService(specs, jobs, new Z3ProofEngine(resolveZ3Binary(), 3_000));
const server = new McpServer({ name: "arm-verification-server", version: "1.3.0" });

function describeJob(job: { jobId: string; functionName: string; specVersion: number; status: string; solverStatus?: string; failureReason?: string; counterexample?: string }) {
  return [
    `Verification job ${job.jobId}`,
    `function: ${job.functionName}`,
    `specVersion: ${job.specVersion}`,
    `status: ${job.status}`,
    job.solverStatus ? `solverStatus: ${job.solverStatus}` : null,
    job.failureReason ? `failureReason: ${job.failureReason}` : null,
    job.counterexample ? "counterexample: available" : null,
  ].filter(Boolean).join("\n");
}

function describeExplanation(explanation: { jobId: string; status: string; engine: string; explanation: string; counterexample?: string }) {
  return [
    `Verification explanation for ${explanation.jobId}`,
    `status: ${explanation.status}`,
    `engine: ${explanation.engine}`,
    `summary: ${explanation.explanation}`,
    explanation.counterexample ? "counterexample: available" : null,
  ].filter(Boolean).join("\n");
}

function describeWaitResult(result: { job: { jobId: string; status: string }; completed: boolean; waitedMs: number }) {
  return [
    `Wait result for ${result.job.jobId}`,
    `status: ${result.job.status}`,
    `completed: ${result.completed}`,
    `waitedMs: ${result.waitedMs}`,
  ].join("\n");
}

function describeCounterexampleExcerpt(result: { jobId: string; status: string; hasCounterexample: boolean; excerpt?: string; linesShown: number; totalLines: number }) {
  return [
    `Counterexample excerpt for ${result.jobId}`,
    `status: ${result.status}`,
    `hasCounterexample: ${result.hasCounterexample}`,
    `linesShown: ${result.linesShown}`,
    `totalLines: ${result.totalLines}`,
    result.excerpt ? `excerpt:\n${result.excerpt}` : null,
  ].filter(Boolean).join("\n");
}

server.registerTool("start_verification", { description: "Run Z3 against a specific function/spec version pair.", inputSchema: startVerificationInputSchema, outputSchema: toolOutputSchema(verificationJobResultSchema) }, async ({ functionName, specVersion }) => {
  try {
    const job = await withTimeout(verification.start(functionName, specVersion), 3_500, "SOLVER_TIMEOUT");
    return structuredResult(describeJob(job), { job });
  } catch (error) {
    const contract = normalizeContractError(error);
    return errorResult(contract.code, contract.message, contract.details, contract.retryable);
  }
});

server.registerTool("get_verification_status", { description: "Get the current status of a verification job.", inputSchema: z.object({ jobId: z.string() }), outputSchema: toolOutputSchema(verificationJobResultSchema) }, async ({ jobId }) => {
  const job = await verification.get(jobId);
  return job ? structuredResult(describeJob(job), { job }) : errorResult("JOB_NOT_FOUND", `No job found for ${jobId}`);
});

server.registerTool("wait_for_verification", { description: "Poll a verification job until it reaches a terminal state or the wait timeout expires.", inputSchema: waitForVerificationInputSchema, outputSchema: toolOutputSchema(waitForVerificationSchema) }, async ({ jobId, timeoutMs, pollIntervalMs }) => {
  const result = await verification.waitForCompletion(jobId, timeoutMs, pollIntervalMs);
  return result ? structuredResult(describeWaitResult(result), result) : errorResult("JOB_NOT_FOUND", `No job found for ${jobId}`);
});

server.registerTool("cancel_verification", { description: "Cancel a verification job if it still exists.", inputSchema: z.object({ jobId: z.string() }), outputSchema: toolOutputSchema(verificationJobResultSchema) }, async ({ jobId }) => {
  try {
    const job = await verification.cancel(jobId);
    return job ? structuredResult(`Cancelled ${jobId}`, { job }) : errorResult("JOB_NOT_FOUND", `No job found for ${jobId}`);
  } catch (error) {
    const contract = normalizeContractError(error);
    return errorResult(contract.code, contract.message, contract.details, contract.retryable);
  }
});

server.registerTool("explain_verification_failure", { description: "Explain why a verification job failed.", inputSchema: z.object({ jobId: z.string() }), outputSchema: toolOutputSchema(verificationExplanationSchema) }, async ({ jobId }) => {
  const explanation = await verification.explain(jobId);
  return explanation ? structuredResult(describeExplanation(explanation), explanation) : errorResult("JOB_NOT_FOUND", `No job found for ${jobId}`);
});

server.registerTool("get_counterexample_excerpt", { description: "Return a short excerpt from the stored counterexample for a verification job.", inputSchema: counterexampleExcerptInputSchema, outputSchema: toolOutputSchema(counterexampleExcerptSchema) }, async ({ jobId, maxLines }) => {
  const excerpt = await verification.getCounterexampleExcerpt(jobId, maxLines);
  return excerpt ? structuredResult(describeCounterexampleExcerpt(excerpt), excerpt) : errorResult("JOB_NOT_FOUND", `No job found for ${jobId}`);
});

server.registerResource("verification-job", new ResourceTemplate("verification://jobs/{jobId}", {
  list: async () => ({ resources: (await verification.list()).map((job) => ({ uri: `verification://jobs/${job.jobId}`, name: `Verification ${job.jobId}` })) }),
}), { title: "Verification job", description: "Verification job status snapshot", mimeType: "application/json" }, async (uri, { jobId }) => ({ contents: [{ uri: uri.href, text: JSON.stringify(await verification.get(String(jobId)), null, 2) }] }));

server.registerPrompt("triage_failure", { description: "Explain likely causes of a failed proof.", argsSchema: { jobId: z.string() } }, ({ jobId }) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text: `Explain why verification job ${jobId} failed. Separate domain/spec issues from technical failures and suggest the next minimal fix.` } }] }));

runStdio(server).catch((error) => {
  console.error("verification server failed:", error);
  process.exit(1);
});

