import { resolve } from "node:path";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toolOutputSchema } from "./contracts/errors.js";
import { specCreateInputSchema, specResultSchema, specUpdateInputSchema, specValidationSchema, specVersionListSchema } from "./contracts/specification.js";
import { FileSpecificationRepository } from "./infrastructure/file-specification-repository.js";
import { SpecificationService } from "./application/specification-service.js";
import { errorResult, normalizeContractError, runStdio, structuredResult, withTimeout } from "./shared/runtime.js";

const service = new SpecificationService(new FileSpecificationRepository(resolve(process.cwd(), "data/specifications.json")));
const server = new McpServer({ name: "arm-specification-server", version: "1.2.0" });

server.registerTool("create_spec", { description: "Create a new formal specification version for a function.", inputSchema: specCreateInputSchema, outputSchema: toolOutputSchema(specResultSchema) }, async (args) => {
  try {
    const spec = await withTimeout(service.create(args), 5_000, "CREATE_SPEC_FAILED");
    return structuredResult(`Created spec v${spec.version} for ${spec.functionName}`, { spec });
  } catch (error) {
    const contract = normalizeContractError(error);
    return errorResult(contract.code, contract.message, contract.details, contract.retryable);
  }
});

server.registerTool("update_spec", { description: "Create a new specification version from the latest version.", inputSchema: specUpdateInputSchema, outputSchema: toolOutputSchema(specResultSchema) }, async (args) => {
  try {
    const spec = await service.update(args);
    return spec ? structuredResult(`Updated ${args.functionName} to v${spec.version}`, { spec }) : errorResult("SPEC_NOT_FOUND", `No spec found for ${args.functionName}`);
  } catch (error) {
    const contract = normalizeContractError(error);
    return errorResult(contract.code, contract.message, contract.details, contract.retryable);
  }
});

server.registerTool("validate_spec_consistency", { description: "Validate that the latest spec has all expected sections.", inputSchema: z.object({ functionName: z.string() }), outputSchema: toolOutputSchema(specValidationSchema) }, async ({ functionName }) => {
  const result = await service.validate(functionName);
  if (!result) return errorResult("SPEC_NOT_FOUND", `No spec found for ${functionName}`);
  return structuredResult(result.issues.length ? `Found ${result.issues.length} issue(s)` : "Spec is consistent", result);
});

server.registerTool("list_spec_versions", { description: "List all known versions for a function.", inputSchema: z.object({ functionName: z.string() }), outputSchema: toolOutputSchema(specVersionListSchema) }, async ({ functionName }) => structuredResult(`Listed versions for ${functionName}`, { functionName, versions: await service.versions(functionName) }));

server.registerResource("latest-spec", new ResourceTemplate("spec://functions/{functionName}/latest", {
  list: async () => ({ resources: (await service.listLatest()).map((spec) => ({ uri: `spec://functions/${spec.functionName}/latest`, name: `${spec.functionName} latest spec` })) }),
}), { title: "Latest specification", description: "Latest specification per function", mimeType: "application/json" }, async (uri, { functionName }) => ({ contents: [{ uri: uri.href, text: JSON.stringify(await service.latest(String(functionName)), null, 2) }] }));

server.registerPrompt("review_spec", { description: "Review the latest specification for missing or weak conditions.", argsSchema: { functionName: z.string() } }, ({ functionName }) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text: `Review the latest formal spec for ${functionName}. Check preconditions, postconditions, loop invariants, and ambiguity.` } }] }));

runStdio(server).catch((error) => {
  console.error("specification server failed:", error);
  process.exit(1);
});

