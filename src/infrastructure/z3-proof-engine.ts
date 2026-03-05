/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 23:27
 * Last Updated: 2026-03-05 23:27
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

import { spawn } from "node:child_process";
import type { Spec } from "../contracts/specification.js";
import { contractError } from "../contracts/errors.js";
import type { ProofEngine } from "../application/verification-service.js";

const RESERVED = new Set(["and", "or", "not", "=>", "=", "<", ">", "<=", ">=", "+", "-", "*", "div", "mod", "true", "false"]);

export class Z3ProofEngine implements ProofEngine {
  constructor(private readonly binaryPath = "z3", private readonly timeoutMs = 3_000) {}

  async verify(spec: Spec) {
    if (!spec.postconditions.length) {
      return { engine: "z3", solverStatus: "unknown" as const, status: "failed" as const, failureReason: "No postconditions were provided for verification." };
    }

    const declarations = this.inferDeclarations([...spec.preconditions, ...spec.invariants, ...spec.postconditions]);
    const assumptions = [...spec.preconditions, ...spec.invariants];
    const consistency = await this.runZ3(this.buildScript(declarations, [...assumptions, ...spec.postconditions], false));
    if (consistency.status === "unsat") {
      return { engine: "z3", solverStatus: consistency.status, status: "failed" as const, failureReason: "The specification is internally inconsistent." };
    }
    if (consistency.status === "unknown") {
      throw contractError("SOLVER_UNKNOWN", "Z3 returned unknown for the specification consistency check.", { retryable: true, details: consistency.output });
    }

    const negatedPost = spec.postconditions.length === 1 ? `(not ${spec.postconditions[0]})` : `(not (and ${spec.postconditions.join(" ")}))`;
    const proof = await this.runZ3(this.buildScript(declarations, [...assumptions, negatedPost], false));
    if (proof.status === "unsat") {
      return { engine: "z3", solverStatus: proof.status, status: "passed" as const };
    }
    if (proof.status === "sat") {
      const model = await this.runZ3(this.buildScript(declarations, [...assumptions, negatedPost], true));
      return { engine: "z3", solverStatus: proof.status, status: "failed" as const, failureReason: "Z3 found a counterexample that violates the postconditions.", counterexample: model.model };
    }
    throw contractError("SOLVER_UNKNOWN", "Z3 returned unknown for the proof obligation.", { retryable: true, details: proof.output });
  }

  private inferDeclarations(expressions: string[]) {
    const symbols = new Set<string>();
    for (const expr of expressions) {
      for (const match of expr.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
        const symbol = match[0];
        if (!RESERVED.has(symbol)) symbols.add(symbol);
      }
    }
    return [...symbols].sort().map((symbol) => `(declare-const ${symbol} Int)`);
  }

  private buildScript(declarations: string[], assertions: string[], includeModel: boolean) {
    return [...declarations, ...assertions.map((expr) => `(assert ${expr})`), "(check-sat)", includeModel ? "(get-model)" : "", "(exit)"].filter(Boolean).join("\n");
  }

  private runZ3(script: string): Promise<{ status: "sat" | "unsat" | "unknown"; output: string; model?: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, ["-in", "-smt2"]);
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(contractError("SOLVER_TIMEOUT", `Z3 timed out after ${this.timeoutMs}ms`, { retryable: true })); }, this.timeoutMs);
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("error", () => reject(contractError("SOLVER_UNAVAILABLE", `Unable to execute solver binary '${this.binaryPath}'.`, { retryable: true })));
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          const stdoutText = stdout.trim();
          const stderrText = stderr.trim();
          const message = [stderrText, stdoutText].find(Boolean) || `Z3 rejected the generated SMT-LIB script with exit code ${code}.`;
          return reject(contractError("VALIDATION_FAILED", message, {
            details: {
              exitCode: code,
              binaryPath: this.binaryPath,
              stdout: stdoutText || undefined,
              stderr: stderrText || undefined,
            },
          }));
        }
        const [firstLine, ...rest] = stdout.trim().split(/\r?\n/);
        resolve({ status: (firstLine as "sat" | "unsat" | "unknown") ?? "unknown", output: stdout.trim(), model: rest.join("\n").trim() || undefined });
      });
      child.stdin.end(script);
    });
  }
}

