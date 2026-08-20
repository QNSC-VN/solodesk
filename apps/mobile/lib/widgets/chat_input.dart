import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Text field + send button + a reserved mic-button slot (hidden in v1 —
/// voice input is a documented v2 cut, see `design-system/solodesk/pages/
/// mobile.md`) so wiring real voice later doesn't require a layout rework.
class ChatInput extends StatefulWidget {
  final ValueChanged<String> onSend;
  final bool enabled;

  const ChatInput({super.key, required this.onSend, this.enabled = true});

  @override
  State<ChatInput> createState() => _ChatInputState();
}

class _ChatInputState extends State<ChatInput> {
  final _controller = TextEditingController();

  void _submit() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    widget.onSend(text);
    _controller.clear();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        decoration: const BoxDecoration(color: AppColors.card, border: Border(top: BorderSide(color: AppColors.border))),
        child: Row(
          children: [
            // Reserved mic-button slot — see class doc comment.
            const SizedBox(width: AppMetrics.minTouchTarget, height: AppMetrics.minTouchTarget),
            Expanded(
              child: TextField(
                controller: _controller,
                enabled: widget.enabled,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _submit(),
                decoration: const InputDecoration(hintText: 'Nhập câu trả lời...'),
              ),
            ),
            const SizedBox(width: AppMetrics.touchSpacing),
            SizedBox(
              width: AppMetrics.minTouchTarget,
              height: AppMetrics.minTouchTarget,
              child: IconButton.filled(
                onPressed: widget.enabled ? _submit : null,
                icon: const Icon(Icons.send),
                style: IconButton.styleFrom(backgroundColor: AppColors.accent, foregroundColor: AppColors.onAccent),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
