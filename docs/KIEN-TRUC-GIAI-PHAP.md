# Kiến trúc giải pháp — SoloDesk nền tảng Kế nghiệp số Gia Lai

*Tổng hợp phiên thiết kế kiến trúc 18/08/2026. Tài liệu này chốt phương án kỹ thuật cho bản production, kế thừa tinh thần từ bản mockup v3 (`mobile.html`, `web.html`, `b2g.html`, `index.html`) nhưng thay toàn bộ phần mô phỏng (localStorage, hàng đợi giả lập) bằng kiến trúc thật, chịu được lộ trình mở rộng nêu tại Mục I.3 của bài toán: 5–10 hộ (Q4/2026) → 100–150 hộ/khóa (2027) → hàng nghìn hộ/năm.*

## 1. Nguyên tắc thiết kế

1. **Đúng cỡ với quy mô thật đang biết, không thiết kế cho quy mô tưởng tượng.** Modular monolith trước, tách deployable riêng chỉ khi có lý do cụ thể (khác hệ sinh thái ngôn ngữ, khác hồ sơ scale, khác bán kính nổ/bảo mật, hoặc nền tảng bắt buộc) — không tách vì "nghe hợp lý" hay lo xa.
2. **Đo trước, đổi công nghệ sau.** Mọi quyết định hạ tầng (ngôn ngữ, broker, queue) dựa trên bằng chứng đo được, không phải dự đoán rủi ro.
3. **Bảo mật/cách ly tenant thực thi ở tầng dữ liệu (DB), không chỉ tầng ứng dụng.** Vì đây là SaaS đa hộ kinh doanh (multi-tenant) và có AI agent chạy song song trên nhiều tenant cùng lúc — sai ở tầng này là rò dữ liệu thật, không phải lỗi UI.
4. **Đứng trên nền miễn phí quốc gia, không tự khoá mình vào cái chưa tồn tại.** Nền tảng kế toán miễn phí theo Điều 10 Nghị định 20/2026/NĐ-CP tính đến 8/2026 **chưa ra mắt, chưa có API công khai** (Cục Thuế còn đang chọn giữa 3 phương án) — kiến trúc để sẵn slot connector dạng pluggable, cắm sau, không chờ.
5. **Không xây phần mềm mới (Mục II.1 bài toán).** Đóng gói như sản phẩm nền tảng cấu hình được theo ngành, Gia Lai là tenant/chương trình triển khai đầu tiên.

## 2. Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────────────────┐
│ CLIENT LAYER                                                     │
│  Flutter app (offline-first, mobile-first, giọng nói tiếng Việt) │
│  Next.js 16 web (kế toán chia sẻ / B2G dashboard / cổng bên mua) │
└───────────────┬───────────────────────────────┬─────────────────┘
                │ sync (PowerSync)               │ REST/tRPC
┌───────────────▼───────────────────────────────▼─────────────────┐
│ API GATEWAY — NestJS (Node.js 24 LTS)                            │
│  auth · rate-limit theo (tenant, provider) qua Redis · routing   │
├───────────────────────────────────────────────────────────────────┤
│ DOMAIN MODULES (modular monolith, hexagonal mỗi module)          │
│  Identity·Tenant | Catalog·Inventory | Sales·Order | Invoicing·Tax│
│  Payment·Reconcile | Booking·Resource | Procurement | Traceability│
├───────────────────────────────────────────────────────────────────┤
│ AGENT LAYER                                                       │
│  Temporal worker (workflow durable, workflow ID = tenant:session) │
│  Agent-loop trong Activity — Lớp A (tool-calling/text-to-SQL      │
│  khuôn mẫu, RLS-scoped) + Lớp B (RAG pgvector, có duyệt+trích dẫn)│
│  MCP làm chuẩn expose tool nội bộ cho agent                       │
├───────────────────────────────────────────────────────────────────┤
│ INTEGRATION LAYER — connector-hub (vault + proxy/adapter)         │
│  shopee · tiktok-shop · lazada · misa-meinvoice · viettel-sinvoice│
│  vnpt-invoice · sepay-vietqr · ghn · ghtk · viettelpost ·         │
│  booking-com · agoda · national-free-platform [STUB — chờ Cục     │
│  Thuế công bố API]                                                 │
├───────────────────────────────────────────────────────────────────┤
│ ML/ANALYTICS SERVICE (Python/FastAPI) — dự báo, STT fine-tune     │
├───────────────────────────────────────────────────────────────────┤
│ DATA LAYER — PostgreSQL trên RDS, module `rds` của org (RLS bắt   │
│  buộc mọi bảng) + pgvector · Valkey trên ElastiCache (module      │
│  `cache` của org: rate-limit/cache/BullMQ) · SQS/SNS (module      │
│  `messaging` của org, event bus) · read replica riêng cho         │
│  KB/vector query (tách khỏi ghi giao dịch)                        │
└─────────────────────────────────────────────────────────────────┘
```

### Bounded context (domain module)

| Module | Trách nhiệm |
|---|---|
| Identity & Tenant | Hộ/doanh nghiệp = tenant, vai trò trong hộ, phiên thiết bị |
| Catalog & Inventory | SKU, lô/mẻ, sổ tồn đồng bộ đa kênh thời gian thực |
| Sales & Order | Bán tại quầy, đơn đa kênh, offline-first |
| Invoicing & Tax | Hoá đơn điện tử máy tính tiền, thuế theo hộ/nhóm, hạn kê khai |
| Payment & Reconciliation | QR, tiền mặt, đối soát ngân hàng/sàn |
| Booking & Resource | Lịch, sức chứa, giữ chỗ tạm, no-show |
| Procurement (thu mua) | Bảng kê nông dân, chứng từ đầu vào, giá thoả thuận theo vườn |
| Traceability | Truy xuất theo lô, trang công khai qua QR |
| Channel Integration Hub | Sàn TMĐT, vận chuyển, app giao đồ ăn, nền tảng đặt phòng, mạng xã hội |
| AI Assistant | 2 lớp: data Q&A (Lớp A) + policy Q&A có trích dẫn (Lớp B) |
| Program/B2G | Kích hoạt, cửa thanh toán, dashboard tổng hợp không định danh |
| Accounting Bridge | Cổng nối phần mềm kế toán miễn phí quốc gia khi ra mắt |

## 3. Vì sao modular monolith, không microservice ngay

Microservice trả giá thật ở giai đoạn này: transaction phân tán thay vì gọi hàm trong process (đơn nghiệp vụ xuyên nhiều service phải thành saga, chịu network call/retry), và team nhỏ chưa cần nhiều team độc lập deploy độc lập. Case tham khảo: Amazon Prime Video 2023 gộp ngược microservice về monolith vì chi phí network call giữa service vượt xa lợi ích; Segment có bài viết công khai lý do tương tự.

Modular monolith (module = bounded context, ranh giới rõ, hexagonal: domain/application/infra/api mỗi module) cho phần lớn lợi ích (test được, boundary rõ, thay được) mà không trả giá vận hành phân tán. Tách theo strangler pattern khi có bằng chứng thật (hot path, cần scale riêng).

### 4 deployable thật (từ 1 monorepo) — mỗi cái có lý do riêng

| Deployable | Ngôn ngữ | Lý do tách |
|---|---|---|
| `backend-api` | NestJS/Node | Phần lớn domain logic, HTTP API, Temporal client |
| `agent-orchestrator` | Node | Bắt buộc theo kiến trúc Temporal — worker chạy Activity phải khác process với client gọi workflow |
| `connector-hub` | Node (cân nhắc Go nếu đo thấy cần) | Cách ly bán kính nổ (lỗi Shopee/TikTok không kéo sập core) + biên bảo mật (chỉ nơi này chạm vault + gọi mạng ra ngoài) |
| `ml-analytics` | Python/FastAPI | Hệ sinh thái ML/data science khác hẳn (pandas/statsmodels/prophet, fine-tune Whisper tiếng Việt) |

Đây vẫn là **1 monorepo** — polyrepo (git repo riêng cho từng phần) chỉ cần khi có nhiều team hoàn toàn độc lập, chưa tới lúc đó.

### Vì sao NestJS, không Go/Rust cho core

Bottleneck hệ thống không nằm ở CPU — nằm ở độ trễ API bên thứ 3 và **đúng nghiệp vụ** (thuế, tồn kho, chống trùng booking — sai ở đây là sai pháp lý/tiền, không phải sai hiệu năng). NestJS có sẵn DI/guard/pipe cho code nghiệp vụ nặng validate, share type với web frontend, nguồn tuyển ở Việt Nam sâu hơn Go/Rust. Rust hợp cho engine hiệu năng cực cao (không có workload dạng đó ở đây). Go hợp thật cho `connector-hub` (I/O-bound concurrency cao, goroutine nhẹ) — cân nhắc viết bằng Go nếu team có sẵn kỹ năng, không bắt buộc.

## 4. Multi-tenancy & cách ly dữ liệu khi nhiều AI agent chạy song song

Đây là phần rủi ro cao nhất của kiến trúc — chốt cơ chế cụ thể, không chỉ nguyên tắc.

### 4.1 Enforce tenant ở tầng DB

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY; -- không cho superuser connection bypass
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

- Dùng `SET LOCAL app.tenant_id = $1` **trong transaction**, không phải `SET` cấp session — vì connection pool (transaction-mode pooling) tái sử dụng connection giữa nhiều tenant khác nhau; `SET LOCAL` tự xoá khi commit/rollback, không thể rò sang request sau.
- Dùng transaction pooling, không dùng statement pooling — tránh mất `app.tenant_id` giữa các lệnh trong cùng phiên.
- **Workflow ID Temporal dạng `tenant:session` chỉ để quan sát/định tuyến, KHÔNG phải cơ chế bảo mật.** Hàng rào thật là RLS + `SET LOCAL` mỗi transaction.

### 4.2 Chặn 1 tenant "cày" agent làm nghẽn tenant khác (noisy neighbor ở tầng orchestration)

Rate-limit theo `(tenant, provider)` qua Redis chặn được gọi API ngoài quá tay, nhưng chưa chặn được 1 tenant tạo vô hạn agent workflow chiếm hết worker pool Temporal dùng chung. Giải pháp: giới hạn **số agent workflow đồng thời tối đa mỗi tenant** bằng semaphore Redis (token bucket riêng mà mọi workflow phải xin trước khi chạy Activity thật), hoặc tách task queue Temporal theo tier tenant.

### 4.3 Tách đọc/ghi cho lớp vector/RAG

pgvector nằm chung Postgres với dữ liệu giao dịch. Nhiều agent chạy RAG (HNSW search) song song đúng giờ cao điểm bán hàng sẽ tranh chấp tài nguyên với ghi giao dịch. Giải pháp: **read replica riêng cho truy vấn KB/vector**, route agent RAG query sang replica, giữ primary chỉ lo ghi giao dịch.

### 4.4 Phòng thủ kép tại điểm thực thi tool

Ngay entrypoint mỗi tool-call: assert tường minh `tenant_id` lưu trong session state khớp `tenant_id` API caller truyền vào, không khớp thì chặn trước khi chạm DB. Phòng bug logic route nhầm session — lỗi này RLS không cứu được vì nó xảy ra trước khi tới DB.

### 4.5 Test bắt buộc trong CI

Agent không xác định (non-deterministic) — unit test thường không đủ. Cần bộ test tích hợp: dựng 2 tenant giả, chạy nhiều session agent đồng thời thật (concurrency thật), assert không có dữ liệu tenant A xuất hiện trong response tenant B. Chạy mỗi lần đổi tool/prompt liên quan Lớp A.

## 5. Kiến trúc AI/Agent

### 5.1 Hai lớp trợ lý — tách đúng loại câu hỏi

- **Lớp A (dữ liệu hộ):** KHÔNG phải RAG. Đây là dữ liệu giao dịch chính xác — dùng text-to-SQL/tool-calling có khuôn mẫu (không cho generate SQL tự do — rủi ro injection/hallucinate schema) chạy thẳng Postgres, session có `app.tenant_id` set, RLS tự chặn chéo tenant.
- **Lớp B (chính sách):** RAG thật trên pgvector, không cần vector DB riêng ở quy mô nghìn tenant (Pinecone/Qdrant chỉ cân nhắc lại khi vượt ~50–100 triệu vector). Bảng KB bắt buộc có `version`, `approved_by`, `source_ref` — mọi câu trả lời phải trích dẫn nguồn (đúng tinh thần "tính từ đâu" đã có trong mockup, giữ lại vì đây là điểm mạnh thật, cần cho biện minh trước hội đồng/thanh tra).

```sql
CREATE TABLE kb_chunk (
  id uuid PRIMARY KEY,
  doc_id uuid, version int, approved_by uuid, approved_at timestamptz,
  embedding vector(1536),
  content text, source_ref text
);
CREATE INDEX ON kb_chunk USING hnsw (embedding vector_cosine_ops);
```

### 5.2 Orchestration — Temporal + agent-loop trong Activity

Consensus 2025–2026: Temporal làm lớp durable execution ngoài, agent-loop (gọi thẳng SDK model qua MCP) chạy bên trong Activity. Không dùng CrewAI/AutoGen cho production (chỉ prototype). Không dùng LangChain cho tầng thực thi — thêm trừu tượng không cần thiết, khó debug, hay đổi version phá API; gọi thẳng Anthropic/OpenAI/Google SDK + MCP client là đủ. Nếu cần SDK thống nhất cho streaming chat UI, dùng **Vercel AI SDK** ở tầng UI, không đụng tầng thực thi tool.

- Mọi tool có side-effect (tạo shop Shopee, xuất hoá đơn) bắt buộc **idempotency-key** — bảng `idempotency_keys` (unique constraint) hoặc Redis TTL, chống chạy trùng khi agent tự retry (xảy ra 15–30% do timeout/model không chắc).
- Saga nhiều bước (đặt chỗ + thu cọc + xác nhận, kết nối Shopee OAuth + xác minh + đăng ký webhook) viết thành **Temporal workflow** — Temporal chính là saga orchestrator, không cần thêm saga framework riêng.
- MCP (Model Context Protocol) làm chuẩn expose tool — de facto standard 2026, tương thích Claude/GPT/Gemini, tránh khoá cứng vào 1 nhà cung cấp model.

### 5.3 Quan sát/quản trị AI — Langfuse (tự host)

Cần cho: trace từng bước gọi tool (debug "sao trả lời sai"), theo dõi chi phí/token theo tenant, quản lý version prompt + nội dung Lớp B đã duyệt, eval dataset test regression trước khi deploy prompt mới. **Tự host, không dùng SaaS nước ngoài** — dữ liệu hộ thuộc về hộ (ràng buộc IV.8), tránh gửi nội dung câu hỏi/dữ liệu hộ ra ngoài qua bên thứ 3. Kết hợp OpenTelemetry để trace xuyên suốt cả 4 deployable, không riêng phần AI.

**Prompt lưu ở đâu — không phải câu trả lời đơn nhất, tách theo cái gì thật sự đổi.** CXGenie (Mục 18) có pattern nửa đúng đáng học trực tiếp: prompt hệ thống/orchestration (phân loại intent, sinh SQL, trích KB) hardcode trong `prompt_const.py`, còn prompt persona riêng từng khách hàng (`default_prompt`/`custom_prompt`) nằm cột DB. Tách như vậy — code cho prompt gắn chặt logic, kho dữ liệu đổi được cho nội dung cần đổi độc lập với deploy — là bản năng đúng, nhưng cách họ thực thi có 2 lỗ hổng cụ thể cần tránh:

1. **Prompt lưu DB không version/duyệt** — đúng lỗ hổng đã gắn cờ cho nội dung KB của họ (Mục 18.2), áp dụng luôn cho prompt: cột `TEXT` không lịch sử nghĩa là sửa hỏng không rollback được.
2. **Prompt hệ thống hardcode buộc full deploy chỉ để sửa câu chữ** — bằng chứng thật: nhánh hotfix `fix/openai-leak-prompt`, `fix/fix-translate-prompt` chỉ đổi câu chữ prompt, không đổi logic, vẫn phải qua cả chu trình CI/CD.

Cách sửa cho dự án này: prompt gắn chặt code/schema (vd instruction tool MCP phải khớp đúng JSON schema) ở lại `packages/mcp-tools`, version cùng code triển khai. Mọi thứ khác cần lặp nhanh mà vẫn có audit trail thật — giọng điệu trợ lý Lớp A/B, prompt judge groundedness-check (Mục 5.6), ví dụ few-shot — quản lý qua **prompt management gốc của Langfuse** (có version, gắn nhãn production/staging, fetch runtime qua SDK có cache, rollback không cần redeploy) thay vì hoặc cột DB trần hoặc file hardcode. Nội dung KB Lớp B vẫn giữ nguyên ở `kb_chunk` với `version`/`approved_by`/`source_ref` như đã quy định — quản trị đó đã đúng từ đầu.

**Craft viết prompt — bài học từ đọc thật prompt của CXGenie, không chỉ chỗ lưu.** Vài kỹ thuật đáng copy, và lỗi cụ thể cần cố tình tránh:

- Copy: bắt buộc output JSON bằng cách show ví dụ schema inline (không chỉ mô tả bằng lời), instruction từng bước có đánh số cho reasoning nhiều bước, few-shot ví dụ nhúng sẵn, enforce ngôn ngữ nhất quán qua biến template (`{language}`) — đều là kỹ thuật vững, tái dùng ở đây.
- Tránh: **tự chấm groundedness cùng 1 lần gọi** — prompt sinh câu trả lời của CXGenie để model tự báo `have_enough_information_for_reply` ngay trong chính completion vừa sinh ra câu trả lời — model tự chấm bài mình vừa làm dễ quá tự tin. Groundedness-check bằng model riêng, lần gọi riêng của dự án này (Mục 5.6) là thiết kế đáng tin hơn — phát hiện này xác nhận lựa chọn đó, không cần đổi.
- Tránh: **nối nội dung không tin cậy vào system prompt không delimiter** — `custom_prompt + '\nToday is {today_date}...'` trộn text tenant-cung-cấp thẳng vào dòng instruction không ranh giới, rất có thể chính là lý do sau đó họ phải vá thêm category phát hiện intent "Leak Prompt" mang tính phản ứng. Với dự án này, mọi nội dung động/tenant-cung-cấp đưa vào prompt (đoạn KB retrieve về, text tự do của hộ) phải bọc delimiter rõ ràng (kiểu tag XML) tách biệt khỏi instruction hệ thống lõi — phòng thủ cấu trúc, không phải classifier vá sau.
- Tránh: **prose instruction dài dòng, không thực thi được** — câu kiểu "tích hợp feedback loop liên tục" mô tả việc 1 completion stateless không thể thật sự làm; loại câu đệm này tốn token (ngược nguyên tắc tối ưu chi phí Mục 5.8) mà không đổi hành vi model. Mọi dòng trong system prompt ở đây phải kiểm chứng/thực thi được trong 1 lần gọi.
- Áp dụng rõ: **kỷ luật temperature theo loại tác vụ** — code CXGenie không thấy phân biệt rõ chỗ này. Mọi bước trung gian (routing, phân loại, judge groundedness) chạy `temperature=0` để xác định; chỉ câu trả lời cuối cùng tới hộ mới dùng nhiệt độ ấm hơn cho tự nhiên.

### 5.4 AI hỗ trợ onboarding/tích hợp bên thứ ba

**Build, không buy** cho phần Đông Nam Á/Việt Nam — Merge/Apideck/Nango/Rutter (200–800 connector) không có Shopee/Lazada/VNPT/MISA/VietQR sẵn. Nhưng chép kiến trúc 3 lớp của Nango: **vault** (mã hoá token, tự refresh, cách ly theo tenant) → **proxy/adapter** (tiêm credential vào request, retry/rate-limit — credential không rời khỏi lớp này) → **sync engine** (đồng bộ, schema chuẩn hoá nội bộ).

Nguyên tắc sống còn: **AI agent không bao giờ thấy secret thật.** Agent chỉ giữ token phiên phạm vi hẹp, hết hạn theo tác vụ; backend/broker giải mã credential thật, gọi API, trả kết quả đã lọc, ghi log audit mọi lần dùng.

Luồng copilot onboarding: agent đề xuất bước → gọi tool broker thực thi → gọi endpoint xác minh (test read-only) → báo kết quả → sai thì tự sửa tham số thử lại → không tự giải quyết được (OAuth hết hạn, sai định dạng key, MFA) → chuyển tay người hỗ trợ (khớp yêu cầu IV.6 "cầm tay chỉ việc").

### 5.5 LLM Gateway & failover đa nhà cung cấp

Gateway **LiteLLM tự host** đặt giữa `agent-orchestrator` và API các nhà cung cấp (Claude/GPT/Gemini). Đây là lựa chọn tự host dẫn đầu 2026 cho mẫu hình này — chuẩn hoá request qua nhiều provider, tự động chuyển dự phòng, retry/cooldown, quota theo key — chọn thay Portkey (core giờ Apache 2.0 nhưng nền tảng đầy đủ vẫn thiên về managed/SaaS) và loại Helicone (đã vào maintenance mode sau khi bị mua lại tháng 3/2026, ngừng phát triển tính năng).

- Chuỗi dự phòng: chính Claude Sonnet 5/Opus 5 → GPT-5.6 → Gemini 3.7, tự chuyển khi lỗi/timeout.
- Virtual key theo tenant có `max_budget`/rate-limit riêng, enforce tại gateway — tách biệt với bucket Redis dùng cho rate-limit gọi API bên thứ 3 (Mục 4.2), không thay thế cái đó.
- Vì tool định nghĩa qua MCP (schema không khoá vendor), đổi provider giữa chừng session không vỡ logic gọi tool — đây chính là lợi ích thực tế của việc chọn MCP từ đầu.

### 5.6 Pipeline chống bịa (hallucination) & xác thực

**Lớp A (tool-calling/SQL):** validate JSON schema chặt (`additionalProperties: false`) cho mọi tool call sinh ra, cộng bước dry-run/`EXPLAIN` trước khi thực thi bất cứ gì có side-effect — sai thì model tự sửa dựa trên lỗi dry-run. Hành động rủi ro cao thêm gate duyệt người khi độ tin cậy thấp — cộng thêm, không thay thế, cơ chế idempotency-key đã bắt buộc cho mọi side-effect (Mục 5.2).

**Lớp B (RAG):** thêm bước groundedness check trước khi trả lời tới hộ — model rẻ hơn (Haiku 4.5) chấm điểm câu trả lời có thật sự dựa trên `kb_chunk` lấy về không. Dưới ngưỡng thì từ chối/hỏi lại thay vì bịa. Đây là kỹ thuật RAGAS/TruLens "RAG Triad" (groundedness, context relevance, answer relevance) — chạy offline để eval (RAGAS/DeepEval) và theo dõi sống qua Langfuse đã có sẵn.

**Từ chối đúng lúc:** theo dõi tỷ lệ "không biết" như 1 metric sống trong Langfuse — tăng bất thường báo hiệu retrieval kém hoặc câu hỏi ngoài phạm vi, đẩy sang hỗ trợ người thay vì ép trả lời.

### 5.7 Quản lý phiên & tiếp tục (resume)

Mỗi hội thoại = 1 Temporal workflow, checkpoint sau mỗi bước — crash giữa chừng resume đúng chỗ, không mất dữ liệu, không lặp side-effect (nhờ idempotency-key). Phiên chờ bước người chậm (giữa luồng onboarding OAuth) dùng signal/wait của Temporal thay vì giữ connection sống. Phiên gắn theo `(tenant_id, conversation_id)` phía server, không theo thiết bị — mất máy/cài lại máy mới vẫn tiếp tục đúng hội thoại, không mất ngữ cảnh.

### 5.8 Tối ưu chi phí/token

- **Prompt caching** (Anthropic native, giảm ~90% phần đọc cache): phần tĩnh mỗi lần gọi — system prompt, schema tool, nội dung KB dùng lại — xếp vào phần cache, câu hỏi thật của hộ xếp cuối. Hệ thống này gửi lại gần như cùng schema/KB mỗi lần gọi — đúng chỗ hưởng lợi nhiều nhất.
- **Model cascading:** Haiku 4.5 xử lý routing và câu hỏi Lớp A đơn giản mặc định; chỉ đẩy lên Opus 5 khi độ phức tạp cao hoặc groundedness-check (Mục 5.6) báo tin cậy thấp — leo thang động, không gán cứng theo loại câu hỏi (RouteLLM là implementation tham chiếu: giảm ~85% chi phí, giữ ~95% chất lượng đỉnh).
- **Batch API** (giảm phẳng ~50%, SLA ~24 giờ): chỉ dùng cho việc không cần realtime — viết lại nội dung dự báo từ `ml-analytics`, embedding lại KB hàng loạt khi có bản duyệt mới — không dùng cho chat trực tiếp với hộ.
- Quota LLM theo tenant enforce tại gateway LiteLLM (`max_budget` virtual key), tách biệt với bucket Redis rate-limit cho API bên thứ 3.

### 5.9 Phòng thủ prompt injection — gộp thành 1 nguyên tắc

Không phải cơ chế mới — đặt tên cho phòng thủ đang rải rác nhiều mục thành 1 nguyên tắc tường minh, kiểm chứng được, cộng lấp 2 lỗ hổng phát hiện khi soát từng nguồn nội dung chạm tới prompt LLM.

**Nguyên tắc:** mọi nội dung không do chính instruction cố định của hệ thống viết ra — câu hỏi tự do của hộ, đoạn `kb_chunk` retrieve về, payload webhook bên thứ 3, input hội thoại onboarding — đều coi là dữ liệu, không bao giờ là nguồn chỉ dẫn thực thi được. Khi phải gộp chung với instruction hệ thống trong 1 prompt, bọc bằng delimiter rõ ràng (tag kiểu XML là đủ) tách khỏi dòng instruction, không nối thẳng vào (đúng fix đã làm cho nội dung prompt tenant ở Mục 5.3, mục này khái quát hoá thành quy tắc chung).

**Đã có sẵn, mỗi cái chặn 1 hậu quả khác nhau — đáng gọi tên chung 1 chỗ:**
- **Rò secret qua injection không thể xảy ra về cấu trúc:** agent chưa bao giờ cầm credential thật (Mục 5.4) — không phải phòng thủ chống lại nỗ lực tấn công, mà là loại bỏ hẳn tài nguyên mà nỗ lực đó có thể chạm tới.
- **Hành động chéo tenant qua injection bị chặn dù injection có thao túng được ý định model hay không:** RLS (Mục 4.1) cộng assert tenant độc lập tại entrypoint tool (Mục 4.4) enforce ranh giới ở thời điểm thực thi, không phải thời điểm parse prompt.
- **Tham số tool-call sai/độc hại bị chặn trước khi thực thi:** validate JSON schema chặt cộng dry-run/`EXPLAIN` (Mục 5.6) — ghi là chống hallucinate, nhưng cũng chặn đúng instruction bị injection cố tạo ra tool-call gây hại.
- **SQL injection tự do bị loại trừ về cấu trúc:** Lớp A không bao giờ sinh SQL tự do, chỉ tool-call có khuôn mẫu (Mục 5.1).

**2 lỗ hổng lấp ở đây:**
1. **Nội dung `kb_chunk` retrieve về (RAG Lớp B) phải bọc delimiter khi chèn vào prompt**, không chỉ tin vì đã duyệt. Cờ `version`/`approved_by` (Mục 5.1) là quản trị nội dung, không phải phòng thủ injection — nội dung đã duyệt vẫn có thể vô tình chứa văn bản giống chỉ dẫn (tài liệu scrape-rồi-duyệt trích dẫn ví dụ injection, hoặc bước duyệt lỏng lẻo). Phòng thủ theo chiều sâu nghĩa là vẫn bọc delimiter, giống hệt cách đã làm cho nội dung prompt tenant (Mục 5.3).
2. **Payload webhook/connector bên thứ 3 (Mục 7) là bề mặt input ít tin cậy nhất hệ thống** — bên ngoài thật, đối tượng tấn công chạm tới được. Nếu tương lai có tính năng đưa field payload thô (vd ghi chú tự do người mua từ Shopee) vào LLM context, nội dung đó phải theo đúng quy tắc delimiter này, không chỉ dừng ở hướng dẫn "coi webhook là tín hiệu không phải sự thật" (vốn chỉ nói về tính đúng đắn dữ liệu).

## 6. Message queue / broker / background job

**Đảo lại so với lựa chọn NATS JetStream ban đầu** — org đã có sẵn module Terraform `messaging` (SQS + SNS, có DLQ+redrive, mã hoá KMS) là 1 phần hạ tầng multi-product đã versioned (xem Mục 17). Dựng thêm NATS sẽ lặp lại đúng việc org đang chủ động gộp lại thay vì fork riêng từng sản phẩm — reuse thắng theo đúng nguyên tắc "reuse trước khi thêm công nghệ mới" áp dụng xuyên suốt thiết kế này.

Ba tầng khác nhau, không cạnh tranh nhau:

| Tầng | Công cụ | Vai trò |
|---|---|---|
| Giao tiếp giữa các service | **SNS + SQS** (module `messaging` có sẵn của org) | Domain event (`order.created`, `invoice.issued`, `payment.reconciled`) publish vào SNS topic, phân phối tới SQS queue cho B2G aggregation, hộp thư/notification, ml-analytics — mỗi queue có DLQ+redrive riêng, đã mã hoá KMS |
| Việc nền trong 1 service Node | **BullMQ (trên Valkey/ElastiCache)** | Xuất PDF hoá đơn, gửi nhắc hạn kê khai, resize ảnh QR truy xuất. Valkey đã có sẵn (module `cache` của org), tương thích giao thức Redis — không thêm hạ tầng mới, BullMQ chạy không đổi |
| Việc nền trong service Python | **arq/Celery (khi cần)** | Retrain model dự báo định kỳ — tách biệt hoàn toàn khỏi luồng SNS/SQS |

**Không chọn Kafka** ở giai đoạn này — đúng công cụ cho triệu event/giây, nhiều team độc lập; chi phí vận hành (Zookeeper/KRaft, partition, consumer-group rebalance) vượt xa lợi ích ở quy mô nghìn hộ/năm. **Không chọn RabbitMQ** — không sai nhưng không có lý do dựng thêm broker mới khi SNS/SQS đã là module hoạt động sẵn, versioned. **Không chọn pg-boss** — polling queue chạy chung Postgres với transaction nghiệp vụ + RLS sẽ tự gây nghẽn DB chính; giữ Postgres chỉ lo dữ liệu nghiệp vụ.

**Rủi ro BullMQ "stalled job"** (worker giữ khoá Redis TTL, nếu job xử lý code đồng bộ nặng chặn event loop → khoá không kịp gia hạn → job bị coi là stalled → chạy lại → có thể trùng): chặn bằng (a) không chạy code CPU nặng đồng bộ trong job processor — đẩy ra `worker_threads`; (b) idempotency-key đã áp dụng cho mọi side-effect từ trước, nên nếu có chạy trùng, hậu quả bị vô hiệu hoá ở tầng nghiệp vụ.

Vì SQS/SNS là dịch vụ AWS quản lý sẵn qua module Terraform đã versioned (không phải hạ tầng mới phải tự vận hành), dùng ngay từ ngày đầu pilot là hợp lý, không cần chờ ngưỡng quy mô như khi phải tự vận hành broker kiểu NATS.

## 7. Webhook/sự kiện vào từ bên ngoài

Coi webhook là tín hiệu, không phải nguồn sự thật — không giả định thứ tự đến đúng. Dedupe bằng `provider_event_id` unique index. Retry backoff dạng 30s→2m→10m→1h→4h→12h. Chuẩn hoá payload khác nhau về 1 envelope chung (kiểu CloudEvents: id/source/type/time) trước khi chạm logic nghiệp vụ.

## 8. Repo architecture

```
solodesk/
├── apps/
│   ├── mobile/                  # Flutter — bề mặt chính hộ kinh doanh
│   ├── web-accounting/          # Next.js 16 — kế toán chia sẻ, hỗ trợ
│   ├── web-b2g-dashboard/       # Next.js 16 — tổ công tác, số liệu tổng hợp
│   └── web-buyer-portal/        # Next.js 16 — bên mua xác nhận đơn, truy xuất QR
├── services/
│   ├── backend-api/             # NestJS — gateway + domain modules
│   │   └── src/modules/
│   │       identity-tenant/ catalog-inventory/ sales-order/
│   │       invoicing-tax/ payment-reconcile/ booking-resource/
│   │       procurement/ traceability/
│   │       (mỗi module: domain/ application/ infra/ api/)
│   ├── agent-orchestrator/      # Temporal worker — agent loop trong Activity
│   ├── connector-hub/           # vault + proxy/adapter + sync engine
│   │   └── connectors/
│   │       shopee/ tiktok-shop/ lazada/
│   │       misa-meinvoice/ viettel-sinvoice/ vnpt-invoice/
│   │       sepay-vietqr/ ghn/ ghtk/ viettelpost/ booking-com/ agoda/
│   │       national-free-platform/  # STUB — chờ Cục Thuế công bố API
│   └── ml-analytics/    # Python/FastAPI — dự báo, STT fine-tune
├── packages/
│   ├── domain-core/             # logic thuần: thuế, ngưỡng, tồn kho, chống trùng booking
│   ├── ui-kit/                  # design token dùng chung Flutter/Next.js
│   ├── mcp-tools/                # định nghĩa tool MCP cho agent (Lớp A + Lớp B)
│   └── shared-types/             # contract OpenAPI/tRPC dùng chung
├── infra/
│   ├── terraform/               # tham chiếu qnsc-tf-modules: rds, ecs-cluster/ecs-service,
│   │                             # cache (Valkey), messaging (SQS/SNS), secrets, network, cf-r2
│   └── temporal/                # workflow deploy config (module ECS mới — phần org chưa có)
└── docs/adr/                     # architecture decision record
```

Một monorepo (Turborepo/pnpm workspaces), nhiều deployable — không phải polyrepo.

## 9. Tech stack (bản 2026)

| Lớp | Chọn | Vì sao |
|---|---|---|
| Mobile | Flutter (stable 3.44.x) | Offline-first tốt, chạy êm máy Android cấu hình thấp/vùng sóng yếu |
| Sync engine | PowerSync | Dẫn đầu 2026 cho offline-first mobile+Postgres, "Sync Streams" hợp nhất online/offline |
| Web | Next.js 16 (App Router, RSC) | Ecosystem/tuyển dụng an toàn hơn TanStack Start (mới 1.0, chưa đủ chín) |
| Runtime backend | Node.js 24 LTS | Rủi ro thấp cho enterprise; Bun (v1.3) đáng cân nhắc cho service nhạy độ trễ, chưa phải mặc định |
| Backend framework | NestJS v11 | "Gold standard" TS enterprise 2026 cho modular monolith |
| Connector-hub | Node (hoặc Go nếu đo thấy cần) | I/O-bound concurrency cao, cách ly bán kính nổ |
| ML/Analytics | Python/FastAPI | Hệ sinh thái pandas/statsmodels/prophet, fine-tune Whisper |
| DB | PostgreSQL + pgvector, trên AWS RDS qua module `rds` có sẵn của org | Tận dụng hạ tầng đã versioned thay vì dùng Neon; RLS đúng nhu cầu multi-tenant; pgvector chỉ là bổ sung nhỏ vào parameter group (bật extension), không phải module mới |
| Cache/rate-limit/job queue | Valkey (ElastiCache, module `cache` của org) + BullMQ | Tương thích giao thức Redis, tận dụng hạ tầng có sẵn thay vì dựng Redis riêng |
| Event bus | SNS + SQS (module `messaging` có sẵn của org) | Domain event xuyên service — tận dụng hạ tầng managed có sẵn thay vì dựng NATS |
| Workflow/agent durable | Temporal | Track record production sâu nhất cho workflow dài, cần audit/replay |
| Chuẩn tool agent | MCP | De facto standard 2026, tương thích đa nhà cung cấp model |
| LLM — routing/tool nhanh rẻ | Claude Sonnet 5 / Haiku 4.5 | Cân bằng chi phí-độ trễ cho tool-routing, hỏi đáp dữ liệu hộ |
| LLM — suy luận phức tạp | Claude Opus 5 | Dự báo doanh thu, phân tích sâu, nội dung Lớp B cần chính xác cao |
| Quan sát AI | Langfuse (tự host) + OpenTelemetry | Trace, chi phí theo tenant, version prompt, eval |
| Hoá đơn điện tử | MISA meInvoice Open API (ưu tiên), song song Viettel S-Invoice/VNPT Invoice | Duy nhất MISA công bố Open API/SDK đầy đủ, đã có tích hợp POS thực tế (KiotViet) |
| QR/đối soát ngân hàng | SePay (đối tác uỷ quyền NAPAS) | Webhook + đối soát real-time |
| Giọng nói tiếng Việt | FPT.AI/Viettel AI cloud STT (có mạng) + Whisper-small fine-tune tiếng Việt on-device (mất mạng) | Whisper-tiny gốc quá kém tiếng Việt (~60% WER) |
| Deploy | ECS Fargate qua module `ecs-cluster`/`ecs-service` có sẵn của org (`backend-api`, `agent-orchestrator`, `connector-hub`, `ml-analytics`); Cloudflare Pages hoặc service ECS cho web app (cần xác nhận nhu cầu SSR/RSC khớp hỗ trợ Next.js hiện tại của Pages); Cloudflare R2/edge/tunnel cho object storage và CDN | Tận dụng stack AWS/Cloudflare multi-product đã versioned của org (Mục 17) thay vì Neon/Vercel/Railway/Fly.io |
| CI/CD | Dùng lại nguyên vẹn GitHub Actions `qnsc-ci`: OIDC AWS, build+push ECR (SBOM/provenance), gate migration DB, deploy+verify ECS, attest image, quét secret, đối chiếu OpenAPI contract | Cơ chế không phụ thuộc sản phẩm, đã chạy thật trên `rally`; chỉ cần thêm mới cho bước build Python và Flutter |
| Shared package TS | `@qnsc-vn/identity` (chỉ authn), `@qnsc-vn/platform-http` (error taxonomy, phân trang, guard rate-limit Valkey), `@qnsc-vn/observability` (OTel+pino), `@qnsc-vn/platform-cache` (wrapper Valkey, distributed lock) | Dùng thẳng làm dependency cho `backend-api`; không cái nào gắn với domain của `rally` (Mục 17) |

## 10. Lộ trình theo giai đoạn

- **Pilot 5–10 hộ (Q4/2026):** modular monolith, 1 vùng triển khai, connector nối tay từng đối tác, Temporal cho vài saga trọng yếu (module ECS mới cần dựng, Mục 17), outbox đẩy thẳng qua SNS/SQS ngay từ đầu (hạ tầng managed có sẵn, không cần chờ ngưỡng quy mô riêng), sync REST batch đơn giản (chưa cần CRDT đầy đủ) nhưng schema/API sẵn sàng nâng cấp.
- **100–150 hộ/khóa (2027):** tách module tải cao nếu cần (connector-hub, inventory), thêm read replica, nâng sync engine thật (PowerSync) nếu batch lag, OpenTelemetry đầy đủ vì cam kết SLA uptime (IV.5) cần đo thật.
- **Hàng nghìn hộ/năm:** multi-region nếu nhân rộng toàn quốc, cân nhắc Kafka chỉ khi đo được lượng event vượt ngưỡng thay SNS/SQS, pipeline B2G riêng (Mục 16), tự động hoá onboarding tenant.

## 11. Rủi ro bắt buộc xử lý trước pilot

Docs nội bộ CEO (`SOAT-KICH-BAN-7-VAI.md`, `KIEM-KE-MAN-HINH.md`) đã tự phát hiện các gap thật, phải thành epic kỹ thuật, không chỉ polish demo:

- Idempotent hoá đơn khi mất mạng (chống phát hành trùng)
- Khoá tồn kho chống race (2 đơn cùng tiêu 1 lô cuối)
- Giữ giá đơn treo khi đổi giá sản phẩm
- Hoàn tác thao tác nhầm + nhật ký ai sửa gì
- Khôi phục thiết bị/phiên đăng nhập khi mất máy
- Đối soát tiền mặt ↔ đơn ↔ ngân hàng
- Trả hàng/đổi hàng gắn với đơn gốc
- Test rò rỉ chéo tenant chạy concurrency thật trong CI (Mục 4.5)

## 12. Trả lời tư vấn ngược (Mục V bài toán)

1. **Cấu trúc gói:** một platform cấu hình theo ngành bằng feature-flag, không tách 3 sản phẩm riêng.
2. **Mô hình giá:** kết hợp phí nền/hộ/năm nhỏ + phí nhỏ theo giao dịch vượt ngưỡng miễn phí.
3. **Ranh giới với nền tảng miễn phí quốc gia:** tầng tuân thủ làm mỏng qua adapter, sẵn sàng chuyển sang nền tảng Cục Thuế khi ra mắt mà không đổi kiến trúc.

## 13. Quyết định còn mở — cần ý kiến CEO/kinh doanh

Không phải quyết định kỹ thuật thuần, cần chốt từ phía CEO/kinh doanh trước hoặc trong lúc xây pilot:

1. **Nơi lưu trữ/xử lý dữ liệu khi gọi LLM.** Hướng hiện tại nghiêng về gọi thẳng API Claude/GPT/Gemini (Mục 5.5) thay vì tự host model. Cần xác nhận không có quy định chủ quyền dữ liệu nào của nhà nước chặn việc gửi nội dung câu hỏi của hộ ra API nước ngoài, trước khi chốt hẳn hướng này.
2. **Kiểm tra thực tế kỹ năng team.** Stack giả định team thạo Flutter, NestJS, Temporal, Python/FastAPI. Cần xác nhận team hiện tại/kế hoạch tuyển đúng vậy — vài lựa chọn (vd. Flutter vs React Native) sẽ đổi nếu kỹ năng sẵn có của team lệch hướng khác.
3. **Temporal: tự host hay dùng Temporal Cloud.** Tự host tốn công vận hành thật (backing store, visibility store, quản lý cluster) với team nhỏ; Temporal Cloud bỏ gánh nặng đó, đổi lại chi phí định kỳ. Cần quyết định theo ngân sách.
4. **Mô hình chi phí LLM ở quy mô lớn.** Mục 5.8 đã có kỹ thuật tối ưu, nhưng ước tính $/hộ/tháng cụ thể vẫn cần giả định lượng dùng thật (số câu hỏi AI/hộ/ngày dự kiến) từ phía kinh doanh — số này đưa thẳng vào biểu giá phải công bố trước (Mục IV.9 bài toán).
5. **Yêu cầu chứng nhận tuân thủ.** Cần xác nhận có chứng nhận cụ thể nào (ISO 27001, nghị định bảo vệ dữ liệu cá nhân, kiểm toán liên quan ngân hàng cho dữ liệu QR/thanh toán) là điều kiện bắt buộc cho pilot Q4/2026 hay để sau — ảnh hưởng lựa chọn vault và vùng lưu trữ.
6. **Rủi ro tiến độ ngoài kỹ thuật.** Duyệt app store (Google Play + Apple) và hợp đồng đối tác (MISA/Viettel S-Invoice nhiều khả năng cần hợp đồng reseller/API partnership, không chỉ đăng ký Open API) là thời gian chờ từ phía kinh doanh. Với mục tiêu pilot Q4/2026, cần bắt đầu ngay song song với xây dựng — xác nhận bộ phận kinh doanh đã triển khai việc này chưa.

## 14. Mô hình sẵn sàng — "24/7" nghĩa là gì

Bài toán (Mục IV.5) yêu cầu trợ lý AI tiếng Việt trực 24/7, kèm cam kết tỷ lệ uptime và thời gian phản hồi hỗ trợ người. Cần nói rõ nghĩa kỹ thuật, vì "agent 24/7" dễ bị hiểu lầm thành "agent chạy suy nghĩ liên tục ở nền cho mọi hộ" — cách hiểu này vừa lãng phí (gọi LLM tốn tiền theo lượt, chạy suy luận liên tục khi không có gì mới để xử lý là đốt tiền vô ích) vừa không đúng yêu cầu thật.

Yêu cầu thật — và kiến trúc này đã đáp ứng — gồm 2 việc khác nhau:

1. **Sẵn sàng phản ứng (reactive):** hộ hỏi giờ nào cũng được trả lời. Chỉ cần backend/gateway luôn bật (hosting production chuẩn, không có gì đặc biệt) và API LLM nhận request bất kỳ lúc nào. Agent chỉ chạy — và chỉ tốn token — khi có câu hỏi thật kích hoạt.
2. **Chủ động theo lịch (proactive):** agent nhắc hộ trước hạn (kê khai thuế, hoá đơn quá hạn) mà không cần hộ hỏi trước. Đây là việc nền có lịch — Temporal cron workflow chạy vào giờ định sẵn, kiểm tra điều kiện, gửi thông báo — đúng loại "agent nền/theo lịch" đã mô tả ở Mục 3 (khác với loại agent tương tác).

Mô hình chi phí giữ nguyên cả 2 trường hợp: trả tiền theo lượt gọi LLM thật sự được kích hoạt (câu hỏi thật hoặc kiểm tra theo lịch), không trả theo giây uptime. Không cần kiến trúc mới cho yêu cầu này ngoài những gì đã có — nói rõ ở đây để tránh việc hiểu lệch dần thành "phân tích liên tục mọi thứ theo thời gian thực", vốn là 1 hệ thống khác hẳn (và đắt hơn nhiều) so với bài toán hay thiết kế này thật sự cần.

## 15. Concurrency, realtime & kiến trúc worker

### 15.1 Truyền dữ liệu realtime

Tách theo đúng mối lo, không xây 1 tầng socket chung cho tất cả:

- **Đồng bộ dữ liệu (tồn kho, đơn, đặt chỗ)** — PowerSync đã lo việc này gần thời gian thực giữa các thiết bị. Không xây thêm kênh WebSocket riêng cho cùng dữ liệu — thành 2 nguồn sự thật phải giữ đồng bộ với nhau, không lợi ích gì thêm.
- **Chat AI streaming** — WebSocket, cho phản hồi kiểu gõ chữ dần.
- **Dashboard B2G/web live metric** — Server-Sent Events (SSE) là đủ, chỉ cần đẩy 1 chiều từ server, không cần WebSocket đầy đủ.
- **Cách ly** — mọi kênh/room socket đều scope theo `tenant_id`, kiểm tra tường minh lúc subscribe/xác thực — không chỉ dựa quy ước đặt tên. Bug route nhầm message sang connection tenant khác là rò dữ liệu thật, mức độ nghiêm trọng như mọi lỗi cách ly tenant khác ở Mục 4.

### 15.2 Kích thước worker pool & tự động scale

Scale số bản sao Temporal worker theo **độ dồn ứ task-queue / độ trễ schedule-to-start** — tín hiệu chuẩn báo Activity đang chờ quá lâu mới chạy — không chỉ dựa CPU. Phối hợp với ngân sách connection DB: mỗi worker replica tự mở pool connection riêng, nên `số worker replica × pool size mỗi worker` phải nằm trong giới hạn `max_connections`/pooler của Postgres. Scale worker mà không tính lại ngân sách này chỉ làm cạn connection DB thay vì giải quyết độ dồn ứ.

### 15.3 Tool call chạy song song trong 1 workflow agent

Temporal cho chạy song song nhiều Activity trong 1 workflow (vd kiểm tra tồn kho và chỗ trống booking cùng lúc). Mỗi Activity song song mở transaction DB **riêng**, phải tự `SET LOCAL app.tenant_id` độc lập — không kế thừa từ transaction cha chung. Ghi đồng thời từ các nhánh song song vào cùng tài nguyên (vd cùng lô tồn kho) vẫn cần cơ chế optimistic-lock/version đã quy định ở Mục 4 — chạy song song không miễn trừ yêu cầu này, chỉ làm race dễ xảy ra hơn.

### 15.4 Idempotency — vế đọc, không chỉ vế ghi

Idempotency vế ghi (Mục 5.2/5.6) chống chạy trùng side-effect khi retry. Còn 1 lỗ ở vế đọc: câu trả lời tài chính nhiều truy vấn (vd "thuế tạm tính quý này") chạy thành nhiều statement riêng dưới `READ COMMITTED` mặc định của Postgres có thể trả về số liệu không nhất quán nội bộ nếu có ghi xen giữa các statement đó. Sửa: bọc mọi câu trả lời tài chính/báo cáo nhiều truy vấn trong 1 transaction, 1 snapshot nhất quán (`BEGIN`; `SET LOCAL`; chạy hết các câu đọc; `COMMIT`) để số liệu trong 1 câu trả lời tự nhất quán, dù có hơi cũ.

### 15.5 Ưu tiên giữa agent tương tác và agent nền

Giới hạn đồng thời theo tenant (Mục 4.2) chặn 1 tenant chiếm hết tài nguyên của tenant khác, nhưng không chống được tình huống toàn hệ thống quá tải (tăng trưởng tự nhiên, đợt marketing đột biến). Giải pháp: tách task queue Temporal riêng cho agent tương tác (hộ đang chờ, vd chat) và agent nền (dự báo theo lịch, nhắc hạn), có trọng số ưu tiên — việc tương tác được phục vụ trước khi hệ thống quá tải, việc nền lùi lại/thử lại sau.

## 16. Phân tích & báo cáo: CQRS và ClickHouse

### 16.1 CQRS — đã có ngầm, giờ đặt tên rõ

Pipeline outbox → SNS/SQS → tổng hợp B2G (Mục 6) đã chính là CQRS: bảng OLTP domain chuẩn hoá là write model/nguồn sự thật; view tổng hợp là read model riêng, tối ưu cho đọc, dựng từ dòng sự kiện. Đáng đặt tên rõ để sau này không ai tưởng nhầm đây là phần còn thiếu.

**Đây là CQRS-lite, không phải event sourcing đầy đủ.** Trạng thái không dựng lại thuần từ replay log sự kiện — sự kiện chỉ là cơ chế chiếu/thông báo, bảng OLTP vẫn là nguồn thẩm quyền. Event sourcing đầy đủ cố tình để ngoài phạm vi — thêm độ phức tạp thật kéo dài (version hoá schema sự kiện mãi mãi, công cụ replay) mà không có lợi ích tương xứng cho hệ thống này.

### 16.2 ClickHouse — chưa cần, có điều kiện kích hoạt cụ thể

Không cần ở quy mô pilot/100–150 hộ — vài nghìn đơn tổng cộng vẫn nằm gọn trong khả năng của materialized view Postgres (refresh từ cùng dòng sự kiện). Thêm ngay bây giờ sẽ lặp lại đúng lỗi hạ tầng sớm đã tránh ở mọi chỗ khác trong thiết kế này.

**Thêm khi đo được 1 trong 2 điều kiện:**
1. Truy vấn tổng hợp B2G làm chậm rõ rệt primary khi khối lượng giao dịch lên tới hàng chục triệu dòng (khoảng ngưỡng mà tổng hợp dạng cột bắt đầu vượt trội rõ so với row-store Postgres), hoặc
2. `ml-analytics` cần quét cửa sổ lịch sử lớn để làm feature dự báo, và làm việc đó trên read replica giao dịch sẽ tranh chấp với traffic RAG read-replica đã tách riêng ở Mục 4.3.

**Đường tích hợp khi tới lúc:** mở rộng pipeline SNS/SQS đã có sẵn bằng 1 consumer gom sự kiện domain theo batch đổ vào ClickHouse — không dựng thêm 1 pipeline CDC riêng thứ hai. Khi đã thêm, truy vấn dashboard B2G và truy vấn feature engineering của `ml-analytics` route sang ClickHouse thay vì Postgres.

## 17. Tận dụng hạ tầng org — phát hiện từ `rally`, `qnsc-infra`, `qnsc-tf-modules`, `qnsc-ci`, `qnsc-app-platform`

Org đã có sẵn platform trưởng thành, phục vụ nhiều sản phẩm. Mục này ghi lại những gì đã rà và thay đổi gì so với kế hoạch ở trên — vài lựa chọn trước đó trong tài liệu này (Neon, Vercel/Railway/Fly.io, NATS) bị **đảo lại**, ghi rõ ở đây thay vì âm thầm đổi.

### 17.1 Hạ tầng — tận dụng stack AWS/Cloudflare có sẵn

`qnsc-tf-modules` (versioned, gắn semver) + `qnsc-infra/live` (lớp `runtime-prod`/`runtime-dev` dùng chung đã phục vụ nhiều sản phẩm — `rally` đang chạy, `opshub` dự kiến) đã có sẵn: RDS PostgreSQL, ECS Fargate (module cluster + service), ElastiCache Valkey, SNS/SQS, Secrets Manager/KMS, mạng VPC, quan sát CloudWatch, và Cloudflare edge/WAF/tunnel/R2/Pages. `docs/shared-modules-migration.md` trong `qnsc-infra` xác nhận mục tiêu rõ ràng của org: tách hạ tầng riêng từng sản phẩm thành registry module dùng chung, đúng để "sản phẩm thứ 3" (dự án này) tận dụng thay vì fork riêng. Dùng Neon/Vercel/Railway/Fly.io như đề xuất ban đầu ở Mục 6/9/10 sẽ lặp lại đúng việc org đang chủ động gộp lại — quyết định đó bị đảo trong tài liệu này (xem chỉnh sửa Mục 2, 6, 9, 10 ở trên).

Còn thiếu cần bổ sung: bật extension pgvector trên module `rds` (chỉnh config nhỏ, không phải module mới); dựng deployment Temporal server/worker (chưa có module — phần hạ tầng thật sự mới đầu tiên dự án này thêm vào).

### 17.2 `rally` — copy module skeleton, ghi nhớ 1 bài học đau

`rally` (sản phẩm NestJS/Fastify hiện có, cùng org) đã dựng gần đúng layout hexagonal dự án này nhắm tới: `libs/modules/*` = `domain/{types,ports}` → `application/*.service.ts` → `infrastructure/persistence/*` → `interface/http/*`. Copy nguyên skeleton này cho domain module của `backend-api` (đổi tên `interface/http` thành `api/` cho khớp quy ước dự án). Dockerfile multi-stage của rally (deps → builder → target `api`/`worker`/`migrator`) map thẳng vào nhu cầu dự án này cần image `backend-api` + image `agent-orchestrator` + migrator one-shot — dùng lại nguyên mẫu. Cơ chế transactional outbox rally đã cài đặt chính là cơ chế đã quy định ở Mục 6 — dùng lại code migration/relay thật, không viết lại từ đầu.

**Bài học quan trọng — không lặp lại đúng lỗi rally đã mắc.** Rally từng cài Postgres RLS (`0005_rls_tenant_isolation.sql`, `set_tenant_context()`) rồi **bỏ hẳn** (migration `0025`/`0026`) sau khi phát hiện role DB đang dùng có quyền superuser/`BYPASSRLS`, khiến mọi policy RLS âm thầm vô hiệu — đúng cái bẫy Mục 4.1 đã cảnh báo. Cách rally sửa là quay về lọc `workspace_id` tầng ứng dụng thay vì sửa role. Dự án này không làm vậy — vẫn giữ RLS — nhưng bài học cụ thể là: **phải cấp role DB ứng dụng không phải superuser, không có `BYPASSRLS` ở MỌI môi trường, kể cả dev local, ngay từ đầu.** Lỗ hổng cấp role đó, không phải bản thân RLS, mới là thứ thật sự thất bại ở đó. Dùng lại cơ chế migration RLS của rally (`SET LOCAL app.tenant_id`, khuôn mẫu policy, mẹo junction-table-qua-`EXISTS` cho bảng không có cột `tenant_id` trực tiếp) — chỉ đừng bỏ qua việc cấp role đúng như họ đã bỏ qua.

Mẫu auth (BFF session cho browser + JWT cho client máy, 1 `PolicyGuard`/`@RequirePermission()` decorator duy nhất, quyền resolve lại từ DB mỗi request thay vì nhúng trong JWT) đáng copy về mặt khái niệm; RBAC catalog và mã quyền thật sự là riêng của rally, không chuyển giao được.

### 17.3 CI/CD — dùng lại nguyên vẹn

Toàn bộ 16 GitHub Actions của `qnsc-ci` không phụ thuộc sản phẩm (tham số hoá theo role ARN, tên cluster/service, tên image): OIDC AWS, build+push ECR kèm SBOM/provenance, bước gate migration DB trước deploy, deploy+verify ECS, attest image, quét secret (Gitleaks), đối chiếu OpenAPI contract. Dùng lại nguyên cả pipeline deploy cho `backend-api`/`agent-orchestrator`/`connector-hub`. Thật sự thiếu, cần làm mới: action build/publish Python cho `ml-analytics`, và action build+ký+phân phối app store cho Flutter `mobile` — cái sau gắn thẳng vào rủi ro tiến độ duyệt app store đã nêu ở Mục 13.

### 17.4 Shared package TypeScript — dùng lại 4 cái, xây mới đúng chỗ thật sự mới

4 package của `qnsc-app-platform` đã qua tiêu chí thẩm định của org ("chỉ ở đây nếu khác biệt sẽ thành lỗi bảo mật hoặc vỡ hợp đồng liên repo") và đã bóc code riêng sản phẩm ra — an toàn để dùng thẳng làm dependency: `@qnsc-vn/identity` (chỉ xác thực — JWT/OIDC/xoay refresh-token; phân quyền cố tình loại trừ vì là "từ vựng riêng sản phẩm", nên RBAC tenant/hộ của dự án này xây mới là đúng dự kiến, không phải lỗ hổng), `@qnsc-vn/platform-http` (error taxonomy, phân trang, request-context, guard rate-limit trên Valkey — dùng cái này thay cho rate-limiter tự viết theo `(tenant, provider)` ở Mục 4.2), `@qnsc-vn/observability` (khởi tạo OpenTelemetry + log có cấu trúc — đã khớp kế hoạch Mục 5.3), `@qnsc-vn/platform-cache` (wrapper Valkey có distributed lock — dùng để hiện thực idempotency-key store ở Mục 5.2 thay vì bảng tự viết).

Thật sự mới với dự án này, không phải lỗ hổng của shared lib: enforce RLS đa tenant và RBAC nội bộ hộ, package tool MCP, công cụ CI/deploy riêng cho Temporal.

## 18. Tận dụng sản phẩm org — phát hiện từ CXGenie (`cxgenie-be`, `cxgenie-core-ai`, `cxgenie-loader-service`, `cxgenie-email-service`, `cxgenie-integration-service`, `cxgenie-flutter`)

CXGenie là sản phẩm chatbot chăm sóc khách hàng AI đang chạy production, cùng kiến trúc sư này xây trước đó. Về bản chất đây là 1 danh mục sống các lỗi mà thiết kế mới này đã chủ động phòng — nhiều quyết định của dự án này được xác nhận mạnh bằng bằng chứng thật (không chỉ lý thuyết) từ các lỗ hổng quan sát được ở đây.

### 18.1 Pattern đáng copy

- **3 bề mặt xác thực tách biệt** (`cxgenie-be`): JWT cho nhân viên dashboard/admin, JWT khách riêng cho khách hàng cuối dùng widget nhúng, header API-key cho tích hợp. Ánh xạ đúng khái niệm vào nhu cầu dự án này: auth hộ kinh doanh, token cổng B2B bên mua, và auth webhook/connector là 3 bề mặt thật sự khác nhau, không gộp chung 1 khối.
- **Baseline chunking KB**: `RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=10)` cộng dedupe theo khoảng cách embedding trước khi ingest. Tham số khởi điểm hợp lý cho pipeline ingest KB dự án này (`chunk_overlap=10` ở đó khá mỏng — nên chỉnh cao hơn ở đây).
- **Monolith NestJS ~200 module chạy production thật** (`cxgenie-be`) — bằng chứng cụ thể modular monolith scale được tới số lượng feature lớn thật mà không cần microservice; củng cố lựa chọn ở Mục 3 bằng thực tế, không chỉ khẳng định suông.
- **Hình dạng vòng đời onboarding connector** (`cxgenie-integration-service`): xác thực credential → đăng ký webhook → lưu; khi ngắt kết nối: huỷ đăng ký → xoá. Khung sườn ổn — chỉ thiếu vault, interface adapter, và queue bên dưới — đúng những gì `connector-hub` thêm vào.

### 18.2 Anti-pattern cần tránh — có bằng chứng cụ thể

- **Cách ly vector kiểu shared-collection + filter** (mẹo nhồi partition của `zilliz_module`, cộng nhánh Chroma cũ song song) — cách ly chỉ dựa "filter string đúng", không bao giờ được enforce vật lý. Đây đúng là thứ pgvector + RLS (Mục 4.1) thay thế bằng cách ly enforce ở tầng DB thay vì kỷ luật tầng ứng dụng.
- **Tự viết abstraction đa nhà cung cấp LLM** (`llm_factory_module`) — chuỗi fallback hardcode theo từng provider, circuit breaker dựng bằng cách poll trang status của vendor, xoay vòng API-key chỉ để rải rate-limit (không có config theo tenant thật). Đúng loại việc gateway LiteLLM (Mục 5.5) thay thế — xác nhận quyết định đó, không phải over-engineer.
- **Phụ thuộc Assistants API có trạng thái của OpenAI** (`assistants_module`) — trạng thái phiên/thread do vendor giữ, và OpenAI đang sunset Assistants API để chuyển sang Responses API, nghĩa là cả module phải viết lại. Xác nhận trực tiếp việc tự giữ trạng thái phiên qua Temporal (Mục 5.7) thay vì API có trạng thái độc quyền của nền tảng.
- **Job processor `asyncio.Queue` trong bộ nhớ** (`workers/job_processor.py`, loader-service) — không bền, không retry, mất job khi restart process. Đúng anti-pattern cần tránh ở `ml-analytics` — Temporal Activity đã cho retry/bền miễn phí; dùng cái đó, không tự viết queue trong process.
- **Không có quy trình version/duyệt KB nào cả** — grep "approve"/"version" trên cả 2 repo AI Python không ra gì; nội dung ingest thẳng vào collection vector dùng chung ngay. Xác nhận yêu cầu `version`/`approved_by`/`source_ref` trên `kb_chunk` (Mục 5.1) là yêu cầu có tải trọng thật, không phải thừa thãi phòng ngừa.
- **Không có interface adapter xuyên kênh** (`cxgenie-integration-service`) — Telegram/Slack/Discord/Shopify/WooCommerce mỗi kênh tự viết lại riêng việc xác thực webhook và logic trả lời; doc nội bộ sản phẩm ghi thẳng "luồng tích hợp Slack giống hệt [Telegram]", thừa nhận trùng lặp thay vì trừu tượng hoá. Bằng chứng cụ thể cái giá của việc không làm adapter — lý do `connector-hub` cần 1 model nội bộ chuẩn hoá + adapter riêng từng kênh (Mục 5.4).
- **Credential dạng cột DB thuần văn bản** — `telegram_token`, `slack_signing_secret`, `shopify_access_token`... nằm thẳng trên 1 dòng `BotModel` không chuẩn hoá, không mã hoá, không vault, không KMS. Lý lẽ rõ ràng nhất có thể có cho thiết kế vault+proxy đã chốt.
- **Xử lý webhook hoàn toàn đồng bộ, không queue, không retry, không dedupe** — handler 1 kênh còn không await (fire-and-forget); lỗi chỉ log rồi âm thầm bỏ message. Xác nhận trực tiếp yêu cầu độ tin cậy webhook ở Mục 7 (dedupe theo provider event ID, retry có backoff, coi webhook là tín hiệu không phải nguồn sự thật) — đúng lỗ hổng production mà mục đó sinh ra để ngăn.
- **Không có Postgres RLS nào trong `cxgenie-be`** — multi-tenant chỉ lọc `workspace_id` tầng ứng dụng qua guard phải gắn tay từng route, không có lớp chặn tầng DB. Đây là lỗi đối xứng ngược với RLS-bị-bypass-bởi-superuser của `rally` (Mục 17.2): 1 sản phẩm cũ có RLS nhưng bị vô hiệu âm thầm, sản phẩm kia chưa từng có RLS và chỉ dựa kỷ luật guard. Quan sát được cả 2 kiểu lỗi trên chính 2 sản phẩm trước của cùng kiến trúc sư là lý lẽ mạnh cho phòng thủ nhiều lớp của thiết kế này — RLS + `FORCE ROW LEVEL SECURITY` + role non-superuser (Mục 4.1) **và** assert độc lập tại entrypoint tool (Mục 4.4) — vì không cơ chế đơn lẻ nào đã chứng minh đủ trong thực tế.
- **Việc tách `cxgenie-email-service`** — ORM khác (Prisma) so với phần còn lại (Sequelize), tổng ~2.600 dòng code, tên `package.json` còn để nguyên `"new-project"`, không có lý do scale/bán kính nổ nào trong lịch sử commit. Đọc như 1 lần tách tiện lợi khởi đầu mới, không phải bắt buộc kiến trúc — ví dụ cảnh báo cụ thể khớp đúng quy tắc "chỉ tách deployable khi có lý do cụ thể" ở Mục 3.

### 18.3 Một điểm cần cân chỉnh, không phải đảo ngược

`requirements.txt` của CXGenie cho thấy LangChain đã dùng thành công trong production ở đó, cùng Langfuse (xác nhận lựa chọn đó). Thiết kế dự án này cố tình loại LangChain khỏi tầng thực thi (Mục 5.2) — đáng nói rõ vì sao đây không phải mâu thuẫn: cách dùng của CXGenie là orchestration chat-completion đồng bộ đơn giản trong 1 service Python thuần, còn agent-loop dự án này chạy trong Temporal Activity với giới hạn đồng thời theo tenant, idempotency-key, schema tool MCP. Chi phí trừu tượng của LangChain lộ rõ hơn ở mức độ phức tạp orchestration đó so với 1 backend chatbot đơn giản hơn — kết luận là "sai tầng cho mô hình đồng thời của dự án này", không phải "LangChain tệ".

### 18.4 Bài học tích hợp Node↔Python

`cxgenie-be` gọi `cxgenie-core-ai`/`cxgenie-loader-service` qua HTTP đồng bộ thuần (axios), không thấy kỷ luật timeout/circuit-breaker nào. Với dự án này, lỗ hổng đó tránh được từ cấu trúc miễn tuân thủ đúng quy tắc: mọi lệnh gọi từ `backend-api`/`agent-orchestrator` sang `ml-analytics` diễn ra **bên trong 1 Temporal Activity**, vốn đã cho retry/backoff/bền miễn phí — rủi ro chỉ quay lại nếu có ai gọi đồng bộ từ ngoài workflow (vd trực tiếp trong 1 HTTP request handler), tái tạo đúng lỗ hổng này.

## 19. Resilience pattern — Timeout, Retry, Circuit Breaker, Bulkhead

Không phải hạ tầng mới — lấp đúng lỗ hổng lịch sử CXGenie tự lộ ra (Mục 18.2: không có pattern rate-limit/idempotency nào, circuit breaker tự viết bằng cách poll trang status vendor).

### 19.1 Timeout — 2 lớp, không phải 1

- **Tầng HTTP client** (trong `connector-hub`, gọi Shopee/MISA/GHN/...): timeout ngắn (~10s) đặt tại chính HTTP client. Call bị treo không được phép nằm im trong ngân sách timeout Activity bên ngoài mà không ai hay.
- **Tầng Temporal Activity** (`startToCloseTimeout`, `scheduleToCloseTimeout`, `heartbeatTimeout`): bao ngoài, tính cả thời gian chờ retry. Đã có sẵn native trong Temporal — chỉ cần cấu hình rõ theo từng loại Activity (gọi LLM khác, gọi Shopee khác, gọi DB khác).

### 19.2 Retry — Temporal lo phần lớn, nhưng bắt buộc phân loại lỗi

Retry policy Activity của Temporal (`initialInterval`, `backoffCoefficient`, `maximumAttempts`) là cơ chế retry chính — không cần thêm framework retry riêng chồng lên. Cần thêm: **phân loại lỗi retryable hay không** ngay trong từng adapter `connector-hub`. Lỗi 4xx (request sai định dạng, tham số sai) phải throw non-retryable — retry lỗi này chỉ tốn ngân sách rate-limit mà không có cơ hội thành công. Chỉ lỗi 5xx/timeout/network mới nên retryable. Không phân loại đúng chính là kiểu lỗ hổng retry mù dẫn tới tốn quota và che giấu bug thật.

### 19.3 Circuit breaker — dùng `cockatiel` (Node), không tự viết

`rally` đã dùng `cockatiel` cho resilience (Mục 17.2) — tận dụng lại thay vì tự dựng. Circuit breaker của CXGenie tự viết bằng cách poll trang status vendor (Mục 18.2) — anti-pattern dễ vỡ, cố tình tránh ở đây.

Cần 2 tầng riêng biệt, mỗi tầng phục vụ mục đích khác:

1. **Theo provider (global)** — Shopee/MISA đang sập diện rộng → breaker trip, fail fast, ngừng đốt ngân sách rate-limit của mọi tenant vào 1 provider rõ ràng đang lỗi.
2. **Theo `(tenant, provider)`** — riêng token 1 hộ hết hạn/bị thu hồi (gây lỗi 401 liên tục) → breaker riêng cho đúng cặp đó trip, chuyển sang yêu cầu re-auth thay vì retry vô tận 1 lệnh gọi không bao giờ thành công — không ảnh hưởng tenant khác vẫn dùng provider đó bình thường.

Gateway LiteLLM (Mục 5.5) đã có cơ chế fallback/failover tương đương cho tầng LLM — `cockatiel` chỉ dành cho lệnh gọi API bên thứ 3 trong `connector-hub`, không thay thế LiteLLM.

### 19.4 Bulkhead — đã có 1 phần, cần thêm 1 chỗ

Đã có ở chỗ khác trong tài liệu này:
- Giới hạn đồng thời theo tenant (Mục 4.2) — bulkhead giữa các tenant.
- Ngân sách connection DB gắn với số worker replica (Mục 15.2) — bulkhead chống cạn connection.

Còn thiếu, cần thêm: **bulkhead theo provider trong `connector-hub`**. 1 provider chậm/treo (vd Shopee lag nặng) không được phép chiếm hết connection pool/worker dùng chung cần cho GHN hay MISA. Cụ thể: pool connection HTTP riêng theo từng provider, hoặc tách task queue Temporal riêng theo provider — mở rộng đúng ý tưởng tách task queue interactive/background đã dùng ở Mục 15.5, thêm 1 chiều nữa.

Mục này thật sự là việc mới hoàn toàn, không tái dùng từ codebase org nào đã rà — CXGenie không có pattern tương đương nào (Mục 18.2), nên không có gì để copy ở đây, chỉ có bài học từ cái giá của việc thiếu nó.

## 20. Thực hành kỹ thuật — nguyên tắc chất lượng code

Không phải nhắc nhở chung chung — mỗi nguyên tắc dưới đây đã được thể hiện bằng 1 quyết định cụ thể ở phần trước tài liệu này. Gom lại đây để team có 1 chỗ đối chiếu code mới với tiền lệ đã có, và để giải thích vì sao thiết kế này gắn kết như 1 hệ thống, không phải đống lựa chọn rời rạc.

### 20.1 DRY & tái dùng component

- `packages/domain-core` giữ logic nghiệp vụ (tính thuế, ngưỡng, sổ tồn kho, chống trùng booking) 1 lần duy nhất, mọi domain module cần dùng chung, không viết lại riêng từng module.
- 4 package `@qnsc-vn/*` (Mục 17.4) dùng thẳng làm dependency thay vì viết lại: `identity` cho authn, `platform-http` cho error taxonomy/phân trang/rate-limit guard, `observability` cho OTel/logging, `platform-cache` cho wrapper Valkey và idempotency-key store.
- `packages/mcp-tools` gom schema tool cho cả Lớp A và Lớp B — 1 định nghĩa cho mỗi tool, không lặp lại theo từng nơi gọi.
- `packages/ui-kit` giữ design token dùng chung Flutter và Next.js — 1 hệ thiết kế, không phải 2 cái trôi lệch song song.
- Adapter pattern của `connector-hub` (Mục 5.4) **chính là** DRY áp dụng vào tích hợp bên thứ 3: 1 model nội bộ chuẩn hoá, 1 adapter mỗi kênh — ngược hẳn với việc CXGenie lặp lại logic webhook/trả lời riêng từng kênh (Mục 18.2).
- **Quy tắc:** trước khi thêm logic mới vào bất kỳ module nào, kiểm tra `domain-core`, `mcp-tools`, và các package `@qnsc-vn/*` trước — đây là mục checklist review PR, không phải gợi ý tuỳ chọn.

### 20.2 Nhất quán

- Mọi domain module trong `backend-api` dùng đúng 1 layout hexagonal (`domain/application/infra/api`) — không module nào có cấu trúc riêng biệt, để đọc hiểu module #2 là hiểu luôn module #12.
- Lỗi đi qua error taxonomy của `@qnsc-vn/platform-http` ở mọi nơi — không module nào tự bịa hình dạng lỗi riêng.
- Idempotency-key (Mục 5.2) áp dụng đồng nhất cho **mọi** tool có side-effect, không chọn lọc theo cảm tính lúc viết code thấy "cái này có vẻ rủi ro".
- Kiểu commit và công cụ release theo đúng quy ước org đã có (conventional commits + `release-please`, theo cấu hình `qnsc-app-platform`, Mục 17.4) — dùng lại, không phát minh riêng cho từng repo.

### 20.3 Không hardcode, không magic number

Ví dụ cụ thể quan trọng nhất ở đây: ngưỡng và tỷ lệ thuế (vd ngưỡng 1 tỷ đồng/năm dùng hoá đơn điện tử, quy tắc thuế theo từng loại hộ) phải nằm trong **bảng config/DB có version** (Strategy pattern tính thuế, Mục 20.5), không bao giờ là literal viết thẳng trong code. Biểu giá của chương trình tự nó đã thiết kế đổi hình dạng theo thời gian (Mục 12: năm 1 hỗ trợ 100%, năm 2 50%, năm 3 tự trả) — hardcode bất kỳ giá trị nào trong số này sẽ âm thầm phá vỡ 1 yêu cầu hợp đồng/pháp lý thật, không chỉ vi phạm style guide. Kỷ luật tương tự áp dụng cho số lần retry, thời lượng timeout (Mục 19.1), và giá trị quota/ngân sách theo tenant (Mục 5.8, 19) — hằng số đặt tên, cấu hình được, không phải literal rải rác.

### 20.4 Không trùng lặp, không chồng lấn

Đã enforce ở vài chỗ cụ thể trong tài liệu này, đáng gọi tên là cùng 1 quy tắc:
- 1 cơ chế realtime cho mỗi mối lo, không 2 cái cạnh tranh cho cùng dữ liệu (Mục 15.1 — PowerSync lo đồng bộ, WebSocket/SSE chỉ cho phần PowerSync không phủ tới).
- 1 pipeline CDC, mở rộng chứ không nhân đôi khi thêm ClickHouse (Mục 16.2).
- 2 cơ chế rate-limit/quota trông giống nhau nhưng cố tình KHÔNG gộp vì kiểm soát 2 thứ khác nhau: ngân sách gateway LiteLLM (chi phí LLM) và bucket Redis theo `(tenant, provider)` (gọi API bên thứ 3) — giữ tách biệt tường minh thay vì gộp lại, vì gộp sẽ che mất đang bảo vệ đúng tài nguyên nào.

### 20.5 Dùng đúng design pattern — vừa vặn, không phải trang trí

Mọi pattern trong thiết kế này được chọn vì bài toán nó giải quyết thật sự tồn tại ở đây, không phải để trông tinh vi:
- **Adapter** — `connector-hub`, 1 cái mỗi kênh ngoài.
- **Strategy** — engine tính thuế, có version, đổi được theo từng loại hộ/doanh nghiệp.
- **Saga** — hiện thực **bằng** Temporal workflow (Mục 5.2), cố tình không thêm framework saga riêng, vì Temporal đã cho sẵn orchestration, compensation, replay.
- **CQRS-lite, không phải event sourcing đầy đủ** (Mục 16.1) — tách đọc/ghi hữu ích ở đây; dựng lại toàn bộ trạng thái thuần từ log sự kiện không phải bài toán hệ thống này thật sự có, nên pattern nặng hơn đó cố tình không dùng.

### 20.6 YAGNI — đã là xương sống thiết kế này, không phải ý mới

Mọi lần hoãn trong tài liệu này là 1 quyết định YAGNI nói rõ ra, không giấu ngầm:
- Modular monolith tới khi có lý do cụ thể để tách (Mục 3), không microservice trước.
- ClickHouse hoãn tới điều kiện đo được, không thêm theo suy đoán (Mục 16.2).
- Kafka hoãn trừ khi đo được lượng event đủ lớn để thay SNS/SQS (Mục 6).
- Event sourcing đầy đủ tránh dùng, thay bằng CQRS-lite (Mục 16.1).
- Go cho `connector-hub` chỉ khi đo thấy cần (Mục 3), không dùng theo dự đoán nhu cầu.
- Temporal tự host hay Cloud để mở làm quyết định kinh doanh (Mục 13), không dựng sẵn cho quy mô chưa tới.

### 20.7 KISS

- Lớp A dùng tool-calling/text-to-SQL có khuôn mẫu, không dùng cơ chế RAG nặng hơn không cần tới (Mục 5.1) — cơ chế đơn giản nhất vừa đúng nhu cầu dữ liệu giao dịch chính xác.
- 1 monorepo, không polyrepo, tới khi cấu trúc team thật sự cần tách (Mục 3, Mục 8).
- Dùng lại SNS/SQS nguyên trạng thay vì dựng broker mới, vì lựa chọn đơn giản hơn, đã có sẵn, đủ đáp ứng yêu cầu thật (Mục 6).

---

*Tài liệu sống — cập nhật khi có quyết định kiến trúc mới hoặc khi nền tảng miễn phí quốc gia công bố API.*
