/**
 * Exact fixed-point decimal arithmetic for money math. Every Postgres
 * `numeric` column this codebase stores money/quantity in is exact-decimal
 * for a reason — `Number(a) * Number(b)` at the app layer (the pattern this
 * replaces, duplicated across order/purchase-note/payment/tax-calculation
 * services) converts that exact decimal string to a binary float and back,
 * throwing the guarantee away. Every function here operates on the decimal
 * string directly via BigInt — never a JS `number` — and returns a decimal
 * string in the same shape Postgres expects back.
 */

function toBigIntScaled(value: string, scale: number): bigint {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole, frac = ''] = unsigned.split('.');
  if (frac.length > scale) {
    throw new Error(`toBigIntScaled: "${value}" has more than ${scale} decimal digits`);
  }
  const digits = BigInt((whole || '0') + frac.padEnd(scale, '0'));
  return negative ? -digits : digits;
}

function fromBigIntScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const digits = abs.toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale) || '0';
  const frac = scale > 0 ? digits.slice(digits.length - scale) : '';
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** Round-half-up from `fromScale` decimal digits down to `toScale` (a no-op widen if `toScale >= fromScale`). */
function rescale(value: bigint, fromScale: number, toScale: number): bigint {
  if (toScale >= fromScale) return value * 10n ** BigInt(toScale - fromScale);
  const divisor = 10n ** BigInt(fromScale - toScale);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const rounded = (abs + divisor / 2n) / divisor;
  return negative ? -rounded : rounded;
}

/** `a * b`, each parsed at its own natural decimal scale, rounded to `resultScale` (default 2 — every money column in this schema). E.g. unitPrice (scale 2) × quantity (scale 3) → lineTotal (scale 2). */
export function multiplyMoney(a: string, b: string, resultScale = 2): string {
  const aScale = (a.split('.')[1] ?? '').length;
  const bScale = (b.split('.')[1] ?? '').length;
  const product = toBigIntScaled(a, aScale) * toBigIntScaled(b, bScale);
  return fromBigIntScaled(rescale(product, aScale + bScale, resultScale), resultScale);
}

export function addMoney(a: string, b: string, scale = 2): string {
  return fromBigIntScaled(toBigIntScaled(a, scale) + toBigIntScaled(b, scale), scale);
}

export function subtractMoney(a: string, b: string, scale = 2): string {
  return fromBigIntScaled(toBigIntScaled(a, scale) - toBigIntScaled(b, scale), scale);
}

export function sumMoney(amounts: string[], scale = 2): string {
  return fromBigIntScaled(
    amounts.reduce((sum, a) => sum + toBigIntScaled(a, scale), 0n),
    scale,
  );
}

/** `a <=> b`, exact — negative if a<b, 0 if equal, positive if a>b. Use instead of `Number(a) > Number(b)` for any money comparison (overpayment checks, isFullyPaid, etc). */
export function compareMoney(a: string, b: string, scale = 2): number {
  const diff = toBigIntScaled(a, scale) - toBigIntScaled(b, scale);
  return diff > 0n ? 1 : diff < 0n ? -1 : 0;
}
