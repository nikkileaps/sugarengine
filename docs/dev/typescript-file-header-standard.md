# TypeScript File Header Standard

This document defines the standard top-of-file comment for hand-authored `.ts` files in Sugarengine.

## Scope

Apply this header to new or edited hand-authored TypeScript files.

Do not apply this header to:

- generated files
- one-line barrel files (for example, pure re-export files)
- vendored third-party code

## Required Template

```ts
/**
 * @fileoverview <One-sentence purpose of this file.>
 *
 * Responsibilities:
 * - <Primary responsibility 1>
 * - <Primary responsibility 2>
 *
 * Boundaries:
 * - Owns: <what this file/module is allowed to do>
 * - Does not own: <what is intentionally handled elsewhere>
 *
 * Public API:
 * - <exportName>: <contract in one line>
 *
 * Side Effects:
 * - <none | fs/network/process/env/global state/session mutation>
 *
 * Invariants:
 * - <rule that must always hold>
 *
 * @see <ADR/doc path if applicable>
 */
```

## Authoring Rules

- Keep the header concise (roughly 8-16 lines after filling values).
- Describe intent and boundaries, not implementation details.
- Do not include author names, dates, or change logs (Git is the source of truth).
- Use `none` explicitly for `Side Effects` when applicable.
- Keep `Public API` aligned with actual exports.

## Rationale

This format keeps module purpose and ownership explicit, improves review clarity, and supports JSDoc/TypeScript tooling via `@fileoverview`.
