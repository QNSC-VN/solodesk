/// Mirrors backend-api's `/v1/notifications*` response shape. Named
/// `AppNotification`, not `Notification` — that name collides with
/// Flutter's own `dart:ui`/local-notifications ecosystem types.
class AppNotification {
  final String id;
  final String type;
  final String title;
  final String body;
  final bool isRead;
  final DateTime createdAt;

  AppNotification({required this.id, required this.type, required this.title, required this.body, required this.isRead, required this.createdAt});

  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
        id: json['id'] as String,
        type: json['type'] as String,
        title: json['title'] as String,
        body: json['body'] as String,
        isRead: json['isRead'] as bool,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}
