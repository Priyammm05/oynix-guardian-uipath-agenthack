// auth-service
// Issues and refreshes tokens. Owns the auth contract in shared-sdk/auth.
import { TokenClaims } from "../shared-sdk/auth";

export function issueToken(userId: string, scopes: string[]): string {
  const claims: TokenClaims = {
    sub: userId,
    scopes,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return btoa(JSON.stringify(claims)); // string -> base64 (no Node types needed)
}
