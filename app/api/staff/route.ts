import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";
import { isArea, parseAccess, type Area } from "@/lib/server/authz";
import type { User } from "@prisma/client";

/*
 * Collaborator management for the company portal (admin only): list staff,
 * create an account with its area grants, adjust role/areas. Removing every
 * area from a staff account locks it out of the portal.
 */

function toClient(u: User) {
  return { email: u.email, name: u.name, role: u.role, access: parseAccess(u.access), active: u.active };
}

function cleanAreas(v: unknown): Area[] | null {
  if (!Array.isArray(v)) return null;
  return [...new Set(v.filter(isArea))];
}

/** Append an entry to the immutable access-rights trail. */
function audit(actor: string, action: string, target: string, detail = "") {
  return db.auditLog.create({ data: { actor, action, target, detail } });
}

export async function GET() {
  const user = await sessionUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rows = await db.user.findMany({ where: { role: { not: "customer" } }, orderBy: { createdAt: "asc" } });
  const trail = await db.auditLog.findMany({ orderBy: { at: "desc" }, take: 50 });
  return NextResponse.json({
    staff: rows.map(toClient),
    audit: trail.map((e) => ({ at: e.at.toISOString().slice(0, 16).replace("T", " "), actor: e.actor, action: e.action, target: e.target, detail: e.detail })),
  });
}

export async function POST(req: Request) {
  const user = await sessionUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { email, name, password, role } = body;
  const access = cleanAreas(body.access);
  if (!email || !password || String(password).length < 8 || !["staff", "admin"].includes(role) || access === null) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const existing = await db.user.findUnique({ where: { email: String(email).toLowerCase() } });
  if (existing) return NextResponse.json({ error: "email_taken" }, { status: 409 });
  const created = await db.user.create({
    data: {
      email: String(email).toLowerCase(),
      name: String(name || email).slice(0, 120),
      passwordHash: await bcrypt.hash(String(password), 10),
      role,
      access: JSON.stringify(access),
    },
  });
  await audit(user.email, "staff_created", created.email, `${role} · [${access.join(", ")}]`);
  return NextResponse.json({ staff: toClient(created) }, { status: 201 });
}

export async function PATCH(req: Request) {
  const user = await sessionUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").toLowerCase();
  const data: { role?: string; access?: string; active?: boolean; passwordHash?: string } = {};
  if (body.role !== undefined) {
    if (!["staff", "admin"].includes(body.role)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    data.role = body.role;
  }
  if (body.access !== undefined) {
    const access = cleanAreas(body.access);
    if (access === null) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    data.access = JSON.stringify(access);
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    data.active = body.active;
  }
  if (body.password !== undefined) {
    if (typeof body.password !== "string" || body.password.length < 8) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(body.password, 10);
  }
  if (!email || Object.keys(data).length === 0) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  // Guards: an admin can neither demote nor disable their own account
  // (avoids locking everyone out of the administration section).
  if (email === user.email && (data.role === "staff" || data.active === false)) {
    return NextResponse.json({ error: "cannot_demote_self" }, { status: 409 });
  }
  const target = await db.user.findUnique({ where: { email } });
  if (!target || target.role === "customer") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const updated = await db.user.update({ where: { email }, data });

  // Access-rights trail: one entry per changed facet, with before → after.
  if (data.role !== undefined && data.role !== target.role) {
    await audit(user.email, "role_changed", email, `${target.role} → ${data.role}`);
  }
  if (data.access !== undefined && data.access !== target.access) {
    await audit(user.email, "access_changed", email, `[${parseAccess(target.access).join(", ")}] → [${parseAccess(data.access).join(", ")}]`);
  }
  if (data.active !== undefined && data.active !== target.active) {
    await audit(user.email, data.active ? "account_enabled" : "account_disabled", email);
  }
  if (data.passwordHash !== undefined) {
    await audit(user.email, "password_reset", email);
  }
  return NextResponse.json({ staff: toClient(updated) });
}
