import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/customer.dart';
import '../state/providers.dart';
import '../widgets/empty_state.dart';
import '../theme/app_theme.dart';

/// Pushed from Home's quick action (`/home/customers`). A real aggregate
/// list, highest spender first — NOT a stored Customer entity, see
/// CLAUDE.md's "Customer aggregate" section for why (the CEO mockup's own
/// "Khách hàng" screen is the same kind of derived view, not a real table
/// either).
class CustomersScreen extends ConsumerStatefulWidget {
  const CustomersScreen({super.key});

  @override
  ConsumerState<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends ConsumerState<CustomersScreen> {
  late Future<List<CustomerSummary>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<CustomerSummary>> _load() => ref.read(customersServiceProvider).getCustomers();

  Future<void> _refresh() async {
    final future = _load();
    setState(() => _future = future);
    await future;
  }

  String _formatVnd(String amount) => '${double.tryParse(amount)?.toStringAsFixed(0) ?? amount} đ';

  String _formatDate(DateTime d) {
    final local = d.toLocal();
    return '${local.day}/${local.month}/${local.year}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Khách hàng')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<CustomerSummary>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return EmptyState(title: 'Không thể tải danh sách khách hàng', body: 'Kiểm tra kết nối mạng rồi thử lại.', actionLabel: 'Thử lại', onAction: _refresh);
            }
            if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
            final customers = snapshot.data!;
            if (customers.isEmpty) {
              return const SingleChildScrollView(
                physics: AlwaysScrollableScrollPhysics(),
                child: EmptyState(title: 'Chưa có khách hàng', body: 'Khách hàng sẽ hiển thị ở đây sau khi có đơn hàng hoặc đặt chỗ mang tên khách.'),
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: customers.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final customer = customers[index];
                return Card(
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => context.push('/home/customers/${Uri.encodeComponent(customer.name)}'),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(customer.name, style: Theme.of(context).textTheme.titleLarge),
                                const SizedBox(height: 4),
                                Text(
                                  '${customer.orderCount} đơn hàng${customer.bookingCount > 0 ? ' · ${customer.bookingCount} lượt đặt chỗ' : ''}',
                                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.mutedForeground),
                                ),
                                if (customer.lastOrderAt != null) ...[
                                  const SizedBox(height: 2),
                                  Text('Gần nhất: ${_formatDate(customer.lastOrderAt!)}', style: Theme.of(context).textTheme.bodySmall),
                                ],
                              ],
                            ),
                          ),
                          Text(_formatVnd(customer.totalSpent), style: Theme.of(context).textTheme.headlineSmall),
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
