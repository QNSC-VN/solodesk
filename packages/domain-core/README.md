# @solodesk/domain-core

Pure business logic shared across domain modules — tax rules, thresholds, inventory
ledger math, booking-conflict rules (docs Section 3 / Mục 3). No framework
dependency (no NestJS, no Drizzle), so it stays trivially unit-testable and
portable if a module is ever extracted.

**Check here first before writing business logic in a module** (Section 20.1
rule): if the rule already exists here, import it — don't re-derive it.

Empty on purpose at Sprint 0: the first real content lands with
`catalog-inventory`/`invoicing-tax` (tax-threshold Strategy pattern, Section
20.3/20.5 — every tax constant versioned here, never hardcoded inline in a module).
