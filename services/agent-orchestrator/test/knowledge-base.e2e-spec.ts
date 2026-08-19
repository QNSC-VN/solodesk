import { describe, it, expect, afterAll } from 'vitest';
import postgres from 'postgres';
import { ilike, cosineDistance } from 'drizzle-orm';
import { db } from '../src/db/client';
import { knowledgeChunks } from '../src/db/schema/knowledge-chunks';
import { searchKnowledgeBaseByKeyword } from '../src/temporal/activities/tools/search-knowledge-base.tool';

/**
 * Real Postgres (with pgvector), no mocks — but no real Voyage API call
 * either: the cosine-ordering test hand-supplies vectors directly, proving
 * the schema/index/distance-ordering plumbing works without needing a real
 * embedding call, same "not live-verified" shape as this repo's 3rd-party
 * connector adapters. `searchKnowledgeBaseByKeyword` (the
 * MOCK_LLM_RESPONSES fallback) needs no embedding at all — fully real.
 *
 * `knowledge.chunks` is NOT tenant-scoped (shared reference content, no
 * per-tenant fixture isolation like every other e2e spec in this repo gets
 * for free) — every fixture here uses a unique per-run title marker AND is
 * deleted in afterAll, so repeated runs never accumulate rows that could
 * pollute another run's cosine-distance ordering.
 */

const adminSql = postgres(process.env.DATABASE_ADMIN_URL!, { max: 1 });
const TEST_SOURCE = 'e2e-test-fixture';

afterAll(async () => {
  await adminSql`DELETE FROM knowledge.chunks WHERE source = ${TEST_SOURCE}`;
  await adminSql.end();
});

function unitVector(index: number, dim = 1024): number[] {
  const v = new Array(dim).fill(0);
  v[index] = 1;
  return v;
}

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  return v.map((x) => x / norm);
}

async function seedChunk(title: string, content: string, embedding: number[]): Promise<void> {
  await adminSql`
    INSERT INTO knowledge.chunks (title, content, source, embedding)
    VALUES (${title}, ${content}, ${TEST_SOURCE}, ${JSON.stringify(embedding)}::vector)
  `;
}

describe('knowledge base — pgvector schema and retrieval, real Postgres', () => {
  it('orders results by cosine distance, closest first', async () => {
    const marker = `KB-TEST-COSINE-${Date.now()}`;
    await seedChunk(`${marker} exact match`, 'content A', unitVector(0));
    await seedChunk(`${marker} partial match`, 'content B', normalize([1, 1, ...new Array(1022).fill(0)]));
    await seedChunk(`${marker} orthogonal`, 'content C', unitVector(1));

    // Filtered by this run's own marker, not the production tool's
    // unscoped top-5 — knowledge.chunks has no tenant filter to isolate
    // fixtures with, so this is the deterministic equivalent.
    const rows = await db
      .select({ title: knowledgeChunks.title })
      .from(knowledgeChunks)
      .where(ilike(knowledgeChunks.title, `${marker}%`))
      .orderBy(cosineDistance(knowledgeChunks.embedding, unitVector(0)));

    expect(rows.map((r) => r.title)).toEqual([`${marker} exact match`, `${marker} partial match`, `${marker} orthogonal`]);
  });

  it('keyword fallback (MOCK_LLM_RESPONSES path) matches on title/content substring, no embedding needed', async () => {
    const marker = `KB-TEST-KEYWORD-${Date.now()}`;
    await seedChunk(`${marker} formalization steps`, 'Steps to register a household business.', unitVector(2));
    await seedChunk(`${marker} unrelated`, 'Something about shipping labels.', unitVector(3));

    const result = await searchKnowledgeBaseByKeyword({ query: 'register a household business' });

    expect(result.results.some((r) => r.title === `${marker} formalization steps`)).toBe(true);
    expect(result.results.some((r) => r.title === `${marker} unrelated`)).toBe(false);
  });

  it('returns an empty result, not an error, when nothing matches', async () => {
    const result = await searchKnowledgeBaseByKeyword({ query: `no-such-topic-${Date.now()}` });
    expect(result.count).toBe(0);
    expect(result.results).toEqual([]);
  });
});
