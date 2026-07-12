import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";
import { hasArea } from "@/lib/server/authz";

export async function GET() {
  const user = await sessionUser();
  if (!hasArea(user, "customers")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const orders = await db.order.findMany();
  const users = await db.user.findMany({ where: { role: "customer" } });
  const tierByEmail = new Map(users.map((u) => [u.email, u.tier]));

  const byEmail = new Map<string, { name: string; city: string; email: string; orders: number; quotes: number; revenue: number; tier: string }>();
  orders.forEach((o) => {
    const key = o.email.toLowerCase();
    const c = byEmail.get(key) ?? {
      name: o.customerName, city: o.city, email: o.email,
      orders: 0, quotes: 0, revenue: 0, tier: tierByEmail.get(key) ?? "standard",
    };
    if (o.kind === "order") { c.orders += 1; c.revenue += o.gross; } else c.quotes += 1;
    byEmail.set(key, c);
  });
  // Registered users without orders appear too.
  users.forEach((u) => {
    if (!byEmail.has(u.email)) {
      byEmail.set(u.email, { name: u.name, city: "", email: u.email, orders: 0, quotes: 0, revenue: 0, tier: u.tier });
    }
  });
  return NextResponse.json({ customers: [...byEmail.values()].sort((a, b) => b.revenue - a.revenue) });
}

export async function PATCH(req: Request) {
  const user = await sessionUser();
  if (!hasArea(user, "customers")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { email, tier } = await req.json().catch(() => ({}));
  if (!email || !["standard", "partner", "pro"].includes(tier)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  // The tier lives on the user account; customers without an account yet get
  // one implicitly at signup, so unknown emails are a no-op acknowledged here.
  await db.user.updateMany({ where: { email: String(email).toLowerCase() }, data: { tier } });
  return NextResponse.json({ ok: true });
}
