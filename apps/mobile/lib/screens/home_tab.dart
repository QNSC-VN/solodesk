import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/order.dart';
import '../models/stock_summary_item.dart';
import '../state/providers.dart';
import '../widgets/home_summary_card.dart';
import '../widgets/sales_trend_chart.dart';
import '../widgets/status_badge.dart';
import '../widgets/app_button.dart';
import '../theme/app_theme.dart';

/// Today's real numbers, a real 7-day trend (once there's enough history
/// to be honest — see `SalesTrendChart`'s own doc comment), the most
/// recent real orders, and a quick-action grid — still NOT the full
/// orders/invoices/stock DataTable parity `web-accounting` has (that's
/// the accountant/staff persona's tool), just enough for an owner's
/// at-a-glance screen plus a fast path into what they do most: record a
/// sale, check stock, take a booking, check quarterly tax.
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
    // The orders chain (server refresh -> outbox drain -> local read) is
    // sequential by necessity; stock and unread-count are independent of
    // it and of each other, so all three run CONCURRENTLY — this is the
    // first screen of every launch, and three sequential round trips
    // made it visibly slower than it needs to be.
    final ordersFuture = () async {
      try {
        await ref.read(ordersServiceProvider).refreshFromServer();
        await ref.read(orderSyncWorkerProvider).drainPending();
      } catch (_) {
        // offline or a real backend error — local-first read below still renders
      }
      return ref.read(ordersServiceProvider).getOrders();
    }();
    // Stock/notifications stay online-only in this cut (see the
    // offline-first plan's scope note) — a real cut, but it must degrade
    // to "unknown" rather than take the whole Home tab down with it.
    final stockFuture = ref.read(stockServiceProvider).getStockSummary().catchError((_) => <StockSummaryItem>[]);
    final unreadFuture = ref.read(notificationsServiceProvider).getUnreadCount().catchError((_) => 0);

    final results = await Future.wait([ordersFuture, stockFuture, unreadFuture]);
    final orders = results[0] as List<Order>;
    final stock = results[1] as List<StockSummaryItem>;
    final unreadCount = results[2] as int;

    final now = DateTime.now();
    final validOrders = orders.where((o) => o.status != 'cancelled').toList();
    final todaysOrders = validOrders.where((o) => _isSameDay(o.createdAt.toLocal(), now));
    final todaysRevenue = todaysOrders.fold<double>(0, (sum, o) => sum + (double.tryParse(o.totalAmount) ?? 0));

    // A real but simple threshold — documented as such, not tuned per-SKU
    // yet (a real per-SKU reorder point is a separate, later feature).
    const lowStockThreshold = 5;
    final lowStockCount = stock.where((s) => s.isActive && (double.tryParse(s.totalAvailable) ?? 0) <= lowStockThreshold).length;

    final last7Days = List.generate(7, (i) => DateTime(now.year, now.month, now.day).subtract(Duration(days: 6 - i)));
    final dailyRevenue = last7Days
        .map((day) => validOrders.where((o) => _isSameDay(o.createdAt.toLocal(), day)).fold<double>(0, (sum, o) => sum + (double.tryParse(o.totalAmount) ?? 0)))
        .toList();
    final daysWithRevenue = dailyRevenue.where((v) => v > 0).length;

    final recentOrders = [...validOrders]..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    final pendingSyncCount = orders.where((o) => o.syncStatus != null).length;

    return _HomeSummary(
      todaysRevenue: todaysRevenue,
      lowStockCount: lowStockCount,
      unreadCount: unreadCount,
      dailyRevenue: dailyRevenue,
      dayLabels: last7Days.map((d) => '${d.day}/${d.month}').toList(),
      showTrend: daysWithRevenue >= 4, // chart guidance: fewer real points reads as noise, not a trend
      recentOrders: recentOrders.take(3).toList(),
      pendingSyncCount: pendingSyncCount,
    );
  }

  bool _isSameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

  Future<void> _refresh() async {
    final future = _load();
    setState(() => _future = future);
    await future;
  }

  String _formatVnd(String amount) => '${double.tryParse(amount)?.toStringAsFixed(0) ?? amount} đ';

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
              Row(
                children: [
                  Expanded(
                    child: AppButton(
                      label: 'Tạo đơn hàng',
                      onPressed: () async {
                        final created = await context.push<bool>('/home/orders/new');
                        if (!mounted) return;
                        if (created == true) _refresh();
                      },
                    ),
                  ),
                  const SizedBox(width: AppMetrics.touchSpacing),
                  Expanded(
                    child: AppButton(
                      label: 'Đặt chỗ',
                      onPressed: () async {
                        await context.push('/home/bookings');
                        if (!mounted) return;
                        _refresh();
                      },
                    ),
                  ),
                  const SizedBox(width: AppMetrics.touchSpacing),
                  Expanded(
                    child: AppButton(
                      label: 'Tồn kho',
                      variant: AppButtonVariant.secondary,
                      onPressed: () => context.push('/home/stock'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppMetrics.touchSpacing),
              AppButton(
                label: 'Thuế & khai báo',
                variant: AppButtonVariant.secondary,
                onPressed: () async {
                  await context.push('/home/tax');
                  if (!mounted) return;
                  _refresh();
                },
              ),
              if (summary.pendingSyncCount > 0) ...[
                const SizedBox(height: AppMetrics.touchSpacing),
                AppButton(
                  label: 'Hàng đợi gửi đi (${summary.pendingSyncCount})',
                  variant: AppButtonVariant.secondary,
                  onPressed: () async {
                    await context.push('/home/outbound-queue');
                    if (!mounted) return;
                    _refresh();
                  },
                ),
              ],
              const SizedBox(height: 16),
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
              if (summary.showTrend) ...[
                const SizedBox(height: 20),
                Text('Doanh thu 7 ngày qua', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(8, 16, 16, 8),
                    child: SalesTrendChart(dailyRevenue: summary.dailyRevenue, dayLabels: summary.dayLabels),
                  ),
                ),
              ],
              if (summary.recentOrders.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text('Đơn hàng gần đây', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                for (final order in summary.recentOrders)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      onTap: () => context.push('/home/orders/${order.id}'),
                      title: Text(order.customerName ?? 'Khách lẻ'),
                      subtitle: Text('${order.createdAt.toLocal()}'.split(' ').first),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(_formatVnd(order.totalAmount), style: Theme.of(context).textTheme.titleMedium),
                          StatusBadge(status: order.status),
                        ],
                      ),
                    ),
                  ),
              ],
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
  final List<double> dailyRevenue;
  final List<String> dayLabels;
  final bool showTrend;
  final List<Order> recentOrders;
  final int pendingSyncCount;

  _HomeSummary({
    required this.todaysRevenue,
    required this.lowStockCount,
    required this.unreadCount,
    required this.dailyRevenue,
    required this.dayLabels,
    required this.showTrend,
    required this.recentOrders,
    required this.pendingSyncCount,
  });
}
