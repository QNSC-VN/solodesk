/**
 * Vietnamese is very often typed WITHOUT diacritics in practice (phone
 * keyboards, quick typing) — found by actually running the demo script
 * with plain-ASCII Vietnamese questions ("Con ton kho..."), which keyword
 * matching against accented-only patterns silently failed to recognize.
 * NFD-normalizing and stripping combining marks handles every accented
 * vowel generically; `đ`/`Đ` don't decompose that way (they're distinct
 * letters, not a base+diacritic pair) so they're folded by hand. Shared
 * between `run-agent-turn.activity.ts`'s mock keyword branches and
 * `search-knowledge-base.tool.ts`'s keyword fallback.
 */
export function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}
