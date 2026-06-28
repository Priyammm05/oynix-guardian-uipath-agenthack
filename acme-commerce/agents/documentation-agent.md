---
agent: documentation-agent
status: active
description: Auto-generates and answers questions about ACME docs.
depends_on:
  - shared-sdk/auth.ts
  - docs/authentication.md
  - docs/api.md
---

# Documentation Agent

Keeps the authentication guide and API docs in sync with the codebase and
answers developer questions about them. If `shared-sdk/auth.ts` changes, its
context becomes stale until the auth guide is regenerated.
