# AxioForm — 3D Guardrail Configurator SaaS

**Implementation Plan · v1.0 · July 2026**

---

## 1. Vision & Confirmed Scope

AxioForm is an online SaaS where customers configure guardrails in 3D, get a live SIA-compliant
price, and order directly — with a full admin back office for orders, pricing and product
management.

Decisions confirmed with the owner:

| Topic | Decision |
|---|---|
| First deliverable | **High-fidelity clickable prototype** (real 3D + pricing + SIA logic, mocked backend), then production SaaS on top |
| Product types (launch) | 1. **Bar railing** (Staketengeländer) · 2. **Glass railing** (Glasgeländer) |
| Geometry | **Multi-segment runs with corners + sloped stair segments** |
| Configurator output | **Interactive 3D (Three.js)** + auto-generated **dimensioned 2D technical drawing (PDF)** per order |
| Order flow | **Hybrid**: instant online purchase for standard configs + "request quote" path for complex projects |
| Customers | **B2C and B2B** (trade accounts, volume pricing, project management) |
| Pricing model | **Rule-based per meter**: base CHF/m per type + option surcharges, fully admin-editable |
| Languages | **DE / FR / EN** (IT later) |
| Branding | Sky-Frame look & feel: minimalist, architectural, monochrome, large imagery |
| Reference for product logic & pricing | metallbauXpress.ch (bar railings from ~192 CHF/m, glass from ~334 CHF/m, kit-based) |
| Compliance | **SIA 358** (with SIA 261 loads, SIGAB glass rules) baked into the rules engine |
| Stack | **Next.js + TypeScript + react-three-fiber, Node/Postgres, Stripe (incl. TWINT)** |

Public site sections: **Home · About us · References · Product configurator · Portal login**.
Admin portal: **orders, pricing configurator, guardrail type management (upload new types), users, content**.

---

## 2. Phase Overview

| # | Phase | Outcome | Effort (indicative) |
|---|---|---|---|
| 0 | Foundations & content | Repo, CI, content inventory, legal texts | 1 wk |
| 1 | **Brandbook** | AxioForm visual identity system | 1–2 wk |
| 2 | **UX** — IA, wireframes, configurator flow | Validated user flows | 2 wk |
| 3 | **Prototype** (current mandate) | Clickable Next.js app, 3D configurator, mocked backend | 4–6 wk |
| 4 | Domain engines | Geometry, SIA-358 rules, pricing, drawing generator (shared TS packages) | built inside Phase 3, hardened in Phase 5 |
| 5 | **Backend** & data model | Postgres, API, auth, real persistence | 4 wk |
| 6 | Customer portal & checkout | Accounts, orders, Stripe/TWINT, quotes | 3 wk |
| 7 | **Admin portal** | Orders, pricing configurator, product type upload, CMS | 4 wk |
| 8 | i18n & content DE/FR/EN | Fully translated product | 1–2 wk |
| 9 | QA, security, compliance, launch | Production deployment | 2 wk |

Phases 5–7 partially overlap. Realistic path to production: **~4–5 months** after prototype sign-off.

---

## 3. Phase 1 — Brandbook (AxioForm)

Sky-Frame's design language, adapted to AxioForm:

- **Positioning**: "Engineered safety, invisible design." Swiss precision, architectural minimalism.
- **Color**: near-monochrome — warm white `#FAFAF8`, ink `#1A1A1A`, graphite greys; one restrained
  accent (e.g. steel blue) used only for interactive states. No gradients, no decoration.
- **Typography**: a single neo-grotesque family (e.g. Suisse Int'l, Neue Haas Grotesk, or open-source
  fallback like Inter/Neue Montreal style), light weights for display, generous tracking, small caps
  for labels.
- **Imagery**: full-bleed architectural photography (terraces, stair situations, detail shots of
  posts/glass edges); duotone treatment for consistency. Renders from the 3D engine reused as imagery.
- **Layout**: huge whitespace, thin hairline rules, edge-to-edge sections, slow subtle scroll
  animations. Navigation: minimal top bar that recedes on scroll.
- **Deliverables**: logo + wordmark, color/type/spacing tokens (as a `tailwind.config` +
  `tokens.json` so design = code), photography guidelines, component sheet (buttons, forms, cards,
  configurator controls), motion principles.

---

## 4. Phase 2 — UX

### 4.1 Sitemap

```
Public   : Home · About us · References · Configurator · Portal login
Customer : Dashboard · My configurations · Quotes · Orders (status, drawings, invoices) · Account/Company
Admin    : Dashboard · Orders (Kanban: new→confirmed→production→shipped) · Quotes
           · Pricing configurator · Guardrail types · Customers (B2C/B2B, trade tiers)
           · Content (references, about) · Settings (shipping zones, taxes, users/roles)
```

### 4.2 Configurator flow (the core UX)

1. **Type** — bar railing vs. glass railing (large visual cards).
2. **Geometry** — draw the run in plan view: add segments (length + angle between segments),
   mark segments as *stairs* (slope up to 37°, like metallbauXpress "Flex"); set height (default
   1000 mm, min enforced).
3. **Mounting** — top mount (aufgesetzt) / side mount (seitlich) / on stringer; floor material hints.
4. **Options** — bars: spacing, handrail (round/flat, stainless/steel), RAL color;
   glass: VSG glass type/tint, with/without handrail, clamp vs. channel profile, RAL.
5. **Review** — 3D view + live 2D drawing + SIA compliance badge + itemized price;
   fork: **Buy now** (standard) or **Request quote** (complex flags: >37° slope, custom RAL,
   installation wanted, B2B project).
6. **Checkout / Quote** — address, shipping zone, payment (Stripe: cards + TWINT) or quote submission.

Persistent right rail: live price breakdown + compliance status. Every change updates 3D, drawing
and price instantly. Configurations savable (anonymous → claimed at login).

### 4.3 UX deliverables

Low-fi wireframes for all sections, hi-fi Figma (or coded directly in prototype given the
prototype-first decision), mobile behavior (3D configurator: touch orbit + bottom-sheet controls).

---

## 5. Phase 3 — High-Fidelity Prototype (current mandate)

**Goal**: a deployed, clickable product that looks final, computes real prices, enforces real SIA
rules, renders real 3D — with a mocked/in-browser backend. Used to validate with pilot customers
before backend investment.

- **Stack**: Next.js (App Router) + TypeScript + Tailwind (brand tokens) + react-three-fiber/drei.
  State: Zustand. Mock persistence: localStorage + JSON fixtures. Deployed on Vercel/GitHub Pages.
- **Included**: all 5 public sections, the full configurator flow above, PDF drawing export
  (client-side, e.g. svg → pdf-lib), fake login + portal screens with fixture data, admin screens
  with editable in-browser pricing rules (proves the pricing configurator UX).
- **Explicitly mocked**: auth, payment (Stripe test-mode checkout stub), order persistence, email.
- The domain engines (§6) are written as **clean standalone TypeScript packages from day one** —
  they move unchanged into production.

---

## 6. Phase 4 — Domain Engines (shared TS packages)

### 6.1 `@axioform/geometry`
Parametric model: `Railing = { type, height, segments[] }`,
`Segment = { length, angleToPrevious, slope, mounting }`. Derives post positions (max post spacing
per type, e.g. 1200–1500 mm), bar counts/spacing, glass panel splitting (max panel width, weight),
corner details. Single source of truth consumed by 3D renderer, 2D drawing generator, pricing and
SIA validator.

### 6.2 `@axioform/sia` — compliance rules engine
Declarative rules evaluated on every config change; each rule returns pass / fail / needs-review:

| Rule | Requirement (SIA 358 / related) |
|---|---|
| Guard required | Fall height ≥ 1.00 m ⇒ protective element mandatory |
| Min height | ≥ 1.00 m from walkable surface (measured vertically); recommend 1.10 m where fall height > 12 m |
| Openings | No opening may pass a 12 cm sphere up to 0.75 m height (child safety); ⇒ bar spacing ≤ 110 mm effective |
| Climbability | No horizontal climbing aids between 0.15 m and 0.75 m (relevant to option design) |
| Gap at base | Max gap between floor and bottom rail/glass edge: 12 cm sphere rule applies |
| Loads (via SIA 261) | Horizontal line load on handrail: 0.8 kN/m residential, 1.6 kN/m public assembly ⇒ drives post spacing & anchor spec per mounting type |
| Glass | Laminated safety glass (VSG) mandatory for fall protection; thickness matrix per span/clamping (SIGAB 002); free glass edge rules for handrail-less systems |
| Stairs | Height measured vertically above nosing line; slope limits per system (≤ 37° for Flex-style) |

Admin can add/adjust rule parameters per guardrail type (the "upload new type" flow includes its
rule profile). Rules are versioned — an order stores the rule version it was validated against.

### 6.3 `@axioform/pricing` — rule-based per-meter engine
```
price = Σ per segment [ base_chf_per_m(type) × length ]
      + posts × post_price(mounting, type)
      + option surcharges (handrail type, glass spec, RAL color, stair slope, corners)
      + fixed setup fee + shipping(zone, weight) − B2B tier discount
      × VAT
```
All numbers live in a versioned `PriceBook` (JSON schema) edited in the admin pricing configurator.
Seed values calibrated to metallbauXpress market prices (bars ~192–253 CHF/m, glass ~334–433 CHF/m).
Every quote/order snapshots its PriceBook version.

### 6.4 `@axioform/drawing`
Generates dimensioned 2D drawings (plan + elevation per segment) as SVG from the geometry model;
export to PDF with title block (project, customer, config ID, SIA rule version, date). Attached to
quotes, orders and the production workflow.

---

## 7. Phase 5 — Backend

- **Architecture**: Next.js API routes / tRPC on Node, PostgreSQL (Prisma), file storage (S3-compatible,
  Swiss region — e.g. Exoscale/AWS eu-central-2 Zurich) for drawings, uploads, reference images.
- **Auth**: Auth.js — email+password & magic link; roles `customer`, `b2b_customer`, `admin`,
  `staff`; B2B organizations with member management.
- **Core data model**:
  `users, organizations, guardrail_types (incl. 3D/rule/price profiles), price_books (versioned),
  configurations (geometry JSON + engine versions), quotes, orders, order_events, shipments,
  invoices, reference_projects, cms_pages, shipping_zones, audit_log`.
- **APIs**: configurator CRUD, price calculation (server-authoritative re-check at checkout),
  quote→order conversion, webhook handlers (Stripe), PDF generation service, email
  (transactional: order confirmations, quote follow-ups — DE/FR/EN templates).
- **Payments**: Stripe Checkout — cards + **TWINT** (essential in CH); B2B: invoice/on-account
  option with credit approval flag.

---

## 8. Phase 6 — Customer Portal

Saved configurations (resume editing), quote tracking (accept → converts to order), order status
timeline with production/shipping updates, downloads (technical drawing PDF, invoice, assembly
instructions), B2B extras: multiple projects, team members, agreed discount tier visible.

## 9. Phase 7 — Admin Portal

- **Orders**: Kanban + list, status transitions trigger customer emails; drawing + parts list
  (BOM derived from geometry) per order for production.
- **Pricing configurator**: edit every number in the PriceBook with draft → preview (recompute
  sample configs) → publish (new version); full history.
- **Guardrail type management** ("upload new types"): create a type from a template — name, images,
  3D parameters (profiles, post model, infill logic), SIA rule profile, price entries, translations;
  publish/unpublish. New types appear in the configurator without code changes.
- **Customers & CMS**: B2B tier assignment; edit About-us and References (images, project data).

## 10. Phase 8 — i18n (DE/FR/EN)

`next-intl`; all UI strings, product data and email templates translated; locale-aware routing
(`/de`, `/fr`, `/en`), CHF formatting, translated PDFs. IT prepared but not launched.

## 11. Phase 9 — QA, Security, Compliance, Launch

- Unit tests on the three engines (golden files for pricing & SIA cases), Playwright E2E for
  configure→checkout, visual regression on 3D snapshots.
- Swiss **nDSG**/GDPR: privacy policy, data in CH/EU region, cookie-less analytics (e.g. Plausible).
- Legal review: disclaimer scope — configurator validates against SIA 358 parameters, structural
  responsibility statement for anchoring/substrate (as market players do).
- Monitoring (Sentry), backups, staging + production environments, load test on price/render APIs.

---

## 12. Immediate Next Steps

1. Approve this plan (adjust anything).
2. I build **Phase 1+2 inside the prototype**: brand tokens + IA directly as the Next.js app skeleton.
3. First prototype milestone: public site shell (Home/About/References/Login) in AxioForm branding.
4. Second milestone: 3D configurator for the **bar railing** end-to-end (geometry → SIA → price → drawing).
5. Third milestone: glass railing + quote/buy fork + portal & admin mock screens.
