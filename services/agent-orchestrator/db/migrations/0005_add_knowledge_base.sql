-- Layer B (RAG) — docs Section 5.1 lists this as the second retrieval layer
-- alongside Layer A's live SQL tools: "Layer B: general knowledge (tax
-- rules, formalization steps, FAQs) ... retrieved via embeddings". This is
-- the first thing in this database that isn't tenant-scoped business data —
-- knowledge.chunks holds shared reference content, the same non-tenant
-- reference-data shape as backend-api's tax.tax_rules (see that table's own
-- migration comment). No RLS here for the same reason: there is no tenant
-- to scope it to.
--
-- Ingestion (INSERT) happens ONLY via DATABASE_ADMIN_URL through
-- scripts/ingest-knowledge.ts, never through solodesk_agent — this role
-- gets SELECT only, same least-privilege discipline as every other GRANT
-- in this file's siblings (0001-0004).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS knowledge;

CREATE TABLE knowledge.chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  source text NOT NULL,
  -- voyage-3.5's embedding dimension (Anthropic's recommended embeddings
  -- partner, since Anthropic itself doesn't offer an embeddings endpoint).
  embedding vector(1024) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- HNSW over cosine distance — matches the `cosineDistance()` operator the
-- search-knowledge-base tool queries with (drizzle-orm's pgvector helper).
CREATE INDEX chunks_embedding_hnsw_idx ON knowledge.chunks USING hnsw (embedding vector_cosine_ops);

GRANT USAGE ON SCHEMA knowledge TO solodesk_agent;
GRANT SELECT ON knowledge.chunks TO solodesk_agent;
