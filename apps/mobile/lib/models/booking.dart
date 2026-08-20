/// Mirrors backend-api's `BookingResponseDto` (`GET /v1/bookings` and
/// friends). Dates arrive as ISO-8601 UTC strings with `Z`
/// (`DateTime.parse` handles them); every DISPLAY goes through `.toLocal()`
/// first or the wall clock is 7 hours off for a Vietnam device.
class Booking {
  final String id;
  final String resourceId;
  final String customerName;
  final String status;
  final DateTime startsAt;
  final DateTime endsAt;
  final int partySize;
  final DateTime? holdExpiresAt;

  Booking({
    required this.id,
    required this.resourceId,
    required this.customerName,
    required this.status,
    required this.startsAt,
    required this.endsAt,
    required this.partySize,
    required this.holdExpiresAt,
  });

  factory Booking.fromJson(Map<String, dynamic> json) => Booking(
        id: json['id'] as String,
        resourceId: json['resourceId'] as String,
        customerName: json['customerName'] as String,
        status: json['status'] as String,
        startsAt: DateTime.parse(json['startsAt'] as String),
        endsAt: DateTime.parse(json['endsAt'] as String),
        partySize: json['partySize'] as int,
        holdExpiresAt: json['holdExpiresAt'] == null ? null : DateTime.parse(json['holdExpiresAt'] as String),
      );

  /// The backend expires holds LAZILY — no sweeper ever rewrites an expired
  /// held row, so "is this hold still live" is a display-time computation
  /// against `holdExpiresAt`, matching `activeForCapacity`'s own rule.
  bool get isActiveHold => status == 'held' && holdExpiresAt != null && holdExpiresAt!.isAfter(DateTime.now());

  bool get isExpiredHold => status == 'held' && !isActiveHold;

  /// Counts toward capacity for a window check — the exact condition the
  /// backend's overlap query uses (`confirmed` OR held-and-unexpired).
  bool countsTowardCapacity(DateTime asOf) =>
      status == 'confirmed' || (status == 'held' && holdExpiresAt != null && holdExpiresAt!.isAfter(asOf));
}

/// Vietnamese label table for the booking statuses — passed explicitly as
/// `StatusBadge.label:` at every call site (the badge's own default labels
/// are English and used by the orders screens; booking screens never rely
/// on them).
String? bookingStatusLabel(Booking b) => switch (b.status) {
      'held' => 'Đã giữ chỗ',
      'confirmed' => 'Đã xác nhận',
      'cancelled' => 'Đã hủy',
      'no_show' => 'Không đến',
      _ => null,
    };
