import 'dart:convert';
import '../services/api_client.dart';
import '../services/api_error_message.dart';
import 'local_database.dart';

/// Drains every `pending` `LocalOrders` row against the real backend-api,
/// reusing the SAME client-generated `clientId` as the `Idempotency-Key`
/// on every attempt (`withIdempotency` is purely key-based, no TTL — see
/// `services/backend-api/src/platform/idempotency.ts`), so a retry hours
/// or days later is still exactly-once. Classification mirrors
/// connector-hub's own `connector-http.ts`: network/timeout (no response
/// to classify) and a real 429/5xx are retryable and stay `pending`; any
/// other 4xx (e.g. a real 409 INSUFFICIENT_STOCK) is non-retryable and
/// marks `failed` with the real reason shown to the user — never an
/// infinite retry loop, never a silently-dropped order.
///
/// No separate backoff timer: retries are driven by real triggers (app
/// start, a real offline→online transition, the Outbound Queue screen's
/// manual "Đồng bộ ngay") rather than a background poll loop — the
/// simpler, battery-honest choice for a mobile client with exactly one
/// offline-capable write.
class OrderSyncWorker {
  final ApiClient _client;
  final LocalDatabase _db;

  OrderSyncWorker(this._client, this._db);

  Future<void> drainPending() async {
    final pending = await _db.getPendingSyncOrders();
    for (final row in pending) {
      await _syncOne(row);
    }
  }

  Future<void> _syncOne(LocalOrder row) async {
    await _db.incrementAttempts(row.clientId);

    final requestLines = (jsonDecode(row.linesJson) as List<dynamic>)
        .map((l) => {'skuId': (l as Map<String, dynamic>)['skuId'], 'quantity': l['quantity']})
        .toList();

    try {
      final response = await _client.post(
        ApiTarget.backendApi,
        '/orders',
        {
          'channel': row.channel,
          if (row.customerName != null) 'customerName': row.customerName,
          'lines': requestLines,
        },
        (json) => json as Map<String, dynamic>,
        headers: {'Idempotency-Key': row.clientId},
      );
      await _db.markSynced(
        clientId: row.clientId,
        serverId: response['id'] as String,
        status: response['status'] as String,
        totalAmount: response['totalAmount'] as String,
        createdAt: DateTime.parse(response['createdAt'] as String),
        serverLinesJson: jsonEncode(response['lines'] ?? []),
      );
    } on ApiException catch (e) {
      final retryable = e.status == 429 || e.status >= 500;
      await _db.markAttemptFailed(clientId: row.clientId, retryable: retryable, reason: apiErrorMessage(e, 'Không có kết nối mạng.'));
    } catch (_) {
      await _db.markAttemptFailed(clientId: row.clientId, retryable: true, reason: 'Không có kết nối mạng.');
    }
  }

}
