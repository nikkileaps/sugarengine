# Plan 013: Hosted OpenAI Web Publish And Cloud Run Parity

## Status

Proposed.

## Purpose

Finish the path from:

1. local SugarAgent OpenAI configuration in the editor,
2. web publish targeting a hosted game-api,
3. Cloud Run deployment,
4. real hosted gameplay using OpenAI generation.

The runtime-core and hosted bridge plumbing already exist.

The remaining work is to make sure:

1. the hosted game repo has one clear configuration source of truth,
2. publish/deploy use that truth consistently,
3. Cloud Run receives the required OpenAI secret/config,
4. we have a real end-to-end verification path for hosted OpenAI turns.

## Problem Statement

Today the hosted path is only partially closed operationally.

What is already present:

1. runtime-core can resolve `provider: 'openai'`
2. hosted runtime services can create an OpenAI-backed generation service
3. the published web client already calls the hosted game-api through `HttpGameApiRuntimeBridge`
4. scaffolded backend config/workflows already know about:
   - `GAME_API_SUGARAGENT_GENERATION_PROVIDER`
   - `GAME_API_SUGARAGENT_OPENAI_MODEL`
   - `GAME_API_SUGARAGENT_OPENAI_BASE_URL`
   - `GAME_API_SUGARAGENT_OPENAI_API_KEY`

What is still fuzzy:

1. the editor publish flow does not currently appear to persist the in-editor SugarAgent generation config into the game repo’s hosted web publish profile
2. “Publish web target” and “deploy backend to Cloud Run” are separate operations, but that boundary is not yet enforced/verified strongly enough
3. there is no happy-path hosted OpenAI integration test proving a real hosted `generateStructured` request reaches the OpenAI-backed generation service successfully
4. secret/deploy readiness is scaffolded, but not yet validated as a complete workflow

## Architectural Rules

1. The hosted game repo web publish profile is the single source of truth for deployed SugarAgent generation config.
2. The editor may edit or sync that profile, but deployed behavior must not depend on hidden in-memory editor state.
3. The published frontend must remain transport-only:
   - it talks to the hosted game-api
   - it does not call OpenAI directly from the browser
4. Cloud Run backend configuration must be fully derivable from the publish profile plus environment secrets.
5. The hosted path must keep using the shared runtime core rather than a second hosted-only SugarAgent implementation.

## Non-Goals

1. Do not redesign the core SugarAgent runtime again.
2. Do not move browser clients to direct-to-OpenAI calls.
3. Do not treat this as a general deployment platform redesign.
4. Do not optimize away llama/model artifact downloads in this plan unless it is required for correctness.
   That is a follow-on optimization, not a correctness blocker.

## Target Outcome

After this plan:

1. choosing OpenAI for SugarAgent and publishing for web results in a game repo profile that explicitly records hosted OpenAI settings
2. Cloud Run deploy reads those settings and the OpenAI secret without ad hoc manual patching
3. hosted web gameplay uses the game-api, and the game-api uses OpenAI generation
4. there is a repeatable verification path that proves the hosted OpenAI flow works

## Current Source-Of-Truth Problem

Right now there are two relevant surfaces:

1. editor-local SugarAgent config/UI state
2. game repo hosted web publish profile

The hosted backend deploy path is already driven by the publish profile.

That means deployed behavior should be treated as profile-owned, not editor-state-owned.

So the missing product/architecture decision is:

1. either the editor publish flow must sync SugarAgent hosted generation config into the profile before publish,
2. or the editor must make it explicit that hosted deploy uses the profile and give the user a direct way to edit/save it there.

This plan assumes the correct architecture is:

1. hosted profile is the single source of truth
2. editor publish flow becomes a profile sync/editor surface, not a second hidden config channel

## Workstreams

### Phase 13A: Make Hosted Generation Config Profile-Owned

Files likely involved:

1. [Editor.tsx](/Users/nikki/projects/sugarengine/src/editor/Editor.tsx)
2. [service.ts](/Users/nikki/projects/sugarengine/src/editor/game-root/service.ts)
3. [web-publish-profile.ts](/Users/nikki/projects/sugarengine/src/editor/game-root/web-publish-profile.ts)
4. [release-target-scaffold.ts](/Users/nikki/projects/sugarengine/src/editor/game-root/release-target-scaffold.ts)

Tasks:

1. make the publish UI surface the hosted SugarAgent generation settings from the publish profile
2. allow saving/syncing:
   - provider
   - OpenAI model
   - OpenAI base URL
3. ensure publish/deploy operate on the saved profile-owned values, not transient editor-only state
4. add explicit UI copy that hosted deploy uses the profile-backed settings

Acceptance criteria:

1. switching hosted SugarAgent generation to OpenAI is reflected in the profile on disk
2. reloading the editor shows the same hosted config from the profile
3. publish no longer depends on hidden unsaved editor config for hosted SugarAgent provider selection

### Phase 13B: Tighten Hosted Backend Config And Deployment Parity

Files likely involved:

1. [release-target-scaffold.ts](/Users/nikki/projects/sugarengine/src/editor/game-root/release-target-scaffold.ts)
2. scaffold-generated backend config/runtime-services files

Tasks:

1. verify the scaffolded backend runtime initialization path consumes:
   - provider
   - OpenAI model
   - OpenAI base URL
   - OpenAI secret
2. add/update tests to prove the generated files preserve those values correctly
3. ensure deploy workflow injects the secret and env vars in the same shape the backend config expects

Acceptance criteria:

1. scaffold tests cover the OpenAI hosted path explicitly
2. generated backend config and generated deploy workflow agree on env/secret names

### Phase 13C: Add Hosted OpenAI Happy-Path Verification

Files likely involved:

1. [hosted.test.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/hosted.test.ts)
2. hosted game-api route tests in generated/backend test surfaces
3. possibly `HttpGameApiRuntimeBridge` tests if needed

Tasks:

1. add a runtime-core hosted happy-path test for `provider: 'openai'`
   - likely by mocking `fetch`
   - or by injecting a provider-backed generation service at the hosted boundary
2. add a game-api route-level test that proves:
   - hosted request enters `/sugaragent/generateStructured`
   - runtime services are initialized with hosted config
   - structured output returns successfully
3. verify the diagnostics still flow through the hosted path

Acceptance criteria:

1. we have at least one successful hosted OpenAI generation test, not only a missing-key failure test
2. the hosted happy-path test exercises the actual hosted boundary, not just a local preview codepath

### Phase 13D: Deployment Readiness Guardrails

Files likely involved:

1. publish/deploy workflow generation
2. editor publish UX
3. deployment docs or checklist

Tasks:

1. make missing hosted prerequisites obvious before deploy:
   - missing OpenAI secret name
   - missing game-api base URL
   - missing backend-required flag mismatch
2. optionally add a deploy-readiness validation step or checklist output
3. document the exact hosted OpenAI setup steps for a game repo

Acceptance criteria:

1. users can tell before deploy whether the hosted OpenAI path is actually configured
2. the setup path is documented and reproducible

## Verification Matrix

The plan is complete when all of these are true:

1. local editor can save hosted SugarAgent OpenAI config into the web publish profile
2. web publish profile round-trips that config correctly
3. scaffolded backend reads the same config and secret names
4. generated workflow deploys Cloud Run with matching env vars and secret wiring
5. hosted happy-path test passes for OpenAI generation
6. published frontend still calls only the game-api, not OpenAI directly

## Risks

1. Editor and profile drift:
   - mitigated by making the profile the single source of truth
2. Secret/config naming drift between scaffold and backend:
   - mitigated by tests over generated files
3. False confidence from local-only tests:
   - mitigated by hosted happy-path route/runtime verification

## Follow-On Work

These are intentionally out of scope for this plan:

1. conditionally slimming the Cloud Run image when provider is OpenAI so llama/model assets are not bundled unnecessarily
2. moving hosted embeddings off-box instead of using local embedding assets in Cloud Run
3. one-click editor-driven deploy orchestration beyond the current publish/profile/deploy split
