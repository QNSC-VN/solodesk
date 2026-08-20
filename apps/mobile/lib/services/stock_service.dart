import 'api_client.dart';
import '../models/stock_summary_item.dart';

class StockService {
  final ApiClient _client;
  StockService(this._client);

  Future<List<StockSummaryItem>> getStockSummary() => _client.get(
        ApiTarget.backendApi,
        '/lots/stock-summary',
        (json) => (json as List<dynamic>).map((s) => StockSummaryItem.fromJson(s as Map<String, dynamic>)).toList(),
      );
}
