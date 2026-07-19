/* Seed: demo admin + customer accounts and the fixture orders. */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

// Orders are born deposit-paid (paid online at checkout). Keller's shipped
// order deliberately carries an unpaid, overdue balance for the dunning demo.
const seedOrders = [
  {
    ref: "AX-D8K2F1", kind: "order", createdAt: new Date("2026-06-12"), status: "shipped",
    customerName: "M. Keller", email: "m.keller@example.ch", street: "Seestrasse 41", city: "8802 Kilchberg",
    phone: "+41 79 555 01 01", payment: "card", system: "glass", lengthM: 12.4, gross: 6412.35,
    depositPaidAt: "2026-06-12", deliveryDate: "2026-06-15",
  },
  {
    ref: "AX-E3M9Q7", kind: "order", createdAt: new Date("2026-06-24"), status: "production",
    customerName: "Atelier Brunner AG", email: "bau@brunner.example.ch", street: "Werkhofweg 3", city: "3013 Bern",
    phone: "+41 31 555 02 02", payment: "invoice", system: "bars", lengthM: 26, gross: 7250.1,
    depositPaidAt: "2026-06-24", deliveryDate: "2026-07-10",
    deliveryStreet: "Chantier Viktoriaplatz 2", deliveryCity: "3013 Bern",
  },
  {
    ref: "AX-F7T2B4", kind: "order", createdAt: new Date("2026-07-01"), status: "confirmed",
    customerName: "S. Aebischer", email: "s.aebischer@example.ch", street: "Lindenweg 8", city: "6300 Zug",
    phone: "+41 41 555 03 03", payment: "twint", system: "bars", lengthM: 5.2, gross: 1493.6,
    depositPaidAt: "2026-07-01", deliveryDate: "2026-08-01",
  },
  {
    ref: "AX-G1P5R9", kind: "quote", createdAt: new Date("2026-07-03"), status: "quote_requested",
    customerName: "Hotel Alpina", email: "technik@alpina.example.ch", street: "Via Maistra 12", city: "7500 St. Moritz",
    system: "bars", lengthM: 56, gross: 15890.4,
  },
  {
    ref: "AX-H4W8S2", kind: "quote", createdAt: new Date("2026-06-28"), status: "quoted",
    customerName: "Baugenossenschaft Rütli", email: "verwaltung@ruetli.example.ch", street: "Am Rain 5", city: "6003 Luzern",
    system: "glass", lengthM: 18.5, gross: 10240.8, quotedGross: 9840,
  },
];

async function main() {
  const users = [
    { email: "admin@axioform.ch", name: "AxioForm Admin", role: "admin", tier: "standard", password: "axioform-admin" },
    { email: "m.keller@example.ch", name: "M. Keller", role: "customer", tier: "standard", password: "demo1234" },
    // Company-portal collaborators, scoped to their stations.
    { email: "production@axioform.ch", name: "Atelier Production", role: "staff", tier: "standard", password: "axioform-prod", access: ["production"] },
    { email: "logistique@axioform.ch", name: "Équipe Logistique", role: "staff", tier: "standard", password: "axioform-log", access: ["logistics"] },
  ];
  for (const u of users) {
    await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email, name: u.name, role: u.role, tier: u.tier,
        access: JSON.stringify(u.access ?? []),
        passwordHash: await bcrypt.hash(u.password, 10),
      },
    });
  }

  const keller = await db.user.findUnique({ where: { email: "m.keller@example.ch" } });
  for (const o of seedOrders) {
    await db.order.upsert({
      where: { ref: o.ref },
      update: {},
      create: { ...o, userId: o.email === "m.keller@example.ch" ? keller.id : null },
    });
  }
  console.log("seeded", await db.user.count(), "users,", await db.order.count(), "orders");
}

main().finally(() => db.$disconnect());
