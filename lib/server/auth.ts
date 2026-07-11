import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";

const COOKIE = "axioform-session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Fail closed in production: a hardcoded fallback secret would let anyone forge
// a session JWT (sub = any user id) and take over the admin account. Resolved
// lazily (not at module load) so `next build` — which imports route modules
// under NODE_ENV=production — isn't broken; any real auth call still throws when
// the secret is missing. The dev fallback is only tolerated outside production.
function secretKey(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production" && (!raw || raw.length < 16)) {
    throw new Error("AUTH_SECRET must be set to a strong value (≥16 chars) in production");
  }
  return new TextEncoder().encode(raw ?? "axioform-dev-secret");
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function sessionUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return await db.user.findUnique({ where: { id: payload.sub } });
  } catch {
    return null;
  }
}
