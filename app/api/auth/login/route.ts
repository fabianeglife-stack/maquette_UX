import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/server/db";
import { createSession } from "@/lib/server/auth";
import { parseAccess } from "@/lib/server/authz";
import { isBlocked, recordFailure, recordSuccess } from "@/lib/server/ratelimit";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  // Throttle brute force per source + account (5 failures / 15 min window).
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${ip}|${String(email ?? "").toLowerCase()}`;
  if (isBlocked(key)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }
  const user = email ? await db.user.findUnique({ where: { email: String(email).toLowerCase() } }) : null;
  if (!user || !(await bcrypt.compare(String(password ?? ""), user.passwordHash))) {
    recordFailure(key);
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }
  if (!user.active) return NextResponse.json({ error: "account_disabled" }, { status: 403 });
  recordSuccess(key);
  await createSession(user.id);
  return NextResponse.json({ email: user.email, name: user.name, role: user.role, tier: user.tier, access: parseAccess(user.access) });
}
