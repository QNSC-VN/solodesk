import 'api_client.dart';
import '../models/booking.dart';
import '../models/resource.dart';

/// Online-only booking/resource access — the `StockService` convention
/// (thin, one method per endpoint, constructor takes `ApiClient` only).
/// Offline-first is deliberately orders-only in this app (a documented
/// cut); every method here degrades to whatever error the caller's
/// FutureBuilder shows, never a silent cache.
class BookingsService {
  final ApiClient _client;
  BookingsService(this._client);

  Future<List<Resource>> getResources() => _client.get(
        ApiTarget.backendApi,
        '/resources',
        (json) => (json as List<dynamic>).map((r) => Resource.fromJson(r as Map<String, dynamic>)).toList(),
      );

  Future<Resource> createResource({required String name, required String resourceType, required int capacity}) => _client.post(
        ApiTarget.backendApi,
        '/resources',
        {'name': name, 'resourceType': resourceType, 'capacity': capacity},
        (json) => Resource.fromJson(json as Map<String, dynamic>),
      );

  /// Tenant-wide list (the list screen's data source — one call, not one
  /// per resource). Newest `startsAt` first, per the backend's ordering.
  Future<List<Booking>> listBookings() => _client.get(
        ApiTarget.backendApi,
        '/bookings',
        (json) => (json as List<dynamic>).map((b) => Booking.fromJson(b as Map<String, dynamic>)).toList(),
      );

  Future<List<Booking>> listBookingsByResource(String resourceId) => _client.get(
        ApiTarget.backendApi,
        '/bookings/by-resource/$resourceId',
        (json) => (json as List<dynamic>).map((b) => Booking.fromJson(b as Map<String, dynamic>)).toList(),
      );

  Future<Booking> getBooking(String id) => _client.get(
        ApiTarget.backendApi,
        '/bookings/$id',
        (json) => Booking.fromJson(json as Map<String, dynamic>),
      );

  Future<Booking> requestHold({
    required String resourceId,
    required String customerName,
    required DateTime startsAt,
    required DateTime endsAt,
    int partySize = 1,
  }) =>
      _client.post(
        ApiTarget.backendApi,
        '/bookings',
        {
          'resourceId': resourceId,
          'customerName': customerName,
          'startsAt': startsAt.toIso8601String(),
          'endsAt': endsAt.toIso8601String(),
          'partySize': partySize,
        },
        (json) => Booking.fromJson(json as Map<String, dynamic>),
      );

  Future<Booking> confirmBooking(String id) => _client.post(
        ApiTarget.backendApi,
        '/bookings/$id/confirm',
        null,
        (json) => Booking.fromJson(json as Map<String, dynamic>),
      );

  Future<Booking> cancelBooking(String id) => _client.post(
        ApiTarget.backendApi,
        '/bookings/$id/cancel',
        null,
        (json) => Booking.fromJson(json as Map<String, dynamic>),
      );

  Future<Booking> markNoShow(String id) => _client.post(
        ApiTarget.backendApi,
        '/bookings/$id/no-show',
        null,
        (json) => Booking.fromJson(json as Map<String, dynamic>),
      );
}
