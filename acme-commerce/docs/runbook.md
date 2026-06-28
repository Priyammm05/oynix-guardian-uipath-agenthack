# ACME Commerce — Incident Runbook

## Auth failures spike (401/403)
Most often caused by a change to `shared-sdk/auth.ts` (token format, scope
names, or expiry handling). Check the most recent merge touching that module.

1. Confirm `auth-service` token issuance still matches `verifyToken`.
2. Roll back the offending change if checkout/payment error rate > 2%.
3. Re-issue tokens if claim shape changed.

## Payment capture failures
Check `payment-service` scope checks against the current `TokenClaims.scopes`.
