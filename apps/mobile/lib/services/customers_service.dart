import 'api_client.dart';
import '../models/customer.dart';

class CustomersService {
  final ApiClient _client;
  CustomersService(this._client);

  Future<List<CustomerSummary>> getCustomers() =>
      _client.get(ApiTarget.backendApi, '/customers', (json) => (json as List<dynamic>).map((c) => CustomerSummary.fromJson(c as Map<String, dynamic>)).toList());

  Future<CustomerDetail> getCustomerDetail(String name) =>
      _client.get(ApiTarget.backendApi, '/customers/detail?name=${Uri.encodeQueryComponent(name)}', (json) => CustomerDetail.fromJson(json as Map<String, dynamic>));
}
