# Solution Architecture — SoloDesk Platform (Gia Lai Digital Succession Program)

*Consolidated from architecture design session, 2026-08-18. This is the production architecture, superseding the mockup's simulated layer (localStorage, fake sync queue in `mobile.html`/`web.html`/`b2g.html`/`index.html`) with a real system designed to survive the program's stated scaling path: 5–10 pilot households (Q4 2026) → 100–150 households/cohort (2027) → thousands of households/year.*

## 1. Design Principles

1. **Right-size for known scale, not imagined scale.** Modular monolith first. Split out a separate deployable only for a concrete reason (different language ecosystem, different scaling profile, different blast-radius/security boundary, or a platform-mandated split) — never because it "sounds more scalable."
2. **Measure before you switch technology.** Infrastructure decisions (language, broker, queue) are made from measured evidence, not anticipated risk.
3. **Tenant isolation is enforced at the data layer, not just the application layer.** This is a multi-tenant SaaS with concurrent AI agents running across tenants — a mistake here is real data leakage, not a UI bug.
4. **Build on top of the free national platform, don't lock into something that doesn't exist yet.** The free accounting platform mandated under Article 10, Decree 20/2026/NĐ-CP has **not launched as of Aug 2026** — the Tax Department is still evaluating three implementation proposals, no public API exists. Architecture reserves a pluggable connector slot for this; it is not a blocker for pilot.
5. **No new software from scratch (per the program's own constraint).** This is packaged as a configurable platform product, with Gia Lai as the first tenant/rollout program — not a bespoke provincial app.

## 2. Overall Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ CLIENT LAYER                                                     │
│  Flutter app (offline-first, mobile-first, Vietnamese voice input)│
│  Next.js 16 web (shared accountant / B2G dashboard / buyer portal)│
└───────────────┬───────────────────────────────┬─────────────────┘
                │ sync (PowerSync)               │ REST/tRPC
┌───────────────▼───────────────────────────────▼─────────────────┐
│ API GATEWAY — NestJS (Node.js 24 LTS)                            │
│  auth · rate-limit per (tenant, provider) via Redis · routing    │
├───────────────────────────────────────────────────────────────────┤
│ DOMAIN MODULES (modular monolith, hexagonal per module)          │
│  Identity·Tenant | Catalog·Inventory | Sales·Order | Invoicing·Tax│
│  Payment·Reconcile | Booking·Resource | Procurement | Traceability│
├───────────────────────────────────────────────────────────────────┤
│ AGENT LAYER                                                       │
│  Temporal worker (durable workflow, workflow ID = tenant:session) │
│  Agent loop inside Activities — Layer A (constrained tool-calling/│
│  text-to-SQL, RLS-scoped) + Layer B (pgvector RAG, versioned +    │
│  approved + cited)                                                │
│  MCP as the standard for exposing internal tools to the agent     │
├───────────────────────────────────────────────────────────────────┤
│ INTEGRATION LAYER — connector-hub (vault + proxy/adapter)         │
│  shopee · tiktok-shop · lazada · misa-meinvoice · viettel-sinvoice│
│  vnpt-invoice · sepay-vietqr · ghn · ghtk · viettelpost ·         │
│  booking-com · agoda · national-free-platform [STUB — pending    │
│  Tax Dept. API]                                                   │
├───────────────────────────────────────────────────────────────────┤
│ ML/ANALYTICS SERVICE (Python/FastAPI) — forecasting, STT fine-tune│
├───────────────────────────────────────────────────────────────────┤
│ DATA LAYER — PostgreSQL on RDS, org's `rds` module (RLS mandatory │
│  on every table) + pgvector · Valkey on ElastiCache (org's        │
│  `cache` module: rate-limit/cache/BullMQ) · SQS/SNS (org's        │
│  `messaging` module, event bus) · dedicated read replica for      │
│  KB/vector queries (isolated from transactional writes)           │
└─────────────────────────────────────────────────────────────────┘
```

### Bounded Contexts (Domain Modules)

| Module | Responsibility |
|---|---|
| Identity & Tenant | Household/business = tenant, in-household roles, device sessions |
| Catalog & Inventory | SKU, lot/batch, real-time stock ledger synced across channels |
| Sales & Order | Counter sales, multi-channel orders, offline-first |
| Invoicing & Tax | POS-linked e-invoice, tax calc by household/business type, filing deadlines |
| Payment & Reconciliation | QR, cash, bank/marketplace reconciliation |
| Booking & Resource | Calendar, capacity, temporary holds, no-shows |
| Procurement (purchase notes) | Farmer purchase ledger, input documentation, per-supplier negotiated pricing |
| Traceability | Lot-based tracing, public QR-accessible page |
| Channel Integration Hub | Marketplaces, shipping, food delivery, booking platforms, social channels |
| AI Assistant | Two layers: data Q&A (Layer A) + cited policy Q&A (Layer B) |
| Program/B2G | Activation tracking, payment gates, anonymized aggregate dashboard |
| Accounting Bridge | Connector to the free national accounting platform once it launches |

## 3. Why Modular Monolith, Not Microservices (Yet)

Microservices carry a real cost at this stage: business transactions crossing multiple services become distributed sagas (network calls, retries) instead of in-process function calls, and the team is small — there's no need yet for many teams deploying independently. Reference case: Amazon Prime Video (2023) rolled a microservice back into a monolith because inter-service network call cost outweighed the benefit; Segment published a similar "goodbye microservices" account.

A modular monolith (module = bounded context, clear boundaries, hexagonal layout: domain/application/infra/api per module) delivers most of the benefit — testability, clear boundaries, replaceability — without distributed-systems overhead. Extraction follows the strangler pattern only when there's concrete evidence (hot path, independent scaling need).

### The 4 Real Deployables (One Monorepo) — Each With Its Own Justification

| Deployable | Language | Reason to split |
|---|---|---|
| `backend-api` | NestJS/Node | Bulk of domain logic, HTTP API, Temporal client |
| `agent-orchestrator` | Node | Mandated by Temporal's own architecture — the Activity-executing worker must run as a separate process from the workflow-starting client |
| `connector-hub` | Node (Go if metrics justify it) | Blast-radius isolation (a Shopee/TikTok outage must not take down core) + security boundary (only this component touches the credential vault and calls out to the internet) |
| `ml-analytics` | Python/FastAPI | Genuinely different ecosystem (pandas/statsmodels/prophet, Vietnamese Whisper fine-tuning) |

This is still **one monorepo** — a polyrepo (separate git repos per component) only makes sense once there are fully independent teams, which isn't the case yet.

### Why NestJS, Not Go/Rust, for the Core

The bottleneck here isn't CPU — it's third-party API latency and **correctness of business rules** (tax, inventory, booking-conflict logic — a mistake here is a legal/financial mistake, not a performance one). NestJS ships DI/guards/pipes well-suited to validation-heavy business logic, shares types with the web frontend, and has a deeper local hiring pool than Go/Rust. Rust fits extreme-performance engines (no such workload exists here). Go genuinely fits `connector-hub` (high I/O-bound concurrency, lightweight goroutines) — worth writing in Go if the team already has the skill, not mandatory otherwise.

## 4. Multi-Tenancy & Data Isolation Under Concurrent AI Agents

This is the highest-risk part of the architecture — concrete mechanisms, not just principles.

### 4.1 Enforce Tenant Boundary at the Database Layer

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY; -- no bypass, even for superuser connections
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

- Use `SET LOCAL app.tenant_id = $1` **inside the transaction**, never session-level `SET` — with transaction-mode connection pooling, connections are reused across different tenants; `SET LOCAL` is automatically cleared on commit/rollback and cannot leak into the next request.
- Use transaction pooling, not statement pooling, so `app.tenant_id` doesn't get lost between statements within the same session.
- **The Temporal workflow ID (`tenant:session`) is for observability/routing only — it is NOT the security boundary.** The real enforcement is RLS + per-transaction `SET LOCAL`.

### 4.2 Prevent One Tenant's Agent Swarm From Starving Others (Orchestration-Level Noisy Neighbor)

Per-`(tenant, provider)` rate limiting via Redis stops runaway outbound API calls, but doesn't stop one tenant (or a bug) from spinning up unbounded agent workflows and monopolizing the shared Temporal worker pool. Mitigation: a per-tenant **concurrent agent workflow cap**, enforced via a Redis semaphore/token bucket that every workflow must acquire before running its real Activity, or a task queue split by tenant tier.

### 4.3 Split Reads From Writes for the Vector/RAG Layer

pgvector lives in the same Postgres instance as transactional data. Many agents running concurrent RAG (HNSW) queries during peak sales hours will contend with transactional writes. Mitigation: a **dedicated read replica for KB/vector queries** — route agent RAG queries there, keep the primary dedicated to transactional writes.

### 4.4 Defense-in-Depth at the Tool Execution Entry Point

At every tool-call entry point: explicitly assert that the `tenant_id` stored in session state matches the `tenant_id` passed by the API caller, and reject before touching the database if it doesn't. This guards against a routing bug sending a request to the wrong session — a failure mode RLS cannot catch, since it happens before the query reaches the database.

### 4.5 Mandatory CI Testing

AI agents are non-deterministic — unit tests aren't sufficient. Maintain an integration test suite: spin up two fake tenants, run multiple concurrent agent sessions for real (real concurrency, not mocked), and assert zero cross-tenant data leakage in responses. Run this on every change touching Layer A tools or prompts.

## 5. AI/Agent Architecture

### 5.1 Two Assistant Layers — Match the Question Type to the Mechanism

- **Layer A (household's own data):** NOT RAG. This is precise transactional data — use constrained tool-calling/text-to-SQL (never free-form SQL generation — injection/schema-hallucination risk) executed directly against Postgres, with `app.tenant_id` set on the session so RLS enforces the boundary automatically.
- **Layer B (policy content):** Real RAG on pgvector — no separate vector database needed at thousands-of-tenants scale (revisit Pinecone/Qdrant only past ~50–100M vectors). The KB table requires `version`, `approved_by`, `source_ref` columns — every answer must cite its source (this preserves the mockup's "where is this computed from" instinct, which is a genuine strength worth defending in front of the evaluation board and any audit).

```sql
CREATE TABLE kb_chunk (
  id uuid PRIMARY KEY,
  doc_id uuid, version int, approved_by uuid, approved_at timestamptz,
  embedding vector(1536),
  content text, source_ref text
);
CREATE INDEX ON kb_chunk USING hnsw (embedding vector_cosine_ops);
```

### 5.2 Orchestration — Temporal + Agent Loop Inside Activities

2025–2026 consensus: Temporal as the outer durable-execution layer, with the agent loop (calling model SDKs directly via MCP) running inside an Activity. CrewAI/AutoGen are prototyping tools, not the production backbone here. LangChain is deliberately excluded from the execution layer — it adds abstraction that isn't needed, is harder to debug in production, and its APIs churn across versions; calling the Anthropic/OpenAI/Google SDKs directly plus an MCP client is sufficient. If a unified SDK is wanted for the streaming chat UI, use the **Vercel AI SDK** at the UI layer only — it never touches the tool-execution layer.

- Every side-effecting tool (create a Shopee shop, issue an invoice) requires an **idempotency key** — a Postgres `idempotency_keys` table (unique constraint) or a Redis TTL entry — to prevent duplicate execution when an agent retries (which happens 15–30% of the time due to timeouts/model uncertainty).
- Multi-step sagas (book a slot + take a deposit + confirm, or connect a Shopee account via OAuth + verify + register webhooks) are implemented as **Temporal workflows** — Temporal itself is the saga orchestrator; no separate saga framework is needed.
- MCP (Model Context Protocol) is the standard for exposing tools — the 2026 de facto standard, compatible with Claude/GPT/Gemini, avoiding lock-in to a single model vendor.

### 5.3 AI Observability & Governance — Self-Hosted Langfuse

Needed for: tracing every agent tool-call step (debugging "why did it answer wrong"), per-tenant cost/token tracking, prompt and Layer-B content version management with approval workflow, and eval datasets for regression-testing prompts before deploy. **Self-hosted, not a foreign SaaS** — household data belongs to the household (per the program's data-boundary constraint), so tenant question/data content should never transit a third-party service. Combine with OpenTelemetry for tracing across all four deployables, not just the AI path.

**Where prompts live — not a single answer, split by what actually changes.** CXGenie (Section 18) shows a real, partially-good pattern worth learning from directly: system/orchestration prompts (intent classification, SQL generation, KB extraction) are hardcoded in `prompt_const.py`, while a per-customer persona prompt (`default_prompt`/`custom_prompt`) lives on a DB column. That split — code for logic-coupled prompts, a mutable store for content that needs to change independently of a deploy — is the right instinct, but CXGenie's execution has two concrete gaps worth avoiding:

1. **No versioning/approval on the DB-stored prompt** — the same discipline gap already flagged for their KB content (Section 18.2), applied to prompts too: a `TEXT` column with no history means no rollback if an edit breaks behavior.
2. **Hardcoded system prompts force a full code deploy for any wording tweak** — evidenced by real hotfix branches in their own history (`fix/openai-leak-prompt`, `fix/fix-translate-prompt`) that only changed prompt text, not logic, yet needed the full CI/CD cycle.

The fix for this project: prompts tightly coupled to code/schema (e.g. an MCP tool's instruction text that must match its JSON schema exactly) stay in `packages/mcp-tools`, versioned with the code they ship alongside. Everything else that needs faster iteration with a real audit trail — the Layer A/B assistant's system voice, the groundedness-judge prompt (Section 5.6), few-shot examples — is managed through **Langfuse's native prompt management** (versioned, labeled production/staging, fetched at runtime via SDK with caching, rollback without a redeploy) instead of either a bare DB column or a hardcoded file. Layer B knowledge content itself keeps living in `kb_chunk` with `version`/`approved_by`/`source_ref` as already specified — that governance was already correct.

**Prompt-writing craft — lessons from reading CXGenie's actual prompts, not just their storage.** A few concrete techniques worth copying, and specific defects worth deliberately avoiding:

- Copy: enforcing JSON output by showing an inline example schema (not just describing the format in prose), numbered step-by-step instructions for multi-step reasoning, embedded few-shot examples, and consistent language enforcement via a template variable (`{language}`) — all genuinely solid technique, reused here.
- Avoid: **same-call self-assessed groundedness** — CXGenie's answer-generation prompt asks the model to self-report `have_enough_information_for_reply` in the same completion that produced the answer, which is a model grading its own work in the same breath and tends to be overconfident. This project's separate-model, separate-call groundedness check (Section 5.6) is the more reliable design — this finding confirms that choice rather than changing it.
- Avoid: **untrusted content concatenated into the system prompt with no delimiter** — `custom_prompt + '\nToday is {today_date}...'` mixes tenant-supplied text directly into the instruction stream with no boundary, which is very likely why they later had to bolt on a reactive "Leak Prompt" intent-detection category as a patch. For this project, any dynamic or tenant-supplied content injected into a prompt (retrieved KB chunks, a household's own free-text input) must be wrapped in a clear delimiter (e.g. an XML-style tag) separating it from core system instructions — a structural defense, not a reactive classifier bolted on afterward.
- Avoid: **verbose, non-actionable instruction prose** — lines like "incorporate a feedback loop for continuous refinement" describe something a single stateless completion cannot actually do; padding like this wastes tokens (working against Section 5.8's cost optimization) without changing model behavior. Every line in a system prompt here should be checkable/actionable within one call.
- Adopt explicitly: **temperature discipline by task type** — CXGenie's code shows no visible distinction here. Every intermediate step (routing, classification, the groundedness judge) runs at `temperature=0` for determinism; only the final household-facing answer uses a warmer setting for natural tone.

### 5.4 AI-Assisted Onboarding/Integration Copilot

**Build, don't buy**, for the Southeast Asia + Vietnam-specific layer — Merge/Apideck/Nango/Rutter (200–800 connectors) don't cover Shopee/Lazada/VNPT/MISA/VietQR. But the reusable pattern is Nango's own three-layer architecture: **vault** (encrypted tokens, auto-refresh, per-tenant isolation) → **proxy/adapter** (injects credentials into requests, handles retries/rate-limits — credentials never leave this layer) → **sync engine** (normalized internal schema, one/two-way sync).

Core rule: **the AI agent never sees a raw secret.** The agent holds only a narrowly-scoped, task-lifetime session token; the backend/broker resolves the real credential, makes the call, and returns filtered results, with every use audit-logged.

Onboarding copilot flow: agent proposes a step → calls a broker tool to execute it → calls a read-only verification endpoint → reports the outcome → self-corrects and retries on recoverable errors → escalates to a human when it can't resolve (expired OAuth, wrong key format, MFA) — matching the program's own "hands-on setup support" requirement.

### 5.5 LLM Gateway & Multi-Provider Failover

A self-hosted **LiteLLM** gateway sits between `agent-orchestrator` and the provider APIs (Claude/GPT/Gemini). It is the current (2026) leading self-hostable option for this pattern — unified request format across providers, automatic fallback chains, retry/cooldown, and per-key budgets — chosen over Portkey (core now Apache 2.0, but the full platform leans managed/SaaS) and Helicone (excluded — in maintenance mode since its March 2026 acquisition, no further feature development).

- Fallback chain: primary Claude Sonnet 5/Opus 5 → GPT-5.6 → Gemini 3.7, automatic on error/timeout.
- Per-tenant virtual keys with `max_budget`/rate-limit tiers, enforced at the gateway — a separate control from the Redis rate-limit bucket used for third-party API calls (Section 4.2), not a replacement for it.
- Because tools are defined via MCP (vendor-agnostic schema), switching providers mid-session doesn't break tool-calling logic — this is where the earlier MCP choice pays off directly.

### 5.6 Hallucination Mitigation & Verification Pipeline

**Layer A (tool-calling/SQL):** strict JSON schema validation (`additionalProperties: false`) on every generated tool call, plus a dry-run/`EXPLAIN` step before executing anything with a side effect — the model self-corrects on a failed dry-run. Higher-risk actions get a human-approval gate when confidence is low, on top of (not instead of) the idempotency-key protection already required for every side effect (Section 5.2).

**Layer B (RAG):** a groundedness check before the answer reaches the household — a cheaper judge model (Haiku 4.5) scores whether the drafted answer is actually supported by the retrieved `kb_chunk` rows. Below threshold, the assistant declines or asks a clarifying question instead of confabulating. This is the RAGAS/TruLens "RAG Triad" technique (groundedness, context relevance, answer relevance) — run offline for eval (RAGAS/DeepEval) and live via the already-adopted Langfuse.

**Abstention:** track the "I don't know" rate as a live Langfuse metric. A rising rate signals poor retrieval or an out-of-scope question and routes to human support instead of forcing an answer.

### 5.7 Session & Resume Management

Each conversation is one Temporal workflow, checkpointed after every step — a crash resumes exactly where it left off, with no data loss and no duplicate side effects (idempotency-key). A session waiting on a slow human step (e.g. mid-way through an OAuth onboarding flow) uses Temporal's signal/wait pattern instead of holding a connection open. Sessions are keyed server-side by `(tenant_id, conversation_id)`, not by device — losing or replacing a phone resumes the same conversation with no lost context.

### 5.8 Cost & Token Optimization

- **Prompt caching** (Anthropic native, ~90% discount on cache reads): the static portion of every call — system prompt, tool schemas, reused KB content — goes in the cached prefix; the household's actual question goes last. This system re-sends the same schema/KB content on nearly every call, making this a high-value target.
- **Model cascading**: Haiku 4.5 handles routing and straightforward Layer-A questions by default; escalation to Opus 5 happens only when complexity or the Section 5.6 groundedness check signals low confidence — a dynamic escalation, not a fixed per-question-type assignment (RouteLLM is the reference implementation: ~85% cost reduction at ~95% of frontier-quality retention).
- **Batch APIs** (flat ~50% discount, ~24h SLA): used only for non-realtime work — regenerating forecast narratives from `ml-analytics`, bulk re-embedding of the KB after a new approved version — never for live household-facing chat.
- Per-tenant LLM budget enforcement happens at the LiteLLM gateway (virtual key `max_budget`), separate from the Redis rate-limit bucket used for third-party API calls.

### 5.9 Prompt Injection Defense — Consolidated

This isn't new machinery — it's naming a defense that's currently scattered across several sections as one explicit, auditable principle, plus closing two gaps found by checking each content source that reaches an LLM prompt against it.

**The principle**: any content not authored by the system's own fixed instructions — a household's free-text question, a retrieved `kb_chunk`, a third-party webhook payload, onboarding-conversation input — is treated as data, never as a source of executable directives. Where it's combined with system instructions in a single prompt, it's wrapped in a clear delimiter (an XML-style tag is sufficient) separating it from the instruction stream, rather than concatenated in directly (Section 5.3's fix for tenant-supplied prompt content applies the same rule; this section generalizes it).

**Already in place, each defending a different consequence — worth naming together**:
- **Secret exfiltration via injection is structurally impossible**: the agent never holds a raw credential to begin with (Section 5.4) — not a defense against the attempt, but removal of the resource an attempt could ever reach.
- **Cross-tenant action via injection is blocked regardless of whether the injection succeeded in manipulating intent**: RLS (Section 4.1) plus the independent tool-entrypoint tenant assertion (Section 4.4) enforce the boundary at execution time, not at prompt-parsing time.
- **Malformed or malicious tool-call arguments are caught before execution**: strict JSON schema validation plus a dry-run/`EXPLAIN` step (Section 5.6) — documented there as hallucination mitigation, but it equally defends against an injected instruction trying to produce a harmful tool call.
- **Free-form SQL injection is structurally excluded**: Layer A never generates arbitrary SQL, only constrained/templated tool calls (Section 5.1).

**Two gaps closed here**:
1. **Retrieved `kb_chunk` content (Layer B RAG context) must be delimited when inserted into the prompt**, not just trusted because it's approved. The `version`/`approved_by` gate (Section 5.1) is content governance, not injection defense — approved content can still accidentally contain adversarial-looking text (a scraped-and-approved document quoting example injection text, or a lapse in the approval step). Defense-in-depth means delimiting it anyway, the same way tenant-supplied prompt content already is (Section 5.3).
2. **Third-party webhook/connector payloads (Section 7) are the least trusted input surface in the system** — genuinely external, adversary-reachable. If any future feature passes raw payload fields (e.g. a buyer's free-text order note from Shopee) into an LLM context, that content must follow the same delimiting rule, not just the existing "treat webhooks as triggers, not sources of truth" data-correctness guidance.

## 6. Message Queue / Broker / Background Jobs

**Revised from the original NATS JetStream pick** — the org already operates a versioned Terraform `messaging` module (SQS + SNS, DLQ+redrive built in, KMS-encrypted) as part of its shared multi-product platform (see Section 17). Standing up and operating NATS would duplicate infrastructure the org is actively consolidating away from per-product forks — reuse wins under the same "reuse over new tech" principle applied everywhere else in this design.

Three distinct layers — not competing choices:

| Layer | Tool | Role |
|---|---|---|
| Cross-service communication | **SNS + SQS** (org's existing `messaging` Terraform module) | Domain events (`order.created`, `invoice.issued`, `payment.reconciled`) published to an SNS topic, fanned out to SQS queues consumed by B2G aggregation, notifications/inbox, ml-analytics — each with its own DLQ+redrive, already KMS-encrypted |
| Background jobs within a Node service | **BullMQ (on Valkey/ElastiCache)** | PDF invoice generation, filing-deadline reminders, QR traceability image resizing. Valkey is already in the stack (org's `cache` module) and is Redis-protocol compatible — no new infrastructure, BullMQ works unchanged |
| Background jobs within the Python service | **arq/Celery (as needed)** | Periodic forecasting model retraining — fully decoupled from the SNS/SQS event path |

**Not Kafka at this stage** — the right tool for millions of events/sec across many independent teams; its operational cost (Zookeeper/KRaft, partitions, consumer-group rebalancing) far outweighs the benefit at a thousands-of-households-per-year scale. **Not RabbitMQ** — not wrong, but there's no reason to stand up and operate a new broker when SNS/SQS is already a working, versioned module. **Not pg-boss** — a polling queue sharing the same Postgres instance as transactional + RLS workload would contend with and degrade the primary database; Postgres stays dedicated to business data.

**BullMQ's "stalled job" risk** (a worker holds a Redis TTL lock; if the job handler blocks the event loop with synchronous CPU work, the lock-renewal heartbeat misses its window, the job is marked stalled and re-queued, potentially causing duplicate execution): mitigated by (a) never running heavy synchronous CPU work inside a job processor — offload to `worker_threads`; (b) the idempotency-key discipline already required for every side effect, which neutralizes the impact of an occasional duplicate run.

Because SNS/SQS is a managed AWS service behind an already-versioned Terraform module (not new infrastructure to operate), it's reasonable to use it from pilot day one rather than gating it behind a scale threshold the way a self-operated broker like NATS would have needed.

## 7. Inbound Webhook/Event Reliability

Treat webhooks as triggers, not sources of truth — never assume delivery order. Deduplicate via a unique index on `provider_event_id`. Retry with backoff (30s→2m→10m→1h→4h→12h). Normalize disparate provider payloads into a common envelope (CloudEvents-style: id/source/type/time) before they reach business logic.

## 8. Repo Architecture

```
solodesk/
├── apps/
│   ├── mobile/                  # Flutter — primary surface for household users
│   ├── web-accounting/          # Next.js 16 — shared accountant / support staff
│   ├── web-b2g-dashboard/       # Next.js 16 — program task-force team
│   └── web-buyer-portal/        # Next.js 16 — buyer-side order confirmation, QR traceability
├── services/
│   ├── backend-api/             # NestJS — gateway + domain modules
│   │   └── src/modules/
│   │       identity-tenant/ catalog-inventory/ sales-order/
│   │       invoicing-tax/ payment-reconcile/ booking-resource/
│   │       procurement/ traceability/
│   │       (each module: domain/ application/ infra/ api/)
│   ├── agent-orchestrator/      # Temporal worker — agent loop inside Activities
│   ├── connector-hub/           # vault + proxy/adapter + sync engine
│   │   └── connectors/
│   │       shopee/ tiktok-shop/ lazada/
│   │       misa-meinvoice/ viettel-sinvoice/ vnpt-invoice/
│   │       sepay-vietqr/ ghn/ ghtk/ viettelpost/ booking-com/ agoda/
│   │       national-free-platform/  # STUB — pending Tax Dept. API
│   └── ml-analytics/    # Python/FastAPI — forecasting, STT fine-tuning
├── packages/
│   ├── domain-core/             # pure business logic: tax rules, thresholds, inventory ledger, booking-conflict rules
│   ├── ui-kit/                  # shared design tokens across Flutter/Next.js
│   ├── mcp-tools/                # MCP tool definitions for the agent (Layer A + Layer B)
│   └── shared-types/             # shared OpenAPI/tRPC contracts
├── infra/
│   ├── terraform/               # references qnsc-tf-modules: rds, ecs-cluster/ecs-service,
│   │                             # cache (Valkey), messaging (SQS/SNS), secrets, network, cf-r2
│   └── temporal/                # workflow deployment config (new ECS-service-based module — org gap)
└── docs/adr/                     # architecture decision records
```

One monorepo (Turborepo/pnpm workspaces), multiple deployables — not a polyrepo.

## 9. Tech Stack (2026)

| Layer | Choice | Rationale |
|---|---|---|
| Mobile | Flutter (stable 3.44.x) | Strong offline-first support, runs well on low-end Android hardware / weak rural connectivity |
| Sync engine | PowerSync | Leading 2026 choice for offline-first mobile + Postgres; "Sync Streams" unifies online/offline sync modes |
| Web | Next.js 16 (App Router, RSC) | Safer ecosystem/hiring bet than TanStack Start (1.0 as of 2026, not yet enterprise-proven) |
| Backend runtime | Node.js 24 LTS | Lower-risk enterprise default; Bun (v1.3) is viable for latency-sensitive services, not yet the default |
| Backend framework | NestJS v11 | The 2026 "gold standard" for TS enterprise modular monoliths |
| Connector-hub | Node (Go if metrics justify it) | High I/O-bound concurrency, blast-radius isolation |
| ML/Analytics | Python/FastAPI | pandas/statsmodels/prophet ecosystem, Whisper fine-tuning |
| Database | PostgreSQL + pgvector, on AWS RDS via the org's existing `rds` module | Reuses already-versioned infra instead of adopting Neon; RLS fits multi-tenancy; pgvector is a small addition to the existing parameter group (enable extension), not a new module |
| Cache/rate-limit/job queue | Valkey (ElastiCache, org's `cache` module) + BullMQ | Redis-protocol compatible, reuses existing infra instead of adopting standalone Redis |
| Event bus | SNS + SQS (org's existing `messaging` module) | Cross-service domain events — reuses existing managed infra instead of standing up NATS |
| Durable agent workflow | Temporal | Deepest production track record for long-running, auditable/replayable workflows |
| Agent tool standard | MCP | 2026 de facto standard, multi-vendor model compatibility |
| LLM — cheap/fast routing | Claude Sonnet 5 / Haiku 4.5 | Cost/latency balance for tool-routing and "your data" Q&A |
| LLM — complex reasoning | Claude Opus 5 | Revenue forecasting, deep analysis, high-accuracy Layer-B content |
| AI observability | Langfuse (self-hosted) + OpenTelemetry | Tracing, per-tenant cost, prompt versioning, evals |
| E-invoicing | MISA meInvoice Open API (primary), Viettel S-Invoice/VNPT Invoice in parallel | MISA is the only provider with fully published Open API/SDK docs and proven POS integrations (e.g. KiotViet) |
| QR/bank reconciliation | SePay (NAPAS-authorized partner) | Real-time webhooks + reconciliation |
| Vietnamese voice input | FPT.AI/Viettel AI cloud STT (online) + fine-tuned Whisper-small on-device (offline fallback) | Base Whisper-tiny performs poorly on Vietnamese (~60% WER) |
| Deployment | ECS Fargate via the org's existing `ecs-cluster`/`ecs-service` modules (`backend-api`, `agent-orchestrator`, `connector-hub`, `ml-analytics`); Cloudflare Pages or an ECS-hosted Next.js service for web apps (confirm SSR/RSC needs against Pages' current Next.js adapter support); Cloudflare R2/edge/tunnel for object storage and CDN | Reuses the org's already-versioned multi-product AWS/Cloudflare stack (Section 17) instead of adopting Neon/Vercel/Railway/Fly.io |
| CI/CD | Reuse `qnsc-ci` composite GitHub Actions unchanged: OIDC AWS auth, ECR build+push (SBOM/provenance), gated DB migration, ECS deploy+verify, image attestation, secret scanning, OpenAPI contract diffing | Product-agnostic mechanism already built and proven on `rally`; net-new additions needed only for Python and Flutter build/release steps |
| Shared TS packages | `@qnsc-vn/identity` (authn only), `@qnsc-vn/platform-http` (error taxonomy, pagination, Valkey rate-limit guard), `@qnsc-vn/observability` (OTel+pino), `@qnsc-vn/platform-cache` (Valkey wrapper, distributed lock) | Depend on directly from `backend-api`; none are coupled to `rally`'s domain (Section 17) |

## 10. Phased Rollout

- **Pilot, 5–10 households (Q4 2026):** modular monolith, single deployment region, connectors onboarded manually one at a time, Temporal for a handful of critical sagas (new ECS module to build, Section 17), outbox pattern feeding SNS/SQS from day one (already managed infra, no separate scale-gated adoption needed), simple batch REST sync (no full CRDT yet) — but schema/API designed to upgrade without rewrite.
- **100–150 households/cohort (2027):** split out high-load modules if needed (connector-hub, inventory), add read replicas, upgrade the sync engine (PowerSync) if batch sync starts lagging, full OpenTelemetry coverage — required because the committed uptime SLA needs real measurement, not a guess.
- **Thousands of households/year:** multi-region if scaling nationally, revisit Kafka only if measured event volume justifies replacing SNS/SQS, a dedicated B2G data pipeline (Section 16), self-service tenant onboarding.

## 11. Risks That Must Be Addressed Before Pilot

The CEO team's own internal review docs (`SOAT-KICH-BAN-7-VAI.md`, `KIEM-KE-MAN-HINH.md`) already surfaced real gaps that must become engineering epics, not demo polish:

- Idempotent invoice issuance when connectivity drops mid-transaction
- Inventory locking to prevent races (two orders consuming the last unit of stock)
- Preserving the original price on open orders when a product's price changes
- Undo for mistaken actions + an audit log of who changed what
- Device/session recovery when a phone is lost
- Cash ↔ order ↔ bank reconciliation
- Returns/exchanges linked back to the original order
- Real-concurrency cross-tenant leakage tests in CI (Section 4.5)

## 12. Reverse-Consulting Answers (Program's Section V)

1. **Package structure:** one configurable platform with feature-flagged industry verticals, not three separate products.
2. **Pricing model:** a small base per-household/year fee plus a small per-transaction fee above a free threshold.
3. **Boundary with the national free platform:** keep the compliance layer thin and adapter-based, ready to switch to the Tax Department's platform once it launches, without an architecture rewrite.

## 13. Open Decisions Needing Business Input

These are not engineering calls — they need a decision from the CEO/business side before or during pilot build:

1. **LLM data residency.** Current lean is toward calling Claude/GPT/Gemini APIs directly (see Section 5.5) rather than self-hosting a model. Confirm there is no Vietnam government data-sovereignty rule blocking household query content from reaching a foreign API before this is locked in further.
2. **Team skill reality check.** The stack assumes working knowledge of Flutter, NestJS, Temporal, and Python/FastAPI. Confirm current team/hiring plan actually matches this before committing to it — some choices (e.g. Flutter vs. React Native) would shift if the team's existing skills point elsewhere.
3. **Temporal: self-hosted or Temporal Cloud.** Self-hosting means real ops overhead (backing store, visibility store, cluster operations) for a small team; Temporal Cloud removes that burden at a recurring cost. Needs a budget decision.
4. **LLM cost model at scale.** Section 5.8 covers the optimization techniques, but an actual $/household/month estimate still requires a real usage assumption (expected AI queries per household per day) from the business side — this feeds directly into the price schedule the program requires you to publish upfront (Section IV.9 of the program brief).
5. **Compliance/certification requirement.** Confirm whether any specific certification (ISO 27001, Vietnam's personal data protection decree, banking-adjacent audit for QR/payment data) is a hard gate for the Q4 2026 pilot or a later milestone — this affects vault choice and hosting region.
6. **Timeline risk outside engineering.** Mobile app store review (Google Play + Apple) and partner agreements (MISA/Viettel S-Invoice likely require a reseller/API partnership contract, not just open API signup) are business-development lead times. Given the Q4 2026 pilot target, these need to start now, in parallel with the build — confirm business development already has this moving.

## 14. Availability Model — What "24/7" Actually Means

The program brief (Section IV.5) requires a 24/7 Vietnamese AI assistant with a committed uptime % and human-support response time. It's worth being precise about what this requires technically, since "24/7 agent" is easy to misread as "an agent continuously thinking in the background for every household" — which would be both wasteful (LLM inference costs money per call; running continuous inference with nothing new to process burns money for zero benefit) and is not what's actually being asked for.

What's actually required — and what this architecture already delivers — is two distinct things:

1. **Reactive availability**: a household can ask a question at any hour and get an answer. This only requires the backend/gateway to be always-on (standard production hosting, nothing exotic) and the LLM API to accept requests at any time. The agent only runs — and only costs tokens — when a real question triggers it.
2. **Proactive scheduling**: the agent pings a household ahead of a deadline (tax filing due, an overdue invoice) without being asked first. This is scheduled background work — a Temporal cron workflow that fires at set times, checks a condition, and sends a notification — already the "background/scheduled agent" pattern described in Section 3 (as distinct from the interactive session type).

Cost model stays the same either way: pay per actual triggered LLM call (a real question or a scheduled check), not per second of uptime. No new architecture is needed for this requirement beyond what's already specified — it's worth stating explicitly here so the framing doesn't drift toward "continuously analyzing everything live," which would be a materially different (and far more expensive) system than what the program brief or this design calls for.

## 15. Concurrency, Realtime & Worker Architecture

### 15.1 Realtime Delivery

Split by concern rather than building one general-purpose socket layer:

- **Data sync (inventory, orders, bookings)** — already handled by PowerSync's sync protocol, which is near-realtime across devices. Do not build a duplicate WebSocket channel for the same data — that's two sources of truth to keep consistent with each other for no benefit.
- **AI chat streaming** — WebSocket, for token-by-token response streaming.
- **B2G/web dashboard live metrics** — Server-Sent Events (SSE) is sufficient; it's one-directional server push, no need for full WebSocket.
- **Isolation** — every socket channel/room is scoped by `tenant_id`, with an explicit tenant check enforced at subscribe/auth time — not just by naming convention. A bug routing a message to the wrong tenant's connection is a real data leak, same severity as any other cross-tenant isolation failure in Section 4.

### 15.2 Worker Pool Sizing & Autoscaling

Scale Temporal worker replicas based on **task-queue backlog / schedule-to-start latency** — the standard signal that Activities are waiting too long to start — not on CPU utilization alone. Coordinate this with the database connection budget: each worker replica opens its own connection pool, so `worker_replicas × per_worker_pool_size` must stay within Postgres's `max_connections`/pooler limit. Scaling workers without resizing this budget exhausts DB connections instead of fixing the backlog.

### 15.3 Parallel Tool Calls Within a Single Agent Workflow

Temporal supports running Activities in parallel inside one workflow (e.g. checking inventory and booking availability at the same time). Each parallel Activity opens its **own** DB transaction and must independently `SET LOCAL app.tenant_id` — tenant context is not inherited from a shared parent transaction. Concurrent writes from parallel branches to the same resource (e.g. two branches touching the same inventory lot) still require the optimistic-lock/version mechanism already specified in Section 4 — parallelism doesn't bypass that requirement, it just makes the race more likely to actually occur.

### 15.4 Idempotency — the Read Side, Not Just the Write Side

Write-side idempotency (Sections 5.2/5.6) prevents duplicate side effects on retry. There's a separate read-side gap: a multi-query financial answer (e.g. "quarterly tax estimate") run as several separate statements under Postgres's default `READ COMMITTED` isolation can return an internally inconsistent figure if a write lands mid-computation between those statements. Fix: wrap any multi-query financial/report answer in a single transaction with one consistent snapshot (`BEGIN`; `SET LOCAL`; run all reads; `COMMIT`) so the numbers in one answer are self-consistent, even if slightly stale.

### 15.5 Priority Between Interactive and Background Agents

The per-tenant concurrency cap (Section 4.2) stops one tenant from starving others, but doesn't protect against total system-wide saturation (organic growth, a marketing spike). Mitigation: separate Temporal task queues for interactive (user-waiting, e.g. chat) versus background (scheduled forecasting, reminders) agent workflows, with priority weighting so interactive work is served first when the system is under load and background jobs defer/retry instead.

## 16. Analytics & Reporting: CQRS and ClickHouse

### 16.1 CQRS — Already Implicit, Now Named Explicitly

The outbox → SNS/SQS → B2G aggregation pipeline (Section 6) is already a CQRS pattern: the normalized OLTP domain tables are the write model and source of truth; the aggregation/materialized view is a separate, read-optimized model built from the event stream. Worth naming explicitly so it isn't mistaken for a missing piece later.

**This is CQRS-lite, not full event sourcing.** State is not reconstructed purely by replaying the event log — events are a projection/notification mechanism only, and the OLTP tables remain authoritative. Full event sourcing is deliberately out of scope: it adds real ongoing complexity (event schema versioning forever, replay tooling) with no corresponding benefit for this system.

### 16.2 ClickHouse — Deferred, With a Concrete Trigger

Not needed at pilot / 100–150-household scale — a few thousand orders total is well within what Postgres materialized views (refreshed from the same event stream) handle comfortably. Introducing it now would repeat the premature-infrastructure mistake avoided everywhere else in this design.

**Introduce it when either condition is actually measured:**
1. B2G aggregation queries measurably slow the primary as transaction volume grows into the tens of millions of rows (roughly where columnar aggregation starts meaningfully outperforming Postgres's row store), or
2. `ml-analytics` forecasting needs to scan large historical windows for feature engineering, and doing so against the transactional read replica would contend with the RAG read-replica traffic already isolated in Section 4.3.

**Integration path when the time comes:** extend the already-adopted SNS/SQS pipeline with a consumer that batches domain events into ClickHouse — do not stand up a second, separate CDC pipeline. Once introduced, B2G dashboard queries and `ml-analytics` feature-engineering queries route to ClickHouse instead of Postgres.

## 17. Org Platform Reuse — Findings from `rally`, `qnsc-infra`, `qnsc-tf-modules`, `qnsc-ci`, `qnsc-app-platform`

The org already runs a mature, multi-product platform. This section records what was reviewed and what it changes about the plan above — several choices earlier in this document (Neon, Vercel/Railway/Fly.io, NATS) are **reversed** in favor of reuse, recorded here rather than silently changed.

### 17.1 Infrastructure — Reuse the Existing AWS/Cloudflare Stack

`qnsc-tf-modules` (versioned, semver-tagged) + `qnsc-infra/live` (shared `runtime-prod`/`runtime-dev` layers already serving multiple products — `rally` live, `opshub` planned) already provide: RDS PostgreSQL, ECS Fargate (cluster + service modules), ElastiCache Valkey, SNS/SQS, Secrets Manager/KMS, VPC networking, CloudWatch observability, and Cloudflare edge/WAF/tunnel/R2/Pages. `docs/shared-modules-migration.md` in `qnsc-infra` confirms the org's explicit goal of extracting per-product infra into this shared registry precisely so a "product #3" (this project) reuses it rather than forking. Adopting Neon/Vercel/Railway/Fly.io, as originally proposed in Sections 6/9/10, would have duplicated infrastructure the org is actively consolidating away from — that recommendation is reversed in this document (see the edits to Sections 2, 6, 9, 10 above).

Gaps still to fill: pgvector extension enablement on the `rds` module (trivial config change, not a new module); a Temporal server/worker deployment (no existing module — first genuinely new piece of infra this project adds).

### 17.2 `rally` — Copy the Module Skeleton, Heed One Hard-Won Lesson

`rally` (existing NestJS/Fastify product, same org) already implements close to the exact hexagonal layout this project targets: `libs/modules/*` = `domain/{types,ports}` → `application/*.service.ts` → `infrastructure/persistence/*` → `interface/http/*`. Copy this skeleton wholesale for `backend-api`'s domain modules (renaming `interface/http` to `api/` to match this project's naming). Its multi-stage Dockerfile (deps → builder → `api`/`worker`/`migrator` targets) maps directly onto this project's need for a `backend-api` image, an `agent-orchestrator` image, and a one-shot migrator — reuse the pattern unchanged. Its transactional outbox implementation is the same mechanism already specified in Section 6 — reuse the actual migration/relay code rather than re-authoring it.

**Critical lesson — do not repeat rally's actual mistake.** `rally` implemented Postgres RLS (`0005_rls_tenant_isolation.sql`, `set_tenant_context()`) and later **removed it entirely** (`0025`/`0026` migrations) after discovering the DB role in use had superuser/`BYPASSRLS` privileges, silently making every RLS policy a no-op — the exact footgun Section 4.1 already warns about. Rally's fix was to fall back to application-layer `workspace_id` filtering instead of fixing the role. This project is not doing that — RLS stays — but the concrete lesson is: **provision a non-superuser, non-`BYPASSRLS` application database role in every environment, including local dev, from the start.** That role-provisioning gap, not RLS itself, is what actually failed there. Reuse rally's RLS migration mechanics (`SET LOCAL app.tenant_id`, the policy pattern, the junction-table-via-`EXISTS` trick for tables without a direct `tenant_id` column) — just don't skip the role setup that made theirs silently unenforced.

Its auth pattern (BFF session for browser + JWT for machine clients, a single `PolicyGuard`/`@RequirePermission()` decorator, permissions resolved fresh from the database per request rather than embedded in the JWT) is worth copying conceptually; the actual RBAC catalog and permission codes are `rally`-specific and not transferable.

### 17.3 CI/CD — Reuse Unchanged

All 16 `qnsc-ci` composite GitHub Actions are product-agnostic (parameterized by role ARN, cluster/service names, image names): OIDC AWS auth, ECR build+push with SBOM/provenance, a gated DB-migration-before-deploy step, ECS deploy+verify, image attestation, secret scanning (Gitleaks), and OpenAPI contract diffing. Reuse the entire deploy pipeline as-is for `backend-api`/`agent-orchestrator`/`connector-hub`. Genuinely missing and needed net-new: a Python build/publish action for `ml-analytics`, and Flutter build+sign+store-distribution actions for `mobile` — the latter ties directly to the app-store review timeline risk already flagged in Section 13.

### 17.4 Shared TypeScript Packages — Reuse Four, Build Fresh Where Genuinely New

`qnsc-app-platform`'s four packages passed the org's own admission bar ("belongs here only if divergence would be a security defect or cross-repo contract break") and had product-specific code stripped out — safe to depend on directly: `@qnsc-vn/identity` (authentication only — JWT/OIDC/refresh-token rotation; authorization is deliberately excluded as "product vocabulary," so this project's tenant/household RBAC is built fresh, which is expected, not a gap), `@qnsc-vn/platform-http` (error taxonomy, pagination, request-context, a Valkey-backed rate-limit guard — this can back the per-`(tenant, provider)` rate limiter in Section 4.2 instead of a hand-rolled one), `@qnsc-vn/observability` (OpenTelemetry bootstrap + structured logging — already matches the Section 5.3 plan), `@qnsc-vn/platform-cache` (Valkey wrapper with a distributed lock primitive — usable to implement the idempotency-key store in Section 5.2 instead of a bespoke table).

Genuinely new to this project, not a gap in the shared libs: multi-tenant RLS enforcement and household-internal RBAC, MCP tool packages, Temporal-specific CI/deploy tooling.

## 18. Org Product Reuse — Findings from CXGenie (`cxgenie-be`, `cxgenie-core-ai`, `cxgenie-loader-service`, `cxgenie-email-service`, `cxgenie-integration-service`, `cxgenie-flutter`)

CXGenie is an existing production AI customer-service chatbot product from the same architect. It is, in effect, a live catalog of exactly the failure modes this new design already guards against — several of this project's design decisions are strongly validated (not just theoretically justified) by concrete gaps observed here.

### 18.1 Patterns Worth Copying

- **Three distinct auth surfaces** (`cxgenie-be`): JWT for dashboard/admin staff, a separate guest JWT for the embedded end-customer, and an API-key header for integrations. Maps conceptually onto this project's need for household-user auth, B2B buyer-portal tokens, and webhook/connector auth as genuinely separate surfaces rather than one blob.
- **KB chunking baseline**: `RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=10)` plus dedupe-by-embedding-distance before ingest. Reasonable starting parameters for this project's KB ingestion pipeline (the `chunk_overlap=10` there is thin — worth tuning higher here).
- **~200-module single NestJS monolith running in production** (`cxgenie-be`) — concrete evidence that a modular monolith scales to a large real feature count without needing microservices; reinforces Section 3's choice rather than just asserting it.
- **Connector onboarding lifecycle shape** (`cxgenie-integration-service`): validate credentials → register webhook → store; on disconnect, unregister → clear. The skeleton is sound — it's missing a vault, an adapter interface, and a queue underneath, which is exactly what `connector-hub` adds.

### 18.2 Anti-Patterns to Avoid — With Concrete Receipts

- **Shared-collection-with-metadata-filter vector isolation** (`zilliz_module`'s partition-packing hack, plus a parallel legacy Chroma path) — isolation is "the filter string was correct," never physically enforced. This is precisely what pgvector + RLS (Section 4.1) replaces with DB-enforced isolation instead of app-discipline-enforced isolation.
- **Hand-rolled multi-provider LLM abstraction** (`llm_factory_module`) — hardcoded per-provider fallback chains, a circuit breaker built by polling vendor status pages, API-key round-robin for rate-limit spreading only (no real per-tenant config). This is exactly the class of thing the LiteLLM gateway (Section 5.5) replaces — confirms that decision rather than being over-engineering.
- **Dependence on OpenAI's stateful Assistants API** (`assistants_module`) — session/thread state owned by the vendor, and OpenAI is sunsetting Assistants API in favor of the Responses API, meaning the whole module needs a rewrite. Direct validation of owning session state via Temporal (Section 5.7) instead of a platform-proprietary stateful API.
- **In-memory `asyncio.Queue` job processor** (`workers/job_processor.py`, loader-service) — no persistence, no retry, jobs lost on process restart. The exact anti-pattern to avoid in `ml-analytics` — Temporal Activities already give retry/durability for free; use those, not a bespoke in-process queue.
- **No KB version/approval workflow at all** — a grep for "approve"/"version" across both Python AI repos returns nothing; content goes live straight into the shared vector collection. This confirms the `version`/`approved_by`/`source_ref` requirement on `kb_chunk` (Section 5.1) is load-bearing, not precautionary excess.
- **No adapter interface across channels** (`cxgenie-integration-service`) — Telegram/Slack/Discord/Shopify/WooCommerce each independently reimplement webhook verification and reply logic; the product's own internal doc states "Slack integration flow is the same [as Telegram]," acknowledging the duplication rather than abstracting it. Concrete cost-of-not-adapting evidence for why `connector-hub` needs one normalized internal model with a per-channel adapter (Section 5.4).
- **Plaintext credentials as flat DB columns** — `telegram_token`, `slack_signing_secret`, `shopify_access_token`, etc. inlined directly on one denormalized `BotModel` row, no encryption, no vault, no KMS. The starkest possible argument for the vault+proxy design already committed to.
- **Fully synchronous webhook handling with no queue, retry, or dedup** — one channel's handler isn't even awaited (fire-and-forget); errors are logged and the message silently dropped. Directly validates Section 7's webhook-reliability requirements (dedup by provider event ID, retry with backoff, treat webhooks as triggers rather than sources of truth) — this is exactly the production gap that section exists to prevent.
- **No Postgres RLS at all in `cxgenie-be`** — multi-tenancy is pure application-layer `workspace_id` filtering via guards that must be manually attached per route, with no database-level backstop. This is the mirror-image failure to `rally`'s RLS-with-superuser-bypass (Section 17.2): one past product had RLS that was silently disabled, the other never had RLS and relies purely on guard discipline. Having observed both failure modes across the same architect's own two prior products is strong justification for this design's layered defense — RLS + `FORCE ROW LEVEL SECURITY` + a non-superuser role (Section 4.1) *and* the independent tool-entrypoint assertion (Section 4.4) — since neither single mechanism alone has held up in practice.
- **The `cxgenie-email-service` split** — a different ORM (Prisma) from the rest of the codebase (Sequelize), ~2,600 total lines of code, a `package.json` name literally left as `"new-project"`, and no scaling or blast-radius rationale anywhere in its commit history. Reads as a fresh-start convenience split rather than an architecturally forced one — a concrete cautionary example matching Section 3's "only split a deployable for a concrete reason" rule.

### 18.3 One Calibration Point, Not a Reversal

CXGenie's `requirements.txt` shows LangChain used successfully in production there, alongside Langfuse (which validates that separate choice). This project's design explicitly excludes LangChain from its execution layer (Section 5.2) — worth being precise about why that isn't a contradiction: CXGenie's usage is simpler synchronous chat-completion orchestration inside a plain Python service, whereas this project's agent loop runs inside Temporal Activities with per-tenant concurrency limits, idempotency keys, and MCP tool schemas. LangChain's abstraction cost shows up more at that level of orchestration complexity than in a simpler chatbot backend — the conclusion is "wrong layer for this project's concurrency model," not "LangChain is bad."

### 18.4 Node↔Python Integration Lesson

`cxgenie-be` calls `cxgenie-core-ai`/`cxgenie-loader-service` via raw synchronous HTTP (axios), with no visible timeout or circuit-breaker discipline. For this project, that gap is avoided by construction as long as the rule is followed: any call from `backend-api`/`agent-orchestrator` to `ml-analytics` happens **inside a Temporal Activity**, which already provides retry/backoff/durability for free — the risk is only reintroduced if such a call is ever made synchronously from outside a workflow (e.g. directly inside an HTTP request handler), which would recreate exactly this gap.

## 19. Resilience Patterns — Timeout, Retry, Circuit Breaker, Bulkhead

These aren't new infrastructure — they fill gaps CXGenie's own history shows were never addressed there (Section 18.2: no rate-limiting/idempotency pattern anywhere, a hand-rolled circuit breaker built by polling vendor status pages).

### 19.1 Timeout — Two Layers, Not One

- **HTTP client-level** (in `connector-hub`, calling Shopee/MISA/GHN/etc.): a short timeout (~10s) set on the HTTP client itself. A hung call must not be allowed to sit inside the outer Activity timeout budget unnoticed.
- **Temporal Activity-level** (`startToCloseTimeout`, `scheduleToCloseTimeout`, `heartbeatTimeout`): the outer envelope, accounting for retry time as well. Already native to Temporal — just needs explicit per-Activity-type configuration (an LLM call, a Shopee call, and a DB call each need different budgets).

### 19.2 Retry — Temporal Handles Most of It, But Errors Must Be Classified

Temporal's Activity retry policy (`initialInterval`, `backoffCoefficient`, `maximumAttempts`) is the primary retry mechanism — no separate retry framework is needed on top of it. What's required in addition: **classify errors as retryable or not** inside each `connector-hub` adapter. A 4xx (malformed request, bad parameters) must throw a non-retryable error — retrying it wastes rate-limit budget for no chance of success. Only 5xx/timeout/network errors should be retryable. Failing to classify this is exactly the kind of blind-retry gap that leads to wasted quota and masked bugs.

### 19.3 Circuit Breaker — Use `cockatiel` (Node), Not a Hand-Rolled One

`rally` already uses `cockatiel` for resilience (Section 17.2) — reuse it rather than building something bespoke. CXGenie's own circuit breaker was built by polling vendor status pages (Section 18.2) — a fragile anti-pattern explicitly avoided here.

Two distinct levels are needed, each serving a different purpose:

1. **Per-provider (global)** — if Shopee/MISA is having a widespread outage, trip the breaker, fail fast, and stop burning every tenant's rate-limit budget hammering a provider that's clearly down.
2. **Per-`(tenant, provider)`** — if one household's specific token has expired or been revoked (causing repeated 401s), trip a breaker scoped to just that pair and prompt re-authentication instead of endlessly retrying a call that can never succeed — without affecting other tenants still using that provider normally.

The LiteLLM gateway (Section 5.5) already provides an equivalent fallback/failover mechanism for the LLM layer — `cockatiel` is specifically for the third-party API calls inside `connector-hub`, not a replacement for LiteLLM.

### 19.4 Bulkhead — Partially in Place, One Addition Needed

Already covered elsewhere in this document:
- Per-tenant concurrency cap (Section 4.2) — a bulkhead between tenants.
- Database connection budget tied to worker replica count (Section 15.2) — a bulkhead against connection exhaustion.

Missing, and needed: a **per-provider bulkhead inside `connector-hub`**. A slow or hanging provider (e.g. Shopee degraded) must not be allowed to consume the entire shared connection pool/worker capacity needed for GHN or MISA calls. Concretely: separate HTTP connection pools per provider, or separate Temporal task queues per provider — extending the same idea already used for interactive-vs-background task queue separation (Section 15.5) along one more dimension.

This section is genuinely new work, not adapted from either reviewed org codebase — CXGenie had no equivalent pattern at all (Section 18.2), so there's nothing to reuse here, only the lesson of what its absence cost.

## 20. Engineering Practices — Code Quality Principles

These aren't generic reminders — each one is already embodied by a specific decision earlier in this document. Listing them together here gives the team a single place to check new code against established precedent, and a way to explain why the design holds together as one system rather than a pile of independent choices.

### 20.1 DRY & Component Reuse

- `packages/domain-core` holds business rules (tax calc, thresholds, inventory ledger, booking-conflict logic) once, shared by every domain module that needs them — never re-implemented per module.
- The four `@qnsc-vn/*` packages (Section 17.4) are depended on directly rather than re-written: `identity` for authn, `platform-http` for error taxonomy/pagination/rate-limit guard, `observability` for OTel/logging, `platform-cache` for the Valkey wrapper and idempotency-key store.
- `packages/mcp-tools` centralizes tool schemas for both Layer A and Layer B — one definition per tool, not duplicated per calling context.
- `packages/ui-kit` holds design tokens shared across Flutter and Next.js — one design system, not two drifting in parallel.
- The `connector-hub` adapter pattern (Section 5.4) *is* DRY applied to third-party integration: one normalized internal model, one adapter per channel — the direct opposite of CXGenie's per-channel duplicated webhook/reply logic (Section 18.2).
- **Rule**: before adding new logic to any module, check `domain-core`, `mcp-tools`, and the `@qnsc-vn/*` packages first — this is a PR-review checklist item, not a suggestion.

### 20.2 Consistency

- Every domain module in `backend-api` uses the identical hexagonal layout (`domain/application/infra/api`) — no module gets a bespoke structure, so navigating module #2 teaches you module #12.
- Errors flow through `@qnsc-vn/platform-http`'s error taxonomy everywhere — no module invents its own error shape.
- Idempotency-keys (Section 5.2) apply uniformly to *every* side-effecting tool, not selectively based on which felt risky at the time.
- Commit style and release tooling follow the org's existing convention (conventional commits + `release-please`, per `qnsc-app-platform`'s setup, Section 17.4) — reused, not reinvented per repo.

### 20.3 No Hardcoding, No Magic Numbers

The concrete example that matters most here: tax thresholds and rates (e.g. the 1-billion-VND/year e-invoice threshold, per-household-type tax rules) must live in a **versioned config/database table** (the tax-rule Strategy pattern, Section 20.5), never as inline literals in code. The program's pricing schedule itself changes shape over time by design (Section 12: year 1 fully subsidized, year 2 half, year 3 self-pay) — hardcoding any of these values would silently break a real contractual/legal requirement, not just violate a style guide. The same discipline applies to retry counts, timeout durations (Section 19.1), and per-tenant budget/quota values (Section 5.8, 19) — named, configurable constants, never scattered literals.

### 20.4 No Duplication or Overlap

Already enforced in several concrete places in this document, worth naming as the same underlying rule:
- One realtime mechanism per concern, not two competing ones for the same data (Section 15.1 — PowerSync for sync, WebSocket/SSE only for what PowerSync doesn't cover).
- One CDC pipeline, extended rather than duplicated when ClickHouse is introduced (Section 16.2).
- Two rate-limit/budget mechanisms that look similar but are deliberately NOT merged because they control different things: the LiteLLM gateway budget (LLM cost) and the Redis `(tenant, provider)` bucket (third-party API calls) — kept explicitly separate rather than collapsed into one, because collapsing them would hide which resource is actually being protected.

### 20.5 Correct Design Pattern Usage — Fit, Not Decoration

Every pattern in this design was chosen because the problem it solves actually exists here, not to look sophisticated:
- **Adapter** — `connector-hub`, one per external channel.
- **Strategy** — the tax-calculation engine, versioned and swappable per household/business type.
- **Saga** — implemented *as* Temporal workflows (Section 5.2), deliberately without a separate saga framework, since Temporal already provides orchestration, compensation, and replay.
- **CQRS-lite, not full event sourcing** (Section 16.1) — the read/write split is useful here; reconstructing all state purely from an event log is not a problem this system actually has, so that heavier pattern was deliberately not adopted.

### 20.6 YAGNI — Already the Backbone of This Design, Not a New Idea

Every deferral in this document is a YAGNI decision made explicit rather than left implicit:
- Modular monolith until a concrete reason to split exists (Section 3), not microservices pre-emptively.
- ClickHouse deferred until a measured trigger, not adopted speculatively (Section 16.2).
- Kafka deferred unless measured event volume justifies replacing SNS/SQS (Section 6).
- Full event sourcing avoided in favor of CQRS-lite (Section 16.1).
- Go for `connector-hub` only if metrics justify it (Section 3), not adopted on anticipated need.
- Temporal self-hosted-vs-Cloud left as an open business decision (Section 13) rather than pre-built for a scale that hasn't arrived.

### 20.7 KISS

- Layer A uses constrained tool-calling/text-to-SQL, not a heavier RAG mechanism it doesn't need (Section 5.1) — the simplest mechanism that correctly fits precise transactional data.
- One monorepo, not a polyrepo, until team structure genuinely requires the split (Section 3, Section 8).
- SNS/SQS reused as-is rather than standing up a new broker, because the simpler, already-available option covers the actual requirement (Section 6).

---

*Living document — update as new architecture decisions are made or once the national free platform publishes its API.*
