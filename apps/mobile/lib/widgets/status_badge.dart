import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// The four semantic colors a pill can carry. Direct use (via
/// `StatusBadge.variant`) is for states that AREN'T order/booking
/// statuses — sync state, connector state, message-answered state — so
/// those screens stop funnelling fake statuses through the table below
/// just to pick a color.
enum StatusVariant { success, pending, neutral, error }

/// `StatusPill`'s Flutter twin — same status-to-color mapping table as
/// `apps/web-accounting/components/StatusPill.tsx`, ported not reinvented.
class StatusBadge extends StatelessWidget {
  final String status;
  final String? label;

  /// Direct semantic use, bypassing the status table entirely.
  final StatusVariant? variant;

  const StatusBadge({super.key, required this.status, this.label})
      : variant = null;

  const StatusBadge.variant({super.key, required this.variant, required this.label})
      : status = '';

  static const _variants = <String, StatusVariant>{
    'confirmed': StatusVariant.success,
    'pending': StatusVariant.pending,
    'cancelled': StatusVariant.error,
    'returned': StatusVariant.neutral,
    'issued': StatusVariant.success,
    'completed': StatusVariant.success,
    // Booking statuses — color map only; the label default stays English
    // (orders screens rely on it), booking screens always pass a Vietnamese
    // `label:` from `bookingStatusLabel`.
    'held': StatusVariant.pending,
    'no_show': StatusVariant.error,
  };

  static String _labelFor(String status) => status.split('_').map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');

  Color _bg(StatusVariant v) => switch (v) {
        StatusVariant.success => AppColors.secondary.withValues(alpha: 0.18),
        StatusVariant.pending => AppColors.accent.withValues(alpha: 0.18),
        StatusVariant.neutral => AppColors.muted,
        StatusVariant.error => AppColors.destructive.withValues(alpha: 0.12),
      };

  Color _fg(StatusVariant v) => switch (v) {
        StatusVariant.success => const Color(0xFF166534),
        StatusVariant.pending => const Color(0xFF854D0E),
        StatusVariant.neutral => AppColors.mutedForeground,
        StatusVariant.error => AppColors.destructive,
      };

  @override
  Widget build(BuildContext context) {
    final v = variant ?? _variants[status] ?? StatusVariant.neutral;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: _bg(v), borderRadius: BorderRadius.circular(999)),
      child: Text(
        label ?? _labelFor(status),
        style: TextStyle(color: _fg(v), fontSize: 13, fontWeight: FontWeight.w600),
      ),
    );
  }
}
