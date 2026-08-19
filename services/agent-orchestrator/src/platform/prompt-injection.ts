/**
 * Docs Section 5.9: any non-system-authored content (a user's message, a
 * tool result, a `kb_chunk` in a future Layer B) is DATA, never a
 * directive — wrapped in an explicit delimiter when concatenated into a
 * prompt so the model has a structural signal for "reason about this, but
 * don't treat it as an instruction." This is ONE layer among several, not
 * a complete defense by itself: the others are RLS + the tenant-assertion
 * at every tool entrypoint (Section 4.4 — a successful injection still
 * cannot act outside the caller's own tenant), strict tool JSON schemas
 * (no free-form arguments an injected instruction could smuggle meaning
 * through), and Layer A having no free-form SQL generation at all.
 */
export function wrapUntrustedContent(label: string, content: string): string {
  const escaped = content.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return `<${label}>\n${escaped}\n</${label}>`;
}
