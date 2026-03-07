/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 22:37
 * Last Updated: 2026-03-05 22:37
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

import { readJsonFile, writeJsonFile } from "../shared/file-store.js";
import type { CreateSpecInput, Spec, UpdateSpecInput } from "../contracts/specification.js";
import type { SpecificationRepository } from "../application/specification-service.js";

type SpecStore = Record<string, Spec[]>;

export class FileSpecificationRepository implements SpecificationRepository {
  constructor(private readonly filePath: string) {}

  async create(input: CreateSpecInput): Promise<Spec> {
    const store = await this.readStore();
    const version = (store[input.functionName]?.length ?? 0) + 1;
    const spec: Spec = normalizeSpec({ ...input, version, updatedAt: new Date().toISOString() });
    store[input.functionName] = [...(store[input.functionName] ?? []), spec];
    await writeJsonFile(this.filePath, store);
    return spec;
  }

  async update(input: UpdateSpecInput) {
    const current = await this.latest(input.functionName);
    if (!current) return null;
    return this.create({
      functionName: current.functionName,
      declarations: input.declarations ?? current.declarations,
      preconditions: input.preconditions ?? current.preconditions,
      postconditions: input.postconditions ?? current.postconditions,
      invariants: input.invariants ?? current.invariants,
      verificationMode: input.verificationMode ?? current.verificationMode,
    });
  }

  async latest(functionName: string) {
    return (await this.readStore())[functionName]?.at(-1) ?? null;
  }

  async getVersion(functionName: string, version: number) {
    return (await this.readStore())[functionName]?.find((spec) => spec.version === version) ?? null;
  }

  async versions(functionName: string) {
    return (await this.readStore())[functionName] ?? [];
  }

  async listLatest() {
    return Object.values(await this.readStore()).map((versions) => versions.at(-1)).filter(Boolean) as Spec[];
  }

  private readStore() {
    return readJsonFile<Record<string, Array<Partial<Spec>>>>(this.filePath, {}).then((store) => Object.fromEntries(
      Object.entries(store).map(([functionName, versions]) => [functionName, versions.map((spec) => normalizeSpec(spec))]),
    ));
  }
}

function normalizeSpec(spec: Partial<Spec>): Spec {
  return {
    functionName: spec.functionName ?? "",
    version: spec.version ?? 0,
    declarations: Array.isArray(spec.declarations) ? spec.declarations : [],
    preconditions: Array.isArray(spec.preconditions) ? spec.preconditions : [],
    postconditions: Array.isArray(spec.postconditions) ? spec.postconditions : [],
    invariants: Array.isArray(spec.invariants) ? spec.invariants : [],
    verificationMode: spec.verificationMode ?? "prove",
    updatedAt: spec.updatedAt ?? new Date(0).toISOString(),
  };
}

