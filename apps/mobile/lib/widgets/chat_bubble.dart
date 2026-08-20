import 'package:flutter/material.dart';
import '../models/conversation_message.dart';
import '../theme/app_theme.dart';

/// One shape, mirrored — user bubbles right-aligned/primary-tinted,
/// assistant bubbles left-aligned/card-background, per
/// `design-system/solodesk/pages/mobile.md`.
class ChatBubble extends StatelessWidget {
  final ConversationMessage message;
  const ChatBubble({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == MessageRole.user;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
        decoration: BoxDecoration(
          color: isUser ? AppColors.primary.withValues(alpha: 0.12) : AppColors.card,
          border: isUser ? null : Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(AppMetrics.cardRadius + 4),
        ),
        child: Text(message.content, style: Theme.of(context).textTheme.bodyLarge),
      ),
    );
  }
}
