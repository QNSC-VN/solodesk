/// Mirrors backend-api's `GET /v1/lots/stock-summary` response.
/// The single low-stock rule — Home's badge count and the Stock screen's
/// red rows must agree, so the threshold lives with the model, once.
const double lowStockThreshold = 5;

class StockSummaryItem {
  final String skuId;
  final String skuCode;
  final String name;
  final String unit;
  final String unitPrice;
  final bool isActive;
  final String totalOnHand;
  final String totalReserved;
  final String totalAvailable;

  StockSummaryItem({
    required this.skuId,
    required this.skuCode,
    required this.name,
    required this.unit,
    required this.unitPrice,
    required this.isActive,
    required this.totalOnHand,
    required this.totalReserved,
    required this.totalAvailable,
  });

  factory StockSummaryItem.fromJson(Map<String, dynamic> json) => StockSummaryItem(
        skuId: json['skuId'] as String,
        skuCode: json['skuCode'] as String,
        name: json['name'] as String,
        unit: json['unit'] as String,
        unitPrice: json['unitPrice'] as String,
        isActive: json['isActive'] as bool,
        totalOnHand: json['totalOnHand'] as String,
        totalReserved: json['totalReserved'] as String,
        totalAvailable: json['totalAvailable'] as String,
      );
}
