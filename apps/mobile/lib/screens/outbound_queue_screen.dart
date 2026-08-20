import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/order.dart';
import '../state/providers.dart';
import '../widgets/app_button.dart';
import '../widgets/status_badge.dart';
import '../widgets/empty_state.dart';
import '../theme/app_theme.dart';

/// "Hàng đợi gửi đi" — one of the CEO mockup's explicitly-missing screens,
/// and in this app it IS just `LocalOrders` filtered to `syncStatus !=
/// synced` (no separate generic outbox model — see the offline-first
/// plan's YAGNI note). Reached from Home's quick action once there's
/// something to show.
class OutboundQueueScreen extends ConsumerStatefulWidget {
  const OutboundQueueScreen({super.key});

  @override
  ConsumerState<OutboundQueueScreen> createState() => _OutboundQueueScreenState();
}

class _OutboundQueueScreenState extends ConsumerState<OutboundQueueScreen> {
  late Future<List<Order>> _future;
  bool _isSyncing = false;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Order>> _load() async {
    final orders = await ref.read(ordersServiceProvider).getOrders();
    return orders.where((o) => o.syncStatus != null).toList();
  }

  Future<void> _syncNow() async {
    setState(() => _isSyncing = true);
    try {
      await ref.read(orderSyncWorkerProvider).drainPending();
    } finally {
      if (mounted) {
        setState(() {
          _isSyncing = false;
          _future = _load();
        });
      }
    }
  }

  String _formatVnd(String amount) => '${double.tryParse(amount)?.toStringAsFixed(0) ?? amount} đ';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Hàng đợi gửi đi')),
      body: FutureBuilder<List<Order>>(
        future: _future,
        builder: (context, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final orders = snapshot.data!;
          if (orders.isEmpty) {
            return const SingleChildScrollView(
              physics: AlwaysScrollableScrollPhysics(),
              child: EmptyState(title: 'Không có đơn chờ đồng bộ', body: 'Mọi đơn hàng đã được gửi lên máy chủ thành công.'),
            );
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              AppButton(label: 'Đồng bộ ngay', onPressed: _syncNow, isLoading: _isSyncing),
              const SizedBox(height: 16),
              for (final order in orders)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(order.customerName ?? 'Khách lẻ', style: Theme.of(context).textTheme.titleLarge),
                            order.syncStatus == 'failed'
                                ? const StatusBadge(status: 'cancelled', label: 'Lỗi')
                                : const StatusBadge(status: 'pending', label: 'Đang chờ'),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text('${order.lines.length} sản phẩm · ${_formatVnd(order.totalAmount)}', style: Theme.of(context).textTheme.bodyMedium),
                        if (order.syncError != null) ...[
                          const SizedBox(height: 8),
                          Text(order.syncError!, style: TextStyle(color: AppColors.destructive)),
                        ],
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
