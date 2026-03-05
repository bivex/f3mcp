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

import type { CreateSpecInput, Spec, UpdateSpecInput } from "../contracts/specification.js";
import { contractError } from "../contracts/errors.js";
import { assertValidSpecExpressions, validateSpecClause, type ClauseSection } from "../shared/spec-expression-validation.js";

export interface SpecificationRepository {
  create(input: CreateSpecInput): Promise<Spec>;
  update(input: UpdateSpecInput): Promise<Spec | null>;
  latest(functionName: string): Promise<Spec | null>;
  getVersion(functionName: string, version: number): Promise<Spec | null>;
  versions(functionName: string): Promise<Spec[]>;
  listLatest(): Promise<Spec[]>;
}

export class SpecificationService {
  constructor(private readonly repo: SpecificationRepository) {}

  async create(input: CreateSpecInput) {
    assertValidSpecExpressions(input);
    return this.repo.create(input);
  }

  async update(input: UpdateSpecInput) {
    assertValidSpecExpressions(input);
    return this.repo.update(input);
  }

  async validate(functionName: string) {
    const spec = await this.repo.latest(functionName);
    if (!spec) return null;
    const issues = [
      !spec.preconditions.length && "Missing preconditions",
      !spec.postconditions.length && "Missing postconditions",
      !spec.invariants.length && "Missing invariants",
    ].filter(Boolean) as string[];
    return { functionName, valid: issues.length === 0, issues };
  }

  validateClause(clause: string, section: ClauseSection = "postconditions") {
    return validateSpecClause(clause, section);
  }

  async diff(functionName: string, fromVersion: number, toVersion: number) {
    const [fromSpec, toSpec] = await Promise.all([
      this.repo.getVersion(functionName, fromVersion),
      this.repo.getVersion(functionName, toVersion),
    ]);

    if (!fromSpec) {
      throw contractError("SPEC_VERSION_NOT_FOUND", `No spec version ${fromVersion} found for ${functionName}`);
    }
    if (!toSpec) {
      throw contractError("SPEC_VERSION_NOT_FOUND", `No spec version ${toVersion} found for ${functionName}`);
    }

    const diff = {
      preconditions: diffClauses(fromSpec.preconditions, toSpec.preconditions),
      postconditions: diffClauses(fromSpec.postconditions, toSpec.postconditions),
      invariants: diffClauses(fromSpec.invariants, toSpec.invariants),
    };
    const changedSections = (Object.entries(diff)
      .filter(([, sectionDiff]) => sectionDiff.added.length || sectionDiff.removed.length)
      .map(([section]) => section)) as ClauseSection[];

    return {
      functionName,
      fromVersion,
      toVersion,
      changed: changedSections.length > 0,
      changedSections,
      diff,
    };
  }

  latest(functionName: string) {
    return this.repo.latest(functionName);
  }

  getVersion(functionName: string, version: number) {
    return this.repo.getVersion(functionName, version);
  }

  versions(functionName: string) {
    return this.repo.versions(functionName);
  }

  listLatest() {
    return this.repo.listLatest();
  }
}

function diffClauses(fromClauses: string[], toClauses: string[]) {
  const toSet = new Set(toClauses);
  const fromSet = new Set(fromClauses);
  return {
    added: toClauses.filter((clause) => !fromSet.has(clause)),
    removed: fromClauses.filter((clause) => !toSet.has(clause)),
    unchanged: toClauses.filter((clause) => fromSet.has(clause)),
  };
}

