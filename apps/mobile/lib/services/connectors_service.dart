import 'api_client.dart';
import '../models/connector_status.dart';

/// Talks to connector-hub directly (own base URL, own port) — NOT
/// backend-api. Same shared JWT works against both services (one identity
/// provider), so no separate login/token handling is needed.
class ConnectorsService {
  final ApiClient _client;
  ConnectorsService(this._client);

  Future<List<ConnectorStatus>> getStatus() => _client.get(
        ApiTarget.connectorHub,
        '/connectors/status',
        (json) => (json as List<dynamic>).map((c) => ConnectorStatus.fromJson(c as Map<String, dynamic>)).toList(),
      );

  /// A real API call against the provider — can genuinely fail (bad key,
  /// provider outage), not just a format check. Returns the real outcome;
  /// callers refresh the status list afterward to see the persisted result.
  Future<bool> verify(String provider) => _client.post<bool>(
        ApiTarget.connectorHub,
        '/connectors/$provider/verify',
        null,
        (json) => (json as Map<String, dynamic>)['verified'] as bool,
      );
}
