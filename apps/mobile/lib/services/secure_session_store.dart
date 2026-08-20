import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/session.dart';
import '../models/tenant.dart';
import 'jwt.dart';

/// Real token storage — `flutter_secure_storage` (Keychain on iOS,
/// EncryptedSharedPreferences/Keystore-backed on Android), NOT the httpOnly
/// cookies web-accounting uses. Mobile has no CORS restriction and no
/// browser XSS surface the way a web app's client JS does, so this app
/// calls backend-api/agent-orchestrator directly with a stored bearer
/// token rather than needing a BFF layer.
class SecureSessionStore {
  static const _storage = FlutterSecureStorage();

  static const _kAccessToken = 'sd_access_token';
  static const _kRefreshToken = 'sd_refresh_token';
  static const _kCsrfToken = 'sd_csrf_token';
  static const _kExpiresAt = 'sd_expires_at';
  static const _kUser = 'sd_user';
  static const _kTenant = 'sd_tenant';

  Future<void> save(Session session) async {
    final expiresAt = DateTime.now().add(Duration(seconds: session.expiresIn)).millisecondsSinceEpoch;
    await Future.wait([
      _storage.write(key: _kAccessToken, value: session.accessToken),
      _storage.write(key: _kRefreshToken, value: session.refreshToken),
      _storage.write(key: _kCsrfToken, value: session.csrfToken),
      _storage.write(key: _kExpiresAt, value: expiresAt.toString()),
      _storage.write(key: _kUser, value: jsonEncode(session.user.toJson())),
    ]);
  }

  /// Rotates just the token trio after a real refresh — same fields
  /// `refreshSession` returns, `user` stays whatever was already stored.
  Future<void> saveRefreshed({required String accessToken, required String refreshToken, required String csrfToken, required int expiresIn}) async {
    final expiresAt = DateTime.now().add(Duration(seconds: expiresIn)).millisecondsSinceEpoch;
    await Future.wait([
      _storage.write(key: _kAccessToken, value: accessToken),
      _storage.write(key: _kRefreshToken, value: refreshToken),
      _storage.write(key: _kCsrfToken, value: csrfToken),
      _storage.write(key: _kExpiresAt, value: expiresAt.toString()),
    ]);
  }

  Future<String?> get accessToken => _storage.read(key: _kAccessToken);
  Future<String?> get refreshToken => _storage.read(key: _kRefreshToken);
  Future<String?> get csrfToken => _storage.read(key: _kCsrfToken);

  Future<String?> get tenantId async {
    final token = await accessToken;
    if (token == null) return null;
    return tenantIdFromAccessToken(token);
  }

  Future<SessionUser?> get user async {
    final raw = await _storage.read(key: _kUser);
    if (raw == null) return null;
    return SessionUser.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  Future<bool> get hasSession async => (await accessToken) != null;

  /// Last-known tenant snapshot — the offline-first cold-start fallback.
  /// Without this, `SessionController._loadTenant()` would have to treat
  /// "app launched with no network" the same as "not logged in" (a real
  /// bug found via the emulator smoke test: it did, forcing a real logout
  /// on every offline cold start — exactly the CEO mockup's own headline
  /// scenario, broken at the very first screen).
  Future<void> cacheTenant(Tenant tenant) => _storage.write(key: _kTenant, value: jsonEncode(tenant.toJson()));

  Future<Tenant?> get cachedTenant async {
    final raw = await _storage.read(key: _kTenant);
    if (raw == null) return null;
    return Tenant.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  Future<void> clear() async {
    await Future.wait([
      _storage.delete(key: _kAccessToken),
      _storage.delete(key: _kRefreshToken),
      _storage.delete(key: _kCsrfToken),
      _storage.delete(key: _kExpiresAt),
      _storage.delete(key: _kUser),
      _storage.delete(key: _kTenant),
    ]);
  }
}
