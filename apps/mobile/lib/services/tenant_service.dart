import 'api_client.dart';
import '../models/tenant.dart';

class TenantService {
  final ApiClient _client;
  TenantService(this._client);

  Future<Tenant> getTenant(String tenantId) => _client.get(ApiTarget.backendApi, '/tenants/$tenantId', (json) => Tenant.fromJson(json as Map<String, dynamic>));
}
