import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import { VerificationService } from "../build/application/verification-service.js";
import { Z3ProofEngine } from "../build/infrastructure/z3-proof-engine.js";

const bundledWindowsZ3 = process.platform === "win32"
  ? resolve(process.cwd(), "z3-4.16.0-x64-win", "bin", "z3.exe")
  : undefined;
const pathEntries = (process.env.PATH ?? process.env.Path ?? "").split(delimiter).filter(Boolean);
const systemZ3 = [
  process.env.Z3_BINARY,
  bundledWindowsZ3,
  ...(process.platform === "win32" ? pathEntries.flatMap((entry) => [resolve(entry, "z3.exe"), resolve(entry, "z3")]) : []),
  "/opt/homebrew/bin/z3",
  "/usr/local/bin/z3",
  "z3.exe",
  "z3",
].find((candidate) => candidate && (candidate === "z3" || candidate === "z3.exe" || existsSync(candidate))) ?? "z3";

test("VerificationService reuses an existing job without invoking the engine", async () => {
  let getVersionCalls = 0;
  let verifyCalls = 0;
  const existing = {
    jobId: "job_existing",
    functionName: "demo_fn",
    specVersion: 1,
    createdAt: new Date().toISOString(),
    engine: "z3",
    status: "passed",
    solverStatus: "unsat",
  };

  const service = new VerificationService({
    async getVersion() {
      getVersionCalls += 1;
      return null;
    },
  }, {
    async findByFunctionAndVersion() {
      return existing;
    },
    async save(job) {
      return job;
    },
    async get() {
      return existing;
    },
    async list() {
      return [existing];
    },
  }, {
    async verify() {
      verifyCalls += 1;
      return { engine: "z3", status: "passed", solverStatus: "unsat" };
    },
  });

  const job = await service.start("demo_fn", 1);
  assert.equal(job, existing);
  assert.equal(getVersionCalls, 0);
  assert.equal(verifyCalls, 0);
});

test("VerificationService reports missing specs and explains successful jobs", async () => {
  const passed = {
    jobId: "job_passed",
    functionName: "demo_fn",
    specVersion: 1,
    createdAt: new Date().toISOString(),
    engine: "z3",
    status: "passed",
    solverStatus: "unsat",
  };

  const service = new VerificationService({
    async getVersion() {
      return null;
    },
  }, {
    async findByFunctionAndVersion() {
      return null;
    },
    async save(job) {
      return job;
    },
    async get(jobId) {
      return jobId === passed.jobId ? passed : null;
    },
    async list() {
      return [passed];
    },
  }, {
    async verify() {
      return { engine: "z3", status: "passed", solverStatus: "unsat" };
    },
  });

  await assert.rejects(() => service.start("missing_fn", 1), (error) => error?.code === "SPEC_VERSION_NOT_FOUND");

  const explanation = await service.explain("job_passed");
  assert.equal(explanation.explanation, "Verification passed with no counterexample.");
  assert.equal(await service.explain("job_missing"), null);
  assert.deepEqual(await service.list(), [passed]);
  assert.equal(await service.get("job_passed"), passed);
});

test("VerificationService creates a new job and explains failures with counterexamples", async () => {
  const spec = {
    functionName: "demo_fn",
    version: 3,
    declarations: [],
    preconditions: ["(>= n 0)"],
    postconditions: ["(>= result 0)"],
    invariants: ["(>= result 0)"],
    verificationMode: "prove",
    updatedAt: new Date().toISOString(),
  };
  const jobs = [];

  const service = new VerificationService({
    async getVersion(functionName, version) {
      return functionName === "demo_fn" && version === 3 ? spec : null;
    },
  }, {
    async findByFunctionAndVersion() {
      return null;
    },
    async save(job) {
      jobs.push(job);
      return job;
    },
    async get(jobId) {
      return jobs.find((job) => job.jobId === jobId) ?? null;
    },
    async list() {
      return jobs;
    },
  }, {
    async verify(inputSpec) {
      assert.equal(inputSpec, spec);
      return {
        engine: "z3",
        status: "failed",
        solverStatus: "sat",
        failureReason: "counterexample found",
        counterexample: "(model (define-fun n () Int 7))",
      };
    },
  });

  const job = await service.start("demo_fn", 3);
  assert.match(job.jobId, /^job_/u);
  assert.equal(job.functionName, "demo_fn");
  assert.equal(job.specVersion, 3);
  assert.equal(job.status, "failed");
  assert.equal(job.verificationMode, "prove");
  assert.equal(job.counterexample, "(model (define-fun n () Int 7))");

  const explanation = await service.explain(job.jobId);
  assert.equal(explanation.explanation, "counterexample found");
  assert.equal(explanation.counterexample, "(model (define-fun n () Int 7))");

  const waited = await service.waitForCompletion(job.jobId, 5, 1);
  assert.equal(waited.completed, true);
  assert.equal(waited.job.jobId, job.jobId);

  const excerpt = await service.getCounterexampleExcerpt(job.jobId, 1);
  assert.equal(excerpt.hasCounterexample, true);
  assert.equal(excerpt.linesShown, 1);
  assert.match(excerpt.excerpt, /define-fun n/u);
});

test("VerificationService wait and counterexample helpers cover missing and non-terminal jobs", async () => {
  const mutableJobs = [{
    jobId: "job_running",
    functionName: "demo_fn",
    specVersion: 1,
    status: "running",
    createdAt: new Date().toISOString(),
    engine: "z3",
  }];

  const service = new VerificationService({
    async getVersion() {
      return null;
    },
  }, {
    async findByFunctionAndVersion() {
      return null;
    },
    async save(job) {
      const index = mutableJobs.findIndex((entry) => entry.jobId === job.jobId);
      if (index >= 0) mutableJobs[index] = job;
      else mutableJobs.push(job);
      return job;
    },
    async get(jobId) {
      return mutableJobs.find((job) => job.jobId === jobId) ?? null;
    },
    async list() {
      return mutableJobs;
    },
  }, {
    async verify() {
      throw new Error("unused");
    },
  });

  assert.equal(await service.waitForCompletion("job_missing"), null);
  const waited = await service.waitForCompletion("job_running", 5, 1);
  assert.equal(waited.completed, false);
  assert.equal(waited.job.status, "running");

  const emptyExcerpt = await service.getCounterexampleExcerpt("job_running", 3);
  assert.deepEqual(emptyExcerpt, {
    jobId: "job_running",
    status: "running",
    verificationMode: "prove",
    evidenceKind: undefined,
    hasCounterexample: false,
    excerpt: undefined,
    linesShown: 0,
    totalLines: 0,
  });
  assert.equal(await service.getCounterexampleExcerpt("job_missing"), null);
});

test("VerificationService cancels running jobs and rejects finished jobs", async () => {
  const running = {
    jobId: "job_running",
    functionName: "demo_fn",
    specVersion: 1,
    createdAt: new Date().toISOString(),
    engine: "z3",
    status: "running",
  };
  const failed = { ...running, jobId: "job_failed", status: "failed" };
  const saved = [];

  const service = new VerificationService({
    async getVersion() {
      return null;
    },
  }, {
    async findByFunctionAndVersion() {
      return null;
    },
    async save(job) {
      saved.push(job);
      return job;
    },
    async get(jobId) {
      if (jobId === running.jobId) return running;
      if (jobId === failed.jobId) return failed;
      return null;
    },
    async list() {
      return [running, failed];
    },
  }, {
    async verify() {
      return { engine: "z3", status: "passed", solverStatus: "unsat" };
    },
  });

  const cancelled = await service.cancel("job_running");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(saved.at(-1).status, "cancelled");
  assert.equal(await service.cancel("job_missing"), null);
  await assert.rejects(() => service.cancel("job_failed"), (error) => error?.code === "JOB_NOT_CANCELLABLE");
});

test("Z3ProofEngine distinguishes solver launch failures from invalid SMT input", async () => {
  const unavailableEngine = new Z3ProofEngine("/definitely/missing/z3", 500);
  await assert.rejects(
    () => unavailableEngine.verify({ functionName: "broken", version: 1, preconditions: ["(> x 0)"], postconditions: ["(> x 0)"], invariants: [], updatedAt: new Date().toISOString() }),
    (error) => error?.code === "SOLVER_UNAVAILABLE",
  );

  const validationEngine = new Z3ProofEngine(systemZ3, 1_500);
  await assert.rejects(
    () => validationEngine.verify({ functionName: "invalid", version: 1, preconditions: ["x > 0"], postconditions: ["x > 0"], invariants: [], updatedAt: new Date().toISOString() }),
    (error) => error?.code === "VALIDATION_FAILED" && /invalid assert command|SMT-LIB/u.test(error?.message ?? ""),
  );
});

test("Z3ProofEngine covers empty postconditions, inconsistent specs, and counterexample generation", async () => {
  const engine = new Z3ProofEngine(systemZ3, 1_500);

  const passed = await engine.verify({
    functionName: "passed",
    version: 1,
    declarations: [],
    preconditions: ["(> x 0)"],
    postconditions: ["(> x 0)"],
    invariants: [],
    verificationMode: "prove",
    updatedAt: new Date().toISOString(),
  });
  assert.deepEqual(passed, { engine: "z3", solverStatus: "unsat", status: "passed" });

  assert.deepEqual(
    await engine.verify({ functionName: "no_posts", version: 1, declarations: [], preconditions: ["(>= x 0)"], postconditions: [], invariants: [], verificationMode: "prove", updatedAt: new Date().toISOString() }),
    {
      engine: "z3",
      solverStatus: "unknown",
      status: "failed",
      failureReason: "No postconditions were provided for verification.",
    },
  );

  const inconsistent = await engine.verify({
    functionName: "inconsistent",
    version: 1,
    declarations: [],
    preconditions: ["(> x 0)", "(< x 0)"],
    postconditions: ["(> x 1)"],
    invariants: [],
    verificationMode: "prove",
    updatedAt: new Date().toISOString(),
  });
  assert.equal(inconsistent.status, "failed");
  assert.equal(inconsistent.solverStatus, "unsat");
  assert.match(inconsistent.failureReason, /internally inconsistent/u);

  const counterexample = await engine.verify({
    functionName: "counterexample",
    version: 1,
    declarations: [],
    preconditions: ["(>= n 0)", "(= result n)"],
    postconditions: ["(>= result 0)", "(<= result 0)"],
    invariants: [],
    verificationMode: "prove",
    updatedAt: new Date().toISOString(),
  });
  assert.equal(counterexample.status, "failed");
  assert.equal(counterexample.solverStatus, "sat");
  assert.match(counterexample.failureReason, /counterexample/u);
  assert.match(counterexample.counterexample ?? "", /define-fun/u);

  const foundModel = await engine.verify({
    functionName: "find_model_bitvec",
    version: 1,
    declarations: ["(declare-const x (_ BitVec 32))", "(declare-const y (_ BitVec 32))"],
    preconditions: ["(distinct x y)"],
    postconditions: ["(= ((_ extract 15 0) x) ((_ extract 15 0) y))"],
    invariants: [],
    verificationMode: "find-model",
    updatedAt: new Date().toISOString(),
  });
  assert.equal(foundModel.status, "passed");
  assert.equal(foundModel.solverStatus, "sat");
  assert.equal(foundModel.evidenceKind, "model");
  assert.match(foundModel.failureReason ?? "", /satisfying model/u);
  assert.match(foundModel.counterexample ?? "", /define-fun/u);

  const noModel = await engine.verify({
    functionName: "find_model_unsat",
    version: 1,
    declarations: ["(declare-const x (_ BitVec 32))", "(declare-const y (_ BitVec 32))"],
    preconditions: ["(distinct x y)"],
    postconditions: ["(= x y)"],
    invariants: [],
    verificationMode: "find-model",
    updatedAt: new Date().toISOString(),
  });
  assert.equal(noModel.status, "failed");
  assert.equal(noModel.solverStatus, "unsat");
  assert.match(noModel.failureReason ?? "", /No satisfying assignment/u);
});

test("Z3ProofEngine handles unknown solver states and exposes helper internals", async () => {
  const consistencyUnknown = new Z3ProofEngine(systemZ3, 500);
  consistencyUnknown.runZ3 = async () => ({ status: "unknown", output: "consistency unknown" });
  await assert.rejects(
    () => consistencyUnknown.verify({ functionName: "unknown_consistency", version: 1, declarations: [], preconditions: ["(> x 0)"], postconditions: ["(> x 0)"], invariants: [], verificationMode: "prove", updatedAt: new Date().toISOString() }),
    (error) => error?.code === "SOLVER_UNKNOWN" && /consistency check/u.test(error?.message ?? "") && error?.details === "consistency unknown",
  );

  const proofUnknown = new Z3ProofEngine(systemZ3, 500);
  let calls = 0;
  proofUnknown.runZ3 = async () => {
    calls += 1;
    return calls === 1 ? { status: "sat", output: "ok" } : { status: "unknown", output: "proof unknown" };
  };
  await assert.rejects(
    () => proofUnknown.verify({ functionName: "unknown_proof", version: 1, declarations: [], preconditions: ["(> x 0)"], postconditions: ["(> x 0)"], invariants: [], verificationMode: "prove", updatedAt: new Date().toISOString() }),
    (error) => error?.code === "SOLVER_UNKNOWN" && /proof obligation/u.test(error?.message ?? "") && error?.details === "proof unknown",
  );

  const modelUnknown = new Z3ProofEngine(systemZ3, 500);
  modelUnknown.runZ3 = async () => ({ status: "unknown", output: "model unknown" });
  await assert.rejects(
    () => modelUnknown.verify({
      functionName: "unknown_model_search",
      version: 1,
      declarations: ["(declare-const x (_ BitVec 32))", "(declare-const y (_ BitVec 32))"],
      preconditions: ["(distinct x y)"],
      postconditions: ["(= ((_ extract 15 0) x) ((_ extract 15 0) y))"],
      invariants: [],
      verificationMode: "find-model",
      updatedAt: new Date().toISOString(),
    }),
    (error) => error?.code === "SOLVER_UNKNOWN" && /searching for a satisfying model/u.test(error?.message ?? "") && error?.details === "model unknown",
  );

  const helperEngine = new Z3ProofEngine(systemZ3, 500);
  assert.deepEqual(helperEngine.inferDeclarations(["(and (> n 0) (= result (+ n x)) true)"]).sort(), ["(declare-const n Int)", "(declare-const result Int)", "(declare-const x Int)"]);
  assert.deepEqual(helperEngine.inferDeclarations(["(= (bvxor x #x00000001) y)"], ["(declare-const x (_ BitVec 32))", "(declare-const y (_ BitVec 32))"]), []);
  const script = helperEngine.buildScript(["(declare-const n Int)"], ["(> n 0)"]);
  assert.match(script, /\(declare-const n Int\)/u);
  assert.match(script, /\(assert \(> n 0\)\)/u);
  assert.match(script, /\(exit\)\s*$/u);

  assert.deepEqual(helperEngine.buildArgs(false), ["-in", "-smt2", "-t:500", "-nw"]);
  assert.deepEqual(helperEngine.buildArgs(true), ["-in", "-smt2", "-t:500", "-nw", "-model"]);
});