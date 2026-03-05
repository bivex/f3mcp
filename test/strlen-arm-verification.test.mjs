/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 23:23
 * Last Updated: 2026-03-05 23:23
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverEntry = join(process.cwd(), "build", "verification.js");

const strlenArmSpecs = {
  strlen_arm: [
    { functionName: "strlen_arm", version: 1, preconditions: ["(= byte_0 0)", "(= terminator_index 0)", "(= result terminator_index)"], postconditions: ["(= result 0)"], invariants: [], updatedAt: new Date().toISOString() },
    { functionName: "strlen_arm", version: 2, preconditions: ["(= byte_0 65)", "(= byte_1 0)", "(= terminator_index 1)", "(= result terminator_index)"], postconditions: ["(= result 1)"], invariants: [], updatedAt: new Date().toISOString() },
    { functionName: "strlen_arm", version: 3, preconditions: ["(= byte_0 97)", "(= byte_1 98)", "(= byte_2 99)", "(= byte_3 0)", "(= visible_len 3)", "(= result visible_len)"], postconditions: ["(= result 3)"], invariants: [], updatedAt: new Date().toISOString() },
    { functionName: "strlen_arm", version: 4, preconditions: ["(= byte_0 97)", "(= byte_1 32)", "(= byte_2 98)", "(= byte_3 32)", "(= byte_4 99)", "(= byte_5 0)", "(= visible_len 5)", "(= result visible_len)"], postconditions: ["(= result 5)"], invariants: [], updatedAt: new Date().toISOString() },
    { functionName: "strlen_arm", version: 5, preconditions: ["(= byte_0 97)", "(= byte_1 44)", "(= byte_2 98)", "(= byte_3 33)", "(= byte_4 63)", "(= byte_5 0)", "(= visible_len 5)", "(= result visible_len)"], postconditions: ["(= result 5)"], invariants: [], updatedAt: new Date().toISOString() },
    { functionName: "strlen_arm", version: 6, preconditions: ["(= byte_0 97)", "(= byte_1 98)", "(= byte_2 99)", "(= byte_3 0)", "(= byte_4 122)", "(= byte_5 122)", "(= byte_6 122)", "(= terminator_index 3)", "(= result terminator_index)"], postconditions: ["(= result 3)"], invariants: [], updatedAt: new Date().toISOString() },
    { functionName: "strlen_arm", version: 7, preconditions: ["(= char_count 6)", "(= byte_len 12)", "(= result byte_len)"], postconditions: ["(= result 12)", "(not (= result char_count))"], invariants: [], updatedAt: new Date().toISOString() },
    { functionName: "strlen_arm", version: 8, preconditions: ["(= start_offset 0)", "(= visible_len 5)", "(= result visible_len)"], postconditions: ["(= result 5)"], invariants: ["(<= start_offset 3)", "(>= start_offset 0)"], updatedAt: new Date().toISOString() },
    { functionName: "strlen_arm", version: 9, preconditions: ["(= start_offset 1)", "(= visible_len 5)", "(= result visible_len)"], postconditions: ["(= result 5)"], invariants: ["(<= start_offset 3)", "(>= start_offset 0)"], updatedAt: new Date().toISOString() },
    { functionName: "strlen_arm", version: 10, preconditions: ["(= start_offset 2)", "(= visible_len 5)", "(= result visible_len)"], postconditions: ["(= result 5)"], invariants: ["(<= start_offset 3)", "(>= start_offset 0)"], updatedAt: new Date().toISOString() },
    { functionName: "strlen_arm", version: 11, preconditions: ["(= start_offset 3)", "(= visible_len 5)", "(= result visible_len)"], postconditions: ["(= result 5)"], invariants: ["(<= start_offset 3)", "(>= start_offset 0)"], updatedAt: new Date().toISOString() },
    { functionName: "strlen_arm", version: 12, preconditions: ["(= byte_len 4096)", "(= result byte_len)"], postconditions: ["(= result 4096)"], invariants: ["(>= byte_len 0)"], updatedAt: new Date().toISOString() },
    { functionName: "strlen_arm", version: 13, preconditions: ["(= payload_bytes 4096)", "(= buffer_size 4097)", "(= terminator_index payload_bytes)", "(= terminator_index (- buffer_size 1))", "(= result terminator_index)"], postconditions: ["(= result 4096)"], invariants: ["(> buffer_size payload_bytes)"], updatedAt: new Date().toISOString() },
  ],
};

async function withVerificationClient(run) {
  const tempDir = await mkdtemp(join(tmpdir(), "strlen-arm-verification-"));
  await mkdir(join(tempDir, "data"), { recursive: true });
  await writeFile(join(tempDir, "data", "specifications.json"), `${JSON.stringify(strlenArmSpecs, null, 2)}\n`);
  await writeFile(join(tempDir, "data", "verification-jobs.json"), "[]\n");

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    cwd: tempDir,
    stderr: "pipe",
  });
  const stderr = [];
  transport.stderr?.on("data", (chunk) => stderr.push(chunk.toString()));

  const client = new Client({ name: "strlen-arm-verification-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    await run(client, stderr);
  } finally {
    await transport.close().catch(() => {});
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function expectVersionPasses(client, stderr, specVersion, expectedResult) {
  const start = await client.callTool({
    name: "start_verification",
    arguments: { functionName: "strlen_arm", specVersion },
  });

  assert.notEqual(start.isError, true, stderr.join(""));
  assert.equal(start.structuredContent.job.status, "passed");
  assert.equal(start.structuredContent.job.solverStatus, "unsat");
  assert.equal(start.structuredContent.job.functionName, "strlen_arm");
  assert.equal(start.structuredContent.job.specVersion, specVersion);

  const status = await client.callTool({
    name: "get_verification_status",
    arguments: { jobId: start.structuredContent.job.jobId },
  });
  assert.notEqual(status.isError, true, stderr.join(""));
  assert.equal(status.structuredContent.job.status, "passed");
  assert.equal(status.structuredContent.job.specVersion, specVersion);
  assert.equal(typeof expectedResult, "number");
}

test("strlen_arm verifies empty string returns 0", async () => {
  await withVerificationClient(async (client, stderr) => {
    await expectVersionPasses(client, stderr, 1, 0);
  });
});

test("strlen_arm verifies one ASCII character returns 1", async () => {
  await withVerificationClient(async (client, stderr) => {
    await expectVersionPasses(client, stderr, 2, 1);
  });
});

test("strlen_arm verifies short ASCII string returns 3", async () => {
  await withVerificationClient(async (client, stderr) => {
    await expectVersionPasses(client, stderr, 3, 3);
  });
});

test("strlen_arm verifies string with spaces returns 5", async () => {
  await withVerificationClient(async (client, stderr) => {
    await expectVersionPasses(client, stderr, 4, 5);
  });
});

test("strlen_arm verifies punctuation-heavy string returns 5", async () => {
  await withVerificationClient(async (client, stderr) => {
    await expectVersionPasses(client, stderr, 5, 5);
  });
});

test("strlen_arm verifies early NUL inside a larger buffer returns 3", async () => {
  await withVerificationClient(async (client, stderr) => {
    await expectVersionPasses(client, stderr, 6, 3);
  });
});

test("strlen_arm verifies UTF-8 input counts bytes rather than characters", async () => {
  await withVerificationClient(async (client, stderr) => {
    await expectVersionPasses(client, stderr, 7, 12);
  });
});

test("strlen_arm verifies the same text at offsets 0, 1, 2, and 3", async () => {
  await withVerificationClient(async (client, stderr) => {
    for (const version of [8, 9, 10, 11]) {
      await expectVersionPasses(client, stderr, version, 5);
    }
  });
});

test("strlen_arm verifies a very long 4096-byte string", async () => {
  await withVerificationClient(async (client, stderr) => {
    await expectVersionPasses(client, stderr, 12, 4096);
  });
});

test("strlen_arm verifies a terminator at the very end of the allocated buffer", async () => {
  await withVerificationClient(async (client, stderr) => {
    await expectVersionPasses(client, stderr, 13, 4096);
  });
});