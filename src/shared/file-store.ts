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

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writeJsonFile<T>(path: string, value: T) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function updateJsonFile<T>(path: string, fallback: T, updater: (current: T) => T | Promise<T>) {
  const current = await readJsonFile(path, fallback);
  const next = await updater(current);
  await writeJsonFile(path, next);
  return next;
}

