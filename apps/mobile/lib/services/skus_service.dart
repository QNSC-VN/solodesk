import 'api_client.dart';
import '../models/sku.dart';

class SkusService {
  final ApiClient _client;
  SkusService(this._client);

  Future<List<Sku>> getSkus() =>
      _client.get(ApiTarget.backendApi, '/skus', (json) => (json as List<dynamic>).map((s) => Sku.fromJson(s as Map<String, dynamic>)).toList());
}
