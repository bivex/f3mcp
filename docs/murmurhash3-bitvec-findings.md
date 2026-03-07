# MurmurHash3 BitVec Verification Findings

## Scope

This note summarizes the MurmurHash3-related formal verification work performed through the MCP specification and verification servers after extending them to support explicit SMT-LIB declarations and satisfiability search.

## MCP stack changes relevant to this work

The verification stack was updated to support:

- explicit `declarations` in stored specs;
- `verificationMode: "prove" | "find-model"`;
- correct handling of `(_ BitVec 32)` declarations;
- model-returning workflows for satisfiable search problems;
- backward-compatible normalization of older stored specs.

These changes were required because the original adapter inferred undeclared symbols as `Int`, which caused sort errors for bit-vector formulas.

## Hash model used

The analyzed model represents a single 4-byte MurmurHash3-style block over 32-bit bit-vectors and includes:

- `c1 = #xcc9e2d51`
- `c2 = #x1b873593`
- block mixing with `bvmul`
- rotation with `(_ rotate_left 15)` and `(_ rotate_left 13)`
- `h * 5 + 0xe6546b64`
- finalization with xor-shifts and multipliers
  - `#x85ebca6b`
  - `#xc2b2ae35`

The search problem was encoded as:

- `x != y`
- both inputs are 32-bit bit-vectors;
- their modeled MurmurHash3 outputs must match under the selected equality condition.

## Full 32-bit collision search

Function/spec used:

- `murmurhash3_single_block_collision`
- version `v2`
- mode `find-model`

Result:

- the verification server returned `SOLVER_TIMEOUT`;
- the timeout was the current server-side Z3 limit of `3000ms`.

Interpretation:

- no 32-bit collision witness was produced in the current MCP run;
- this does **not** prove absence of collisions under the exact model;
- it only shows that the configured verification path did not finish in time.

## Truncated 16-bit collision search

To obtain a concrete witness through the MCP workflow, a second search required equality only on the low 16 bits of the final 32-bit hash.

Function/spec used:

- `murmurhash3_low16_collision`
- version `v1`
- mode `find-model`

Result:

- verification status: `passed`
- solver status: `sat`
- evidence kind: `model`

Model excerpt yielded the following inputs:

- `x = 0xb07c48f2`
- `y = 0xec69fc57`

Modeled outputs:

- `hx = 0x971c6219`
- `hy = 0xe8d46219`

Observed relation:

- `x != y`
- `hx != hy`
- low 16 bits match: `0x6219`

## Main findings

1. The MCP verification stack can now express and solve BitVec-based search problems.
2. The original sort mismatch issue was due to implicit `Int` declarations, not invalid SMT-LIB syntax.
3. The exact single-block 32-bit collision query is currently too expensive for the server's default `3s` timeout.
4. A truncated-output collision witness was successfully obtained through MCP.

## Practical next steps

If full 32-bit witness search is required, the most useful next options are:

1. raise the verification timeout in the server;
2. reduce the formula size by introducing shared helper terms or staged constraints;
3. search for weaker collision forms first, then refine.

## Bottom line

The MCP workflow is now capable of formal BitVec MurmurHash3-style analysis. In the current configuration it successfully found a 16-bit truncated collision witness, while the full 32-bit single-block collision query timed out before producing a definitive result.