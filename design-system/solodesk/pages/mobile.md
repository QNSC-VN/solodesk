# Mobile App Overrides (`apps/mobile`, Flutter)

> **PROJECT:** SoloDesk
> **Page Type:** Flutter mobile app — household-business owner, first-run AI
> onboarding conversation + minimal daily-use home screen
> **Generated:** 2026-08-20, tool run + manual override (see below)

> ⚠️ Rules here **override** `MASTER.md`. Only deviations are documented; for
> everything else (color palette, base typography, spacing scale), use Master.

---

## Why this file exists, and what got overridden from the tool's auto-run

Ran `ui-ux-pro-max --design-system` with query "elderly non-technical
household business owner conversational AI onboarding accessible mobile
app Vietnam" (`--density 3 --variance 3 --motion 3` — spacious/calm/subtle,
matching this audience). Two results needed manual correction before
persisting, same "verify fit, override the tool's wrong auto-aggregation"
discipline as every other page in this design system:

1. **Pattern was "Product Demo + Features"** — a marketing-landing-page
   shape (hero, product video, feature breakdown, comparison, CTA). Wrong
   category entirely: this is a working app someone opens daily, not a page
   selling the app to a visitor. Real pattern for this page, written by
   hand below: **conversation-first onboarding, bottom-nav app shell after**.
2. **Color came back "AI purple + cyan" (`#7C3AED`)** — the exact
   "AI purple/pink gradient" anti-pattern this design system's own Master
   file already flags elsewhere. Also would fork the brand: docs'
   architecture explicitly wants `packages/ui-kit` sharing ONE token set
   across Flutter and Next.js, not a second palette for mobile. **Not
   applied** — this page correctly has no color override, it uses Master's
   Agriculture/Farm Tech palette (`--color-primary` #15803D earth-green,
   `--color-accent` #A16207 harvest-gold) unchanged.
3. **Typography suggested "Inter"** — a fine neutral system font on its
   own merits, but same brand-fork problem as the color. **Not applied** —
   this page uses Master's Lexend (headings) + Source Sans 3 (body)
   unchanged.

What DID carry over from the tool run, because it was actually right for
this audience: **Minimalism & Swiss Style**'s structural values (spacious,
high-contrast, grid-based, minimal chrome) and the accessibility
checklist. Applied below at MOBILE/elderly-appropriate settings, not the
tool's raw defaults (its touch-target/contrast checklist is generic-web;
this page states the actual mobile-platform numbers).

---

## Layout — two real modes, not one shape

### Mode 1: Onboarding conversation (first run, before setup is done)

- Full-screen chat. No bottom nav, no side chrome — nothing to compete
  with the one thing that matters this screen: reading the AI's next
  question and answering it. Matches agent-orchestrator's real `mode:
  'onboarding'` conversation (`POST /v1/conversations`), already built
  server-side — this page is purely the client for it.
- Single column, max content width same as a phone's own width (no
  artificial narrowing — unlike a desktop chat widget, there's no reason
  to leave gutters on a phone screen).
- Progress signal: a thin, non-blocking top indicator (e.g. "Bước 2/5"),
  not a modal wizard with Back/Next buttons — the conversation itself IS
  the navigation. Never let the user get stuck with no way to answer —
  every AI turn ends in a rendered input widget from the closed catalog
  below (buttons, a form, or free text), never a dead end.

### Onboarding — structured input widgets ("Generative UI")

Real feedback on the first build: a single free-text box for every
question — even "what kind of business do you run?" (a closed 3-value
choice) and "connect SePay? yes/no" — tests badly for this audience.
Research confirms the fix direction: quick-reply buttons reduce effort
and guide intent, and are the stronger default at the start of a flow;
free text is for genuinely open-ended answers only, and relying on it
too early raises drop-off. This is doubly true for elderly users
specifically — Bank of America rebuilt its own assistant (Erica) away
from a chat paradigm after finding older customers uncomfortable with
open chat but comfortable with structured, search/menu-like interaction.

The named 2026 pattern for "model decides the input widget, client
renders it" is **Generative UI**: the model doesn't just reply with
prose, it also calls a tool (`present_step`, agent-orchestrator) that
declares which widget to render next, from a **fixed, closed catalog** —
never model-generated arbitrary UI, the concrete pitfall every source on
this pattern names ("the biggest mistake teams make is letting the AI do
anything"). Three widget types, no more, added only when a real 4th
shape is needed:

- **`choice`** — a `Wrap` of tappable buttons (`ChoiceButtons`), never a
  single clipped row (chip-collection-reflow rule: labels stay whole).
  Used for the industry question (3 fixed options, matching the backend's
  own closed enum exactly) and the SePay yes/no question.
- **`form`** — a small set of labeled fields shown together
  (`StepForm`), submitted as one action. Used for the first-product step
  (name/unit/price) — replaced a single comma-separated free-text line,
  which was fragile (wrong field order, a missing comma) and asked the
  user to remember a format instead of just filling in blanks.
- **`text`** — the existing free-text `ChatInput`, unchanged. Reserved
  for genuinely open-ended answers only: the business name, the SePay
  token — nothing with a knowable, closed answer set uses this anymore.

**Voice v1 — TTS + STT (on-device, added after CEO request).** The
elderly audience hears instead of reads, and dictates instead of types:
- Every ASSISTANT bubble carries a speaker button underneath ("bấm để
  nghe") — one control, one mental model: tap to speak, tap again (red
  stop icon) to stop. User bubbles deliberately have none. Speech rate
  0.45, slower than default for this audience. No Vietnamese voice on
  the device → the tap says so with install directions, never a silent
  dead button.
- The `ChatInput` mic slot (reserved since the first build) is real:
  TAP-to-talk, not hold-to-talk (shaky hands release early); the live
  transcript fills the field and stays editable; dictation drafts,
  the user still presses send — same "human presses the button"
  boundary as every AI write. No recognizer on the device → honest
  snackbar, never a dead mic.
- v2 path (documented, not built): cloud Whisper on ml-analytics if
  field accents defeat the on-device recognizer (docs Section 8's own
  named plan); cloud TTS if device voices disappoint.

A `form` step submits a human-readable chat bubble built from each
field's display `label` (e.g. "Tên sản phẩm: Cà phê Arabica"), never the
raw machine-readable wire string sent to agent-orchestrator underneath —
showing a user their own `key=value` payload back at them would be a
real regression in exactly the audience this redesign is for.

### Mode 2: Daily-use home (after onboarding, the app opened tomorrow)

- Bottom nav, 4 tabs max (ui-ux-pro-max's own `bottom-nav-limit` rule):
  **Trang chủ** (Home) / **Đơn hàng** (Orders) / **Trợ lý AI** (AI
  assistant — the default/`assistant` mode conversation, read-only tools)
  / **Thông báo** (Notifications). Order detail/create and the stock list
  are real PUSHED screens (`context.push`), not additional bottom-nav
  tabs — adding a 5th tab would break the tab-limit rule; a quick-action
  button on Home and a FAB on the Orders tab reach them instead.
- Home tab: today's real numbers (revenue, low-stock count, unread
  notifications), two quick-action buttons (Tạo đơn hàng / Xem tồn kho),
  a real 7-day revenue trend chart, and the 3 most recent orders. Still
  NOT the full orders/invoices/stock DataTable parity web-accounting
  has — that's the accountant/staff persona's tool, this is the owner's
  at-a-glance screen. One real number per stat card, large type; the
  trend/recent-orders sections only render once there's real data to
  show (never a chart or list stretched over fake/absent points).
- Orders tab: a real create flow (SKU picker + quantity + optional
  customer name, reachable via the tab's own FAB or Home's quick action)
  and a real detail screen (every order line, not just the list row's
  aggregate total) — the first genuinely CRUD, not read-only, screens in
  this app besides onboarding itself.
- Stock: a real, read-only list (`GET /v1/lots/stock-summary`, the same
  source Home's low-stock count already uses) — reachable from Home's
  quick action, matching `web-accounting`'s stock page data but without
  its editing affordances (this persona is the owner glancing at levels,
  not the accountant managing them).
- Outbound queue ("Hàng đợi gửi đi"): a quick-action button on Home,
  shown only once there's something in it (a pending/failed local
  order) — lists every not-yet-synced order with its real attempt count
  and, for a failed one, the real backend rejection reason plus a
  "Đồng bộ ngay" retry action. See the offline-first section below for
  the mechanism.
- Booking ("Đặt chỗ"): Home's quick-action row became THREE equal
  `Expanded` buttons (Tạo đơn hàng / Đặt chỗ / Tồn kho, 12px gaps —
  equal widths at every size, which is why a fixed Row beat a `Wrap`).
  Booking is a PUSHED screen set like orders/stock, not a 5th tab.
  Time entry is no keyboard fight: a date row + Vietnamese
  `showDatePicker` (`flutter_localizations`, `locale: vi` — without it
  the SDK's own calendar renders English), hour/minute dropdowns,
  duration `ChoiceChip`s — one tap each, the same "buttons before
  typing" rule as the Generative UI research. The create screen's
  remaining-capacity hint ("Còn trống: n chỗ" / "Khung giờ đã đầy")
  mirrors the backend's own overlap rule and is advisory only — the 409
  stays the truth. Status pills reuse `StatusBadge` with Vietnamese
  labels passed per call site (`Đã giữ chỗ`/`Đã xác nhận`/`Đã hủy`/
  `Không đến`, plus an extra `Hết giữ` badge for an expired hold —
  holds expire lazily server-side, so the badge is a display-time
  computation, never a countdown timer).

### Offline-first order creation ("Bán khi mất mạng")

The CEO mockup's own headline demo scenario — sell with no network, the
sale stands, a visible queue drains once connectivity returns — ported
as the mockup's own core property: **the local write IS the
transaction; the network send is a visible, retryable side-channel**,
never a precondition for "order placed" to succeed. `OrderCreateScreen`'s
submit writes to a local SQLite table (`drift`) and returns instantly,
regardless of connectivity; a snackbar says plainly which case just
happened ("Đã tạo đơn hàng — đang đồng bộ" vs "Đã lưu — sẽ đồng bộ khi
có mạng"). A persistent `OfflineBanner` sits above the bottom-nav tabs
(real `connectivity_plus` detection, never a fake manual toggle) whenever
the device is genuinely offline. Every order row (Orders tab, Home's
recent-orders list, the Outbound Queue) carries a small sync-status
badge — `StatusBadge` reused with an explicit Vietnamese label ("Đang
đồng bộ" / "Đồng bộ lỗi") rather than its own auto-titled English
default, the same "never show the user their own raw wire string" rule
`present_step` forms already follow.

**A hard scope boundary discovered mid-build, not assumed up front**:
offline selling requires the product PICKER to work offline too, not
just the write — `OrderCreateScreen`'s SKU list is a real-time read-through
cache (`CachedSkus`), refreshed on every successful online fetch and
served from cache on failure, specifically so the one screen this whole
feature is about doesn't itself require a live connection to open.
Stock levels and notifications remain online-only reads by deliberate
choice (a real, narrower cut) — they degrade to "0"/"can't tell" rather
than blocking the screen, never a silent crash.

**Sales trend chart** — a real 7-day line chart (`fl_chart`), only
rendered once ≥4 of those days have real revenue (`ui-ux-pro-max`'s own
chart guidance: fewer real points reads as noise, not a trend — a stat
card is the honest choice below that threshold, which is exactly what a
fresh tenant already sees via the 3 stat cards above it).

---

## Touch targets & spacing — real platform numbers, not web defaults

- **48dp minimum** on Android, **44pt minimum** on iOS for every tappable
  element (buttons, chat send button, nav tabs) — the real per-platform
  guidance, not a single "44px" web rule applied blindly to a native app.
- **12px minimum gap** between adjacent tappable elements — slightly
  above the generic 8px floor, deliberately, for this audience (a
  non-technical, possibly-first-smartphone-experience user mis-tapping an
  adjacent button is a worse failure here than for a professional
  dashboard user).
- Base body text **18sp**, not the web default 16px — elderly users are
  this app's primary persona (docs' own framing), and there's no reason
  to default to a size tuned for typical office/desktop reading distance.
  Headings scale up proportionally from Master's existing Lexend/Source
  Sans 3 type scale, not a new type ramp.

---

## Reusable Flutter widgets (`apps/mobile/lib/widgets/`)

Copied-not-shared convention, same as every cross-app component set in
this repo (web-buyer-portal's `Badge`/`EmptyState` copied into
web-accounting, not a package) — Flutter widgets can't literally be
shared with the Next.js apps' React components anyway, only the design
TOKENS (`packages/ui-kit`) are shared.

- **`AppButton`** — primary (harvest-gold accent, filled) / secondary
  (earth-green, outlined). 48dp min height, 8px corner radius matching
  Master's card radius.
- **`AppTextField`** — visible label above (never placeholder-only, per
  Master's own Forms rule), 48dp min height.
- **`ChatBubble`** — user (right-aligned, primary-tinted background) vs.
  assistant (left-aligned, `--color-card` background, subtle border) — one
  shape, mirrored, not two different visual languages.
- **`ChatTypingIndicator`** — 3-dot pulse, shown while waiting on a real
  agent-orchestrator response — never a spinner with no context (the
  tool's own "streaming/typing indicator" recommendation, applied for
  real here since this page genuinely has an async AI response to cover).
- **`ChatInput`** — text field + send button + a reserved mic-button slot
  (disabled/hidden in v1 — voice input is a documented v2 cut, not built
  yet, see CLAUDE.md's mobile-app scope note) so adding real voice later
  doesn't require a layout rework. Only rendered for a `text`-type step.
- **`ChoiceButtons`** — Generative UI's `choice` step widget, a `Wrap` of
  outlined buttons, each ≥48dp, tapping immediately sends that option's
  exact label as the answer (no separate submit step, matching the
  research finding that buttons should minimize taps/typing).
- **`StepForm`** — Generative UI's `form` step widget, a small dynamic
  set of labeled `TextField`s (numeric keyboard for `number`-type fields)
  with one "Xác nhận" submit button, disabled until every field is filled.
- **`StatusBadge`** — `StatusPill`'s Flutter twin, same status→color
  mapping as web (`confirmed`→success green, `cancelled`→error red,
  `returned`→neutral) — one mapping table, ported, not reinvented per
  platform.
- **`EmptyState`** — title + body + (optional) one action button, same
  "never a blank screen" rule as the web `EmptyState` component.
- **`SalesTrendChart`** — a real 7-day `fl_chart` line chart (Home tab
  only), see the Motion/chart-guidance note above for when it's shown.
- **`HomeSummaryCard`** — one real number, one label, optional trend
  arrow — the Home tab's one repeating shape.
- **`BottomNavShell`** — the 4-tab shell described above.

### Tax & filing ("Thuế & khai báo")

A pushed screen (`/home/tax`), reached from a Home quick action — not a
5th bottom-nav tab (stays at 4). Two real states, not one shape: a
first-run rate-group picker (`ChoiceButtons`, the SAME closed-catalog
widget onboarding's Generative UI already established — never free text
for a fixed 4-option set), and, once set, the real quarterly estimate.
The draft-rate disclaimer banner is gated on the real `isDraft` flag from
the API response, never a hardcoded string — the one place on this
screen where the number itself could be wrong, so the warning has to be
data-driven too, matching the mockup's own `canDoiChieu` mechanism. The
receipt-code "đóng sổ kỳ" action reuses `showDialog`/`AlertDialog` (the
same modal primitive booking's cancel/no-show confirmations already
use) rather than introducing a bottom-sheet pattern for one screen.

---

## Motion

- **Subtle only** — the typing indicator's pulse, a soft fade when a new
  chat message appears, tab-switch cross-fade. No scroll-reveal choreography
  (that was the wrong marketing-page suggestion) — nothing here scrolls
  past a hero, there's no hero.
- Respect the OS-level reduced-motion setting (`MediaQuery.disableAnimations`
  in Flutter) exactly like the web apps respect `prefers-reduced-motion`.

---

## Pre-delivery checklist (mobile-specific, supplements Master's web checklist)

- [ ] Every tappable element ≥48dp (Android) / ≥44pt (iOS), never a raw
      icon button sized to its icon
- [ ] `Semantics` widget on every custom-painted/gesture-only control
      (Flutter's real screen-reader hook — TalkBack/VoiceOver both tested,
      not just assumed from a visual review)
- [ ] Base body text 18sp minimum on the onboarding/home screens
- [ ] Every form field uses the matching `inputmode`/`TextInputType`
      (numeric keypad for quantities/prices, not the default text keyboard)
- [ ] No screen the user can get stuck on with no visible next action —
      true for both the AI conversation (every turn ends in a clear
      question/choice) and the home screen (every empty state has a
      next-action button)
