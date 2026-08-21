/// Mirrors backend-api's `ComplianceDocumentResponseDto`. Status is DERIVED
/// server-side (missing/expired/expiring/valid) — never stored, same
/// discipline as the payment summary.
class ComplianceDocument {
  final String id;
  final String docType;
  final String? documentNumber;
  final String? issuedOn;
  final String? expiresOn;
  final bool isMandatory;
  final String? notes;
  final String status;
  final int? daysRemaining;
  final int incompleteCount;

  ComplianceDocument({
    required this.id,
    required this.docType,
    required this.documentNumber,
    required this.issuedOn,
    required this.expiresOn,
    required this.isMandatory,
    required this.notes,
    required this.status,
    required this.daysRemaining,
    required this.incompleteCount,
  });

  factory ComplianceDocument.fromJson(Map<String, dynamic> json) => ComplianceDocument(
        id: json['id'] as String,
        docType: json['docType'] as String,
        documentNumber: json['documentNumber'] as String?,
        issuedOn: json['issuedOn'] as String?,
        expiresOn: json['expiresOn'] as String?,
        isMandatory: json['isMandatory'] as bool,
        notes: json['notes'] as String?,
        status: json['status'] as String,
        daysRemaining: json['daysRemaining'] as int?,
        incompleteCount: json['incompleteCount'] as int,
      );
}
