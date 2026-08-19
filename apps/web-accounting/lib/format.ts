/** Shared by every data page (orders, invoices, stock) — same `vi-VN` formatting convention as web-buyer-portal's own `lib/format.ts`. */

export function formatVnd(amount: string): string {
  return `${Number(amount).toLocaleString("vi-VN")} đ`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN");
}
