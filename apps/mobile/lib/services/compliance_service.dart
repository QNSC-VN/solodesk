import 'package:uuid/uuid.dart';

import 'api_client.dart';
import '../models/compliance_document.dart';

/// Compliance-document CRUD against backend-api's `/compliance/documents`.
/// Every create carries a fresh `Idempotency-Key` (uuid v4) — a retried
/// submit replays the same row instead of duplicating it.
class ComplianceService {
  final ApiClient _client;
  ComplianceService(this._client);

  Future<List<ComplianceDocument>> getDocuments() => _client.get(
        ApiTarget.backendApi,
        '/compliance/documents',
        (json) => (json as List<dynamic>).map((d) => ComplianceDocument.fromJson(d as Map<String, dynamic>)).toList(),
      );

  Future<ComplianceDocument> createDocument({
    required String docType,
    String? documentNumber,
    String? issuedOn,
    String? expiresOn,
    bool? isMandatory,
    String? notes,
  }) =>
      _client.post(
        ApiTarget.backendApi,
        '/compliance/documents',
        {
          'docType': docType,
          if (documentNumber?.isNotEmpty ?? false) 'documentNumber': documentNumber,
          'issuedOn': issuedOn,
          'expiresOn': expiresOn,
          'isMandatory': isMandatory,
          if (notes?.isNotEmpty ?? false) 'notes': notes,
        },
        (json) => ComplianceDocument.fromJson(json as Map<String, dynamic>),
        headers: {'Idempotency-Key': const Uuid().v4()},
      );

  Future<ComplianceDocument> updateDocument(String id, Map<String, dynamic> patch) => _client.patch(
        ApiTarget.backendApi,
        '/compliance/documents/$id',
        patch,
        (json) => ComplianceDocument.fromJson(json as Map<String, dynamic>),
      );

  Future<void> deleteDocument(String id) async {
    await _client.delete(
      ApiTarget.backendApi,
      '/compliance/documents/$id',
      (json) => json,
    );
  }
}
