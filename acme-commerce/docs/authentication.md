# ACME Commerce — Authentication Guide

Authentication is centralized in `shared-sdk/auth.ts`.

- **Tokens** are base64-encoded `TokenClaims` (`sub`, `scopes`, `exp`).
- **Issuing**: `auth-service.issueToken(userId, scopes)`.
- **Verifying**: `shared-sdk/auth.verifyToken(authHeader)` returns
  `{ valid, claims, reason }`.
- **Scopes**: `requireScope(claims, "checkout:write")` etc.

This guide is the source of truth that AI agents (documentation, QA, support)
use when answering auth questions. It must be regenerated whenever
`shared-sdk/auth.ts` changes.
