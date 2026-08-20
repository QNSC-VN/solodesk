import 'dart:convert';

/// Decodes the `contextId` (tenant id) claim out of a real backend-api
/// access token, without a full JWT verification library — this app never
/// verifies the signature itself (backend-api already did that when it
/// issued the token; this is purely reading a claim client-side to know
/// which tenant to call `GET /v1/tenants/:id` for). Same claim name
/// `@qnsc-vn/identity` uses everywhere else in this repo (see CLAUDE.md's
/// "contextId, not tenantId" note).
String? tenantIdFromAccessToken(String accessToken) {
  final parts = accessToken.split('.');
  if (parts.length != 3) return null;

  var payload = parts[1];
  payload = payload.padRight(payload.length + (4 - payload.length % 4) % 4, '=');
  try {
    final decoded = utf8.decode(base64Url.decode(payload));
    final json = jsonDecode(decoded) as Map<String, dynamic>;
    return json['contextId'] as String?;
  } catch (_) {
    return null;
  }
}
