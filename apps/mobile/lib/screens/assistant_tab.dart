import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/conversation_message.dart';
import '../state/providers.dart';
import '../widgets/chat_bubble.dart';
import '../widgets/chat_typing_indicator.dart';
import '../widgets/chat_input.dart';
import '../widgets/empty_state.dart';

/// The default, read-only `mode: 'assistant'` conversation — a SEPARATE
/// conversation from the onboarding one (agent-orchestrator fixes `mode`
/// once at start, never mixed — see CLAUDE.md). This tab starts a fresh
/// conversation on first open and keeps it for the app session; it does
/// NOT reuse the onboarding conversation's id.
class AssistantTab extends ConsumerStatefulWidget {
  const AssistantTab({super.key});

  @override
  ConsumerState<AssistantTab> createState() => _AssistantTabState();
}

class _AssistantTabState extends ConsumerState<AssistantTab> {
  final List<ConversationMessage> _messages = [];
  String? _conversationId;
  bool _isWaitingReply = false;
  bool _isStarting = true;
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    final conversationId = await ref.read(conversationServiceProvider).start(mode: 'assistant');
    setState(() {
      _conversationId = conversationId;
      _isStarting = false;
    });
  }

  Future<void> _send(String text) async {
    final conversationId = _conversationId;
    if (conversationId == null) return;

    setState(() {
      _messages.add(ConversationMessage(role: MessageRole.user, content: text));
      _isWaitingReply = true;
    });
    _scrollToBottom();

    try {
      final reply = await ref.read(conversationServiceProvider).sendMessage(conversationId, text);
      setState(() {
        _messages.add(ConversationMessage(role: MessageRole.assistant, content: reply));
        _isWaitingReply = false;
      });
    } catch (_) {
      setState(() {
        _messages.add(ConversationMessage(role: MessageRole.assistant, content: 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.'));
        _isWaitingReply = false;
      });
    }
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(_scrollController.position.maxScrollExtent, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isStarting) return const Center(child: CircularProgressIndicator());

    return Column(
      children: [
        Expanded(
          child: _messages.isEmpty
              ? const EmptyState(title: 'Trợ lý AI', body: 'Hỏi về doanh thu, tồn kho, hóa đơn chưa thanh toán, hoặc lịch đặt chỗ sắp tới.')
              : ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.all(16),
                  itemCount: _messages.length + (_isWaitingReply ? 1 : 0),
                  itemBuilder: (context, index) {
                    if (index == _messages.length) return const ChatTypingIndicator();
                    return ChatBubble(message: _messages[index]);
                  },
                ),
        ),
        ChatInput(onSend: _send, enabled: !_isWaitingReply),
      ],
    );
  }
}
