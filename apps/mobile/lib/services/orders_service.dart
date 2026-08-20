import 'dart:math';
import 'api_client.dart';
import '../models/order.dart';

class CreateOrderLine {
  final String skuId;
  final String quantity;
  CreateOrderLine({required this.skuId, required this.quantity});

  Map<String, dynamic> toJson() => {'skuId': skuId, 'quantity': quantity};
}

class OrdersService {
  final ApiClient _client;
  OrdersService(this._client);

  Future<List<Order>> getOrders() =>
      _client.get(ApiTarget.backendApi, '/orders', (json) => (json as List<dynamic>).map((o) => Order.fromJson(o as Map<String, dynamic>)).toList());

  Future<Order> getOrder(String id) => _client.get(ApiTarget.backendApi, '/orders/$id', (json) => Order.fromJson(json as Map<String, dynamic>));

  /// `POST /v1/orders` requires a real `Idempotency-Key` header (Mục 5.2 —
  /// same convention every other order/invoice/return create call in this
  /// repo follows) — a fresh one per real submit attempt, not reused.
  Future<Order> createOrder({required List<CreateOrderLine> lines, String? customerName}) {
    final idempotencyKey = '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(1 << 32)}';
    return _client.post(
      ApiTarget.backendApi,
      '/orders',
      {'channel': 'counter', if (customerName != null && customerName.isNotEmpty) 'customerName': customerName, 'lines': lines.map((l) => l.toJson()).toList()},
      (json) => Order.fromJson(json as Map<String, dynamic>),
      headers: {'Idempotency-Key': idempotencyKey},
    );
  }
}
