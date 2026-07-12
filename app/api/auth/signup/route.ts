import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/server/db";
import { createSession } from "@/lib/server/auth";

export async function POST(req: Request) {
  const { email, password, name } = await req.json().catch(() => ({}));
  if (!email || !password || String(password).length < 8) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const existing = await db.user.findUnique({ where: { email: String(email).toLowerCase() } });
  if (existing) return NextResponse.json({ error: "email_taken" }, { status: 409 });

  const user = await db.user.create({
    data: {
      email: String(email).toLowerCase(),
      name: String(name || email),
      passwordHash: await bcrypt.hash(String(password), 10),
    },
  });
  await createSession(user.id);
  return NextResponse.json({ email: user.email, name: user.name, role: user.role, tier: user.tier, access: [] });
}
