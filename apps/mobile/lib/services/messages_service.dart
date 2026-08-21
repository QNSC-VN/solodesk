import 'api_client.dart';
import '../models/customer_message.dart';

/// Online-only customer-messaging access (the `StockService` convention)
/// against backend-api's `/messages` routes.
class MessagesService {
  final ApiClient _client;
  MessagesService(this._client);

  Future<List<CustomerMessage>> getMessages() => _client.get(
        ApiTarget.backendApi,
        '/messages',
        (json) => (json as List<dynamic>).map((m) => CustomerMessage.fromJson(m as Map<String, dynamic>)).toList(),
      );

  Future<int> getUnansweredCount() async {
    final result = await _client.get(
      ApiTarget.backendApi,
      '/messages/unanswered-count',
      (json) => (json as Map<String, dynamic>)['count'] as int,
    );
    return result;
  }

  Future<CustomerMessage> getMessage(String id) => _client.get(
        ApiTarget.backendApi,
        '/messages/$id',
        (json) => CustomerMessage.fromJson(json as Map<String, dynamic>),
      );

  /// Records the household's reply — the backend stores it and marks the
  /// exchange answered; it is NOT sent to Zalo yet (no real outbound API).
  Future<CustomerMessage> reply(String messageId, String content) => _client.post(
        ApiTarget.backendApi,
        '/messages/$messageId/reply',
        {'content': content},
        (json) => CustomerMessage.fromJson(json as Map<String, dynamic>),
      );
}
