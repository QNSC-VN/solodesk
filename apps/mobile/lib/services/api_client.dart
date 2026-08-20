import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/env.dart';
import 'secure_session_store.dart';

enum ApiTarget { backendApi, agentOrchestrator }

/// Thrown when a request 401s AND the subsequent real refresh attempt also
/// fails (refresh token itself expired/revoked — e.g. logout-all elsewhere)
/// — the router listens for this to send the user back to `/login`, same
/// "the only real option is a fresh login" outcome `web-accounting`'s
/// `proxy.ts` reaches for the identical failure.
class SessionExpiredException implements Exception {}

class ApiException implements Exception {
  final int status;
  final String body;
  ApiException(this.status, this.body);

  @override
  String toString() => 'ApiException($status): $body';
}

/// Bearer-token HTTP client for backend-api AND agent-orchestrator — both
/// verify the SAME JWT (one identity provider across services, see
/// CLAUDE.md's local-dev setup), so one client/one stored token pair
/// covers both. Unlike `web-accounting`'s `proxy.ts` (which proactively
/// refreshes before expiry, since only a Server Function/Proxy response
/// can set a cookie), this app reacts to a real 401 and refreshes then —
/// a plain in-memory token, no cookie-setting constraint to design around.
class ApiClient {
  final SecureSessionStore _store;
  Future<void>? _refreshInFlight;

  ApiClient(this._store);

  String _baseUrl(ApiTarget target) => switch (target) {
        ApiTarget.backendApi => Env.backendApiBaseUrl,
        ApiTarget.agentOrchestrator => Env.agentOrchestratorBaseUrl,
      };

  Future<T> get<T>(ApiTarget target, String path, T Function(dynamic) parse) => _send(target, 'GET', path, null, parse);

  Future<T> post<T>(ApiTarget target, String path, Object? body, T Function(dynamic) parse) => _send(target, 'POST', path, body, parse);

  Future<T> _send<T>(ApiTarget target, String method, String path, Object? body, T Function(dynamic) parse, {bool isRetry = false}) async {
    final token = await _store.accessToken;
    final uri = Uri.parse('${_baseUrl(target)}$path');
    final headers = {'Content-Type': 'application/json', if (token != null) 'Authorization': 'Bearer $token'};

    final res = method == 'GET'
        ? await http.get(uri, headers: headers)
        : await http.post(uri, headers: headers, body: body == null ? null : jsonEncode(body));

    if (res.statusCode == 401 && !isRetry) {
      final refreshed = await _refreshOnce();
      if (!refreshed) throw SessionExpiredException();
      return _send(target, method, path, body, parse, isRetry: true);
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(res.statusCode, res.body);
    }

    if (res.body.isEmpty) return parse(null);
    return parse(jsonDecode(res.body));
  }

  /// Concurrent 401s share ONE real refresh call, not one each — a burst of
  /// simultaneous requests hitting an expired token (e.g. the home screen's
  /// parallel tab prefetches) must not race backend-api's own refresh-token
  /// rotation, which invalidates the old refresh token the instant the new
  /// one is issued.
  Future<bool> _refreshOnce() {
    return (_refreshInFlight ??= _doRefresh()).then((_) => true).catchError((_) => false).whenComplete(() => _refreshInFlight = null);
  }

  Future<void> _doRefresh() async {
    final refreshToken = await _store.refreshToken;
    final csrfToken = await _store.csrfToken;
    if (refreshToken == null) throw SessionExpiredException();

    final res = await http.post(
      Uri.parse('${Env.backendApiBaseUrl}/auth/refresh'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'refreshToken': refreshToken, if (csrfToken != null) 'csrfToken': csrfToken}),
    );
    if (res.statusCode < 200 || res.statusCode >= 300) throw SessionExpiredException();

    final json = jsonDecode(res.body) as Map<String, dynamic>;
    await _store.saveRefreshed(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      csrfToken: json['csrfToken'] as String,
      expiresIn: json['expiresIn'] as int,
    );
  }
}
