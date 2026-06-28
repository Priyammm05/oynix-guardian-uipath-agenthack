# ACME Commerce — Architecture

ACME Commerce is a microservice storefront. Requests enter through the
**gateway**, which routes to the **order-service**. Orders fan out to
**checkout-service**, which coordinates **payment-service** and
**inventory-service**. **notification-service** sends async updates.

All request authentication is centralized in `shared-sdk/auth.ts`. The
**auth-service** issues tokens; every other service verifies them through the
shared SDK. This makes the auth module the single highest-risk dependency in
the system — a change to it touches checkout, payment and order paths at once.

```
gateway → order-service → checkout-service → payment-service
                                           → inventory-service
auth-service → (issues) → shared-sdk/auth ← (verifies) all services
```
