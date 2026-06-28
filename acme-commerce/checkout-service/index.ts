// checkout-service
// Depends on shared-sdk/auth for request authentication.
// Orchestrates payment + inventory during checkout.
import { verifyToken, requireScope } from "../shared-sdk/auth";
import { callService } from "../shared-sdk/http";

const PAYMENT_URL = process.env.PAYMENT_URL ?? "http://payment-service:8082";
const INVENTORY_URL = process.env.INVENTORY_URL ?? "http://inventory-service:8083";

export async function checkout(authHeader: string, cartId: string) {
  const auth = verifyToken(authHeader);
  if (!auth.valid || !auth.claims) {
    return { status: 401, error: auth.reason };
  }
  if (!requireScope(auth.claims, "checkout:write")) {
    return { status: 403, error: "insufficient_scope" };
  }

  const reserve = await callService(`${INVENTORY_URL}/reserve`, {
    method: "POST",
    body: JSON.stringify({ cartId }),
  });
  if (reserve.status !== 200) return { status: 409, error: "out_of_stock" };

  const pay = await callService(`${PAYMENT_URL}/charge`, {
    method: "POST",
    headers: { authorization: authHeader },
    body: JSON.stringify({ cartId }),
  });
  return { status: pay.status, cartId };
}
