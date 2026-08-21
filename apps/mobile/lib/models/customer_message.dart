/// Mirrors backend-api's `MessageResponseDto` (`GET /v1/messages`) — a
/// FLAT customer-message row, no threads; "pending" == `reply == null`,
/// exactly the mockup's daTraLoi semantics.
class CustomerMessage {
  final String id;
  final String channel;
  final String direction;
  final String customerName;
  final String content;
  final String? reply;
  final DateTime? repliedAt;
  final DateTime occurredAt;
  final DateTime createdAt;

  CustomerMessage({
    required this.id,
    required this.channel,
    required this.direction,
    required this.customerName,
    required this.content,
    required this.reply,
    required this.repliedAt,
    required this.occurredAt,
    required this.createdAt,
  });

  bool get isAnswered => repliedAt != null;

  factory CustomerMessage.fromJson(Map<String, dynamic> json) => CustomerMessage(
        id: json['id'] as String,
        channel: json['channel'] as String,
        direction: json['direction'] as String,
        customerName: json['customerName'] as String,
        content: json['content'] as String,
        reply: json['reply'] as String?,
        repliedAt: json['repliedAt'] == null ? null : DateTime.parse(json['repliedAt'] as String),
        occurredAt: DateTime.parse(json['occurredAt'] as String),
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}
