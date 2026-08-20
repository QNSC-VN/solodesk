import 'api_client.dart';
import '../models/session.dart';

/// Calls backend-api's real `/v1/auth/*` endpoints directly (see
/// `api_client.dart`'s header comment on why no BFF is needed here).
class AuthService {
  final ApiClient _client;
  AuthService(this._client);

  Future<Session> loginWithPassword(String email, String password) =>
      _client.post(ApiTarget.backendApi, '/auth/login', {'email': email, 'password': password}, (json) => Session.fromJson(json as Map<String, dynamic>));

  Future<void> logout(String accessToken) => _client.post<void>(ApiTarget.backendApi, '/auth/logout', null, (_) {});
}
