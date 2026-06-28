# ACME Commerce — Public API

## POST /orders
Place an order. Requires `Authorization: Bearer <token>` with scope
`checkout:write`. The token is verified via `shared-sdk/auth.verifyToken`.

## POST /payments/charge
Internal. Requires scope `payment:charge`. Auth contract is defined by
`shared-sdk/auth.TokenClaims`.

> Any change to the token format or scope semantics in `shared-sdk/auth.ts`
> invalidates the contract documented here.
