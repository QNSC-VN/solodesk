// ONE home for the app's display formatters — eight screens carried a
// private `_formatVnd` and nine a private date formatter (one of them
// missing `.toLocal()`, rendering a tax deadline on the wrong day).
// Vietnamese conventions, no `intl` dependency (the app's own rule).

/// `'50000 đ'` — plain number + đ, thousands separator when it exists.
String formatVnd(String amount) {
  final value = double.tryParse(amount)?.toStringAsFixed(0) ?? amount;
  final grouped = value.replaceAllMapped(
    RegExp(r'^(\d{1,3})(?=(\d{3})+(?!\d))'),
    (m) => '${m[1]}.',
  );
  return '$grouped đ';
}

/// `'21/8/2026'` — the VN-local calendar date of an instant.
String formatDate(DateTime dt) {
  final local = dt.toLocal();
  return '${local.day}/${local.month}/${local.year}';
}

/// `'21/8/2026 14:05'` — the VN-local wall clock of an instant.
String formatDateTime(DateTime dt) {
  final local = dt.toLocal();
  return '${local.day}/${local.month}/${local.year} ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}

/// `'14:05'` — time only.
String formatTime(DateTime dt) {
  final local = dt.toLocal();
  return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}
