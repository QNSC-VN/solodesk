import 'package:uuid/uuid.dart';
import 'api_client.dart';
import '../models/expense.dart';

class ExpensesService {
  final ApiClient _client;
  static const _uuid = Uuid();

  ExpensesService(this._client);

  Future<List<Expense>> getExpenses() =>
      _client.get(ApiTarget.backendApi, '/expenses', (json) => (json as List<dynamic>).map((e) => Expense.fromJson(e as Map<String, dynamic>)).toList());

  Future<ExpenseSummary> getSummary() => _client.get(ApiTarget.backendApi, '/expenses/summary', (json) => ExpenseSummary.fromJson(json as Map<String, dynamic>));

  /// A fresh idempotency key per real submit attempt — a one-shot user
  /// action, not a retried background sync (same reasoning as
  /// `TaxService.recordFiling`).
  Future<void> recordExpense({
    required String category,
    required String description,
    required String amount,
    String documentation = 'khong',
    String? supplierName,
    bool isPersonalWallet = false,
  }) =>
      _client.post<void>(
        ApiTarget.backendApi,
        '/expenses',
        {
          'category': category,
          'description': description,
          'amount': amount,
          'documentation': documentation,
          if (supplierName != null && supplierName.isNotEmpty) 'supplierName': supplierName,
          'isPersonalWallet': isPersonalWallet,
        },
        (_) {},
        headers: {'Idempotency-Key': _uuid.v4()},
      );
}
