import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/resource.dart';
import '../state/providers.dart';
import '../services/api_error_message.dart';
import '../widgets/app_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/empty_state.dart';
import '../theme/app_theme.dart';

/// Pushed from `BookingsScreen`'s FAB. Places a HOLD (`POST /v1/bookings`)
/// — online-only by this app's documented cut (offline-first is
/// orders-only); a network failure shows an inline error, never a fake
/// success.
///
/// Time entry is deliberately not a keyboard fight for this audience:
/// a date row (tap -> Vietnamese `showDatePicker`), hour/minute dropdowns,
/// and duration chips (30 phút / 1 giờ / 2 giờ / 4 giờ / Cả ngày) — one
/// tap each, no typing beyond the guest's name.
///
/// Timezone rule: the picked wall-clock time is built as a UTC instant
/// (`DateTime.utc(...)`) so `toIso8601String()` emits an unambiguous `Z`
/// suffix — calling `toIso8601String()` on a local `DateTime` emits no
/// offset and the backend would parse it in the SERVER's timezone. Every
/// display path goes through `.toLocal()` to reproduce the wall clock.
class BookingCreateScreen extends ConsumerStatefulWidget {
  const BookingCreateScreen({super.key});

  @override
  ConsumerState<BookingCreateScreen> createState() => _BookingCreateScreenState();
}

class _BookingCreateScreenState extends ConsumerState<BookingCreateScreen> {
  static const _durations = <int, String>{
    30: '30 phút',
    60: '1 giờ',
    120: '2 giờ',
    240: '4 giờ',
    1440: 'Cả ngày',
  };

  late Future<List<Resource>> _resourcesFuture;
  Resource? _selectedResource;
  DateTime _date = DateTime.now();
  int _hour = 0;
  int _minute = 0;
  int _durationMinutes = 60;
  final _customerName = TextEditingController();
  final _partySize = TextEditingController(text: '1');
  bool _isSubmitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    // Default: the next full hour from now — a booking "right now" is the
    // common case at the counter.
    _hour = (now.hour + 1) % 24;
    _resourcesFuture = ref.read(bookingsServiceProvider).getResources();
  }

  @override
  void dispose() {
    _customerName.dispose();
    _partySize.dispose();
    super.dispose();
  }

  DateTime get _startUtc => DateTime.utc(_date.year, _date.month, _date.day, _hour, _minute);

  DateTime get _endUtc => _startUtc.add(Duration(minutes: _durationMinutes));

  /// Memoized — a FutureBuilder handed a fresh future on every build
  /// refires the request on every `setState`; recompute only when an input
  /// the calculation depends on actually changes.
  Future<int>? _capacityFuture;

  void _recomputeCapacity() {
    final resource = _selectedResource;
    if (resource == null) {
      _capacityFuture = null;
      return;
    }
    _capacityFuture = () async {
      final bookings = await ref.read(bookingsServiceProvider).listBookingsByResource(resource.id);
      final now = DateTime.now();
      final used = bookings
          .where((b) => b.countsTowardCapacity(now) && b.startsAt.isBefore(_endUtc) && b.endsAt.isAfter(_startUtc))
          .fold<int>(0, (sum, b) => sum + b.partySize);
      return resource.capacity - used;
    }();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() {
        _date = picked;
        _recomputeCapacity();
      });
    }
  }

  Future<void> _submit() async {
    final resource = _selectedResource;
    final name = _customerName.text.trim();
    final partySize = int.tryParse(_partySize.text.trim()) ?? 0;
    if (resource == null) {
      setState(() => _error = 'Vui lòng chọn tài nguyên.');
      return;
    }
    if (name.isEmpty) {
      setState(() => _error = 'Vui lòng nhập tên khách.');
      return;
    }
    if (partySize < 1) {
      setState(() => _error = 'Vui lòng nhập số khách hợp lệ (từ 1 trở lên).');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _error = null;
    });
    try {
      await ref.read(bookingsServiceProvider).requestHold(
        resourceId: resource.id,
        customerName: name,
        startsAt: _startUtc,
        endsAt: _endUtc,
        partySize: partySize,
      );
      if (mounted) {
        // The backend defaults holdMinutes to 15 and this screen never
        // overrides it — the snackbar states the real rule.
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã giữ chỗ. Hạn xác nhận: 15 phút.')),
        );
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      setState(() {
        _isSubmitting = false;
        _error = apiErrorCode(e) == 'CAPACITY_UNAVAILABLE'
            ? 'Tài nguyên đã hết chỗ trong khung giờ này.'
            : apiErrorMessage(e, 'Không thể tạo đặt chỗ. Kiểm tra kết nối mạng.');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tạo đặt chỗ')),
      body: FutureBuilder<List<Resource>>(
        future: _resourcesFuture,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return EmptyState(
              title: 'Không thể tải tài nguyên',
              body: 'Kiểm tra kết nối mạng rồi thử lại.',
              actionLabel: 'Thử lại',
              onAction: () => setState(() => _resourcesFuture = ref.read(bookingsServiceProvider).getResources()),
            );
          }
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final resources = snapshot.data!;
          if (resources.isEmpty) {
            return EmptyState(
              title: 'Chưa có tài nguyên',
              body: 'Đặt chỗ cần một tài nguyên (phòng, bàn, cano, tour...) trước. Thêm một tài nguyên rồi quay lại.',
              actionLabel: 'Thêm tài nguyên',
              onAction: () async {
                await context.push('/home/bookings/resources');
                if (mounted) setState(() => _resourcesFuture = ref.read(bookingsServiceProvider).getResources());
              },
            );
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Tài nguyên', style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                DropdownButtonFormField<Resource>(
                  initialValue: _selectedResource,
                  items: resources.map((r) => DropdownMenuItem(value: r, child: Text('${r.name} (sức chứa ${r.capacity})'))).toList(),
                  onChanged: (r) => setState(() {
                    _selectedResource = r;
                    _recomputeCapacity();
                  }),
                  hint: const Text('Chọn tài nguyên'),
                ),
                const SizedBox(height: 16),
                InkWell(
                  onTap: _pickDate,
                  borderRadius: BorderRadius.circular(8),
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'Ngày',
                      prefixIcon: Icon(Icons.calendar_today),
                      border: OutlineInputBorder(),
                    ),
                    child: Text('${_date.day}/${_date.month}/${_date.year}', style: Theme.of(context).textTheme.bodyLarge),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<int>(
                        initialValue: _hour,
                        items: [for (var h = 5; h <= 23; h++) DropdownMenuItem(value: h, child: Text('${h.toString().padLeft(2, '0')} giờ'))],
                        onChanged: (h) => setState(() {
                          _hour = h ?? _hour;
                          _recomputeCapacity();
                        }),
                        hint: const Text('Giờ'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: DropdownButtonFormField<int>(
                        initialValue: _minute,
                        items: [for (final m in const [0, 15, 30, 45]) DropdownMenuItem(value: m, child: Text('${m.toString().padLeft(2, '0')} phút'))],
                        onChanged: (m) => setState(() {
                          _minute = m ?? _minute;
                          _recomputeCapacity();
                        }),
                        hint: const Text('Phút'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Text('Thời lượng', style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: AppMetrics.touchSpacing,
                  runSpacing: AppMetrics.touchSpacing,
                  children: [
                    for (final entry in _durations.entries)
                      ChoiceChip(
                        label: Text(entry.value),
                        selected: _durationMinutes == entry.key,
                        onSelected: (_) => setState(() {
                          _durationMinutes = entry.key;
                          _recomputeCapacity();
                        }),
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                if (_capacityFuture != null) _CapacityHint(future: _capacityFuture!),
                const SizedBox(height: 16),
                AppTextField(label: 'Tên khách', controller: _customerName),
                const SizedBox(height: 16),
                AppTextField(label: 'Số khách', controller: _partySize, keyboardType: TextInputType.number),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 24),
                AppButton(label: 'Giữ chỗ', onPressed: _submit, isLoading: _isSubmitting),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// `'Còn trống: n chỗ'` when the proposed window still has room,
/// `'Khung giờ đã đầy'` when it doesn't, nothing when the lookup itself
/// fails (the hint is advisory — the backend's own 409 decides).
class _CapacityHint extends StatelessWidget {
  final Future<int> future;

  const _CapacityHint({required this.future});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<int>(
      future: future,
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const SizedBox.shrink();
        final free = snapshot.data!;
        return Text(
          free > 0 ? 'Còn trống: $free chỗ' : 'Khung giờ đã đầy',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: free > 0 ? AppColors.secondary : AppColors.destructive,
                fontWeight: FontWeight.w600,
              ),
        );
      },
    );
  }
}
