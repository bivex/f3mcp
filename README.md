# ARM Verification MCP Servers

This repository contains four MCP stdio servers for ARM specification, verification, assembly analysis, and performance checks.

Recent additions include:

- `validate_smt_clause` to check a single SMT-LIB clause before storing it;
- `diff_spec_versions` to compare two stored spec revisions;
- `wait_for_verification` to poll a verification job to completion;
- `get_counterexample_excerpt` to retrieve the first lines of a stored model.

## Who these MCP servers are for

These servers are most useful for:

- **LLM agents and MCP hosts** that need structured ARM-oriented tools instead of free-form reasoning alone.
- **Firmware and low-level engineers** who want fast checks for ARM control flow, register effects, loop candidates, and instruction semantics.
- **Formal methods and verification workflows** that need a lightweight path from stored specifications to Z3-backed proof attempts.
- **Performance and constant-time review workflows** that need quick timing-budget and secret-dependent-control-flow checks.
- **Security reviewers** who want a repeatable MCP surface for examining constant-time assumptions and verification failures.
- **Tooling and platform teams** building internal copilots, CI assistants, or analysis bots around ARM assembly and formal specs.

Typical use cases include:

- creating and versioning formal specs for functions such as `fibonacci` or `strlen_arm`;
- starting and inspecting verification jobs over stored spec versions;
- analyzing small ARM snippets during reverse engineering or code review;
- checking whether a function stays within a cycle budget;
- comparing baseline and candidate performance results;
- giving MCP clients a deterministic, tool-backed workflow for ARM reasoning.

## Build

From the repository root:

- `bun install`
- `bun run build`
- `npm run build`

The compiled server entrypoints are written to `build/`.

## Universal `mcpServers` config

Use this as a portable baseline for MCP hosts that support `mcpServers`, `command`, `args`, and `cwd`.

On Windows, keep the same structure but replace the example paths with your local absolute paths, for example `C:\\augment\\f3mcp\\build\\specification.js` and `C:\\augment\\f3mcp`.

```json
{
  "mcpServers": {
    "arm-specification": {
      "command": "node",
      "args": ["/Volumes/External/Code/f3mcp/build/specification.js"],
      "cwd": "/Volumes/External/Code/f3mcp"
    },
    "arm-verification": {
      "command": "node",
      "args": ["/Volumes/External/Code/f3mcp/build/verification.js"],
      "cwd": "/Volumes/External/Code/f3mcp"
    },
    "arm-assembly": {
      "command": "node",
      "args": ["/Volumes/External/Code/f3mcp/build/assembly.js"],
      "cwd": "/Volumes/External/Code/f3mcp"
    },
    "arm-performance": {
      "command": "node",
      "args": ["/Volumes/External/Code/f3mcp/build/performance.js"],
      "cwd": "/Volumes/External/Code/f3mcp"
    }
  }
}
```

## Notes

- The servers are stdio-based and should be launched by your MCP host.
- `cwd` matters because the servers read and write `data/*.json` relative to the repo root.
- If your MCP host ignores `cwd`, the servers may not find the `data/` directory correctly.

## Test commands

From the repository root:

- `npm test`
- `node --test`
- `node --test test/strlen-arm-verification.test.mjs`

The test suite includes MCP stdio end-to-end coverage for all four servers, verification unit coverage, and a dedicated `strlen_arm` scenario suite.

## Cold-start prompts

Use these prompts in your MCP host right after connecting the servers.

The best pattern for cold start is to separate prompts into two modes:

- **strict smoke prompts**: verify wiring, tool routing, and basic payload quality;
- **exploratory prompts**: allow a fuller explanation once the wiring is confirmed.

For the strict prompts below, prefer these rules:

- ask the host to use only MCP tool output when possible;
- ask it to list the tools it actually called;
- ask it not to make assumptions unless it explicitly labels them as assumptions;
- ask for short, structured answers so thin MCP clients remain readable.

### 1. One-shot strict smoke test

Ask the host:

- `Smoke test all connected ARM MCP servers. List the available tools for specification, verification, assembly, and performance. Then run one safe example call per server. Return only: (1) tools discovered, (2) tools actually used, (3) pass/fail per server, (4) short notes on any missing structured output.`

### 2. Specification server strict smoke test

Ask the host:

- `Use only the specification MCP tools. Create a formal specification for sum_positive with preconditions ['(> x 0)', '(> y 0)'], postconditions ['(> (+ x y) 0)'], and invariants ['(>= x 1)', '(>= y 1)']. Then validate the spec and list all known versions. Return only: tools used, created version, validation result, and version list.`

### 3. Verification server strict smoke test

Ask the host:

- `Use only the verification MCP tools. Start verification for function 'sum_positive' spec version 1. Then fetch the verification status and explanation. Return only: tools used, job ID, function name, spec version, job status, solver status, whether a counterexample exists, and the final one-line verdict.`

### 4. Assembly server strict smoke test

Ask the host:

- `Use only ARM assembly MCP tools for this task. Do not rely on prior knowledge unless the tool output is missing something, and if so say that explicitly. Analyze this snippet: 'loop:\nLDR x1, [x2]\nADD x0, x0, x1\nSTR x0, [x3]\nCBNZ x0, loop\nRET'. Return only: (1) tools used, (2) control-flow summary, (3) registers read/written, (4) memory read/write effects, (5) likely loops/back-edges, (6) one-sentence explanation of ADD.`

### 5. Performance server strict smoke test

Ask the host:

- `Use only ARM performance MCP tools for this task. Run checks for function 'fast_fn' with observedCycles=90, maxCycles=100, baselineCycles=100, candidateCycles=95, branchOnSecret=false, memoryOnSecret=false. Return only: (1) tools used, (2) timing budget pass/fail, (3) cycle delta and percentage, (4) constant-time pass/fail, (5) final one-line verdict.`

### 6. Fibonacci strict cold-start prompt

Ask the host:

- `Use only the specification and verification MCP tools. Do not include process narration. Create a formal SMT-LIB specification for fibonacci with preconditions ['(>= n 0)', '(<= n 10)'], a piecewise postcondition defining result for n from 0 through 10, and invariants ['(>= result 0)', '(<= result 55)']. Validate the spec, list versions, start verification for the newest version, then return only: tools used, created version, validation result, version list, job ID, job status, solver status, failure reason if any, and the first available counterexample details if present.`

If the host first tries natural language or infix syntax such as `n >= 0`, the server should return `VALIDATION_FAILED` with an SMT-LIB formatting hint.

### 7. `strlen_arm` strict cold-start prompt

Ask the host:

- `Use only the specification and verification MCP tools. Create or inspect the stored specification for strlen_arm, then verify practical scenarios for empty string, one-character ASCII, embedded NUL, UTF-8 byte counting, offset 0/1/2/3 alignment, and a 4096-byte input. Return only: tools used, spec versions touched, scenario-to-version mapping, pass/fail per scenario, and final summary.`

### 8. Error-path smoke prompt

Ask the host:

- `Deliberately try to create a bad specification for fibonacci using natural language clauses like 'n must be non-negative' and 'result is fibonacci of n'. Show the returned validation error, then rewrite the clauses into valid SMT-LIB and retry. Return only: tools used, original validation error, corrected clauses, and retry result.`

### 9. Exploratory assembly prompt

Ask the host:

- `Analyze this ARM snippet: 'loop:\nLDR x1, [x2]\nADD x0, x0, x1\nSTR x0, [x3]\nCBNZ x0, loop\nRET'. After using the ARM assembly tools, give a concise explanation of behavior, likely loop semantics, register/memory effects, and a short pseudocode summary.`

### 10. Exploratory performance prompt

Ask the host:

- `Check timing constraints for function 'fast_fn' with observedCycles 90 and maxCycles 100. Then compare baselineCycles 100 vs candidateCycles 95 and verify constant-time assumptions with branchOnSecret=false and memoryOnSecret=false. After calling the performance tools, summarize the practical meaning of the results.`

These prompts are especially useful for MCP clients that do not automatically render `structuredContent`, because the servers now include more human-readable status and explanation text in normal tool responses.

## Individual server entrypoints

- `node build/specification.js`
- `node build/verification.js`
- `node build/assembly.js`
- `node build/performance.js`

## Verification input guide

For valid SMT-LIB examples used by the verification server, see:

- `src/verification.md`

## Verification notes

- The verification server prefers `Z3_BINARY` when set. On Windows it also checks common `PATH` entries for `z3.exe`, then falls back to `z3.exe`/`z3`. On macOS it also checks `/opt/homebrew/bin/z3` and `/usr/local/bin/z3`.
- You can override the solver path explicitly with `Z3_BINARY=/absolute/path/to/z3` on POSIX shells, or set `Z3_BINARY=C:\\path\\to\\z3.exe` in Windows before launching the server.
- `SOLVER_UNAVAILABLE` means the server could not start the solver process.
- `VALIDATION_FAILED` means Z3 started, but rejected the submitted SMT-LIB input.

## `strlen_arm` verification scenarios

The repository now includes a dedicated verification suite for practical `strlen_arm` cases in:

- `test/strlen-arm-verification.test.mjs`

It covers:

- empty string
- one-character ASCII string
- short ASCII string
- strings with spaces and punctuation
- early `NUL` termination inside a larger buffer
- UTF-8 byte-count behavior
- start-pointer offsets `0`, `1`, `2`, and `3`
- a 4096-byte input
- a terminator in the final byte of the allocated buffer

