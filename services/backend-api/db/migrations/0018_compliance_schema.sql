-- compliance module — matches src/db/schema/compliance-documents.ts
-- exactly. Ported from SOLOMATRIX-Mockup-v4's "Hồ sơ để bán cho khách tổ
-- chức" card (Kho tab) + its per-tenant `t.compliance[]` array: a document
-- ROW here is one compliance artifact (ATTP certificate, tự công bố sản
-- phẩm, phương tiện thuỷ đăng kiểm, ...). `doc_type` is free text on
-- purpose — the mockup has no doc-type enum either, and the real set
-- varies by industry (food safety vs marine vessels vs growing areas).
--
-- `document_number` NULL means "known-required-but-missing" — the mockup's
-- `trangThai: 'thieu'` rows — which is what feeds the "N mục chưa đủ"
-- count. Status (missing/expired/expiring/valid) is DERIVED from the row
-- at read time and NEVER stored, same "no stored status column that can
-- drift from the truth" discipline as payment-reconcile's isFullyPaid.

CREATE SCHEMA IF NOT EXISTS compliance;
GRANT USAGE ON SCHEMA compliance TO solodesk_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA compliance
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO solodesk_app;

CREATE TABLE compliance.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.tenants(id),
  doc_type text NOT NULL,
  document_number text,
  issued_on date,
  expires_on date,
  is_mandatory boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compliance_expiry_after_issue CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on > issued_on)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON compliance.documents TO solodesk_app;

ALTER TABLE compliance.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.documents
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX compliance_documents_tenant_idx ON compliance.documents (tenant_id, expires_on);
