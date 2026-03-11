# ADR-SL-011: External AI-Assisted Authoring Client and Invocation Strategy

## Status

Proposed

## Context

The central implementation question behind the Sugarlang dream workflow is:

how does AI authoring actually get invoked?

The obvious answers all create problems:

- put raw API calls in the browser editor
- keep a long-lived in-app chat conversation
- invent a custom plugin for Codex
- let every assistant surface improvise its own prompt logic

The user has already been clear about what they do not want:

- no manual context babysitting
- no second authoring system hidden inside a chat pane
- no unnecessary CLI authoring path
- no tight coupling to one assistant product

At the same time, the architecture must remain compatible with:

- external workspace assistants such as Codex
- future integrated local-model generation
- future commercial API generation
- future self-hosted inference

## Decision

Sugarlang will use an external-assistant-first invocation strategy for AI-assisted authoring, with an optional future tool bridge and optional future integrated AI adapters.

The key decisions are:

1. V1 does not depend on a built-in editor chat client.
2. V1 does not depend on a custom Codex plugin.
3. The primary authoring path is file-and-artifact based: an external assistant operates on Sugarlang packets and artifacts in the same workspace.
4. If tighter assistant integration is added later, it should use a standard tool bridge such as MCP over the same control-plane operations rather than inventing a one-off plugin contract.
5. If integrated AI generation is added later, it must remain task-scoped, stateless or near-stateless, and packet/proposal based.
6. Commercial API calls remain behind a server boundary and are never required for the base authoring flow.

The concrete packet/proposal detail used across those invocation modes is defined in [ADR-SL-013: Authoring Packet and Proposal Contract](./013-authoring-packet-and-proposal-contract.md).

## Architectural Strategy

### 1. Make External Workspace Assistants the Default V1 Client

The default Sugarlang AI-authoring story should be:

- SugarEngine produces or updates the right artifact files and generation packets
- the writer asks an external assistant in the same workspace to perform a bounded task
- the assistant reads those files and writes a structured proposal or updated draft
- Sugarlang validates and previews the result

This is the simplest way to make AI help real now without turning SugarEngine into a chat product.

### 2. Do Not Make the Editor Own a Giant Context Window

OpenAI's Responses and Conversations APIs support stateful interactions, but Sugarlang should not make that its primary architectural dependency.[1][2]

The authoring contract should remain:

- one scoped operation
- one bounded packet
- one proposal

That keeps context assembly in Sugarlang product code rather than in a fragile conversational transcript.

### 3. Do Not Build a Custom "Codex Plugin"

Codex is best treated as a workspace-aware coding agent, not as a proprietary extension host Sugarlang must target.

OpenAI's own MCP documentation shows Codex connecting to MCP servers as a general tool client, not as a bespoke plugin platform.[3]

So the right default posture is:

- make the artifacts excellent
- make the packets narrow
- make validation and preview deterministic
- let Codex or another external assistant operate on the workspace

This is more portable and less brittle than building a custom Codex-specific plugin path.

### 4. Define Three Invocation Modes, One Authoring Contract

The invocation modes can evolve, but the authoring contract should not.

#### Mode A: External File-Based Assistant

V1 default.

The assistant works directly on:

- English-authored quest files
- Sugarlang JSON artifacts
- generated packets
- validation outputs

This requires no embedded AI client inside SugarEngine.

#### Mode B: Optional MCP Tool Bridge

Future compatibility layer.

If the team later wants tighter assistant integration, the right pattern is a narrow tool bridge, not a custom plugin.

That bridge can expose control-plane operations such as:

- build generation packet
- validate scenario
- simulate preview state
- apply accepted proposal

The important architectural rule is:

- the MCP server, if added, is an adapter over the control plane
- it is not the control plane itself

#### Mode C: Optional Integrated AI Adapter

Future editor-integrated path.

If SugarEngine later offers built-in AI draft actions, they should still work by:

- invoking one scoped operation
- building one packet
- sending it through a provider adapter
- receiving one structured proposal
- validating and previewing before apply

That keeps integrated AI from becoming a second incompatible system.

### 5. Keep Hosted Calls Stateless or Task-Scoped

For integrated hosted calls, Sugarlang should favor task-scoped requests over long-running conversations.

Stateful APIs exist and can be useful, but the canonical authoring model should not depend on carrying the whole authoring history forward in a conversation thread.[1][2]

That is how Sugarlang avoids the context-management problem the user explicitly does not want.

### 6. Use Structured Outputs and Selective Retrieval When Hosted AI Is Used

If integrated AI later uses commercial or self-hosted model backends, it should use:

- structured outputs
- selective retrieval or packet assembly
- server-side secret handling where needed

OpenAI's documentation strongly supports both schema-constrained outputs and selective file retrieval patterns.[4][5]

That aligns exactly with Sugarlang's packet/proposal architecture.

### 7. Keep the Browser Editor Clean of Provider Secrets

Commercial API keys are not browser-safe.

Therefore:

- no browser-embedded commercial API keys
- no direct browser calls to commercial providers as the base architecture
- any commercial API path goes through a server-side boundary per ADR-SL-006

This keeps the external-assistant-first workflow attractive because it works even when no hosted provider is configured at all.

## What This Means in Practice

The practical answer to "how is this for reals going to work?" is:

1. Sugarlang control-plane code builds a packet for a specific authoring task.
2. The writer triggers that task from the editor or by asking an external assistant in the workspace.
3. The assistant reads the packet and relevant artifacts.
4. The assistant writes a structured proposal or edited draft artifacts.
5. Sugarlang validates, previews, and applies the result.

For the quest-derived authoring flow, the primary task should be `sync_from_quest`, which means:

- traverse the quest graph
- derive or refresh the scenario interactions
- bind them back to quest nodes, dialogue beats, NPCs, and world objects
- regenerate the target-language interaction overlays inside allowed scope

If the team later wants a tighter assistant bridge:

- expose those same operations through MCP
- do not invent a Codex-only plugin

If the team later wants built-in AI:

- wrap the same operations in an editor action
- do not invent a second prompt stack

## Why This Supports the Product and Use Cases

This ADR supports:

- the writer-facing `UC-006` dream flow
- the AI-assisted workflow in `authoring-workflow.md`
- the user's desire to avoid context management
- future optional AI integration without forcing it into V1

It also keeps the product honest:

- AI helps through bounded operations
- the files stay reviewable
- the editor is not silently hiding a second system

## Alternatives Considered

### 1. Built-In Editor Chat as the Primary Authoring Surface

Rejected for V1.

Why:

- too much UI and state-management complexity
- encourages long-lived prompt dependence
- turns the editor into an AI product before the artifact model is ready

### 2. Raw Browser API Calls to a Commercial Model

Rejected.

Why:

- secrets problem
- poor context hygiene
- bad default for offline/local workflows

### 3. Custom Codex Plugin Architecture

Rejected as the primary strategy.

Why:

- unnecessary coupling
- higher maintenance burden
- weaker portability than file-based or MCP-based collaboration

### 4. Ban Integrated AI Entirely

Rejected.

Why:

- useful later path
- not necessary if it uses the same packet/proposal contracts

## Technology and Pattern Options

Patterns compatible with this ADR include:

- external workspace assistants acting on files directly
- future MCP bridges over control-plane operations
- local-model integrated generation
- server-mediated hosted generation using structured outputs

This ADR does not require one vendor or one assistant.

It requires one stable authoring contract.

## Future-Compatible Growth Path

### V1

- external assistant over workspace files
- no built-in chat requirement
- no CLI authoring requirement

### Later

- optional MCP adapter
- optional integrated editor actions
- optional local or hosted model adapters

All of those remain valid because invocation is replaceable and packets/proposals remain stable.

## Consequences and Tradeoffs

Positive:

- minimizes context-management pain
- avoids premature editor AI complexity
- keeps Codex and similar assistants useful immediately
- prevents vendor-specific lock-in at the authoring layer

Tradeoffs:

- V1 feels less magical inside the editor
- external assistants still depend on good packets and validators
- integrated AI later must be carefully prevented from drifting

## Sources

[1] OpenAI API reference, "Conversations"  
[https://platform.openai.com/docs/api-reference/conversations](https://platform.openai.com/docs/api-reference/conversations)

[2] OpenAI API docs, "Structured model outputs"  
[https://platform.openai.com/docs/guides/json-mode](https://platform.openai.com/docs/guides/json-mode)

[3] OpenAI API docs, "Docs MCP"  
[https://platform.openai.com/docs/docs-mcp](https://platform.openai.com/docs/docs-mcp)

[4] OpenAI API docs, "File search"  
[https://platform.openai.com/docs/guides/tools-file-search/](https://platform.openai.com/docs/guides/tools-file-search/)

[5] OpenAI API docs, "Building MCP servers for ChatGPT and API integrations"  
[https://platform.openai.com/docs/mcp/overview](https://platform.openai.com/docs/mcp/overview)
