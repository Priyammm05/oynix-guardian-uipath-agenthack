---
agent: qa-agent
status: active
description: Generates and runs tests for checkout and payment flows.
depends_on:
  - checkout-service/index.ts
  - payment-service/index.ts
  - shared-sdk/auth.ts
---

# QA Agent

Writes integration tests for the checkout → payment path. Relies on the current
auth contract; a change to token scopes silently invalidates its test
assumptions until it re-reads the auth module.
