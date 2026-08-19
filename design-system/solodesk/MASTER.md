# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** SoloDesk
**Generated:** 2026-08-19 19:19:51
**Category:** Agriculture/Farm Tech
**Design Dials:** Density 4/10 (Standard)

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#15803D` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#22C55E` | `--color-secondary` |
| On Secondary | `#0F172A` | `--color-on-secondary` |
| Accent/CTA | `#A16207` | `--color-accent` |
| On Accent/CTA | `#FFFFFF` | `--color-on-accent` |
| Background | `#F0FDF4` | `--color-background` |
| Foreground | `#14532D` | `--color-foreground` |
| Card | `#FFFFFF` | `--color-card` |
| Card Foreground | `#14532D` | `--color-card-foreground` |
| Muted | `#E8F0F1` | `--color-muted` |
| Muted Foreground | `#475569` | `--color-muted-foreground` |
| Border | `#BBF7D0` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#15803D` | `--color-ring` |

**Color Notes:** Earth green + harvest gold [Accent adjusted from #CA8A04]

### Typography

**Overridden manually** — the tool's automatic aggregation for this query
paired "Fira Code / Fira Sans" (mood: dashboard, code, technical), which
fits an admin/analytics screen, not a consumer-facing trust/provenance
page or a general accounting/B2G staff app. A separate `--domain
typography` search for "trustworthy professional readable" surfaced
"Corporate Trust" (Lexend + Source Sans 3), explicitly designed for
readability/accessibility — a better fit for all three planned apps
(buyer-portal is consumer-facing on mobile in variable lighting;
web-accounting/web-b2g-dashboard are staff tools, not developer tools).

- **Heading Font:** Lexend
- **Body Font:** Source Sans 3
- **Mood:** corporate, trustworthy, accessible, readable, professional, clean
- **Google Fonts:** [Lexend + Source Sans 3](https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&family=Source+Sans+3:wght@300;400;500;600;700&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&family=Source+Sans+3:wght@300;400;500;600;700&display=swap');
```

### Spacing Variables

*Density: 4/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #A16207;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #15803D;
  border: 2px solid #15803D;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #F0FDF4;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #15803D;
  outline: none;
  box-shadow: 0 0 0 3px #15803D20;
}
```

### Status Pill / Badge

Reused across all 3 apps for any "state" signal (trace published, invoice
status, sync status, order channel). Per `--domain ux` guidance: a badge
label must stay on one line (bounded width + `truncate`, never wrap),
never rely on a hover-only tooltip to reveal a truncated value, and any
badge whose value updates asynchronously announces via one atomic
`role="status"` message, not a bare live-region number.

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  max-width: 100%;
}
.badge-text { overflow: hidden; text-overflow: ellipsis; }

.badge-success  { background: #DCFCE7; color: #15803D; } /* published / verified / paid */
.badge-pending   { background: #FEF3C7; color: #A16207; } /* awaiting / in progress */
.badge-neutral   { background: #E8F0F1; color: #475569; } /* informational, e.g. channel */
.badge-error     { background: #FEE2E2; color: #DC2626; } /* not found / failed */
```

```html
<!-- Async-updating badge: one atomic status message, not a bare number -->
<span role="status" aria-atomic="true" class="badge badge-success">
  <span class="badge-text">Verified lot</span>
</span>
```

### Empty / Not-Found State

Per `--domain ux`: never a blank screen — always a helpful message plus,
where one exists, a next action.

```html
<div class="empty-state" role="status">
  <svg aria-hidden="true" class="empty-state-icon"><!-- outline icon, not emoji --></svg>
  <p class="empty-state-title">Lot not found</p>
  <p class="empty-state-body">This QR code doesn't match a published lot. Double-check the code or ask the seller.</p>
</div>
```
```css
.empty-state { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--space-sm); padding: var(--space-2xl) var(--space-lg); color: var(--color-muted-foreground); }
.empty-state-icon { width: 48px; height: 48px; color: var(--color-border); }
.empty-state-title { font-weight: 600; color: var(--color-foreground); }
```

### Loading State

Next.js App Router: a route-level `loading.tsx`, not client-side
`useState` loading flags (`--stack nextjs` guidance) — render a skeleton
matching the real result card's shape so there's no layout shift (CLS)
when real content arrives.

```css
.skeleton { background: linear-gradient(90deg, var(--color-muted) 25%, var(--color-border) 50%, var(--color-muted) 75%); background-size: 200% 100%; animation: skeleton-sweep 1.5s ease-in-out infinite; border-radius: 8px; }
@keyframes skeleton-sweep { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .skeleton { animation: none; opacity: 0.6; } }
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Organic Biophilic

**Keywords:** Nature, organic shapes, green, sustainable, rounded, flowing, wellness, earthy, natural textures

**Best For:** Wellness apps, sustainability brands, eco products, health apps, meditation, organic food brands

**Key Effects:** Rounded corners (16-24px), organic curves (border-radius variations), natural shadows, flowing SVG shapes

### Page Pattern

**"Feature-Rich Showcase" (the tool's default aggregated pattern) does
NOT apply to any of this product's 3 planned apps** — it's a marketing/
conversion landing-page shape (hero, feature grid, social proof, CTA
repetition), and none of `web-buyer-portal`, `web-accounting`, or
`web-b2g-dashboard` are marketing pages; they're utility/data tools
someone reaches by a direct link or login, not a page selling them
something. Use per-app patterns instead (see `pages/*.md` for the first
one, `buyer-portal-trace.md`):

- **Verification/Result pages** (buyer-portal): header bar (logo/wordmark
  only, no nav) → single centered result card → status pill → footer
  disclaimer. No hero, no CTA, no feature grid.
- **Dashboard/data pages** (accounting, b2g): standard app shell — sidebar
  or top nav, content area, data tables/cards. Not covered by this first
  cut; author a `pages/*.md` override when those apps are actually built,
  following this same "verify fit before applying" discipline.

---

## Anti-Patterns (Do NOT Use)

- ❌ Generic design
- ❌ Ignored accessibility
- ❌ AI purple/pink gradients

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
