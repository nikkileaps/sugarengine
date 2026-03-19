# ADR 028: Game API Authentication, Session, and Abuse-Control Architecture

## Status

Proposed

## Context

The moment a published game exposes hosted inference, it creates:

- a cost-bearing public endpoint,
- a route for anonymous abuse,
- a need to distinguish browser users from direct backend callers,
- a future need to grow from closed alpha access into real identity-backed access.

In this architecture, SugarEngine scaffolds release structure, but each game repository owns deployed environment configuration and release automation for that game's backend.

The architecture must support:

- simple gated alpha access now,
- stronger account-backed auth later,
- protection of both save and `sugaragent` endpoints,
- separation between site access control and API access control.

## Decision

The system will use layered access control:

1. optional site/front-door gating,
2. required API session authentication for protected endpoints,
3. rate limiting and abuse controls as a separate but adjacent control layer.

For the first hosted release, the architecture will support a closed-alpha posture using:

- a server-validated shared credential or invite path,
- short-lived signed session credentials,
- authenticated requests to protected API endpoints.

The `auth` module owns:

- login verification,
- session issuance,
- session verification,
- session invalidation,
- future identity attachment.

The `sugaragent` module does not own auth.

For the first hosted release, the preferred session shape is:

- a server-signed first-party session token,
- signed with HMAC-SHA256 using a server-side secret,
- carrying only minimal session claims,
- delivered to the browser as a secure `HttpOnly` cookie.

Bearer tokens remain acceptable for non-browser clients and tooling, but they are not the preferred browser play path.

## Domain Relationships

### Site Gate

The site gate is allowed to reduce casual access.

It is not sufficient protection for the backend by itself.

### `auth` Module

The `auth` module is the backend trust boundary.

It decides:

- who is authenticated,
- which session is valid,
- whether a protected request should proceed.

### Protected API Modules

Protected modules such as:

- `save`
- `player`
- `sugaragent`

must trust session assertions from `auth`, not invent their own login model.

## Session Model

The backend will use short-lived signed session credentials.

The exact token mechanism may vary later, but the architecture requires:

- explicit expiry,
- tamper evidence,
- backend verification,
- revocation or invalidation capability,
- no client-embedded long-lived secret.

Secrets and credential-verification truth must live in deployment environment configuration, not in editor state or committed client assets.

### Preferred v1 Token Format

The preferred v1 format is a compact signed token, such as a minimal JWT signed with HMAC-SHA256.

The important architectural properties are:

- first-party issuance and verification,
- no browser-visible signing secret,
- bounded expiry,
- minimal claims,
- support for key rotation.

This token is being used as a first-party session artifact, not as a general federation or identity protocol.

### Preferred v1 Claims

At minimum, the session token should carry:

- issuer,
- audience,
- issued-at time,
- expiry time,
- a stable session identifier,
- the target game/environment,
- minimal scope/role information if needed.

It should not carry large gameplay payloads or anything that tempts the client to treat it as game-state authority.

### Signing Key Source

The signing key should live in server-side secret management for the deployed environment, then be injected into the Cloud Run service at runtime.

For Google Cloud, the preferred posture is:

- secret material stored in Secret Manager,
- bound into the Cloud Run environment through deployment configuration,
- rotated through normal environment secret rotation practices.

## Plain-Language Algorithms

### Login Verification

In plain language:

1. The browser submits a login or access request.
2. The `auth` module checks the submitted credential against server-side truth.
3. If valid, the backend creates a short-lived signed session credential.
4. The backend returns that credential as a secure `HttpOnly` cookie for browser clients.
5. If invalid, the backend records the failed attempt and returns a controlled denial.

### Session Verification on Protected Requests

In plain language:

1. A protected request arrives with a session credential.
2. The backend verifies signature, expiry, audience/scope, and session status.
3. If valid, the request continues to the target module.
4. If invalid, the request stops before touching protected domain logic.

### Browser Session Transport Rule

In plain language:

1. Browser play should send session state through a secure `HttpOnly` cookie rather than a JS-managed bearer token.
2. Protected browser requests should therefore use credentialed fetch/XHR semantics.
3. The backend should enforce origin checks and cookie policy appropriate to this model.

This keeps the main browser path from storing bearer tokens in local storage or exposing them to normal in-page JavaScript access.

### Abuse-Control Evaluation

In plain language:

1. Check whether the caller is authenticated for the requested action.
2. Check whether the caller exceeds request-rate or budget limits.
3. Check whether the payload exceeds safe bounds.
4. Only then pass the request into expensive protected logic like `sugaragent`.

This order matters because it prevents expensive work from happening before cheap rejection checks.

### Preferred v1 Rate-Limit Shape

The preferred v1 posture is layered, not either/or:

- pre-auth per-IP limits to protect login and anonymous probe surfaces,
- post-auth per-session limits to protect cost-bearing protected endpoints,
- tighter route-specific limits for expensive inference routes such as `sugaragent`.

This means "rate limiting" in the architecture should be read as:

- both per-IP and per-session,
- applied at different stages for different reasons.

## Data Flow

### Closed-Alpha Login Flow

1. Browser reaches the site.
2. Browser passes any front-door gate if present.
3. Browser submits shared credential or invite credential to `/auth/login`.
4. `auth` verifies the credential.
5. `auth` returns a signed short-lived session as a secure `HttpOnly` cookie.
6. Browser uses that session for protected API calls.

### Protected `sugaragent` Call

1. Browser sends a request to `/sugaragent/*` with a session cookie.
2. `auth` verification runs first.
3. Abuse/rate-limit checks run second.
4. Only then does `sugaragent` orchestration begin.

## Shared Alpha Credential Source

For the first hosted release, the shared alpha credential should live in deployed environment secret configuration, not in the game client and not in the editor.

Preferred v1 posture:

- username or invite identifier in environment configuration if needed,
- password verifier stored as a server-side secret,
- backend compares submitted credentials against that server-side source of truth.

If the product uses a single shared password, the preferred implementation is still to store a password verifier/hash rather than checking a plaintext credential committed into repo state.

## Access-Control Rules

### Required

- all protected API routes require session verification,
- the backend must not trust only CDN/site gating,
- auth failure responses must be cheap,
- session lifetime must be bounded,
- abuse/rate controls must happen before expensive inference,
- browser-authenticated requests should prefer `HttpOnly` cookie transport.

### Future-Compatible

- account-backed identity may replace shared alpha credentials,
- durable saves may attach to player identity later,
- the same protected-route model remains valid.

## Consequences

### Positive

- closed alpha is feasible without building the whole account system first,
- inference endpoints are not left publicly callable,
- the architecture grows cleanly into identity-backed access later.

### Tradeoffs

- even a simple alpha needs real backend auth logic,
- session lifecycle becomes part of backend architecture,
- site gating and API gating must be communicated clearly to the team.

## Rejected Alternatives

### 1. Client-Side Shared Password Only

Rejected because anything embedded in the client is not real backend protection.

### 2. Site Gate Only

Rejected because direct backend callers could bypass it.

### 3. Let `sugaragent` Validate Its Own Access

Rejected because auth is a cross-cutting backend concern and must not be duplicated in inference modules.

### 4. Build the Full Public Identity Platform First

Rejected because it overbuilds the first hosted release.

## References

- [web-release-target-publish-system-design.md](/Users/nikki/projects/sugarengine/docs/proposals/web-release-target-publish-system-design.md)
- [027-game-api-service-boundary-and-module-contract.md](/Users/nikki/projects/sugarengine/docs/adr/027-game-api-service-boundary-and-module-contract.md)
