enum MessageRole { user, assistant }

class ConversationMessage {
  final MessageRole role;
  final String content;

  ConversationMessage({required this.role, required this.content});

  factory ConversationMessage.fromJson(Map<String, dynamic> json) => ConversationMessage(
        role: json['role'] == 'user' ? MessageRole.user : MessageRole.assistant,
        content: json['content'] as String,
      );
}
