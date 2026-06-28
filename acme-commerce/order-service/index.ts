// order-service
// Depends on shared-sdk/auth. Calls checkout to finalize an order.
import { verifyToken } from "../shared-sdk/auth";
import { callService } from "../shared-sdk/http";

const CHECKOUT_URL = process.env.CHECKOUT_URL ?? "http://checkout-service:8081";

export async function placeOrder(authHeader: string, cartId: string) {
  const auth = verifyToken(authHeader);
  if (!auth.valid) return { status: 401, error: auth.reason };

  const result = await callService(`${CHECKOUT_URL}/checkout`, {
    method: "POST",
    headers: { authorization: authHeader },
    body: JSON.stringify({ cartId }),
  });
  return { status: result.status, orderId: `ord_${cartId}` };
}
