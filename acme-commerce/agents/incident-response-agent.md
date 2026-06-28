---
agent: incident-response-agent
status: active
description: Triages production incidents using the runbook.
depends_on:
  - payment-service/index.ts
  - docs/runbook.md
  - shared-sdk/auth.ts
---

# Incident Response Agent

Diagnoses auth/payment incidents from the runbook. If the auth module changes
without the runbook being refreshed, it will give outdated remediation steps.
