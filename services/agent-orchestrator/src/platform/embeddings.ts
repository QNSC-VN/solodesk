/**
 * Voyage AI's embed API — Anthropic's own recommended embeddings partner
 * (Anthropic has no embeddings endpoint of its own). Used by
 * `search-knowledge-base.tool.ts` (query embedding, real path only — the
 * mocked LLM path never calls this, see that tool's own comment) and
 * `scripts/ingest-knowledge.ts` (document embedding at ingestion time).
 * Plain fetch, no resilience wrapper — this service has no per-provider
 * circuit-breaker/bulkhead module (that's connector-hub's concern, one
 * inbound-facing service calling many outbound providers); a single
 * embedding call failing surfaces as a real, visible tool error, same as
 * this file's sibling tools' Postgres errors.
 */

export interface EmbedOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface VoyageEmbedResponse {
  data: Array<{ embedding: number[] }>;
}

export async function embedText(text: string, opts: EmbedOptions): Promise<number[]> {
  const res = await fetch(`${opts.baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: [text], model: opts.model }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage embeddings API returned ${res.status}: ${body}`);
  }

  const parsed = (await res.json()) as VoyageEmbedResponse;
  const embedding = parsed.data[0]?.embedding;
  if (!embedding) {
    throw new Error('Voyage embeddings API returned no embedding data.');
  }
  return embedding;
}
