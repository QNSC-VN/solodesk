import { ApplicationFailure } from '@temporalio/common';
import { cosineDistance } from 'drizzle-orm';
import { db } from '../../../db/client';
import { knowledgeChunks } from '../../../db/schema/knowledge-chunks';
import { embedText } from '../../../platform/embeddings';
import { stripDiacritics } from '../../../platform/text';

export interface SearchKnowledgeBaseInput {
  query: string;
}

export interface KnowledgeResult {
  title: string;
  content: string;
  source: string;
}

export interface SearchKnowledgeBaseResult {
  results: KnowledgeResult[];
  count: number;
}

export const SEARCH_KNOWLEDGE_BASE_TOOL_NAME = 'search_knowledge_base';

const MAX_RESULTS = 5;

export const searchKnowledgeBaseToolSchema = {
  name: SEARCH_KNOWLEDGE_BASE_TOOL_NAME,
  description:
    'Search general reference knowledge (business formalization steps, tax/regulatory FAQs) by meaning, not by exact keyword. Layer B — use this for "how do I..." / policy questions; use the other tools for the caller\'s own live business data. Not tenant-scoped: this is shared reference content, the same for every tenant.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string' as const, description: 'The question to search for, in natural language.' },
    },
    required: ['query'],
    additionalProperties: false,
  },
};

/**
 * The pgvector query itself, separated from the embedding call so the
 * ordering/index/schema plumbing is directly testable with a hand-supplied
 * vector — no real Voyage API call needed to prove THIS part works.
 */
export async function searchByEmbedding(embedding: number[]): Promise<SearchKnowledgeBaseResult> {
  const rows = await db
    .select({ title: knowledgeChunks.title, content: knowledgeChunks.content, source: knowledgeChunks.source })
    .from(knowledgeChunks)
    .orderBy(cosineDistance(knowledgeChunks.embedding, embedding))
    .limit(MAX_RESULTS);

  return { results: rows, count: rows.length };
}

/**
 * Layer B (RAG) — docs Section 5.1's second retrieval layer, alongside
 * Layer A's live-SQL tools (the other 4 files in this directory). Not
 * tenant-scoped — `knowledge.chunks` holds shared reference content, not
 * business data, so this is the one tool with no `tenantId` filter at all
 * (see that table's migration comment for why no RLS applies here). Still
 * called through the same `TOOLS[name].handler(tenantId, rawInput)`
 * registry shape as every other tool for consistency, even though this
 * handler ignores the tenantId argument.
 *
 * Real embedding call (Voyage AI) — NOT exercised by `MOCK_LLM_RESPONSES`
 * mode, which uses a separate keyword-based fallback
 * (`searchKnowledgeBaseByKeyword` below) instead, so the demo stays
 * runnable without a real `VOYAGE_API_KEY`. Same "mock the 3rd party, keep
 * everything inside our own system real" line as every other mocked path
 * in this codebase — the difference here is the mock uses a genuinely
 * different (keyword, not semantic) retrieval strategy, not a fake stand-in
 * for the same one.
 */
export async function searchKnowledgeBase(input: SearchKnowledgeBaseInput): Promise<SearchKnowledgeBaseResult> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw ApplicationFailure.nonRetryable('VOYAGE_API_KEY is not set.', 'ConfigError');
  }
  const baseUrl = process.env.VOYAGE_API_BASE_URL ?? 'https://api.voyageai.com/v1';
  const model = process.env.VOYAGE_EMBEDDING_MODEL ?? 'voyage-3.5';

  const queryEmbedding = await embedText(input.query, { apiKey, baseUrl, model });
  return searchByEmbedding(queryEmbedding);
}

/**
 * Keyword fallback for `MOCK_LLM_RESPONSES` mode ONLY — no embedding call.
 * A genuinely different, real retrieval strategy (not a fake stand-in for
 * the semantic one above), same as every other mocked tool call in this
 * codebase hitting real Postgres data.
 *
 * Word-level matching (any query word appearing in title/content), not a
 * whole-phrase `ILIKE '%entire question%'` — a full natural-language
 * question almost never appears verbatim in the reference content, so
 * phrase matching would silently return nothing for every realistic query.
 * Diacritics-stripped on both sides for the same reason
 * `run-agent-turn.activity.ts`'s mock branches strip them: Vietnamese is
 * very often typed without accents. Table is demo-scale (a handful of
 * sample documents), so fetching all rows and matching in JS is simpler
 * and just as correct as pushing word-matching into SQL.
 */
export async function searchKnowledgeBaseByKeyword(input: SearchKnowledgeBaseInput): Promise<SearchKnowledgeBaseResult> {
  const queryWords = stripDiacritics(input.query)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);

  const rows = await db.select({ title: knowledgeChunks.title, content: knowledgeChunks.content, source: knowledgeChunks.source }).from(knowledgeChunks);

  const scored = rows
    .map((row) => {
      const haystack = stripDiacritics(`${row.title} ${row.content}`).toLowerCase();
      const matchCount = queryWords.filter((w) => haystack.includes(w)).length;
      return { row, matchCount };
    })
    .filter((r) => r.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount || a.row.title.localeCompare(b.row.title))
    .slice(0, MAX_RESULTS)
    .map((r) => r.row);

  return { results: scored, count: scored.length };
}
