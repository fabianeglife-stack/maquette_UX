import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/server/db";
import { createSession } from "@/lib/server/auth";
import { parseAccess } from "@/lib/server/authz";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  const user = email ? await db.user.findUnique({ where: { email: String(email).toLowerCase() } }) : null;
  if (!user || !(await bcrypt.compare(String(password ?? ""), user.passwordHash))) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }
  if (!user.active) return NextResponse.json({ error: "account_disabled" }, { status: 403 });
  await createSession(user.id);
  return NextResponse.json({ email: user.email, name: user.name, role: user.role, tier: user.tier, access: parseAccess(user.access) });
}
