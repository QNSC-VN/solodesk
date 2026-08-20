import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/customer.dart';
import '../state/providers.dart';
import '../widgets/status_badge.dart';
import '../widgets/empty_state.dart';

/// Pushed from `CustomersScreen` (`/home/customers/:name`) — real order +
/// booking history for an exact customer-name match, same
/// OrderDetailScreen/BookingDetailScreen card convention.
class CustomerDetailScreen extends ConsumerStatefulWidget {
  final String name;
  const CustomerDetailScreen({super.key, required this.name});

  @override
  ConsumerState<CustomerDetailScreen> createState() => _CustomerDetailScreenState();
}

class _CustomerDetailScreenState extends ConsumerState<CustomerDetailScreen> {
  late Future<CustomerDetail> _future;

  @override
  void initState() {
    super.initState();
    _future = ref.read(customersServiceProvider).getCustomerDetail(widget.name);
  }

  String _formatVnd(String amount) => '${double.tryParse(amount)?.toStringAsFixed(0) ?? amount} đ';

  String _formatDate(DateTime d) {
    final local = d.toLocal();
    return '${local.day}/${local.month}/${local.year}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.name)),
      body: FutureBuilder<CustomerDetail>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return const Center(child: Text('Không thể tải thông tin khách hàng.'));
          }
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final customer = snapshot.data!;

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Tổng chi tiêu: ${_formatVnd(customer.totalSpent)}', style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 8),
                      Text('${customer.orderCount} đơn hàng · ${customer.bookingCount} lượt đặt chỗ', style: Theme.of(context).textTheme.bodyMedium),
                      if (customer.primaryChannel != null) ...[
                        const SizedBox(height: 4),
                        Text('Kênh chính: ${customer.primaryChannel}', style: Theme.of(context).textTheme.bodyMedium),
                      ],
                      if (customer.firstOrderAt != null && customer.lastOrderAt != null) ...[
                        const SizedBox(height: 4),
                        Text('Mua lần đầu: ${_formatDate(customer.firstOrderAt!)} · Gần nhất: ${_formatDate(customer.lastOrderAt!)}', style: Theme.of(context).textTheme.bodyMedium),
                      ],
                    ],
                  ),
                ),
              ),
              if (customer.orders.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text('Đơn hàng', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                for (final order in customer.orders)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      title: Text(_formatVnd(order.totalAmount)),
                      subtitle: Text('${_formatDate(order.createdAt)} · ${order.channel}'),
                      trailing: StatusBadge(status: order.status),
                    ),
                  ),
              ],
              if (customer.bookings.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text('Đặt chỗ', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                for (final booking in customer.bookings)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      title: Text('${_formatDate(booking.startsAt)} · SL ${booking.partySize} khách'),
                      trailing: StatusBadge(status: booking.status),
                    ),
                  ),
              ],
              if (customer.orders.isEmpty && customer.bookings.isEmpty) ...[
                const SizedBox(height: 20),
                const EmptyState(title: 'Chưa có lịch sử', body: 'Chưa có đơn hàng hoặc đặt chỗ nào cho khách này.'),
              ],
            ],
          );
        },
      ),
    );
  }
}
