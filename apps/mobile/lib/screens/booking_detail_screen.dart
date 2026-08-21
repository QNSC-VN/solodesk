import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/booking.dart';
import '../models/resource.dart';
import '../state/providers.dart';
import '../services/api_error_message.dart';
import '../widgets/app_button.dart';
import '../widgets/status_badge.dart';
import '../utils/format.dart';
import '../widgets/empty_state.dart';

/// Pushed from `BookingsScreen` (`context.push('/home/bookings/$id')`).
/// The three state actions mirror the backend's own guards exactly —
/// Confirm (held), Cancel (held|confirmed), No-show (confirmed) — each
/// behind a confirm dialog because all three are one-way transitions.
/// A confirm attempt on an EXPIRED hold is left enabled on purpose: the
/// backend's `HOLD_NOT_CONFIRMABLE` 409 is the honest answer, surfaced as
/// a Vietnamese message, rather than the client guessing expiry state.
class BookingDetailScreen extends ConsumerStatefulWidget {
  final String bookingId;
  const BookingDetailScreen({super.key, required this.bookingId});

  @override
  ConsumerState<BookingDetailScreen> createState() => _BookingDetailScreenState();
}

class _BookingDetailScreenState extends ConsumerState<BookingDetailScreen> {
  late Future<_BookingDetailData> _future;
  bool _isActing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_BookingDetailData> _load() async {
    final service = ref.read(bookingsServiceProvider);
    final results = await Future.wait([service.getBooking(widget.bookingId), service.getResources()]);
    return _BookingDetailData(booking: results[0] as Booking, resources: results[1] as List<Resource>);
  }

  Future<void> _refresh() async {
    final future = _load();
    setState(() => _future = future);
    await future;
  }

  Future<void> _act(Future<Booking> Function() action, String successMessage) async {
    setState(() {
      _isActing = true;
      _error = null;
    });
    try {
      await action();
      await _refresh();
      if (mounted) {
        setState(() => _isActing = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMessage)));
      }
    } catch (e) {
      setState(() {
        _isActing = false;
        _error = switch (apiErrorCode(e)) {
          'HOLD_NOT_CONFIRMABLE' => 'Hết hạn giữ chỗ hoặc đặt chỗ đã được xử lý.',
          'BOOKING_NOT_CANCELLABLE' => 'Đặt chỗ này không thể hủy.',
          'BOOKING_NOT_CONFIRMED' => 'Chỉ đặt chỗ đã xác nhận mới có thể đánh dấu không đến.',
          _ => apiErrorMessage(e, 'Không thể cập nhật. Kiểm tra kết nối mạng.'),
        };
      });
    }
  }

  Future<void> _confirmDialog(String title, String message, Future<void> Function() onYes) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Không')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Đồng ý')),
        ],
      ),
    );
    if (yes == true) await onYes();
  }

  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Chi tiết đặt chỗ')),
      body: FutureBuilder<_BookingDetailData>(
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
          final booking = snapshot.data!.booking;
          final resourceName = snapshot.data!.resourceName(booking.resourceId);

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(child: Text(booking.customerName, style: Theme.of(context).textTheme.titleLarge)),
                      StatusBadge(status: booking.status, label: bookingStatusLabel(booking)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text('Thời gian', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Bắt đầu: ${formatDateTime(booking.startsAt)}', style: Theme.of(context).textTheme.bodyLarge),
                      const SizedBox(height: 4),
                      Text('Kết thúc: ${formatDateTime(booking.endsAt)}', style: Theme.of(context).textTheme.bodyLarge),
                      if (booking.status == 'held' && booking.holdExpiresAt != null) ...[
                        const SizedBox(height: 4),
                        Text('Hết hạn giữ: ${formatDateTime(booking.holdExpiresAt!)}', style: Theme.of(context).textTheme.bodyMedium),
                        if (booking.isExpiredHold)
                          Text('Đã hết hạn giữ chỗ — không còn chiếc chỗ.', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.error)),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text('Chi tiết', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Tài nguyên: $resourceName', style: Theme.of(context).textTheme.bodyLarge),
                      const SizedBox(height: 4),
                      Text('Số khách: ${booking.partySize}', style: Theme.of(context).textTheme.bodyLarge),
                      const SizedBox(height: 4),
                      Text('Mã đặt chỗ: ${booking.id}', style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 16),
              if (booking.status == 'held')
                AppButton(
                  label: 'Xác nhận đặt chỗ',
                  isLoading: _isActing,
                  onPressed: () => _act(() => ref.read(bookingsServiceProvider).confirmBooking(booking.id), 'Đã xác nhận đặt chỗ.'),
                ),
              if (booking.status == 'held' || booking.status == 'confirmed') ...[
                const SizedBox(height: 12),
                AppButton(
                  label: 'Hủy đặt chỗ',
                  variant: AppButtonVariant.secondary,
                  isLoading: _isActing,
                  onPressed: () => _confirmDialog(
                    'Hủy đặt chỗ này?',
                    '${booking.customerName} · ${formatDateTime(booking.startsAt)}',
                    () => _act(() => ref.read(bookingsServiceProvider).cancelBooking(booking.id), 'Đã hủy đặt chỗ.'),
                  ),
                ),
              ],
              if (booking.status == 'confirmed') ...[
                const SizedBox(height: 12),
                AppButton(
                  label: 'Đánh dấu không đến',
                  variant: AppButtonVariant.secondary,
                  isLoading: _isActing,
                  onPressed: () => _confirmDialog(
                    'Đánh dấu khách không đến?',
                    '${booking.customerName} · ${formatDateTime(booking.startsAt)}',
                    () => _act(() => ref.read(bookingsServiceProvider).markNoShow(booking.id), 'Đã đánh dấu không đến.'),
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

class _BookingDetailData {
  final Booking booking;
  final List<Resource> resources;
  _BookingDetailData({required this.booking, required this.resources});

  String resourceName(String resourceId) {
    for (final r in resources) {
      if (r.id == resourceId) return r.name;
    }
    return resourceId.substring(0, 8);
  }
}
