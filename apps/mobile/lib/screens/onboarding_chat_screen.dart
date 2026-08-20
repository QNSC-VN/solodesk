import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/conversation_message.dart';
import '../state/providers.dart';
import '../state/session_controller.dart';
import '../widgets/chat_bubble.dart';
import '../widgets/chat_typing_indicator.dart';
import '../widgets/chat_input.dart';

/// Full-screen chat, no bottom nav, no side chrome — nothing competes with
/// reading the AI's next question (`design-system/solodesk/pages/mobile.md`
/// — Mode 1). Wraps agent-orchestrator's real `mode: 'onboarding'`
/// conversation. After every assistant reply, re-checks the tenant's
/// `activatedAt` — once agent-orchestrator's `complete_onboarding` tool
/// sets it (the flow's real final step), `app_router.dart`'s redirect logic
/// takes the user to the home shell on its own; this screen doesn't parse
/// the assistant's reply text to guess completion.
class OnboardingChatScreen extends ConsumerStatefulWidget {
  const OnboardingChatScreen({super.key});

  @override
  ConsumerState<OnboardingChatScreen> createState() => _OnboardingChatScreenState();
}

class _OnboardingChatScreenState extends ConsumerState<OnboardingChatScreen> {
  final List<ConversationMessage> _messages = [];
  String? _conversationId;
  bool _isWaitingReply = false;
  bool _isStarting = true;
  String? _error;
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    try {
      final conversationId = await ref.read(conversationServiceProvider).start(mode: 'onboarding');
      setState(() {
        _conversationId = conversationId;
        _isStarting = false;
        _isWaitingReply = true;
      });
      // The first turn is a plain greeting — a real empty "kick-off"
      // message triggers it, matching agent-orchestrator's turn-0 shape.
      final reply = await ref.read(conversationServiceProvider).sendMessage(conversationId, 'Xin chào');
      setState(() {
        _messages.add(ConversationMessage(role: MessageRole.assistant, content: reply));
        _isWaitingReply = false;
      });
    } catch (_) {
      setState(() {
        _isStarting = false;
        _error = 'Không thể bắt đầu cuộc trò chuyện. Vui lòng thử lại.';
      });
    }
  }

  Future<void> _send(String text) async {
    final conversationId = _conversationId;
    if (conversationId == null) return;

    setState(() {
      _messages.add(ConversationMessage(role: MessageRole.user, content: text));
      _isWaitingReply = true;
      _error = null;
    });
    _scrollToBottom();

    try {
      final reply = await ref.read(conversationServiceProvider).sendMessage(conversationId, text);
      setState(() {
        _messages.add(ConversationMessage(role: MessageRole.assistant, content: reply));
        _isWaitingReply = false;
      });
      // Cheap re-check — flips SessionStatus.ready once complete_onboarding
      // has run; the router reacts to that on its own.
      await ref.read(sessionControllerProvider.notifier).refreshAfterOnboarding();
    } catch (_) {
      setState(() {
        _isWaitingReply = false;
        _error = 'Không thể gửi tin nhắn. Vui lòng thử lại.';
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
    return Scaffold(
      appBar: AppBar(title: const Text('Thiết lập tài khoản')),
      body: Column(
        children: [
          Expanded(
            child: _isStarting
                ? const Center(child: CircularProgressIndicator())
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
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          ChatInput(onSend: _send, enabled: !_isWaitingReply && !_isStarting),
        ],
      ),
    );
  }
}
