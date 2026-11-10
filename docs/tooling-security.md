# Tooling advisory remediation

The full dependency audit is clean as of November 9, 2026. No advisories are
ignored and the CI audit job still checks the entire dependency graph.

## MCPB packaging

The latest published `@anthropic-ai/mcpb` was 2.1.2 at review time. It requires
Zod 3, affected by [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
Forcing its Zod schema implementation onto Zod 4 would be a separate migration.
Instead, the repository now packages its four known files directly with fflate
0.8.3 and validates the official manifest 0.3 JSON schema with Ajv 6.15.0. Both
were already in the locked development graph; they are now explicit dependencies.
The upstream schema and MIT license are in `schemas/`, with provenance/checksum.

The `mcpb:validate`, `mcpb:pack`, and `mcpb:info` commands and `.mcpb` output path
are unchanged. The removed CLI's signing, prompting, arbitrary project packing,
and installation features were not used here and are not implemented locally.
ZIP entry names, content, and executable permission bits were compared against
the previous CLI output. The old CLI accepted the manifest and read the new
archive. Extracted archives are also smoke-tested as an MCP server in CI on
Node 22 and 24. This does not substitute for testing the Desktop installation UI.

The local packager rejects extra/missing files, symlinks, invalid launch metadata,
version mismatches, and oversized inputs. Archive inspection validates names and
uncompressed size before decompression and never extracts files to disk. Tests
cover traversal entries and compressed oversized payloads. Fixed ZIP timestamps
and entry ordering make repeated builds from identical files reproducible.
Removing the CLI also removes its Inquirer/external-editor/tmp and node-forge
chains, so their obsolete overrides and temporary-editor tests were removed.

## minimatch 11 compatibility exception

[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
is fixed in minimatch 11.0.1. Current ESLint and TypeScript ESLint ranges still
request major 10. The exact override is intentional, rather than an unattended
major update. Major 11 removes `makeRe` and `AST` and changes internal matcher
representation. Source review found the installed consumers use `Minimatch`,
`match`, `pattern`, and the `minimatch` function, not the removed APIs.

Before/after ESLint runs selected exactly the same 75 files during migration.
Regression tests additionally check brace/globstar selection, global ignores,
actual type-aware rule execution, and a pathological globstar-parent pattern
with an explicit expansion budget. The whole source tree passes lint. This
establishes compatibility for these consumers, not every minimatch 10 consumer.
Remove the override when upstream ranges accept a fixed version; recheck these
consumer paths when upgrading ESLint or TypeScript ESLint.

## Package review

Reviewed registry metadata, dependency lists, scripts, tarball SHA-512 integrity,
and matching-code changes for minimatch 11.0.1 and the resolved new transitive
`@isaacs/nonrecursive-glob-match` 1.1.0. The new transitive package has no runtime
dependencies or install hooks. Ajv and fflate archives were integrity-checked too.
No install/preinstall/postinstall hooks were present in these packages. Lockfile
resolution was reviewed before `bun install --frozen-lockfile --ignore-scripts`.
Only minimatch and its new transitive package required installation; all other
retained versions stayed unchanged. Integrity checks establish artifact identity,
not a guarantee of absence of malicious behavior.
