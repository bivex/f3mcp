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
import { assertValidSpecExpressions } from "../shared/spec-expression-validation.js";

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

