import 'api_client.dart';
import '../models/order.dart';

class OrdersService {
  final ApiClient _client;
  OrdersService(this._client);

  Future<List<Order>> getOrders() =>
      _client.get(ApiTarget.backendApi, '/orders', (json) => (json as List<dynamic>).map((o) => Order.fromJson(o as Map<String, dynamic>)).toList());
}
