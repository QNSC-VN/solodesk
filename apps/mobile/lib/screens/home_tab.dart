import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../state/providers.dart';
import '../widgets/home_summary_card.dart';
import '../theme/app_theme.dart';

/// Today's real numbers only — NOT the full orders/invoices/stock
/// DataTable parity `web-accounting` has (that's the accountant/staff
/// persona's tool). One real number per card, large type
/// (`design-system/solodesk/pages/mobile.md`'s Mode 2 spec).
class HomeTab extends ConsumerStatefulWidget {
  const HomeTab({super.key});

  @override
  ConsumerState<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends ConsumerState<HomeTab> {
  late Future<_HomeSummary> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_HomeSummary> _load() async {
    final orders = await ref.read(ordersServiceProvider).getOrders();
    final stock = await ref.read(stockServiceProvider).getStockSummary();
    final unreadCount = await ref.read(notificationsServiceProvider).getUnreadCount();

    final now = DateTime.now();
    final todaysOrders = orders.where((o) => o.status != 'cancelled' && _isSameDay(o.createdAt.toLocal(), now));
    final todaysRevenue = todaysOrders.fold<double>(0, (sum, o) => sum + (double.tryParse(o.totalAmount) ?? 0));

    // A real but simple threshold — documented as such, not tuned per-SKU
    // yet (a real per-SKU reorder point is a separate, later feature).
    const lowStockThreshold = 5;
    final lowStockCount = stock.where((s) => s.isActive && (double.tryParse(s.totalAvailable) ?? 0) <= lowStockThreshold).length;

    return _HomeSummary(todaysRevenue: todaysRevenue, lowStockCount: lowStockCount, unreadCount: unreadCount);
  }

  bool _isSameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

  Future<void> _refresh() async {
    final future = _load();
    setState(() => _future = future);
    await future;
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<_HomeSummary>(
        future: _future,
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final summary = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              HomeSummaryCard(
                label: 'Doanh thu hôm nay',
                value: '${summary.todaysRevenue.toStringAsFixed(0)} đ',
                icon: Icons.payments_outlined,
                accentColor: AppColors.primary,
              ),
              const SizedBox(height: 12),
              HomeSummaryCard(
                label: 'Sản phẩm sắp hết hàng',
                value: '${summary.lowStockCount}',
                icon: Icons.inventory_2_outlined,
                accentColor: AppColors.accent,
              ),
              const SizedBox(height: 12),
              HomeSummaryCard(
                label: 'Thông báo chưa đọc',
                value: '${summary.unreadCount}',
                icon: Icons.notifications_outlined,
                accentColor: AppColors.secondary,
              ),
            ],
          );
        },
      ),
    );
  }
}

class _HomeSummary {
  final double todaysRevenue;
  final int lowStockCount;
  final int unreadCount;
  _HomeSummary({required this.todaysRevenue, required this.lowStockCount, required this.unreadCount});
}
