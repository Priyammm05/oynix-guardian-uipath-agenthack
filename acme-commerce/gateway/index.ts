// gateway
// Edge router. Depends on shared-sdk/http only (no direct auth coupling).
import { callService } from "../shared-sdk/http";

const ORDER_URL = process.env.ORDER_URL ?? "http://order-service:8084";

export async function route(path: string, authHeader: string, body: unknown) {
  if (path.startsWith("/orders")) {
    return callService(`${ORDER_URL}/place`, {
      method: "POST",
      headers: { authorization: authHeader },
      body: JSON.stringify(body),
    });
  }
  return { status: 404, body: { error: "not_found" } };
}
