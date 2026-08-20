import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solodesk_mobile/models/booking.dart';
import 'package:solodesk_mobile/models/resource.dart';
import 'package:solodesk_mobile/screens/bookings_screen.dart';
import 'package:solodesk_mobile/services/bookings_service.dart';
import 'package:solodesk_mobile/state/providers.dart';

class _FakeBookingsService implements BookingsService {
  _FakeBookingsService(this.bookings, this.resources);
  final List<Booking> bookings;
  final List<Resource> resources;

  @override
  Future<List<Booking>> listBookings() async => bookings;

  @override
  Future<List<Resource>> getResources() async => resources;

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

void main() {
  testWidgets('BookingsScreen renders the empty state with an add-resource action when the tenant has neither bookings nor resources', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [bookingsServiceProvider.overrideWithValue(_FakeBookingsService([], []))],
        child: const MaterialApp(home: BookingsScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Chưa có đặt chỗ'), findsOneWidget);
    expect(find.text('Thêm tài nguyên'), findsOneWidget);
  });

  testWidgets('BookingsScreen splits upcoming from past and labels statuses in Vietnamese', (tester) async {
    final now = DateTime.now();
    final resource = Resource(id: 'r1', name: 'Cano 1', resourceType: 'cano', capacity: 8, isActive: true);
    final upcomingHeld = Booking(
      id: 'b1',
      resourceId: 'r1',
      customerName: 'Anh Bảy',
      status: 'held',
      startsAt: now.add(const Duration(hours: 2)),
      endsAt: now.add(const Duration(hours: 4)),
      partySize: 6,
      holdExpiresAt: now.add(const Duration(minutes: 10)),
    );
    final pastConfirmed = Booking(
      id: 'b2',
      resourceId: 'r1',
      customerName: 'Chị Hoa',
      status: 'confirmed',
      startsAt: now.subtract(const Duration(days: 1)),
      endsAt: now.subtract(const Duration(days: 1)).add(const Duration(hours: 2)),
      partySize: 2,
      holdExpiresAt: null,
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [bookingsServiceProvider.overrideWithValue(_FakeBookingsService([upcomingHeld, pastConfirmed], [resource]))],
        child: const MaterialApp(home: BookingsScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sắp tới'), findsOneWidget);
    expect(find.text('Đã qua'), findsOneWidget);
    expect(find.text('Anh Bảy'), findsOneWidget);
    expect(find.text('Đã giữ chỗ'), findsOneWidget);
    expect(find.text('Chị Hoa'), findsOneWidget);
    expect(find.text('Đã xác nhận'), findsOneWidget);
    expect(find.textContaining('Giữ đến:'), findsOneWidget);
  });
}
