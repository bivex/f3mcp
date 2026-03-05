/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 22:43
 * Last Updated: 2026-03-05 22:43
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const expectedFiles = [
  "package.json",
  "tsconfig.json",
  "src/contracts/errors.ts",
  "src/contracts/specification.ts",
  "src/contracts/verification.ts",
  "src/contracts/assembly.ts",
  "src/contracts/performance.ts",
  "src/application/specification-service.ts",
  "src/application/verification-service.ts",
  "src/application/assembly-service.ts",
  "src/application/performance-service.ts",
  "src/infrastructure/file-specification-repository.ts",
  "src/infrastructure/file-verification-job-repository.ts",
  "src/infrastructure/file-instruction-catalog.ts",
  "src/infrastructure/file-performance-report-store.ts",
  "src/infrastructure/z3-proof-engine.ts",
  "src/shared/file-store.ts",
  "src/shared/runtime.ts",
  "src/specification.ts",
  "src/verification.md",
  "src/verification.ts",
  "src/assembly.ts",
  "src/performance.ts",
  "data/specifications.json",
  "data/verification-jobs.json",
  "data/performance-reports.json",
  "data/instruction-docs.json",
  "test/verification-e2e.test.mjs",
];

test("expected project files exist", () => {
  for (const file of expectedFiles) {
    assert.equal(existsSync(file), true, `${file} should exist`);
  }
});

test("package.json contains expected scripts", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(typeof pkg.scripts.build, "string");
  assert.equal(typeof pkg.scripts.test, "string");
  assert.equal(typeof pkg.scripts.spec, "string");
  assert.equal(typeof pkg.scripts.verify, "string");
  assert.equal(typeof pkg.scripts.asm, "string");
  assert.equal(typeof pkg.scripts.perf, "string");
});

test("server entrypoints expose the intended MCP operations", () => {
  const specSource = readFileSync("src/specification.ts", "utf8");
  const verifySource = readFileSync("src/verification.ts", "utf8");
  const asmSource = readFileSync("src/assembly.ts", "utf8");
  const perfSource = readFileSync("src/performance.ts", "utf8");

  for (const token of ["create_spec", "update_spec", "validate_spec_consistency", "list_spec_versions"]) {
    assert.equal(specSource.includes(token), true, `specification.ts should contain ${token}`);
  }

  for (const token of ["start_verification", "get_verification_status", "cancel_verification", "explain_verification_failure"]) {
    assert.equal(verifySource.includes(token), true, `verification.ts should contain ${token}`);
  }

  for (const token of ["analyze_function", "check_instruction_semantics", "summarize_register_effects", "extract_loop_candidates"]) {
    assert.equal(asmSource.includes(token), true, `assembly.ts should contain ${token}`);
  }

  for (const token of ["check_timing_constraints", "verify_constant_time", "compare_performance_profiles", "detect_performance_regression"]) {
    assert.equal(perfSource.includes(token), true, `performance.ts should contain ${token}`);
  }
});

test("all server files define output schemas", () => {
  for (const file of ["src/specification.ts", "src/verification.ts", "src/assembly.ts", "src/performance.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes("outputSchema"), true, `${file} should declare output schemas`);
  }
});

test("verification stack is layered and uses a real solver adapter", () => {
  const verificationSource = readFileSync("src/verification.ts", "utf8");
  const proofEngineSource = readFileSync("src/infrastructure/z3-proof-engine.ts", "utf8");
  const errorContractsSource = readFileSync("src/contracts/errors.ts", "utf8");

  assert.equal(verificationSource.includes("VerificationService"), true);
  assert.equal(verificationSource.includes("Z3ProofEngine"), true);
  assert.equal(proofEngineSource.includes('spawn(this.binaryPath, ["-in", "-smt2"])'), true);
  assert.equal(errorContractsSource.includes("SOLVER_UNAVAILABLE"), true);
  assert.equal(errorContractsSource.includes("JOB_NOT_CANCELLABLE"), true);
});

test("verification documentation includes SMT-LIB examples", () => {
  const docs = readFileSync("src/verification.md", "utf8");
  assert.equal(docs.includes("(> x 0)"), true);
  assert.equal(docs.includes("(= result (+ x y))"), true);
  assert.equal(docs.includes("x > 0"), true);
  assert.equal(docs.includes("bit-vectors"), true);
});

