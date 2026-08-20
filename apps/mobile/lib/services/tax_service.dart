import 'package:uuid/uuid.dart';
import 'api_client.dart';
import '../models/tax_estimate.dart';

/// Thin, `StockService`-style — v1 mobile only ever shows the CURRENT
/// quarter (no historical quarter picker in this cut), so `getEstimate`
/// takes no params, matching backend-api's own default-to-current-quarter
/// behavior on `GET /v1/tax/estimate`.
class TaxService {
  final ApiClient _client;
  static const _uuid = Uuid();

  TaxService(this._client);

  Future<TaxEstimate> getEstimate() => _client.get(ApiTarget.backendApi, '/tax/estimate', (json) => TaxEstimate.fromJson(json as Map<String, dynamic>));

  Future<void> setTaxGroupDefault(String code) =>
      _client.patch<void>(ApiTarget.backendApi, '/tenants/tax-profile', {'taxGroupDefault': code}, (_) {});

  /// "Đóng sổ kỳ" — a fresh idempotency key per real submit attempt (this
  /// is a one-shot user action, not a retried background sync, so unlike
  /// `OrdersService.createOrder` there's no reason to persist/reuse one).
  Future<void> recordFiling({required int quarter, required int year, required String receiptCode}) => _client.post<void>(
        ApiTarget.backendApi,
        '/tax/filings',
        {'quarter': quarter, 'year': year, 'receiptCode': receiptCode},
        (_) {},
        headers: {'Idempotency-Key': _uuid.v4()},
      );
}
