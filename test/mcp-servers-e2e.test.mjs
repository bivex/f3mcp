import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const buildEntry = (name) => join(process.cwd(), "build", `${name}.js`);

function defaultData(overrides = {}) {
  return {
    specifications: {},
    verificationJobs: [],
    instructionDocs: {
      ADD: "Adds registers and writes the result.",
      BNE: "Branches when the zero flag is clear.",
      LDR: "Reads a value from memory into a register.",
      STR: "Writes a register value to memory.",
    },
    performanceReports: [],
    ...overrides,
  };
}

async function withClient(serverName, data, run) {
  const tempDir = await mkdtemp(join(tmpdir(), `${serverName}-mcp-`));
  await mkdir(join(tempDir, "data"), { recursive: true });
  await Promise.all([
    writeFile(join(tempDir, "data", "specifications.json"), `${JSON.stringify(data.specifications, null, 2)}\n`),
    writeFile(join(tempDir, "data", "verification-jobs.json"), `${JSON.stringify(data.verificationJobs, null, 2)}\n`),
    writeFile(join(tempDir, "data", "instruction-docs.json"), `${JSON.stringify(data.instructionDocs, null, 2)}\n`),
    writeFile(join(tempDir, "data", "performance-reports.json"), `${JSON.stringify(data.performanceReports, null, 2)}\n`),
  ]);

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [buildEntry(serverName)],
    cwd: tempDir,
    stderr: "pipe",
  });
  const stderr = [];
  transport.stderr?.on("data", (chunk) => stderr.push(chunk.toString()));

  const client = new Client({ name: `${serverName}-e2e-test`, version: "1.0.0" });
  try {
    await client.connect(transport);
    await run(client, stderr);
  } finally {
    await transport.close().catch(() => {});
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("specification server exposes tools, resources, prompts, and missing-spec errors", async () => {
  await withClient("specification", defaultData(), async (client, stderr) => {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "create_spec",
      "diff_spec_versions",
      "list_spec_versions",
      "update_spec",
      "validate_smt_clause",
      "validate_spec_consistency",
    ]);

    const validClause = await client.callTool({
      name: "validate_smt_clause",
      arguments: { clause: "(>= n 0)", section: "preconditions" },
    });
    assert.equal(validClause.structuredContent.valid, true);

    const invalidClause = await client.callTool({
      name: "validate_smt_clause",
      arguments: { clause: "n >= 0", section: "preconditions" },
    });
    assert.equal(invalidClause.structuredContent.valid, false);
    assert.match(invalidClause.structuredContent.issue, /not a valid SMT-LIB/u);

    const created = await client.callTool({
      name: "create_spec",
      arguments: {
        functionName: "demo_fn",
        declarations: ["(declare-const x (_ BitVec 32))"],
        preconditions: ["(> x 0)"],
        postconditions: ["(> x 0)"],
        invariants: [],
        verificationMode: "find-model",
      },
    });
    assert.notEqual(created.isError, true, stderr.join(""));
    assert.equal(created.structuredContent.spec.version, 1);
    assert.deepEqual(created.structuredContent.spec.declarations, ["(declare-const x (_ BitVec 32))"]);
    assert.equal(created.structuredContent.spec.verificationMode, "find-model");
    assert.match(created.content[0].text, /Created spec v1 for demo_fn/u);

    const invalid = await client.callTool({
      name: "create_spec",
      arguments: {
        functionName: "fib_bad",
        preconditions: ["n must be non-negative"],
        postconditions: ["result is fibonacci of n"],
        invariants: [],
      },
    });
    assert.equal(invalid.isError, true);
    assert.equal(invalid.structuredContent.error.code, "VALIDATION_FAILED");
    assert.match(invalid.structuredContent.error.message, /not a valid SMT-LIB boolean expression/i);
    assert.equal(invalid.structuredContent.error.details.section, "preconditions");
    assert.match(invalid.structuredContent.error.details.hint, /prefix SMT-LIB/u);

    const updated = await client.callTool({
      name: "update_spec",
      arguments: { functionName: "demo_fn", invariants: ["(>= x 1)"], verificationMode: "prove" },
    });
    assert.notEqual(updated.isError, true, stderr.join(""));
    assert.equal(updated.structuredContent.spec.version, 2);
    assert.deepEqual(updated.structuredContent.spec.invariants, ["(>= x 1)"]);
    assert.deepEqual(updated.structuredContent.spec.declarations, ["(declare-const x (_ BitVec 32))"]);
    assert.equal(updated.structuredContent.spec.verificationMode, "prove");

    const missing = await client.callTool({
      name: "validate_spec_consistency",
      arguments: { functionName: "missing_fn" },
    });
    assert.equal(missing.isError, true);
    assert.equal(missing.structuredContent.error.code, "SPEC_NOT_FOUND");

    const validation = await client.callTool({
      name: "validate_spec_consistency",
      arguments: { functionName: "demo_fn" },
    });
    assert.notEqual(validation.isError, true, stderr.join(""));
    assert.equal(validation.structuredContent.valid, true);

    const versions = await client.callTool({
      name: "list_spec_versions",
      arguments: { functionName: "demo_fn" },
    });
    assert.equal(versions.structuredContent.versions.length, 2);

    const diff = await client.callTool({
      name: "diff_spec_versions",
      arguments: { functionName: "demo_fn", fromVersion: 1, toVersion: 2 },
    });
    assert.equal(diff.structuredContent.changed, true);
    assert.deepEqual(diff.structuredContent.changedSections, ["invariants"]);

    const missingVersion = await client.callTool({
      name: "diff_spec_versions",
      arguments: { functionName: "demo_fn", fromVersion: 1, toVersion: 99 },
    });
    assert.equal(missingVersion.isError, true);
    assert.equal(missingVersion.structuredContent.error.code, "SPEC_VERSION_NOT_FOUND");

    const resources = await client.listResources();
    assert.deepEqual(resources.resources.map((resource) => resource.uri), ["spec://functions/demo_fn/latest"]);

    const latest = await client.readResource({ uri: "spec://functions/demo_fn/latest" });
    const latestSpec = JSON.parse(latest.contents[0].text);
    assert.equal(latestSpec.version, 2);
    assert.equal(latestSpec.verificationMode, "prove");

    const prompts = await client.listPrompts();
    assert.deepEqual(prompts.prompts.map((prompt) => prompt.name), ["review_spec"]);

    const prompt = await client.getPrompt({ name: "review_spec", arguments: { functionName: "demo_fn" } });
    assert.match(prompt.messages[0].content.text, /demo_fn/u);
  });
});

test("assembly server exposes tools, resources, prompts, and analysis outputs", async () => {
  await withClient("assembly", defaultData(), async (client, stderr) => {
    const source = [
      "entry:",
      "LDR x1, [x2]",
      "loop:",
      "ADD x0, x0, x1",
      "STR x0, [x3]",
      "CBNZ x0, loop",
      "RET",
    ].join("\n");

    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "analyze_function",
      "check_instruction_semantics",
      "extract_loop_candidates",
      "summarize_register_effects",
    ]);

    const analysis = await client.callTool({ name: "analyze_function", arguments: { source } });
    assert.notEqual(analysis.isError, true, stderr.join(""));
    assert.equal(analysis.structuredContent.analysis.lineCount, 7);
    assert.deepEqual(analysis.structuredContent.analysis.basicBlocks, ["entry", "loop"]);
    assert.equal(analysis.structuredContent.analysis.branchCount, 2);

    const instruction = await client.callTool({ name: "check_instruction_semantics", arguments: { opcode: "add" } });
    assert.equal(instruction.structuredContent.instruction.known, true);
    assert.match(instruction.structuredContent.instruction.summary, /adds/i);

    const effects = await client.callTool({ name: "summarize_register_effects", arguments: { source } });
    assert.deepEqual(effects.structuredContent.effects.touchedRegisters, ["x1", "x2", "x0", "x3"]);
    assert.equal(effects.structuredContent.effects.readsMemory, true);
    assert.equal(effects.structuredContent.effects.writesMemory, true);

    const loops = await client.callTool({ name: "extract_loop_candidates", arguments: { source } });
    assert.equal(loops.structuredContent.candidates.some((entry) => /loop/u.test(entry.text)), true);

    const resources = await client.listResources();
    assert.deepEqual(resources.resources.map((resource) => resource.uri), [
      "asm://instructions/ADD",
      "asm://instructions/BNE",
      "asm://instructions/LDR",
      "asm://instructions/STR",
    ]);

    const addDoc = await client.readResource({ uri: "asm://instructions/ADD" });
    const addInstruction = JSON.parse(addDoc.contents[0].text);
    assert.equal(addInstruction.opcode, "ADD");
    assert.equal(addInstruction.known, true);

    const prompts = await client.listPrompts();
    assert.deepEqual(prompts.prompts.map((prompt) => prompt.name), ["explain_control_flow"]);

    const prompt = await client.getPrompt({ name: "explain_control_flow", arguments: { source } });
    assert.match(prompt.messages[0].content.text, /highlight loops, exits/u);
  });
});

test("performance server persists reports and exposes prompts/resources", async () => {
  await withClient("performance", defaultData(), async (client, stderr) => {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "check_timing_constraints",
      "compare_performance_profiles",
      "detect_performance_regression",
      "verify_constant_time",
    ]);

    const timing = await client.callTool({
      name: "check_timing_constraints",
      arguments: { functionName: "timing_fn", observedCycles: 120, maxCycles: 100 },
    });
    assert.notEqual(timing.isError, true, stderr.join(""));
    assert.equal(timing.structuredContent.report.regression, true);

    const constantTime = await client.callTool({
      name: "verify_constant_time",
      arguments: { functionName: "ct_fn", branchOnSecret: true, memoryOnSecret: false },
    });
    assert.equal(constantTime.structuredContent.report.constantTime, false);

    const comparison = await client.callTool({
      name: "compare_performance_profiles",
      arguments: { functionName: "cmp_fn", baselineCycles: 100, candidateCycles: 95 },
    });
    assert.equal(comparison.structuredContent.report.regression, false);

    const lookup = await client.callTool({
      name: "detect_performance_regression",
      arguments: { functionName: "timing_fn" },
    });
    assert.equal(lookup.structuredContent.report.observedCycles, 120);

    const resources = await client.listResources();
    assert.deepEqual(resources.resources, []);

    const report = await client.readResource({ uri: "perf://functions/timing_fn/report" });
    const parsed = JSON.parse(report.contents[0].text);
    assert.equal(parsed.functionName, "timing_fn");
    assert.equal(parsed.regression, true);

    const prompts = await client.listPrompts();
    assert.deepEqual(prompts.prompts.map((prompt) => prompt.name), ["analyze_perf_delta"]);

    const prompt = await client.getPrompt({ name: "analyze_perf_delta", arguments: { functionName: "timing_fn" } });
    assert.match(prompt.messages[0].content.text, /timing_fn/u);
  });
});

test("verification server exposes prompt/resource flows and structured not-found errors", async () => {
  await withClient("verification", defaultData({
    specifications: {
      prove_positive: [{
        functionName: "prove_positive",
        version: 1,
        preconditions: ["(> x 0)"],
        postconditions: ["(> x 0)"],
        invariants: [],
        updatedAt: new Date().toISOString(),
      }],
    },
  }), async (client, stderr) => {
    const start = await client.callTool({ name: "start_verification", arguments: { functionName: "prove_positive", specVersion: 1 } });
    assert.notEqual(start.isError, true, stderr.join(""));
    const jobId = start.structuredContent.job.jobId;
    assert.match(start.content[0].text, new RegExp(`Verification job ${jobId}`, "u"));
    assert.match(start.content[0].text, /status: passed/u);

    const repeat = await client.callTool({ name: "start_verification", arguments: { functionName: "prove_positive", specVersion: 1 } });
    assert.equal(repeat.structuredContent.job.jobId, jobId);

    const resources = await client.listResources();
    assert.deepEqual(resources.resources.map((resource) => resource.uri), [`verification://jobs/${jobId}`]);

    const resource = await client.readResource({ uri: `verification://jobs/${jobId}` });
    const parsed = JSON.parse(resource.contents[0].text);
    assert.equal(parsed.jobId, jobId);
    assert.equal(parsed.status, "passed");

    const status = await client.callTool({ name: "get_verification_status", arguments: { jobId } });
    assert.notEqual(status.isError, true, stderr.join(""));
    assert.match(status.content[0].text, /status: passed/u);
    assert.match(status.content[0].text, /solverStatus: unsat/u);

    const waited = await client.callTool({ name: "wait_for_verification", arguments: { jobId, timeoutMs: 50, pollIntervalMs: 5 } });
    assert.notEqual(waited.isError, true, stderr.join(""));
    assert.equal(waited.structuredContent.completed, true);
    assert.equal(waited.structuredContent.job.jobId, jobId);

    const excerpt = await client.callTool({ name: "get_counterexample_excerpt", arguments: { jobId, maxLines: 3 } });
    assert.notEqual(excerpt.isError, true, stderr.join(""));
    assert.equal(excerpt.structuredContent.hasCounterexample, false);

    const prompts = await client.listPrompts();
    assert.deepEqual(prompts.prompts.map((prompt) => prompt.name), ["triage_failure"]);

    const prompt = await client.getPrompt({ name: "triage_failure", arguments: { jobId } });
    assert.match(prompt.messages[0].content.text, new RegExp(jobId, "u"));

    const explanation = await client.callTool({ name: "explain_verification_failure", arguments: { jobId } });
    assert.notEqual(explanation.isError, true, stderr.join(""));
    assert.match(explanation.content[0].text, /summary: Verification passed with no counterexample\./u);

    for (const toolName of ["get_verification_status", "wait_for_verification", "cancel_verification", "explain_verification_failure", "get_counterexample_excerpt"]) {
      const result = await client.callTool({ name: toolName, arguments: { jobId: "job_missing" } });
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent.error.code, "JOB_NOT_FOUND");
    }

    const missingSpec = await client.callTool({
      name: "start_verification",
      arguments: { functionName: "missing_fn", specVersion: 1 },
    });
    assert.equal(missingSpec.isError, true);
    assert.equal(missingSpec.structuredContent.error.code, "SPEC_VERSION_NOT_FOUND");
  });
});