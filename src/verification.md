# Verification server guide

This server verifies a stored spec version by translating its conditions into SMT-LIB and sending them to `z3`.

On macOS, the server prefers Homebrew's system binary at `/opt/homebrew/bin/z3` and falls back to `/usr/local/bin/z3` or `z3` from `PATH`. You can override the binary path explicitly with `Z3_BINARY=/absolute/path/to/z3`.

The adapter currently invokes Z3 with CLI flags aligned to the installed 4.15.x interface:

- `-in` to read SMT-LIB from stdin;
- `-smt2` to force SMT-LIB v2 parsing;
- `-t:<ms>` for a soft per-query timeout;
- `-nw` to suppress warning noise in tool output;
- `-model` only on the counterexample pass.

Verification MCP surface highlights:

- `start_verification` runs a spec version through Z3;
- `get_verification_status` returns the last stored job snapshot;
- `wait_for_verification` polls until terminal status or timeout;
- `explain_verification_failure` gives a human-readable verdict;
- `get_counterexample_excerpt` returns the first few lines of a stored model.

If Z3 launches successfully but rejects the submitted expressions, the tool returns `VALIDATION_FAILED` with the solver's message. A common cause is using infix syntax like `x > 0` instead of SMT-LIB prefix syntax like `(> x 0)`.

## Supported input style

Each `precondition`, `postcondition`, and `invariant` must be a valid SMT-LIB boolean expression string.

Rules for the current adapter:

- use prefix SMT-LIB syntax, not infix syntax;
- free identifiers are auto-declared as `Int`;
- arithmetic is currently integer-oriented;
- combine clauses with `and`, `or`, and `not`;
- every expression must be wrapped in parentheses.

## Valid examples

### Preconditions

- `(> x 0)`
- `(>= n 1)`
- `(and (>= x 0) (<= x limit))`
- `(= len (+ left right))`

### Postconditions

- `(> x 0)`
- `(= result (+ x y))`
- `(<= i n)`
- `(and (>= sum 0) (<= sum max_sum))`

### Invariants

- `(<= i n)`
- `(>= acc 0)`
- `(and (>= i 0) (<= i n))`
- `(= remaining (- n i))`

## Invalid examples

These are not valid for the current adapter:

- `x > 0`  ← infix syntax
- `result == x + y`  ← not SMT-LIB
- `x && y`  ← not SMT-LIB
- `bvugt x y`  ← bit-vector operators are not supported by the current adapter contract

## Example stored spec

```json
{
  "sum_positive": [
    {
      "functionName": "sum_positive",
      "version": 1,
      "preconditions": ["(and (> x 0) (> y 0))"],
      "postconditions": ["(> (+ x y) 0)"],
      "invariants": ["(>= x 1)", "(>= y 1)"],
      "updatedAt": "2026-03-05T00:00:00.000Z"
    }
  ]
}
```

## How the server reasons

For a selected spec version, the verification adapter:

1. checks that assumptions plus postconditions are jointly satisfiable;
2. proves the postconditions by asserting assumptions plus `not(postconditions)`;
3. reports:
   - `passed` when `z3` returns `unsat` for the negated proof obligation;
   - `failed` with inconsistency details when the spec contradicts itself;
   - `failed` with a counterexample when `z3` returns `sat`.

## Best practices

- keep conditions small and explicit;
- prefer multiple simple clauses over one giant expression;
- use stable variable names like `x`, `y`, `result`, `i`, `n`, `acc`;
- if you need richer theories like arrays or bit-vectors, extend the proof adapter first.

