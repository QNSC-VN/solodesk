import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/conversation_message.dart';
import '../models/step_descriptor.dart';
import '../state/providers.dart';
import '../state/session_controller.dart';
import '../widgets/chat_bubble.dart';
import '../widgets/chat_typing_indicator.dart';
import '../widgets/chat_input.dart';
import '../widgets/choice_buttons.dart';
import '../widgets/step_form.dart';

/// Full-screen chat, no bottom nav, no side chrome — nothing competes with
/// reading the AI's next question (`design-system/solodesk/pages/mobile.md`
/// — Mode 1). Wraps agent-orchestrator's real `mode: 'onboarding'`
/// conversation.
///
/// **Generative UI**: the assistant's reply carries an optional `step`
/// descriptor (`present_step` tool, agent-orchestrator) declaring which
/// input widget to render for the CURRENT question — closed-choice
/// questions (industry, SePay yes/no) render as tappable buttons, the
/// product step renders as a small form, and only genuinely open-ended
/// answers (business name, SePay token) fall back to free text. This
/// replaced a single free-text box for every question after real user-
/// research feedback that closed questions belong on buttons, not typed,
/// especially for this elderly/non-technical audience — see CLAUDE.md.
///
/// After every assistant reply, re-checks the tenant's `activatedAt` —
/// once agent-orchestrator's `complete_onboarding` tool sets it,
/// `app_router.dart`'s redirect logic takes the user to the home shell on
/// its own; this screen doesn't parse the assistant's reply text to guess
/// completion.
class OnboardingChatScreen extends ConsumerStatefulWidget {
  const OnboardingChatScreen({super.key});

  @override
  ConsumerState<OnboardingChatScreen> createState() => _OnboardingChatScreenState();
}

class _OnboardingChatScreenState extends ConsumerState<OnboardingChatScreen> {
  final List<ConversationMessage> _messages = [];
  String? _conversationId;
  StepDescriptor? _currentStep;
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
      await _sendRaw('Xin chào');
    } catch (_) {
      setState(() {
        _isStarting = false;
        _error = 'Không thể bắt đầu cuộc trò chuyện. Vui lòng thử lại.';
      });
    }
  }

  Future<void> _send(String text) async {
    setState(() {
      _messages.add(ConversationMessage(role: MessageRole.user, content: text));
      _currentStep = null;
    });
    _scrollToBottom();
    await _sendRaw(text);
  }

  /// The form step's own submit — builds a human-readable chat bubble
  /// from each field's display label (never the raw `key=value` wire
  /// string a real user shouldn't see) alongside the actual wire message
  /// agent-orchestrator parses.
  Future<void> _submitForm(List<StepField> fields, Map<String, String> values) async {
    final display = fields.map((f) => '${f.label}: ${values[f.name] ?? ''}').join('\n');
    final wire = fields.map((f) => '${f.name}=${values[f.name] ?? ''}').join('; ');
    setState(() {
      _messages.add(ConversationMessage(role: MessageRole.user, content: display));
      _currentStep = null;
    });
    _scrollToBottom();
    await _sendRaw(wire);
  }

  Future<void> _sendRaw(String text) async {
    final conversationId = _conversationId;
    if (conversationId == null) return;

    setState(() {
      _isWaitingReply = true;
      _error = null;
    });

    try {
      final result = await ref.read(conversationServiceProvider).sendMessage(conversationId, text);
      setState(() {
        _messages.add(ConversationMessage(role: MessageRole.assistant, content: result.assistantMessage));
        _currentStep = result.step;
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

  /// The active input widget for the current step — buttons/form for
  /// closed-choice steps, free text otherwise (including when the model
  /// omits `step`, e.g. the final summary turn needs no further input).
  Widget _buildActiveInput() {
    final step = _currentStep;
    if (_isWaitingReply || step == null) {
      return ChatInput(onSend: _send, enabled: !_isWaitingReply);
    }

    switch (step.inputType) {
      case StepInputType.choice:
        return Padding(
          padding: const EdgeInsets.all(16),
          child: ChoiceButtons(options: step.options ?? [], onSelect: _send),
        );
      case StepInputType.form:
        final fields = step.fields ?? [];
        return Padding(
          padding: const EdgeInsets.all(16),
          child: StepForm(fields: fields, onSubmit: (values) => _submitForm(fields, values)),
        );
      case StepInputType.text:
        return ChatInput(onSend: _send, enabled: true);
    }
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
          if (!_isStarting) _buildActiveInput(),
        ],
      ),
    );
  }
}
