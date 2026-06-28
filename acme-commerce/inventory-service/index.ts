// inventory-service
// Depends on shared-sdk/http. No auth coupling.
import { callService } from "../shared-sdk/http";

const WAREHOUSE_URL = process.env.WAREHOUSE_URL ?? "http://warehouse:9000";

export async function reserve(cartId: string) {
  return callService(`${WAREHOUSE_URL}/reserve`, {
    method: "POST",
    body: JSON.stringify({ cartId }),
  });
}
