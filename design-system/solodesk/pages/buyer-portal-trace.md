# Page Override: Buyer Portal — `/trace/[lotId]`

> Overrides `MASTER.md`'s "Page Pattern" section only. Everything else
> (colors, typography, component specs) inherits from Master unchanged.

## Context

A buyer scans a QR code printed on a product lot (coffee, produce, etc.)
and lands here directly — no login, no navigation, often on a slow mobile
connection in a shop or market. The entire job of this page is: confirm
this specific lot is real, published, and traceable back to a formalized
household business. One data point, one moment, then they're gone. This
is NOT a marketing page and gets none of Master's "Feature-Rich Showcase"
pattern — no hero, no CTA, no feature grid, no social proof section.

## Layout (mobile-first, 375px baseline)

```
┌─────────────────────────────┐
│  SoloDesk  (wordmark, small) │  <- header, ~56px, no nav links
├─────────────────────────────┤
│                             │
│   ┌─────────────────────┐   │
│   │  [status pill]       │   │  <- badge-success "Verified lot"
│   │                       │   │
│   │  Cà phê Arabica       │   │  <- skuName, Lexend 24px/600
│   │  Coffee · LOT-2026-…  │   │  <- skuCategory + lotCode, muted
│   │                       │   │
│   │  ─────────────────    │   │
│   │  Supplier   Nông Trại │   │  <- key/value rows, only if supplierName present
│   │  Channel    Thu mua   │   │  <- sourceChannel
│   │  Received   12/08/26  │   │  <- receivedAt, localized date
│   │  Published  15/08/26  │   │  <- publishedAt
│   └─────────────────────┘   │
│                             │
│   Powered by SoloDesk —     │  <- footer disclaimer, small, muted
│   Kế nghiệp số Gia Lai      │
└─────────────────────────────┘
```

- Single column, always — this page never needs a 2-column desktop
  layout; most visitors arrive on a phone mid-QR-scan. Cap card width at
  `480px`, centered, on any viewport wider than mobile.
- Card uses `--shadow-md`, `border-radius: 16px` (Organic Biophilic's
  16-24px rounding), `--color-card` background.
- No sourceChannel/date jargon — label them in plain Vietnamese
  ("Nguồn gốc", "Ngày nhận hàng", "Ngày công bố"), not raw enum values
  from the API (`sourceChannel` like `purchase_note` must be mapped to a
  human label, never rendered raw).

## States

- **Found + published** (the `GET /v1/trace/:lotId` 200 case): the card
  above, `badge-success`.
- **Not found** (backend's `NotFoundException` — lot never published, or
  wrong/mistyped code): the Empty/Not-Found State component from Master,
  `badge-error` if a pill is shown at all. Never show a blank page or a
  raw error message/stack trace.
- **Loading**: `loading.tsx` skeleton shaped exactly like the found-state
  card (same card outline, `.skeleton` blocks where the SKU name/rows go)
  — avoids CLS when real data streams in, per Next.js Server Component
  fetch guidance in Master.

## Content tone

Plain, short, factual — this is a trust artifact, not a brand moment.
Avoid marketing language ("Discover the journey of your coffee!"); state
what's true ("Lô hàng này đã được xác minh và công bố công khai.").
