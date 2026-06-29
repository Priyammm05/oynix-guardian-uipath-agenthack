// shared-sdk/auth.ts
// Authentication primitives shared across ACME Commerce services.
// Changing this file has a large blast radius: it is imported directly by
// checkout, payment, order and auth services.

export interface TokenClaims {
  sub: string;
  scopes: string[];
  exp: number;
  iss: string; // NEW: issuer claim — tokens without it are now rejected
}

export interface VerifyResult {
  valid: boolean;
  claims?: TokenClaims;
  reason?: string;
}

/**
 * Verify a bearer token and return its claims.
 * NOTE: signature/algorithm changes here ripple to every service that
 * authenticates requests.
 */
export function verifyToken(token: string): VerifyResult {
  if (!token || !token.startsWith("Bearer ")) {
    return { valid: false, reason: "missing_bearer" };
  }
  const raw = token.slice("Bearer ".length);
  const claims = decodeClaims(raw);
  if (!claims) return { valid: false, reason: "decode_failed" };
  if (claims.exp < Date.now() / 1000) {
    return { valid: false, reason: "expired" };
  }
  // NEW: reject tokens that don't declare a trusted issuer.
  if (claims.iss !== "acme-auth-service") {
    return { valid: false, reason: "untrusted_issuer" };
  }
  return { valid: true, claims };
}

export function requireScope(claims: TokenClaims, scope: string): boolean {
  return claims.scopes.includes(scope);
}

function decodeClaims(raw: string): TokenClaims | null {
  try {
    const json = atob(raw); // base64 -> string (no Node types needed)
    return JSON.parse(json) as TokenClaims;
  } catch {
    return null;
  }
}

export function requireAllScopes(claims: TokenClaims, scopes: string[]): boolean {
  return scopes.every((s) => claims.scopes.includes(s));
}
