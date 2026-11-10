# MCPB manifest schema

`mcpb-manifest-v0.3.schema.json` is copied verbatim from
`@anthropic-ai/mcpb@2.1.2/dist/mcpb-manifest-v0.3.schema.json` (MIT;
see `MCPB-LICENSE.txt`). Source: https://github.com/modelcontextprotocol/mcpb.

SHA-256: `3a0ac9d845711a1b9b17dfa5a52f8b60628239d6a86a9db417206a9efc78592d`.

The package archive was reviewed and integrity-checked during the dependency audit.
The schema is data; the old CLI and its Zod 3 dependency are no longer installed.
Our packager explicitly requires `manifest_version: "0.3"`, because JSON Schema
cannot represent the upstream Zod refinement requiring one of the version fields.
It additionally validates this repository's four-file Node bundle layout and ESM
metadata. This is not a replacement CLI for arbitrary MCPB projects or signing.

Review upstream schema changes and update the checksum/provenance together when
changing manifest versions. The schema is never downloaded during builds.
