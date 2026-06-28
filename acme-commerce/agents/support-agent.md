---
agent: support-agent
status: idle
description: Answers customer questions about orders.
depends_on:
  - order-service/index.ts
  - docs/api.md
---

# Support Agent

Answers order-status questions. Lower risk: not coupled to the auth module, so
auth changes do not invalidate its context.
