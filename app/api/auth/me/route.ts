import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/server/auth";

export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({ user: { email: user.email, name: user.name, role: user.role, tier: user.tier } });
}
