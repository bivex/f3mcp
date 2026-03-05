/**
 * Copyright (c) 2026 Bivex
 *
 * Author: Bivex
 * Available for contact via email: support@b-b.top
 * For up-to-date contact information:
 * https://github.com/bivex
 *
 * Created: 2026-03-05 22:39
 * Last Updated: 2026-03-05 22:39
 *
 * Licensed under the MIT License.
 * Commercial licensing available upon request.
 */

import { resolve } from "node:path";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { functionAnalysisSchema, instructionSchema, loopCandidateSchema, registerEffectsSchema } from "./contracts/assembly.js";
import { toolOutputSchema } from "./contracts/errors.js";
import { AssemblyService } from "./application/assembly-service.js";
import { FileInstructionCatalog } from "./infrastructure/file-instruction-catalog.js";
import { runStdio, structuredResult } from "./shared/runtime.js";

const service = new AssemblyService(new FileInstructionCatalog(resolve(process.cwd(), "data/instruction-docs.json")));
const server = new McpServer({ name: "arm-assembly-analysis-server", version: "1.2.0" });

server.registerTool("analyze_function", {
  description: "Analyze an ARM assembly function body.",
  inputSchema: z.object({ source: z.string() }),
  outputSchema: toolOutputSchema(z.object({ analysis: functionAnalysisSchema })),
}, async ({ source }) => structuredResult("Analyzed function", { analysis: service.analyzeFunction(source) }));

server.registerTool("check_instruction_semantics", {
  description: "Explain a single ARM opcode.",
  inputSchema: z.object({ opcode: z.string() }),
  outputSchema: toolOutputSchema(z.object({ instruction: instructionSchema })),
}, async ({ opcode }) => structuredResult(`Checked ${opcode}`, { instruction: await service.instruction(opcode) }));

server.registerTool("summarize_register_effects", {
  description: "Summarize registers and memory effects touched by the source.",
  inputSchema: z.object({ source: z.string() }),
  outputSchema: toolOutputSchema(z.object({ effects: registerEffectsSchema })),
}, async ({ source }) => structuredResult("Summarized register effects", { effects: service.summarizeRegisterEffects(source) }));

server.registerTool("extract_loop_candidates", {
  description: "Find likely loops or back-edges in the source.",
  inputSchema: z.object({ source: z.string() }),
  outputSchema: toolOutputSchema(z.object({ candidates: z.array(loopCandidateSchema) })),
}, async ({ source }) => structuredResult("Extracted loop candidates", { candidates: service.extractLoopCandidates(source) }));

server.registerResource("instruction-doc", new ResourceTemplate("asm://instructions/{opcode}", {
  list: async () => ({ resources: (await service.listInstructions()).map((opcode) => ({ uri: `asm://instructions/${opcode}`, name: opcode })) }),
}), {
  title: "Instruction reference",
  description: "Short instruction semantics summary",
  mimeType: "application/json",
}, async (uri, { opcode }) => ({ contents: [{ uri: uri.href, text: JSON.stringify(await service.instruction(String(opcode)), null, 2) }] }));

server.registerPrompt("explain_control_flow", {
  description: "Explain control flow for a function body.",
  argsSchema: { source: z.string() },
}, ({ source }) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text: `Explain the control flow of this ARM assembly and highlight loops, exits, register dependencies, and memory effects:\n\n${source}` } }] }));

runStdio(server).catch((error) => {
  console.error("assembly server failed:", error);
  process.exit(1);
});

