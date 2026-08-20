import 'dart:convert';
import 'api_client.dart';

/// Shared backend-error-surface helpers — the same wire-envelope parsing
/// `OrderSyncWorker._reasonFor` already does (`{ error: { code, message,
/// details, correlationId } }`, `GlobalExceptionFilter`'s real shape, not
/// Nest's bare default), extracted so booking screens can share it without
/// each carrying its own copy. `order_sync_worker.dart` itself is left
/// untouched this pass.

/// Human-readable message for an error from a service call: an
/// `ApiException` yields the backend's own message (or a status-coded
/// fallback); anything else (network failure, parse error) yields
/// [fallback] — the caller's "check your connection" style Vietnamese line.
String apiErrorMessage(Object error, String fallback) {
  if (error is ApiException) {
    try {
      final body = jsonDecode(error.body) as Map<String, dynamic>;
      final message = (body['error'] as Map<String, dynamic>?)?['message'];
      if (message is String && message.isNotEmpty) return message;
      if (message is List && message.isNotEmpty) return message.join(', ');
    } catch (_) {
      // fall through to the generic reason below
    }
    return 'Lỗi máy chủ (${error.status}).';
  }
  return fallback;
}

/// The backend's machine-readable error code (`CAPACITY_UNAVAILABLE`,
/// `HOLD_NOT_CONFIRMABLE`, ...), or null when the error isn't an
/// `ApiException` or carries no parseable envelope — lets screens map
/// specific codes to their own Vietnamese messages.
String? apiErrorCode(Object error) {
  if (error is! ApiException) return null;
  try {
    final body = jsonDecode(error.body) as Map<String, dynamic>;
    return (body['error'] as Map<String, dynamic>?)?['code'] as String?;
  } catch (_) {
    return null;
  }
}
