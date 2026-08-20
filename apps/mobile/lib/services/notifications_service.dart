import 'api_client.dart';
import '../models/app_notification.dart';

class NotificationsService {
  final ApiClient _client;
  NotificationsService(this._client);

  Future<List<AppNotification>> getNotifications() => _client.get(
        ApiTarget.backendApi,
        '/notifications',
        (json) => (json as List<dynamic>).map((n) => AppNotification.fromJson(n as Map<String, dynamic>)).toList(),
      );

  Future<int> getUnreadCount() => _client.get(ApiTarget.backendApi, '/notifications/unread-count', (json) => (json as Map<String, dynamic>)['count'] as int);

  Future<void> markRead(String notificationId) => _client.post<void>(ApiTarget.backendApi, '/notifications/$notificationId/read', null, (_) {});

  Future<void> markAllRead() => _client.post<void>(ApiTarget.backendApi, '/notifications/read-all', null, (_) {});
}
