/// Mirrors backend-api's `Expense`/`ExpenseSummary` — non-inventory
/// operating spend, the CEO mockup's own "Khoản chi" (see CLAUDE.md's
/// "Expense domain" section for why this is genuinely separate from
/// procurement's purchase notes).
class Expense {
  final String id;
  final String category;
  final String description;
  final String amount;
  final String documentation;
  final String? supplierName;
  final bool isPersonalWallet;
  final DateTime spentAt;
  final DateTime createdAt;

  Expense({
    required this.id,
    required this.category,
    required this.description,
    required this.amount,
    required this.documentation,
    required this.supplierName,
    required this.isPersonalWallet,
    required this.spentAt,
    required this.createdAt,
  });

  factory Expense.fromJson(Map<String, dynamic> json) => Expense(
        id: json['id'] as String,
        category: json['category'] as String,
        description: json['description'] as String,
        amount: json['amount'] as String,
        documentation: json['documentation'] as String,
        supplierName: json['supplierName'] as String?,
        isPersonalWallet: json['isPersonalWallet'] as bool,
        spentAt: DateTime.parse(json['spentAt'] as String),
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

class ExpenseCategoryTotal {
  final String category;
  final String total;
  final int count;
  ExpenseCategoryTotal({required this.category, required this.total, required this.count});

  factory ExpenseCategoryTotal.fromJson(Map<String, dynamic> json) =>
      ExpenseCategoryTotal(category: json['category'] as String, total: json['total'] as String, count: json['count'] as int);
}

class ExpenseSummary {
  final String total;
  final int count;
  final List<ExpenseCategoryTotal> byCategory;
  final String noDocumentationTotal;
  final String personalWalletTotal;

  ExpenseSummary({required this.total, required this.count, required this.byCategory, required this.noDocumentationTotal, required this.personalWalletTotal});

  factory ExpenseSummary.fromJson(Map<String, dynamic> json) => ExpenseSummary(
        total: json['total'] as String,
        count: json['count'] as int,
        byCategory: (json['byCategory'] as List<dynamic>).map((c) => ExpenseCategoryTotal.fromJson(c as Map<String, dynamic>)).toList(),
        noDocumentationTotal: json['noDocumentationTotal'] as String,
        personalWalletTotal: json['personalWalletTotal'] as String,
      );
}

/// The mockup's own fixed LOAI_CHI set — closed, no user-defined categories.
class ExpenseCategoryOption {
  final String code;
  final String label;
  const ExpenseCategoryOption(this.code, this.label);
}

const kExpenseCategoryOptions = [
  ExpenseCategoryOption('bao-bi', 'Bao bì, đóng gói'),
  ExpenseCategoryOption('van-chuyen', 'Vận chuyển, xăng xe'),
  ExpenseCategoryOption('dien-nuoc', 'Điện, nước, internet'),
  ExpenseCategoryOption('mat-bang', 'Mặt bằng, thuê nhà'),
  ExpenseCategoryOption('nhan-cong', 'Nhân công'),
  ExpenseCategoryOption('thiet-bi', 'Thiết bị'),
  ExpenseCategoryOption('nguyen-lieu', 'Nguyên liệu'),
  ExpenseCategoryOption('khac', 'Khác'),
];

String expenseCategoryLabel(String code) => kExpenseCategoryOptions.firstWhere((o) => o.code == code, orElse: () => ExpenseCategoryOption(code, code)).label;
