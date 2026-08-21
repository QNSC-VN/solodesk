import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';

/// Text field + send button + the mic button (the slot reserved since v1,
/// now real — voice dictation v1). ChatGPT-style TAP-to-talk, not
/// hold-to-talk: elderly/shaky hands release too early; a toggle is one
/// confident tap either way. The live transcript fills the field as words
/// are heard and stays EDITABLE — dictation drafts the message, the user
/// still presses send themselves (the same "human presses the button"
/// boundary as every AI write in this product). If the device has no
/// recognizer (some emulators, de-Googled phones), the tap says so
/// honestly instead of doing nothing.
class ChatInput extends ConsumerStatefulWidget {
  final ValueChanged<String> onSend;
  final bool enabled;

  const ChatInput({super.key, required this.onSend, this.enabled = true});

  @override
  ConsumerState<ChatInput> createState() => _ChatInputState();
}

class _ChatInputState extends ConsumerState<ChatInput> {
  final _controller = TextEditingController();

  void _submit() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    widget.onSend(text);
    _controller.clear();
  }

  Future<void> _toggleMic() async {
    final stt = ref.read(sttServiceProvider);
    await stt.init();
    if (!stt.isAvailable.value) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Thiết bị này không có nhận diện giọng nói.')),
      );
      return;
    }
    if (stt.isListening.value) {
      await stt.stop();
      return;
    }
    // One audio channel at a time: if the phone is currently READING a
    // reply aloud, stop it before opening the mic, or the recognizer
    // transcribes the phone's own speaker.
    await ref.read(ttsServiceProvider).stop();
    await stt.start(
      onPartial: (words) {
        if (!mounted) return;
        // Keep the field as the single source of truth — partials replace
        // the dictation so far, never append to stale partials.
        _controller.value = TextEditingValue(
          text: words,
          selection: TextSelection.collapsed(offset: words.length),
        );
      },
      onFinal: (words) {
        if (!mounted || words.trim().isEmpty) return;
        _controller.value = TextEditingValue(
          text: words,
          selection: TextSelection.collapsed(offset: words.length),
        );
      },
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final stt = ref.read(sttServiceProvider);
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        decoration: const BoxDecoration(color: AppColors.card, border: Border(top: BorderSide(color: AppColors.border))),
        child: Row(
          children: [
            ValueListenableBuilder<bool>(
              valueListenable: stt.isListening,
              builder: (context, listening, _) => SizedBox(
                width: AppMetrics.minTouchTarget,
                height: AppMetrics.minTouchTarget,
                child: IconButton.filled(
                  onPressed: widget.enabled ? _toggleMic : null,
                  icon: Icon(listening ? Icons.stop_circle_outlined : Icons.mic),
                  tooltip: listening ? 'Dừng nghe' : 'Nói để nhập',
                  style: IconButton.styleFrom(
                    backgroundColor: listening ? AppColors.destructive : AppColors.primary,
                    foregroundColor: Colors.white,
                  ),
                ),
              ),
            ),
            Expanded(
              child: ValueListenableBuilder<bool>(
                valueListenable: stt.isListening,
                builder: (context, listening, _) => TextField(
                  controller: _controller,
                  enabled: widget.enabled,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _submit(),
                  decoration: InputDecoration(hintText: listening ? 'Đang nghe...' : 'Nhập hoặc bấm micro để nói...'),
                ),
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
