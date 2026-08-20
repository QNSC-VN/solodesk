import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

enum _Variant { success, pending, neutral, error }

/// `StatusPill`'s Flutter twin — same status-to-color mapping table as
/// `apps/web-accounting/components/StatusPill.tsx`, ported not reinvented.
class StatusBadge extends StatelessWidget {
  final String status;
  final String? label;

  const StatusBadge({super.key, required this.status, this.label});

  static const _variants = <String, _Variant>{
    'confirmed': _Variant.success,
    'pending': _Variant.pending,
    'cancelled': _Variant.error,
    'returned': _Variant.neutral,
    'issued': _Variant.success,
    'completed': _Variant.success,
    // Booking statuses — color map only; the label default stays English
    // (orders screens rely on it), booking screens always pass a Vietnamese
    // `label:` from `bookingStatusLabel`.
    'held': _Variant.pending,
    'no_show': _Variant.error,
  };

  static String _labelFor(String status) => status.split('_').map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');

  Color _bg(_Variant v) => switch (v) {
        _Variant.success => AppColors.secondary.withValues(alpha: 0.18),
        _Variant.pending => AppColors.accent.withValues(alpha: 0.18),
        _Variant.neutral => AppColors.muted,
        _Variant.error => AppColors.destructive.withValues(alpha: 0.12),
      };

  Color _fg(_Variant v) => switch (v) {
        _Variant.success => const Color(0xFF166534),
        _Variant.pending => const Color(0xFF854D0E),
        _Variant.neutral => AppColors.mutedForeground,
        _Variant.error => AppColors.destructive,
      };

  @override
  Widget build(BuildContext context) {
    final variant = _variants[status] ?? _Variant.neutral;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: _bg(variant), borderRadius: BorderRadius.circular(999)),
      child: Text(
        label ?? _labelFor(status),
        style: TextStyle(color: _fg(variant), fontSize: 13, fontWeight: FontWeight.w600),
      ),
    );
  }
}
