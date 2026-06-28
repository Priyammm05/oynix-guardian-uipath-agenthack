// notification-service
// Depends on shared-sdk/http. Sends order/payment notifications.
import { callService } from "../shared-sdk/http";

const EMAIL_URL = process.env.EMAIL_URL ?? "http://email:9100";

export async function notify(userId: string, message: string) {
  return callService(`${EMAIL_URL}/send`, {
    method: "POST",
    body: JSON.stringify({ userId, message }),
  });
}
