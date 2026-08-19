# Page Override: web-accounting (dashboard shell)

> Overrides `../MASTER.md` for `apps/web-accounting` only. Master's global
> rules (color palette, typography, buttons/cards/inputs/badges, anti-patterns,
> pre-delivery checklist) still apply — this file only overrides the PAGE
> PATTERN, which Master explicitly deferred: *"Dashboard/data pages
> (accounting, b2g): standard app shell... not covered by this first cut;
> author a `pages/*.md` override when those apps are actually built."*

## Audience — read this before designing anything

`web-accounting` is for the **shared accountant / support staff** (docs
Section 8's own app description) — NOT the household-business owner. The
owner's primary surface is the (separate, out-of-scope-here) Flutter mobile
app. This is a professional tool for someone managing MULTIPLE tenants'
books, comfortable with a real dashboard — do not simplify this toward the
"elderly/non-technical, one big button" language the rest of this product
uses. Standard/dense information display is correct here, not a regression.

## Automatic aggregation, overridden again (same discipline as buyer-portal)

Running `--design-system "internal accounting dashboard multi-tenant staff
tool"` returned "Enterprise Gateway" (a marketing/conversion pattern — hero
video, mega menu, "Contact Sales" CTA) + "Dark Mode (OLED)" style + "Fira
Code / Fira Sans" typography. All three wrong for the same reasons Master
already documented for buyer-portal: this isn't a marketing page, this
audience isn't in a dark control room, and "dashboard mood" typography
isn't the same as "trustworthy professional readable." Overridden:

- **Pattern**: `data-dense-dashboard` (`--domain style`, confirmed
  `Light Mode: supported`, `Preferred Mode: auto`) — real structural
  values reused as-is: `--sidebar-width: 240px`, `--header-height: 56px`,
  `--table-row-height: 36px`, `--grid-gap: 8px`, `--card-padding: 12px`,
  12-column grid, sortable tables, sticky headers.
- **Color**: Master's own light Agriculture/Farm Tech palette (the tool's
  dashboard-pattern default is dark-mode-only; a professional daytime
  accounting tool doesn't need to inherit "dashboard = dark" as a rule).
- **Typography**: Master's Lexend + Source Sans 3, unchanged — already
  the right call for "all three planned apps," per Master's own note.

## Layout

```
┌────────────────────────────────────────────────────────────┐
│ Header (56px): [SoloDesk wordmark] [Tenant name ▾]  [🔔 3] [Avatar ▾] │
├───────────┬──────────────────────────────────────────────────┤
│ Sidebar   │  Content area                                    │
│ (240px)   │  ┌──────────────────────────────────────────┐   │
│           │  │ Page heading + primary action button      │   │
│ Đơn hàng  │  ├──────────────────────────────────────────┤   │
│ Hóa đơn   │  │ Data table: sortable headers, sticky,      │   │
│ Kho hàng  │  │ status-pill column reuses Master's .badge  │   │
│ Thông báo │  │ classes verbatim, 36px row height           │   │
└───────────┴──────────────────────────────────────────────────┘
```

Mobile (< 768px): sidebar collapses to a hamburger-triggered drawer, header
stays fixed (per Master's own Sticky Navigation guidance — compensate with
`padding-top` equal to header height, never let it overlap content).

## Components (new, reusable across future web-accounting pages)

- **`DashboardShell`** — header + sidebar + content slot. The one layout
  component every authenticated page renders inside.
- **`NotificationBell`** — unread count badge (reuses Master's `.badge`
  classes, `role="status"`/`aria-atomic` per its own async-badge rule) +
  dropdown listing recent notifications, "mark all read" action. Backs
  directly onto `GET /v1/notifications/unread-count` and
  `GET /v1/notifications` — the notifications feature this pairs with.
- **`DataTable`** — sortable, sticky header, empty state (reuses Master's
  `EmptyState` component/markup verbatim), loading skeleton (reuses
  Master's `.skeleton` pattern). Generic over columns — the ONE table
  component every future data page (orders, invoices, stock) reuses.
- **`StatusPill`** — thin wrapper around Master's `.badge` classes, mapping
  domain statuses (order/invoice/notification state) to the existing
  success/pending/neutral/error variants — never a 5th ad hoc color.

## First-cut page scope (this build)

1. **`/login`** — email+password form + "Sign in with Google" button. No
   hero, no marketing copy — a single centered card, same restrained shape
   as buyer-portal's result card, just with form fields instead of trace
   data.
2. **`/` (dashboard shell + orders list)** — `DashboardShell` wrapping a
   `DataTable` of the tenant's orders (`GET /v1/orders`), proving the whole
   shape (auth, layout, real data, status pills) end-to-end. Invoices/stock
   pages reuse the exact same `DataTable`/`DashboardShell` components later
   — not built in this first cut (documented scope cut, matching this
   repo's own "narrow but real" discipline elsewhere).
3. **Notification bell**, wired into the header on every authenticated
   page — the one piece that must ship now while the design is being done,
   since it's the direct pairing with the just-built backend feature.

## Auth token handling — this Next.js app is its own thin BFF

`backend-api` has no CORS configured at all (never needed it —
`web-buyer-portal` only ever fetches server-side, in a Server Component).
Rather than add CORS just to let the browser call `backend-api` directly
(which would also mean putting `accessToken`/`refreshToken` somewhere
client JS can read them — real XSS exposure), this app's own Next.js Route
Handlers (`app/api/auth/*`) proxy to `backend-api`'s real
`/v1/auth/{login,google,refresh,logout}` and set the tokens as `httpOnly`
cookies on THIS app's own domain. The browser never sees a token; every
Server Component/Server Action reads the access-token cookie via
`next/headers` and calls `backend-api` with it as a normal
`Authorization: Bearer` header — same real endpoints real login already
exposes, no new backend-api work needed, no CORS needed anywhere.
