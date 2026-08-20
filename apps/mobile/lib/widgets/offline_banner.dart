import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../local/connectivity_service.dart';
import '../theme/app_theme.dart';

/// Persistent, non-dismissible banner shown app-wide while offline — no
/// separate "dismiss" affordance, since the underlying state (no network)
/// hasn't changed just because the user closed it. Absent entirely once
/// online, including on first paint before the real connectivity check
/// resolves (never a false "offline" flash from the still-loading state).
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isOnline = ref.watch(connectivityProvider).valueOrNull ?? true;
    if (isOnline) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      color: AppColors.accent,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          const Icon(Icons.cloud_off_outlined, color: AppColors.onAccent, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Đang ngoại tuyến — đơn hàng mới sẽ đồng bộ khi có mạng.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.onAccent, fontSize: 14),
            ),
          ),
        ],
      ),
    );
  }
}
