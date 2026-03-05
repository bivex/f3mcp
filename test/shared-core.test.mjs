import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { textResult, structuredResult, normalizeContractError, errorResult, withTimeout, runStdio } from "../build/shared/runtime.js";
import { readJsonFile, writeJsonFile, updateJsonFile } from "../build/shared/file-store.js";
import { assertValidSpecExpressions } from "../build/shared/spec-expression-validation.js";
import { FileSpecificationRepository } from "../build/infrastructure/file-specification-repository.js";
import { FileInstructionCatalog } from "../build/infrastructure/file-instruction-catalog.js";
import { FilePerformanceReportStore } from "../build/infrastructure/file-performance-report-store.js";
import { SpecificationService } from "../build/application/specification-service.js";
import { PerformanceService } from "../build/application/performance-service.js";
import { AssemblyService } from "../build/application/assembly-service.js";

async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), "f3mcp-core-"));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("runtime helpers format results, normalize errors, and handle timeouts", async () => {
  assert.deepEqual(textResult("hello"), { content: [{ type: "text", text: "hello" }] });
  assert.deepEqual(structuredResult("ok", { value: 1 }), { content: [{ type: "text", text: "ok" }], structuredContent: { value: 1 } });

  const known = normalizeContractError({ code: "JOB_NOT_FOUND", message: "missing", retryable: true, details: { jobId: "x" } });
  assert.equal(known.code, "JOB_NOT_FOUND");
  assert.equal(known.retryable, true);
  assert.deepEqual(known.details, { jobId: "x" });

  const generic = normalizeContractError(new Error("boom"));
  assert.equal(generic.code, "INTERNAL_ERROR");
  assert.equal(generic.message, "boom");

  const unknown = normalizeContractError("wat");
  assert.equal(unknown.code, "INTERNAL_ERROR");
  assert.equal(unknown.message, "Unknown error");

  const formatted = errorResult("VALIDATION_FAILED", "bad spec", { section: "preconditions" }, true);
  assert.equal(formatted.isError, true);
  assert.equal(formatted.structuredContent.error.code, "VALIDATION_FAILED");
  assert.match(formatted.content[0].text, /bad spec/u);

  assert.equal(await withTimeout(Promise.resolve("done"), 25), "done");
  await assert.rejects(() => withTimeout(new Promise(() => {}), 5, "SOLVER_TIMEOUT"), (error) => error?.code === "SOLVER_TIMEOUT" && error?.retryable === true);

  let connectedTransport;
  await runStdio({ async connect(transport) { connectedTransport = transport; } });
  assert.ok(connectedTransport);
});

test("file-store reads fallback, writes json, updates content, and rethrows invalid json", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "nested", "data.json");
    assert.deepEqual(await readJsonFile(filePath, { missing: true }), { missing: true });

    await writeJsonFile(filePath, { count: 1, list: ["a"] });
    assert.deepEqual(await readJsonFile(filePath, null), { count: 1, list: ["a"] });
    assert.equal((await readFile(filePath, "utf8")).endsWith("\n"), true);

    const next = await updateJsonFile(filePath, { count: 0 }, async (current) => ({ ...current, count: current.count + 1, extra: true }));
    assert.deepEqual(next, { count: 2, list: ["a"], extra: true });
    assert.deepEqual(await readJsonFile(filePath, null), { count: 2, list: ["a"], extra: true });

    const brokenPath = join(dir, "broken.json");
    await writeFile(brokenPath, "{not-json}\n", "utf8");
    await assert.rejects(() => readJsonFile(brokenPath, {}), SyntaxError);
  });
});

test("spec expression validation, repository, and specification service cover valid and invalid flows", async () => {
  assert.doesNotThrow(() => assertValidSpecExpressions({ preconditions: ["true", "(> n 0)"], postconditions: ["(= result 1)"], invariants: ["false"] }));
  assert.throws(() => assertValidSpecExpressions({ preconditions: ["n > 0"], postconditions: [], invariants: [] }), (error) => error?.code === "VALIDATION_FAILED" && error?.details?.section === "preconditions");
  assert.throws(() => assertValidSpecExpressions({ preconditions: [], postconditions: ["result is fibonacci of n"], invariants: [] }), (error) => error?.code === "VALIDATION_FAILED" && error?.details?.section === "postconditions");
  assert.throws(() => assertValidSpecExpressions({ preconditions: [], postconditions: [], invariants: ["  "] }), (error) => error?.code === "VALIDATION_FAILED" && error?.details?.section === "invariants");
  assert.throws(() => assertValidSpecExpressions({ preconditions: [], postconditions: ["= result 0"], invariants: [] }), (error) => error?.code === "VALIDATION_FAILED");

  await withTempDir(async (dir) => {
    const repo = new FileSpecificationRepository(join(dir, "specifications.json"));
    const service = new SpecificationService(repo);

    await assert.rejects(() => service.create({ functionName: "fib_bad", preconditions: ["n >= 0"], postconditions: ["result == 1"], invariants: [] }), (error) => error?.code === "VALIDATION_FAILED");

    const v1 = await service.create({ functionName: "sum_positive", preconditions: ["(> x 0)"], postconditions: ["(> result 0)"], invariants: ["(>= result 1)"] });
    const v2 = await service.update({ functionName: "sum_positive", invariants: ["(>= result 1)", "(>= x 1)"] });
    const partial = await service.create({ functionName: "partial_fn", preconditions: ["(>= n 0)"], postconditions: ["(>= result 0)"], invariants: [] });

    assert.equal(v1.version, 1);
    assert.equal(v2.version, 2);
    assert.equal(partial.version, 1);
    assert.equal(await service.update({ functionName: "missing_fn" }), null);

    assert.equal((await service.latest("sum_positive")).version, 2);
    assert.equal((await service.getVersion("sum_positive", 1)).version, 1);
    assert.deepEqual((await service.versions("sum_positive")).map((spec) => spec.version), [1, 2]);
    assert.deepEqual((await service.listLatest()).map((spec) => spec.functionName).sort(), ["partial_fn", "sum_positive"]);

    assert.deepEqual(await service.validate("missing_fn"), null);
    assert.deepEqual(await service.validate("sum_positive"), { functionName: "sum_positive", valid: true, issues: [] });
    assert.deepEqual(await service.validate("partial_fn"), { functionName: "partial_fn", valid: false, issues: ["Missing invariants"] });
  });
});

test("instruction catalog, performance store, performance service, and assembly service behave as expected", async () => {
  await withTempDir(async (dir) => {
    const instructionPath = join(dir, "instruction-docs.json");
    const reportPath = join(dir, "performance-reports.json");
    await writeJsonFile(instructionPath, { BNE: "Branch if not equal", ADD: "Adds registers" });

    const catalog = new FileInstructionCatalog(instructionPath);
    assert.deepEqual(await catalog.get("add"), { opcode: "ADD", known: true, summary: "Adds registers" });
    assert.deepEqual(await catalog.get("ldr"), { opcode: "LDR", known: false, summary: "Unknown opcode" });
    assert.deepEqual(await catalog.list(), ["ADD", "BNE"]);

    const reportStore = new FilePerformanceReportStore(reportPath);
    await reportStore.upsert({ functionName: "fast_fn", observedCycles: 100, maxCycles: 110, regression: false });
    await reportStore.upsert({ functionName: "fast_fn", observedCycles: 95, regression: false });
    await reportStore.upsert({ functionName: "slow_fn", observedCycles: 120, regression: true });
    assert.deepEqual(await reportStore.get("fast_fn"), { functionName: "fast_fn", observedCycles: 95, regression: false });
    assert.equal(await reportStore.get("missing_fn"), null);

    const perfWrites = [];
    const perfService = new PerformanceService({
      async upsert(report) { perfWrites.push(report); return report; },
      async get(functionName) { return perfWrites.find((entry) => entry.functionName === functionName) ?? null; },
    });
    assert.equal((await perfService.checkTiming("budget_fn", 10, 5)).regression, true);
    assert.equal((await perfService.verifyConstantTime("ct_fn", true, false)).constantTime, false);
    assert.equal((await perfService.compare("compare_fn", 5, 9)).regression, true);
    assert.equal((await perfService.get("budget_fn")).functionName, "budget_fn");

    const assembly = new AssemblyService({
      async get(opcode) { return { opcode, known: true, summary: `Summary for ${opcode}` }; },
      async list() { return ["ADD", "RET"]; },
    });
    assert.deepEqual(assembly.analyzeFunction("\nstart:\nADD x0, x0, x1\nRET\n"), { lineCount: 3, basicBlocks: ["start"], branchCount: 1 });
    assert.deepEqual(await assembly.instruction("ADD"), { opcode: "ADD", known: true, summary: "Summary for ADD" });
    assert.deepEqual(assembly.summarizeRegisterEffects("ADD x0, x0, x1"), { touchedRegisters: ["x0", "x1"], readsMemory: false, writesMemory: false });
    assert.deepEqual(assembly.extractLoopCandidates("start:\nB.eq done\nCBNZ x0, loop\ndone:"), [{ line: 2, text: "B.eq done" }, { line: 3, text: "CBNZ x0, loop" }]);
    assert.deepEqual(await assembly.listInstructions(), ["ADD", "RET"]);
  });
});