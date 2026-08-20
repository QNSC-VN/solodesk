import 'api_client.dart';
import '../local/local_database.dart';
import '../models/sku.dart';

/// Read-through cache: a real online fetch replaces `CachedSkus` and wins;
/// offline (or any fetch failure), the last-known cache serves the
/// product-picker on `OrderCreateScreen` — required for "sell while
/// offline" to be possible at all, not just order submission (see
/// `CachedSkus`' own doc comment).
class SkusService {
  final ApiClient _client;
  final LocalDatabase _db;
  SkusService(this._client, this._db);

  Future<List<Sku>> getSkus() async {
    try {
      final skus = await _client.get(
          ApiTarget.backendApi, '/skus', (json) => (json as List<dynamic>).map((s) => Sku.fromJson(s as Map<String, dynamic>)).toList());
      await _db.replaceCachedSkus(
          skus.map((s) => CachedSkusCompanion.insert(id: s.id, skuCode: s.skuCode, name: s.name, unit: s.unit, unitPrice: s.unitPrice, isActive: s.isActive)).toList());
      return skus;
    } catch (_) {
      final cached = await _db.getCachedSkus();
      if (cached.isEmpty) rethrow;
      return cached.map((c) => Sku(id: c.id, skuCode: c.skuCode, name: c.name, unit: c.unit, unitPrice: c.unitPrice, isActive: c.isActive)).toList();
    }
  }
}
