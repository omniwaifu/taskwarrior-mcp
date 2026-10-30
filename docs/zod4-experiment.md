# Zod 4 compatibility experiment

This branch is an experiment, not an adoption decision. The permanent Dependabot
Zod major-version hold and all audit gates remain unchanged. Do not merge without
reviewing the limits below and explicitly deciding to adopt the migration.

## Dependency boundary

- Direct Zod: 4.6.7. The existing SDK accepts `^3.25 || ^4.0`.
- SDK: compatible patch 1.32.2. Resolving this patch removes its stale nested Zod
  3.25.76 lock entry; the SDK and application resolve Zod 4.6.7 together.
- MCPB: unchanged 2.1.2. It explicitly requires Zod `^3.25.67` and retains its
  own 3.25.76 copy. There is no global Zod override.
- FastMCP and the TypeScript/Node-typings holds are unrelated and unchanged.

The initial direct-Zod-only experiment passed the existing 43 tests, but retained
the SDK's old nested Zod. Existing tests alone were insufficient to establish
schema behavior or dependency isolation.

## Proposed input budgets

| Array | Maximum items | Rationale / tradeoff |
| --- | ---: | --- |
| Tags, addTags, removeTags | 64 each | Generous for interactive tagging; larger retagging sets need multiple calls. Applies to query filters too. |
| Dependencies, addDepends, removeDepends | 128 each | Allows substantial graphs while bounding UUID validation and command arguments. Larger changes need multiple calls. |
| Annotations supplied to add_task | 64 | Bounds validation of the existing field; this does not add annotation-handling functionality. |
| batch_modify_tasks UUIDs | 100 | Bounds sequential mutation work. Larger batches must be split and are not transactional. |
| create_project_tree tasks | 100 | Bounds each request to one root plus at most 100 children. Splitting larger trees needs deliberate dependency coordination. |
| Per-project-task dependency indices | 100 | At most the project task count; a request can still describe up to 10,000 index entries. Existing range checks remain in the handler. |

These are proposed operational budgets, not measured Taskwarrior limits. Empty
arrays retain their previous acceptance. No values are silently truncated.
Returned/exported task arrays remain uncapped so existing data is not dropped.

Zod 4.6.6 introduced collection-size checks before element parsing. The experiment
uses `.max()` on every request-array field, including nested fields. Regression
tests accept each boundary and use throwing element getters to prove that both
synchronous and asynchronous oversized parses reject before reading elements.
An uncapped-array control still accumulates 1,000 invalid-element issues.

## Compatibility and verification

Zod 4's `uuid()` adds version/variant checks that Zod 3 did not enforce. `guid()`
preserves acceptance of legacy UUID-shaped identifiers and still advertises UUID
format. Tests cover legacy identifiers, optional/default behavior and passthrough
Taskwarrior output fields.

The MCP stdio regression lists all 22 tools, checks advertised array `maxItems`,
rejects an oversized add request before any task is created, then adds, queries
and modifies a task in a disposable database. It runs against source and can run
against the built Node bundle:

```sh
bun run check
MCP_TEST_COMMAND=node MCP_TEST_ENTRY=dist/index.js bun test test/mcp-schema.test.ts
bun run mcpb:validate
bun run mcpb:pack
bun run mcpb:info
bun audit
```

The full audit still fails for MCPB's Zod 3. Do not suppress it or force MCPB onto
an unsupported major. Bun 1.3.5's `audit` has no documented production-only flag;
`bun audit --production` must not be treated as production-isolated evidence.
Separately inspecting `npm ls --omit=dev --all --json` shows only Zod 4.6.7 in the
production tree; querying npm's bulk-advisory endpoint for those installed
versions returned no advisories during this experiment.

## Remaining risks and decisions

- Limits apply after JSON decoding. The transport can still allocate an oversized
  serialized message; strings, unknown input fields, total payload size and
  exported data are not bounded by this change.
- Array limits bound per-field validation, not total runtime, subprocess output,
  graph correctness, or concurrent calls. Existing project creation can partially
  complete on failure. These are separate work items.
- Error wording/issue shapes change in Zod 4. Clients should depend on MCP errors
  and schema constraints, not old library-specific wording.
- The bundled SDK retains Zod's v3 compatibility exports even when resolving the
  patched 4.6.7 package. A clean version advisory result is not proof of universal
  resource limits; the new request-schema tests cover the actual registered path.
- Both repositories' MCPB tooling needs an upstream Zod-4-compatible release or a
  separately reviewed packaging migration. ARR's Python runtime is unaffected.
