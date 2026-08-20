import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/booking.dart';
import '../models/resource.dart';
import '../state/providers.dart';
import '../widgets/empty_state.dart';
import '../widgets/status_badge.dart';
import '../theme/app_theme.dart';

/// The bookings list — pushed from Home's 'Đặt chỗ' quick action. One
/// `GET /v1/bookings` call for the whole tenant (the endpoint exists
/// precisely so this screen isn't N+1 per-resource calls), joined
/// client-side against `GET /v1/resources` for names. Online-only by the
/// app's documented cut: error state with retry, never a stale cache.
///
/// Hold expiry is a display-time fact (the backend expires lazily) — an
/// expired hold gets an extra 'Hết giữ' badge, and the 'Giữ đến' line is
/// static text refreshed by pull-to-refresh, not a countdown timer.
class BookingsScreen extends ConsumerStatefulWidget {
  const BookingsScreen({super.key});

  @override
  ConsumerState<BookingsScreen> createState() => _BookingsScreenState();
}

class _BookingsScreenState extends ConsumerState<BookingsScreen> {
  late Future<_BookingsPageData> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_BookingsPageData> _load() async {
    final service = ref.read(bookingsServiceProvider);
    final results = await Future.wait([service.listBookings(), service.getResources()]);
    return _BookingsPageData(bookings: results[0] as List<Booking>, resources: results[1] as List<Resource>);
  }

  Future<void> _refresh() async {
    final future = _load();
    setState(() => _future = future);
    await future;
  }

  String _fmt(DateTime dt) {
    final local = dt.toLocal();
    return '${local.day}/${local.month}/${local.year} ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Đặt chỗ'),
        actions: [
          IconButton(
            icon: const Icon(Icons.inventory_2_outlined),
            tooltip: 'Tài nguyên',
            onPressed: () async {
              await context.push('/home/bookings/resources');
              if (!mounted) return;
              _refresh();
            },
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final created = await context.push<bool>('/home/bookings/new');
          if (!mounted) return;
          if (created == true) _refresh();
        },
        icon: const Icon(Icons.add),
        label: const Text('Tạo đặt chỗ'),
        backgroundColor: AppColors.accent,
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<_BookingsPageData>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: EmptyState(
                  title: 'Không thể tải đặt chỗ',
                  body: 'Kiểm tra kết nối mạng rồi thử lại.',
                  actionLabel: 'Thử lại',
                  onAction: _refresh,
                ),
              );
            }
            if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
            final data = snapshot.data!;
            if (data.bookings.isEmpty) {
              return SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: EmptyState(
                  title: 'Chưa có đặt chỗ',
                  body: data.resources.isEmpty
                      ? 'Đặt chỗ cần một tài nguyên (phòng, bàn, cano, tour...) trước. Thêm một tài nguyên để bắt đầu.'
                      : 'Đặt chỗ sẽ hiển thị ở đây sau khi được tạo.',
                  actionLabel: data.resources.isEmpty ? 'Thêm tài nguyên' : null,
                  onAction: data.resources.isEmpty
                      ? () async {
                          await context.push('/home/bookings/resources');
                          if (!mounted) return;
                          _refresh();
                        }
                      : null,
                ),
              );
            }

            final now = DateTime.now();
            final upcoming = data.bookings.where((b) => b.startsAt.isAfter(now)).toList()..sort((a, b) => a.startsAt.compareTo(b.startsAt));
            final past = data.bookings.where((b) => !b.startsAt.isAfter(now)).toList()..sort((a, b) => b.startsAt.compareTo(a.startsAt));

            return ListView(
              padding: const EdgeInsets.only(bottom: 88),
              children: [
                if (upcoming.isNotEmpty) ..._section(context, 'Sắp tới', upcoming, data),
                if (past.isNotEmpty) ..._section(context, 'Đã qua', past, data),
              ],
            );
          },
        ),
      ),
    );
  }

  List<Widget> _section(BuildContext context, String title, List<Booking> bookings, _BookingsPageData data) {
    return [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Text(title, style: Theme.of(context).textTheme.titleLarge),
      ),
      for (final b in bookings)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: InkWell(
              borderRadius: BorderRadius.circular(AppMetrics.cardRadius),
              onTap: () async {
                await context.push('/home/bookings/${b.id}');
                if (!mounted) return;
                _refresh();
              },
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(b.customerName, style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 2),
                          Text(
                            '${data.resourceName(b.resourceId)} · ${_fmt(b.startsAt)} · ${b.partySize} khách',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                          if (b.isActiveHold && b.holdExpiresAt != null)
                            Text(
                              'Giữ đến: ${b.holdExpiresAt!.toLocal().hour.toString().padLeft(2, '0')}:${b.holdExpiresAt!.toLocal().minute.toString().padLeft(2, '0')}',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        if (b.isExpiredHold) const StatusBadge(status: 'cancelled', label: 'Hết giữ'),
                        StatusBadge(status: b.status, label: bookingStatusLabel(b)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
    ];
  }
}

class _BookingsPageData {
  final List<Booking> bookings;
  final List<Resource> resources;
  _BookingsPageData({required this.bookings, required this.resources});

  String resourceName(String resourceId) {
    for (final r in resources) {
      if (r.id == resourceId) return r.name;
    }
    return resourceId.substring(0, 8);
  }
}
