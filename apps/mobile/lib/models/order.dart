/// Mirrors backend-api's `OrderResponseDto` (`GET /v1/orders`) — same
/// fields web-accounting's `lib/orders.ts` `Order` type carries.
class Order {
  final String id;
  final String channel;
  final String status;
  final String? customerName;
  final String totalAmount;
  final DateTime createdAt;

  Order({required this.id, required this.channel, required this.status, required this.customerName, required this.totalAmount, required this.createdAt});

  factory Order.fromJson(Map<String, dynamic> json) => Order(
        id: json['id'] as String,
        channel: json['channel'] as String,
        status: json['status'] as String,
        customerName: json['customerName'] as String?,
        totalAmount: json['totalAmount'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}
