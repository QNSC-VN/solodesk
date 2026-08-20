/// Mirrors backend-api's `GET /v1/tenants/:id` response. `activatedAt`
/// non-null is the one real signal this app checks after login to decide
/// "show the onboarding conversation" vs "show the home screen" — set by
/// agent-orchestrator's `complete_onboarding` tool at the end of a real
/// onboarding conversation (see CLAUDE.md).
class Tenant {
  final String id;
  final String legalName;
  final String industry;
  final DateTime? activatedAt;

  Tenant({required this.id, required this.legalName, required this.industry, required this.activatedAt});

  bool get isOnboarded => activatedAt != null;

  factory Tenant.fromJson(Map<String, dynamic> json) => Tenant(
        id: json['id'] as String,
        legalName: json['legalName'] as String,
        industry: json['industry'] as String,
        activatedAt: json['activatedAt'] == null ? null : DateTime.parse(json['activatedAt'] as String),
      );
}
