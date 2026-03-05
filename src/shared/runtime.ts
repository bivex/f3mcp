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

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { contractError, errorCodeSchema, type ErrorCode } from "../contracts/errors.js";

export function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

export function structuredResult<T extends object>(text: string, data: T) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: data,
  };
}

export function normalizeContractError(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as { code?: string; message?: string; retryable?: boolean; details?: unknown };
    const parsed = errorCodeSchema.safeParse(value.code);
    if (parsed.success && typeof value.message === "string") {
      return contractError(parsed.data, value.message, {
        retryable: value.retryable,
        details: value.details,
      });
    }
  }
  return contractError("INTERNAL_ERROR", error instanceof Error ? error.message : "Unknown error");
}

export function errorResult(code: ErrorCode, message: string, details?: unknown, retryable = false) {
  const error = contractError(code, message, { details, retryable });
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error }, null, 2),
      },
    ],
    structuredContent: { error },
    isError: true,
  };
}

export async function withTimeout<T>(work: Promise<T>, timeoutMs = 5_000, code: ErrorCode = "INTERNAL_ERROR"): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(contractError(code, `Timed out after ${timeoutMs}ms`, { retryable: true })), timeoutMs);
    }),
  ]);
}

export async function runStdio(server: McpServer) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

