import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/stock_summary_item.dart';
import '../state/providers.dart';
import '../widgets/empty_state.dart';
import '../theme/app_theme.dart';

/// Pushed from the Home tab's "Xem tồn kho" quick action — a real stock
/// list (`GET /v1/lots/stock-summary`, the same source `HomeTab`'s
/// low-stock count already uses), matching `web-accounting`'s stock page
/// data but read-only here — this app's persona is the owner glancing at
/// levels, not the accountant managing them.
class StockScreen extends ConsumerStatefulWidget {
  const StockScreen({super.key});

  @override
  ConsumerState<StockScreen> createState() => _StockScreenState();
}

class _StockScreenState extends ConsumerState<StockScreen> {
  late Future<List<StockSummaryItem>> _future;

  static const _lowStockThreshold = 5;

  @override
  void initState() {
    super.initState();
    _future = ref.read(stockServiceProvider).getStockSummary();
  }

  Future<void> _refresh() async {
    final future = ref.read(stockServiceProvider).getStockSummary();
    setState(() => _future = future);
    await future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tồn kho')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<StockSummaryItem>>(
          future: _future,
          builder: (context, snapshot) {
            if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
            final items = snapshot.data!;
            if (items.isEmpty) {
              return const SingleChildScrollView(
                physics: AlwaysScrollableScrollPhysics(),
                child: EmptyState(title: 'Chưa có sản phẩm', body: 'Sản phẩm sẽ hiển thị ở đây sau khi được thêm.'),
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final item = items[index];
                final available = double.tryParse(item.totalAvailable) ?? 0;
                final isLow = item.isActive && available <= _lowStockThreshold;
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(item.name, style: Theme.of(context).textTheme.titleLarge),
                              const SizedBox(height: 2),
                              Text('${item.skuCode} · ${item.unitPrice} đ/${item.unit}', style: Theme.of(context).textTheme.bodyMedium),
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              item.totalAvailable,
                              style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: isLow ? AppColors.destructive : AppColors.foreground),
                            ),
                            Text(item.unit, style: Theme.of(context).textTheme.bodyMedium),
                          ],
                        ),
                      ],
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
