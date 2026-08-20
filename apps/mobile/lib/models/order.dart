class OrderLine {
  final String id;
  final String skuId;
  final String lotId;
  final String quantity;
  final String unitPrice;
  final String lineTotal;

  OrderLine({required this.id, required this.skuId, required this.lotId, required this.quantity, required this.unitPrice, required this.lineTotal});

  factory OrderLine.fromJson(Map<String, dynamic> json) => OrderLine(
        id: json['id'] as String,
        skuId: json['skuId'] as String,
        lotId: json['lotId'] as String,
        quantity: json['quantity'] as String,
        unitPrice: json['unitPrice'] as String,
        lineTotal: json['lineTotal'] as String,
      );
}

/// Mirrors backend-api's `OrderResponseDto` (`GET /v1/orders`) — same
/// fields web-accounting's `lib/orders.ts` `Order` type carries, plus two
/// local-only additions for offline-first: `syncStatus`/`syncError` are
/// null for every real server-confirmed order (the remote `fromJson` path
/// never sets them) and only carry a value for a `LocalOrders` row that
/// hasn't synced yet (`OrdersService`'s local-DB mapping) — 'pending' or
/// 'failed', surfaced as a small badge on the Orders tab/Home/detail
/// screens.
class Order {
  final String id;
  final String channel;
  final String status;
  final String? customerName;
  final String totalAmount;
  final DateTime createdAt;
  final List<OrderLine> lines;
  final String? syncStatus;
  final String? syncError;

  Order({
    required this.id,
    required this.channel,
    required this.status,
    required this.customerName,
    required this.totalAmount,
    required this.createdAt,
    required this.lines,
    this.syncStatus,
    this.syncError,
  });

  factory Order.fromJson(Map<String, dynamic> json) => Order(
        id: json['id'] as String,
        channel: json['channel'] as String,
        status: json['status'] as String,
        customerName: json['customerName'] as String?,
        totalAmount: json['totalAmount'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
        lines: (json['lines'] as List<dynamic>? ?? []).map((l) => OrderLine.fromJson(l as Map<String, dynamic>)).toList(),
      );
}
