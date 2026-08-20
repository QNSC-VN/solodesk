import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/order.dart';
import '../state/providers.dart';
import '../widgets/status_badge.dart';
import '../theme/app_theme.dart';

/// Pushed from `OrdersTab` (`context.push('/home/orders/$id')`) — a real
/// detail view, not just a list row; shows every order line (SKU/qty/
/// unit price/line total), not just the aggregate total the list shows.
class OrderDetailScreen extends ConsumerStatefulWidget {
  final String orderId;
  const OrderDetailScreen({super.key, required this.orderId});

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  late Future<Order> _future;

  @override
  void initState() {
    super.initState();
    _future = ref.read(ordersServiceProvider).getOrder(widget.orderId);
  }

  String _formatVnd(String amount) => '${double.tryParse(amount)?.toStringAsFixed(0) ?? amount} đ';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Chi tiết đơn hàng')),
      body: FutureBuilder<Order>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return const Center(child: Text('Không thể tải đơn hàng.'));
          }
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final order = snapshot.data!;

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(order.customerName ?? 'Khách lẻ', style: Theme.of(context).textTheme.titleLarge),
                          StatusBadge(status: order.status),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text('${order.createdAt.toLocal()}'.split('.').first, style: Theme.of(context).textTheme.bodyMedium),
                      const SizedBox(height: 6),
                      Text('Kênh: ${order.channel}', style: Theme.of(context).textTheme.bodyMedium),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text('Sản phẩm', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              for (final line in order.lines)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('SL: ${line.quantity} × ${_formatVnd(line.unitPrice)}', style: Theme.of(context).textTheme.bodyMedium),
                            ],
                          ),
                        ),
                        Text(_formatVnd(line.lineTotal), style: Theme.of(context).textTheme.titleMedium),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 8),
              Card(
                color: AppColors.muted,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Tổng cộng', style: Theme.of(context).textTheme.titleLarge),
                      Text(_formatVnd(order.totalAmount), style: Theme.of(context).textTheme.headlineSmall),
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
