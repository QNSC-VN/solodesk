#!/usr/bin/env bash
#
# End-to-end demo: onboarding -> catalog -> procurement -> sales -> invoice ->
# payment -> traceability -> booking -> AI assistant, across all three real
# services (backend-api, connector-hub, agent-orchestrator).
#
# What's REAL: every database write/read, RLS enforcement, Postgres role
# boundaries, Temporal workflow orchestration, the vault's AES-256-GCM
# encryption, connector-hub's webhook dedup + forwarding, cockatiel's
# resilience wrapper.
#
# What's MOCKED, and only these two things: (1) SePay itself — we send a
# correctly-shaped SePay webhook payload by hand instead of a real bank
# transfer, since demoing this needs a real SePay merchant account; (2) the
# LLM's language understanding — agent-orchestrator's worker runs with
# MOCK_LLM_RESPONSES=true, which skips the real Anthropic call but still
# calls the SAME real tool functions against the SAME real Postgres data
# (see run-agent-turn.activity.ts's header comment on that flag). Every
# mocked reply is prefixed "[MOCK]" so it's never confused for a real answer.
#
# Prerequisites: docker compose up (postgres+valkey), all three services'
# .env files already filled in (this script does NOT generate secrets),
# migrations already applied in all three services, `temporal` CLI installed
# (`brew install temporal`).
#
# Usage: ./scripts/demo-e2e.sh
# Servers are left RUNNING after the script finishes so you can keep
# exploring (Swagger docs, Temporal Web UI, curl more endpoints yourself).
# Stop everything with: ./scripts/demo-e2e.sh --stop

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."


if [[ "${1:-}" == "--stop" ]]; then
  echo "Stopping demo processes..."
  lsof -ti :3000,3001,3002,7233,8233 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  pkill -f "tsx watch src/worker.ts" 2>/dev/null || true
  echo "Stopped."
  exit 0
fi

section() { echo; echo "════════════════════════════════════════════════════════════"; echo "  $1"; echo "════════════════════════════════════════════════════════════"; }
step()    { echo; echo "── $1"; }

# Extract a field from JSON on stdin, e.g. `echo "$RESP" | json id` or
# `echo "$RESP" | json 'lines[0].lotId'` — same node-based parsing this
# whole repo already uses throughout its own dev-server smoke tests.
json() {
  node -e "
    let d = '';
    process.stdin.on('data', c => d += c);
    process.stdin.on('end', () => {
      try {
        const j = JSON.parse(d);
        const path = process.argv[1].split('.');
        let v = j;
        for (const key of path) {
          const m = key.match(/^(\w+)\[(\d+)\]\$/);
          v = m ? v[m[1]][Number(m[2])] : v[key];
        }
        console.log(v);
      } catch (e) {
        console.error('JSON parse/path error on:', d);
        process.exit(1);
      }
    });
  " "$1"
}

wait_for_log() {
  local logfile="$1" pattern="$2" label="$3" tries=0
  until grep -qE "$pattern" "$logfile" 2>/dev/null; do
    tries=$((tries + 1))
    if [[ $tries -gt 60 ]]; then
      echo "TIMED OUT waiting for $label — check $logfile"
      exit 1
    fi
    sleep 1
  done
  echo "  $label ready."
}

section "Preflight"

step "Postgres + Valkey (docker compose)"
docker compose -f docker-compose.dev.yml up -d
until docker inspect solodesk-postgres-1 --format='{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; do sleep 1; done
echo "  Postgres healthy."

for svc in backend-api connector-hub agent-orchestrator; do
  if [[ ! -f "services/$svc/.env" ]]; then
    echo "Missing services/$svc/.env — copy services/$svc/.env.example, fill in the real values, then re-run."
    exit 1
  fi
done
echo "  All three .env files present."

step "Migrations (idempotent — safe to re-run)"
(cd services/backend-api && set -a && source .env && set +a && pnpm db:migrate) > /tmp/demo-migrate-backend-api.log 2>&1
(cd services/connector-hub && set -a && source .env && set +a && pnpm db:migrate) > /tmp/demo-migrate-connector-hub.log 2>&1
(cd services/agent-orchestrator && set -a && source .env && set +a && pnpm db:migrate) > /tmp/demo-migrate-agent-orchestrator.log 2>&1
echo "  All migrations applied (backend-api first, as required)."

section "Starting services"

step "backend-api (:3000)"
lsof -ti :3000 | xargs -r kill -9 2>/dev/null || true
(cd services/backend-api && set -a && source .env && set +a && pnpm dev > /tmp/demo-backend-api.log 2>&1 &)
wait_for_log /tmp/demo-backend-api.log "Nest application successfully started" "backend-api"

step "connector-hub (:3001)"
lsof -ti :3001 | xargs -r kill -9 2>/dev/null || true
(cd services/connector-hub && set -a && source .env && set +a && pnpm dev > /tmp/demo-connector-hub.log 2>&1 &)
wait_for_log /tmp/demo-connector-hub.log "Nest application successfully started" "connector-hub"

step "Temporal dev server (:7233 gRPC, :8233 Web UI)"
lsof -ti :7233,8233 | xargs -r kill -9 2>/dev/null || true
(temporal server start-dev > /tmp/demo-temporal.log 2>&1 &)
wait_for_log /tmp/demo-temporal.log "Server:" "Temporal dev server"

step "agent-orchestrator worker (MOCK_LLM_RESPONSES=true — see this script's header)"
(cd services/agent-orchestrator && set -a && source .env && set +a && export MOCK_LLM_RESPONSES=true && pnpm worker > /tmp/demo-agent-worker.log 2>&1 &)
wait_for_log /tmp/demo-agent-worker.log "polling task queue" "agent-orchestrator worker"

step "agent-orchestrator HTTP client (:3002)"
lsof -ti :3002 | xargs -r kill -9 2>/dev/null || true
(cd services/agent-orchestrator && set -a && source .env && set +a && pnpm dev > /tmp/demo-agent-client.log 2>&1 &)
wait_for_log /tmp/demo-agent-client.log "Nest application successfully started" "agent-orchestrator client"

section "1. Onboarding — a new household business joins the program"

TENANT_RESP=$(curl -s -X POST http://localhost:3000/v1/tenants -H 'Content-Type: application/json' \
  -d '{"legalName":"Quan An Ba Mien Demo","industry":"food_beverage"}')
TENANT_ID=$(echo "$TENANT_RESP" | json id)
echo "Tenant onboarded: $TENANT_ID ($(echo "$TENANT_RESP" | json legalName))"

# One shared JWT keypair across all three services (docs: one identity
# provider) — mint ONCE, reuse everywhere.
TOKEN=$(cd services/backend-api && set -a && source .env && set +a && pnpm mint-dev-token "$TENANT_ID" 2>/dev/null \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const m=d.match(/\{[\s\S]*\}/);console.log(JSON.parse(m[0]).accessToken)})')
AUTH="Authorization: Bearer $TOKEN"
echo "Token minted, valid across backend-api/connector-hub/agent-orchestrator."

section "2. Catalog — list a product"

SKU_RESP=$(curl -s -X POST http://localhost:3000/v1/skus -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"skuCode":"CF-ARABICA-500","name":"Ca phe Arabica 500g","unit":"goi","unitPrice":"180000.00","category":"coffee"}')
SKU_ID=$(echo "$SKU_RESP" | json id)
echo "SKU created: $(echo "$SKU_RESP" | json skuCode) — $(echo "$SKU_RESP" | json name)"

section "3. Procurement — buy stock from a local farmer"

SUPPLIER_RESP=$(curl -s -X POST http://localhost:3000/v1/suppliers -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"Nong Trai A Ma H'"'"'Long","contactInfo":"0987000000"}')
SUPPLIER_ID=$(echo "$SUPPLIER_RESP" | json id)
echo "Supplier registered: $(echo "$SUPPLIER_RESP" | json name)"

curl -s -X POST "http://localhost:3000/v1/suppliers/$SUPPLIER_ID/negotiated-prices" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"skuId\":\"$SKU_ID\",\"unitCost\":\"120000.00\"}" > /dev/null
echo "Negotiated price set: 120,000d/goi"

PURCHASE_RESP=$(curl -s -X POST http://localhost:3000/v1/purchase-notes -H "$AUTH" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: demo-purchase-$(date +%s)" \
  -d "{\"supplierId\":\"$SUPPLIER_ID\",\"lines\":[{\"skuId\":\"$SKU_ID\",\"lotCode\":\"LOT-DEMO-1\",\"quantity\":\"50\"}]}")
LOT_ID=$(echo "$PURCHASE_RESP" | json 'lines[0].lotId')
echo "Purchase recorded, stock received: 50 goi (total $(echo "$PURCHASE_RESP" | json totalAmount)d)"

section "4. Sales — a customer buys some"

ORDER_RESP=$(curl -s -X POST http://localhost:3000/v1/orders -H "$AUTH" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: demo-order-$(date +%s)" \
  -d "{\"channel\":\"counter\",\"lines\":[{\"skuId\":\"$SKU_ID\",\"lotId\":\"$LOT_ID\",\"quantity\":\"2\"}]}")
ORDER_ID=$(echo "$ORDER_RESP" | json id)
echo "Order placed: $(echo "$ORDER_RESP" | json totalAmount)d (2 goi at 180,000d)"

STOCK_RESP=$(curl -s "http://localhost:3000/v1/lots/available/$SKU_ID" -H "$AUTH")
echo "Remaining stock: $(echo "$STOCK_RESP" | json totalAvailable) goi"

section "5. Invoicing — tax calculated automatically"

INVOICE_RESP=$(curl -s -X POST http://localhost:3000/v1/invoices -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"orderId\":\"$ORDER_ID\"}")
INVOICE_ID=$(echo "$INVOICE_RESP" | json id)
INVOICE_NUMBER=$(echo "$INVOICE_RESP" | json invoiceNumber)
TOTAL_AMOUNT=$(echo "$INVOICE_RESP" | json totalAmount)
echo "Invoice issued: $INVOICE_NUMBER — subtotal $(echo "$INVOICE_RESP" | json subtotal)d + tax $(echo "$INVOICE_RESP" | json taxAmount)d = ${TOTAL_AMOUNT}d"

section "6. Payment — customer pays via bank transfer (SePay webhook, MOCKED)"

curl -s -X POST http://localhost:3001/v1/vault/sepay/credentials -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"payload":{"apiToken":"demo-token","webhookSecret":"demo-webhook-secret"}}' > /dev/null
echo "SePay credentials vaulted (encrypted at rest, connector-hub)."

WEBHOOK_URL=$(curl -s "http://localhost:3001/v1/vault/sepay/webhook-url" -H "$AUTH" | json url)
echo "Webhook URL issued: $WEBHOOK_URL"

echo "  (MOCKED: this is where a real customer's bank sends SePay a real"
echo "   transfer, and SePay calls our webhook. We simulate that one call by"
echo "   hand — everything AFTER this point, the dedup, the invoice-number"
echo "   extraction, the forward into payment-reconcile, is 100% real.)"
WEBHOOK_RESP=$(curl -s -X POST "http://localhost:3001${WEBHOOK_URL}" \
  -H "Authorization: Apikey demo-webhook-secret" -H 'Content-Type: application/json' \
  -d "{\"id\":\"demo-txn-$(date +%s)\",\"gateway\":\"Vietcombank\",\"transactionDate\":\"$(date -u +'%Y-%m-%d %H:%M:%S')\",\"accountNumber\":\"0123499999\",\"content\":\"CT toi 0123499999 thanh toan $INVOICE_NUMBER\",\"transferType\":\"in\",\"transferAmount\":$TOTAL_AMOUNT,\"referenceCode\":\"DEMO-REF-$(date +%s)\"}")
echo "connector-hub processed the webhook: $WEBHOOK_RESP"

SUMMARY_RESP=$(curl -s "http://localhost:3000/v1/payments/by-invoice/$INVOICE_ID/summary" -H "$AUTH")
echo "backend-api's payment-reconcile now shows: paid $(echo "$SUMMARY_RESP" | json paidAmount)d, outstanding $(echo "$SUMMARY_RESP" | json outstandingAmount)d, fully paid: $(echo "$SUMMARY_RESP" | json isFullyPaid)"

section "7. Traceability — public QR page for the buyer"

curl -s -X POST "http://localhost:3000/v1/trace/$LOT_ID/publish" -H "$AUTH" > /dev/null
echo "Lot published for public tracing."
TRACE_RESP=$(curl -s "http://localhost:3000/v1/trace/$LOT_ID")
echo "Public trace page (ZERO auth, this is what a buyer scanning the QR sees):"
echo "  $TRACE_RESP"

section "8. Booking — a table reservation (Chan dung 2)"

RESOURCE_RESP=$(curl -s -X POST http://localhost:3000/v1/resources -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"Ban so 1","resourceType":"table","capacity":4}')
RESOURCE_ID=$(echo "$RESOURCE_RESP" | json id)
HOLD_RESP=$(curl -s -X POST http://localhost:3000/v1/bookings -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"resourceId\":\"$RESOURCE_ID\",\"customerName\":\"Khach demo\",\"startsAt\":\"$(date -u -v+1d +'%Y-%m-%dT18:00:00Z' 2>/dev/null || date -u -d '+1 day' +'%Y-%m-%dT18:00:00Z')\",\"endsAt\":\"$(date -u -v+1d +'%Y-%m-%dT20:00:00Z' 2>/dev/null || date -u -d '+1 day' +'%Y-%m-%dT20:00:00Z')\",\"partySize\":4}")
BOOKING_ID=$(echo "$HOLD_RESP" | json id)
curl -s -X POST "http://localhost:3000/v1/bookings/$BOOKING_ID/confirm" -H "$AUTH" > /dev/null
echo "Table booked and confirmed for tomorrow evening."

section "9. AI assistant — ask a real question (LLM MOCKED, tool data REAL)"

CONV_RESP=$(curl -s -X POST http://localhost:3002/v1/conversations -H "$AUTH")
CONV_ID=$(echo "$CONV_RESP" | json conversationId)
echo "Conversation started: $CONV_ID"

ask() {
  local question="$1"
  local reply
  reply=$(curl -s -X POST "http://localhost:3002/v1/conversations/$CONV_ID/messages" -H "$AUTH" -H 'Content-Type: application/json' \
    -d "{\"message\":\"$question\"}" | json assistantMessage)
  echo "  Q: $question"
  echo "  A: $reply"
}

ask "Hom nay ban duoc bao nhieu don hang?"
ask "Con ton kho CF-ARABICA-500 khong?"
ask "Co hoa don nao chua thanh toan khong?"

section "Demo complete"

cat <<EOF
Real for the whole flow above: Postgres RLS + tenant isolation, three
separate DB roles with least-privilege grants, AES-256-GCM credential
encryption, webhook dedup, atomic race-safe stock consumption, tax
calculation, cumulative e-invoice threshold, cross-service payment
forwarding, Temporal workflow orchestration.

Mocked, and ONLY these two: the SePay bank transfer itself (step 6 sent a
hand-built webhook payload instead of a real bank sending one), and the
LLM's language understanding (step 9's worker ran with
MOCK_LLM_RESPONSES=true — the tool data behind every "[MOCK]" answer was
still pulled from real Postgres).

Servers are still running:
  backend-api        http://localhost:3000/api/docs
  connector-hub       http://localhost:3001/api/docs
  agent-orchestrator  http://localhost:3002/api/docs
  Temporal Web UI     http://localhost:8233

Tenant id for further poking: $TENANT_ID
Bearer token (1h):  $TOKEN

Stop everything: ./scripts/demo-e2e.sh --stop
EOF
