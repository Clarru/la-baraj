# Provider/client compatibility check

31 October 2026. `prompt` no longer assumes a built-in `image_gen` tool. It prepares a client-neutral text-plus-three-reference-image request, leaves provider/model unspecified and explains how to record the actual backend or unknown identity. It does not discover/configure a service or call one.

A real no-generator run reused the checked workbench recipe and existing timber/iron maps. No `concept.png` existed, and no image provider, image model or remote generation call was used. Headless Blender build, all exported views/diagnostics, check, visual review, package and generated report completed: 604 triangles, 108,840 bytes, 12 passing joint probes. See [results.json](results.json). Source, renders and package are retained locally under ignored `.forge/provider-portability/`.

The root `CLAUDE.md` contains only `@AGENTS.md`, the import documented by Anthropic for sharing canonical instructions, including sessions without native AGENTS support. The locally installed CLI reports Claude Code 2.1.181. This compatibility check did not invoke a Claude model, inspect anyone's credentials or configure an MCP/API provider, so it is not an end-to-end Claude-agent test. The collaborator's actual provider/model remains unknown.

- [Claude image capability](https://support.claude.com/en/articles/9002504-can-claude-produce-images)
- [Claude Code shared instruction import](https://code.claude.com/docs/en/memory#share-one-file-with-other-coding-tools)
- [Claude Code MCP integrations](https://code.claude.com/docs/en/mcp)

The 39 offline tool tests include provider-neutral request/provenance behavior and existing generation-free fixtures. The thin instruction import and documentation links were checked directly; the no-generator path was also exercised in actual Blender rather than inferred from synthetic tests. No claim of equivalent concept quality across image models is made.
