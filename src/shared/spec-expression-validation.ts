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

import { contractError } from "../contracts/errors.js";
import type { CreateSpecInput, UpdateSpecInput } from "../contracts/specification.js";

const SECTION_LABELS = {
  preconditions: "precondition",
  postconditions: "postcondition",
  invariants: "invariant",
} as const;

const SMT_EXAMPLES = [
  "(> n 0)",
  "(= result (+ x y))",
  "(and (>= i 0) (<= i n))",
  "true",
];

type ClauseSections = Pick<CreateSpecInput, "preconditions" | "postconditions" | "invariants">;
type PartialClauseSections = Pick<UpdateSpecInput, "preconditions" | "postconditions" | "invariants">;

export function assertValidSpecExpressions(input: ClauseSections | PartialClauseSections) {
  for (const section of ["preconditions", "postconditions", "invariants"] as const) {
    const clauses = input[section];
    if (!clauses) continue;

    clauses.forEach((rawClause, index) => {
      const clause = rawClause.trim();
      if (!clause) {
        throw invalidClause(section, index, rawClause, "Clause is empty.");
      }

      if (clause === "true" || clause === "false") return;
      if (looksLikeInfix(clause)) {
        throw invalidClause(section, index, rawClause, "Clause looks like infix syntax. Use SMT-LIB prefix form such as `(> n 0)` instead of `n > 0`.");
      }

      if (looksLikeNaturalLanguage(clause)) {
        throw invalidClause(section, index, rawClause, "Clause looks like natural language. The verifier only accepts SMT-LIB boolean expressions.");
      }

      if (!isWrappedExpression(clause)) {
        throw invalidClause(section, index, rawClause, "Clause must be wrapped as an SMT-LIB expression like `(= result 0)`.");
      }
    });
  }
}

function invalidClause(section: keyof ClauseSections, index: number, clause: string, reason: string) {
  return contractError("VALIDATION_FAILED", `${capitalize(SECTION_LABELS[section])} ${index + 1} is not a valid SMT-LIB boolean expression. ${reason}`, {
    details: {
      section,
      index,
      clause,
      expectedFormat: "SMT-LIB boolean expression string",
      examples: SMT_EXAMPLES,
      hint: "Use prefix SMT-LIB with parentheses, for example `(and (>= n 0) (<= n 46))`.",
    },
  });
}

function looksLikeInfix(clause: string) {
  return /==|!=|&&|\|\|/.test(clause) || /\b[A-Za-z_][A-Za-z0-9_]*\b\s*(<=|>=|<|>)\s*[-A-Za-z0-9_(]/.test(clause);
}

function looksLikeNaturalLanguage(clause: string) {
  return /\b(is|equals|must|should|return|returns|means|fibonacci|string|bytes|characters)\b/i.test(clause) && !clause.startsWith("(");
}

function isWrappedExpression(clause: string) {
  return clause.startsWith("(") && clause.endsWith(")");
}

function capitalize(value: string) {
  return value[0].toUpperCase() + value.slice(1);
}