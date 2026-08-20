/// Mirrors backend-api's `SkuResponseDto` (`GET /v1/skus`).
class Sku {
  final String id;
  final String skuCode;
  final String name;
  final String unit;
  final String unitPrice;
  final bool isActive;

  Sku({required this.id, required this.skuCode, required this.name, required this.unit, required this.unitPrice, required this.isActive});

  factory Sku.fromJson(Map<String, dynamic> json) => Sku(
        id: json['id'] as String,
        skuCode: json['skuCode'] as String,
        name: json['name'] as String,
        unit: json['unit'] as String,
        unitPrice: json['unitPrice'] as String,
        isActive: json['isActive'] as bool,
      );
}
