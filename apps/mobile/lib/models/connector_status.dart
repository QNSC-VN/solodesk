/// Mirrors connector-hub's `GET /v1/connectors/status` response — the full
/// 13-provider catalog merged with the caller's tenant real vault state.
/// See CLAUDE.md's "Connector status v1" section for what this is NOT
/// (no 7-state onboarding machine, no freshness/health metadata).
class ConnectorStatus {
  final String provider;
  final bool isImplemented;
  final bool isConfigured;
  final bool isActive;
  final DateTime? lastVerifiedAt;
  final bool? lastVerificationOk;

  ConnectorStatus({
    required this.provider,
    required this.isImplemented,
    required this.isConfigured,
    required this.isActive,
    required this.lastVerifiedAt,
    required this.lastVerificationOk,
  });

  factory ConnectorStatus.fromJson(Map<String, dynamic> json) => ConnectorStatus(
        provider: json['provider'] as String,
        isImplemented: json['isImplemented'] as bool,
        isConfigured: json['isConfigured'] as bool,
        isActive: json['isActive'] as bool,
        lastVerifiedAt: json['lastVerifiedAt'] == null ? null : DateTime.parse(json['lastVerifiedAt'] as String),
        lastVerificationOk: json['lastVerificationOk'] as bool?,
      );
}
