import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';

/// Speaker button for AI/onboarding text — "không cần đọc, bấm để nghe".
/// Only the button whose text is CURRENTLY being spoken shows the red
/// stop state (the service tracks which text is live — one engine speaks
/// one thing at a time); tapping another bubble switches to it. If the
/// device has no Vietnamese TTS voice, the tap says so honestly instead
/// of doing nothing.
///
/// Assistant-bubble-only by design: the USER's own messages don't need
/// reading back to them.
class SpeakButton extends ConsumerStatefulWidget {
  final String text;
  const SpeakButton({super.key, required this.text});

  @override
  ConsumerState<SpeakButton> createState() => _SpeakButtonState();
}

class _SpeakButtonState extends ConsumerState<SpeakButton> {
  Future<void> _toggle() async {
    final tts = ref.read(ttsServiceProvider);
    await tts.init();
    if (!tts.isVietnameseAvailable.value) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Thiết bị chưa có giọng đọc Tiếng Việt. Vào Cài đặt → Ngôn ngữ và nhập → Đầu ra chuyển văn bản thành lời nói để cài giọng tiếng Việt.')),
      );
      return;
    }
    if (tts.speakingText.value == widget.text) {
      await tts.stop();
    } else {
      await tts.speak(widget.text);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tts = ref.read(ttsServiceProvider);
    return ValueListenableBuilder<String?>(
      valueListenable: tts.speakingText,
      builder: (context, speaking, _) {
        final isThisSpeaking = speaking == widget.text;
        return SizedBox(
          width: AppMetrics.minTouchTarget,
          height: AppMetrics.minTouchTarget,
          child: IconButton(
            onPressed: _toggle,
            tooltip: isThisSpeaking ? 'Dừng đọc' : 'Đọc to',
            icon: Icon(isThisSpeaking ? Icons.stop_circle_outlined : Icons.volume_up_outlined),
            color: isThisSpeaking ? AppColors.destructive : AppColors.primary,
          ),
        );
      },
    );
  }
}
