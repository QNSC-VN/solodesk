/**
 * Exact fixed-point decimal arithmetic — same module as backend-api's
 * `src/platform/money.ts` (copied, not shared via an internal package,
 * same YAGNI convention as this service's own tenant-db.ts header
 * comment). `Number(a) - Number(b)` at the app layer converts an exact
 * Postgres `numeric` decimal string to a binary float and back; these
 * tools only ever read data, but the arithmetic guarantee matters just as
 * much for what's displayed back to a tenant as for what's stored.
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

export function subtractMoney(a: string, b: string, scale = 2): string {
  return fromBigIntScaled(toBigIntScaled(a, scale) - toBigIntScaled(b, scale), scale);
}
