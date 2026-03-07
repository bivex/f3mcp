/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 22:44
 * Last Updated: 2026-03-05 22:44
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverEntry = join(process.cwd(), "build", "verification.js");

async function withVerificationClient(specifications, run) {
  const tempDir = await mkdtemp(join(tmpdir(), "verification-mcp-"));
  await mkdir(join(tempDir, "data"), { recursive: true });
  await writeFile(join(tempDir, "data", "specifications.json"), `${JSON.stringify(specifications, null, 2)}\n`);
  await writeFile(join(tempDir, "data", "verification-jobs.json"), "[]\n");

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    cwd: tempDir,
    stderr: "pipe",
  });
  const stderr = [];
  transport.stderr?.on("data", (chunk) => stderr.push(chunk.toString()));

  const client = new Client({ name: "verification-e2e-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    await run(client, stderr);
  } finally {
    await transport.close().catch(() => {});
    await rm(tempDir, { recursive: true, force: true });
  }
}

const seededSpecs = {
  prove_positive: [{ functionName: "prove_positive", version: 1, preconditions: ["(> x 0)"], postconditions: ["(> x 0)"], invariants: [], updatedAt: new Date().toISOString() }],
  needs_stronger_post: [{ functionName: "needs_stronger_post", version: 1, preconditions: ["(> x 0)"], postconditions: ["(> x 10)"], invariants: [], updatedAt: new Date().toISOString() }],
  invalid_smt: [{ functionName: "invalid_smt", version: 1, preconditions: ["x > 0"], postconditions: ["x > 0"], invariants: [], updatedAt: new Date().toISOString() }],
};

test("verification server lists tools and proves a valid spec over MCP stdio", async () => {
  await withVerificationClient(seededSpecs, async (client, stderr) => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name).sort();
    assert.deepEqual(toolNames, ["cancel_verification", "explain_verification_failure", "get_counterexample_excerpt", "get_verification_status", "start_verification", "wait_for_verification"]);
    assert.equal(Boolean(tools.tools.find((tool) => tool.name === "start_verification")?.outputSchema), true);

    const start = await client.callTool({ name: "start_verification", arguments: { functionName: "prove_positive", specVersion: 1 } });
    assert.notEqual(start.isError, true, stderr.join(""));
    assert.equal(start.structuredContent.job.status, "passed");
    assert.equal(start.structuredContent.job.engine, "z3");
    assert.match(start.content[0].text, /status: passed/u);
    assert.match(start.content[0].text, /solverStatus: unsat/u);

    const status = await client.callTool({ name: "get_verification_status", arguments: { jobId: start.structuredContent.job.jobId } });
    assert.notEqual(status.isError, true, stderr.join(""));
    assert.equal(status.structuredContent.job.status, "passed");
    assert.match(status.content[0].text, /function: prove_positive/u);

    const waited = await client.callTool({ name: "wait_for_verification", arguments: { jobId: start.structuredContent.job.jobId, timeoutMs: 50, pollIntervalMs: 5 } });
    assert.equal(waited.structuredContent.completed, true);
    assert.match(waited.content[0].text, /completed: true/u);
  });
});

test("verification server returns counterexamples and structured errors over MCP stdio", async () => {
  await withVerificationClient(seededSpecs, async (client, stderr) => {
    await client.listTools();
    const start = await client.callTool({ name: "start_verification", arguments: { functionName: "needs_stronger_post", specVersion: 1 } });
    assert.notEqual(start.isError, true, stderr.join(""));
    assert.equal(start.structuredContent.job.status, "failed");
    assert.equal(typeof start.structuredContent.job.counterexample, "string");
    assert.match(start.structuredContent.job.counterexample, /define-fun x/u);

    const explain = await client.callTool({ name: "explain_verification_failure", arguments: { jobId: start.structuredContent.job.jobId } });
    assert.notEqual(explain.isError, true, stderr.join(""));
    assert.match(explain.structuredContent.explanation, /counterexample/i);
    assert.equal(typeof explain.structuredContent.counterexample, "string");
    assert.match(explain.content[0].text, /summary: Z3 found a counterexample/u);
    assert.match(explain.content[0].text, /counterexample: available/u);

    const excerpt = await client.callTool({ name: "get_counterexample_excerpt", arguments: { jobId: start.structuredContent.job.jobId, maxLines: 2 } });
    assert.notEqual(excerpt.isError, true, stderr.join(""));
    assert.equal(excerpt.structuredContent.hasCounterexample, true);
    assert.equal(excerpt.structuredContent.linesShown, 2);
    assert.match(excerpt.structuredContent.excerpt, /define-fun x/u);

    const cancel = await client.callTool({ name: "cancel_verification", arguments: { jobId: start.structuredContent.job.jobId } });
    assert.equal(cancel.isError, true);
    assert.equal(cancel.structuredContent.error.code, "JOB_NOT_CANCELLABLE");
  });
});

test("verification server surfaces invalid SMT-LIB as validation errors over MCP stdio", async () => {
  await withVerificationClient(seededSpecs, async (client, stderr) => {
    const start = await client.callTool({ name: "start_verification", arguments: { functionName: "invalid_smt", specVersion: 1 } });
    assert.equal(start.isError, true, stderr.join(""));
    assert.equal(start.structuredContent.error.code, "VALIDATION_FAILED");
    assert.match(start.structuredContent.error.message, /invalid assert command|rejected the generated SMT-LIB/i);
  });
});

