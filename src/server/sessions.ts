import { encode, getToken } from "@auth/core/jwt";

// Matches Auth.js v5's own default (unprefixed — no `__Secure-` prefix,
// since this app doesn't branch cookie naming by environment) session
// cookie name and salt convention (salt = cookie name), so a token minted
// here is decodable exactly the same way Auth.js's own session mechanism
// would decode it, and vice versa. Sessions are stateless JWTs — there is
// no server-side session store to clear/expire manually.
export const SESSION_COOKIE_NAME = "authjs.session-token";

function requireSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set");
  }
  return secret;
}

export async function createSessionToken(userId: string): Promise<string> {
  return encode({
    secret: requireSecret(),
    salt: SESSION_COOKIE_NAME,
    token: { sub: userId }
  });
}

export async function userIdForHeaders(headers: Headers): Promise<string | undefined> {
  const token = await getToken({
    req: { headers },
    secret: requireSecret(),
    salt: SESSION_COOKIE_NAME,
    cookieName: SESSION_COOKIE_NAME
  });
  return token?.sub;
}
