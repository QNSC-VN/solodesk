import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/order.dart';
import '../state/providers.dart';
import '../widgets/status_badge.dart';
import '../widgets/empty_state.dart';
import '../theme/app_theme.dart';

class OrdersTab extends ConsumerStatefulWidget {
  const OrdersTab({super.key});

  @override
  ConsumerState<OrdersTab> createState() => _OrdersTabState();
}

class _OrdersTabState extends ConsumerState<OrdersTab> {
  late Future<List<Order>> _future;

  @override
  void initState() {
    super.initState();
    _future = ref.read(ordersServiceProvider).getOrders();
  }

  Future<void> _refresh() async {
    final future = ref.read(ordersServiceProvider).getOrders();
    setState(() => _future = future);
    await future;
  }

  String _formatVnd(String amount) => '${double.tryParse(amount)?.toStringAsFixed(0) ?? amount} đ';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final created = await context.push<bool>('/home/orders/new');
          if (created == true) _refresh();
        },
        icon: const Icon(Icons.add),
        label: const Text('Tạo đơn hàng'),
        backgroundColor: AppColors.accent,
        foregroundColor: AppColors.onAccent,
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<Order>>(
          future: _future,
          builder: (context, snapshot) {
            if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
            final orders = snapshot.data!;
            if (orders.isEmpty) {
              return const SingleChildScrollView(
                physics: AlwaysScrollableScrollPhysics(),
                child: EmptyState(title: 'Chưa có đơn hàng', body: 'Đơn hàng của bạn sẽ hiển thị ở đây khi có đơn mới.'),
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 88), // clears the FAB
              itemCount: orders.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final order = orders[index];
                return Card(
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => context.push('/home/orders/${order.id}'),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(order.customerName ?? 'Khách lẻ', style: Theme.of(context).textTheme.titleLarge),
                                const SizedBox(height: 4),
                                Text('${order.createdAt.toLocal()}'.split('.').first, style: Theme.of(context).textTheme.bodyMedium),
                                const SizedBox(height: 8),
                                StatusBadge(status: order.status),
                              ],
                            ),
                          ),
                          Text(_formatVnd(order.totalAmount), style: Theme.of(context).textTheme.headlineSmall),
                        ],
                      ),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
