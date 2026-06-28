// payment-service
// Depends on shared-sdk/auth. PCI-sensitive: any auth change must be reviewed.
import { verifyToken, requireScope } from "../shared-sdk/auth";

export async function charge(authHeader: string, cartId: string) {
  const auth = verifyToken(authHeader);
  if (!auth.valid || !auth.claims) {
    return { status: 401, error: auth.reason };
  }
  if (!requireScope(auth.claims, "payment:charge")) {
    return { status: 403, error: "insufficient_scope" };
  }
  // ... settle with payment processor ...
  return { status: 200, cartId, captured: true };
}
