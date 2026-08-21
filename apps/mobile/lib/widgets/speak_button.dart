import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';

/// Speaker button for AI/onboarding text — "không cần đọc, bấm để nghe".
/// One control, one mental model: tap to speak; while speaking the same
/// button becomes stop. If the device has no Vietnamese TTS voice, the
/// tap says so honestly instead of doing nothing.
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
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Thiết bị chưa có giọng đọc Tiếng Việt. Vào Cài đặt → Ngôn ngữ và nhập → Đầu ra chuyển văn bản thành lời nói để cài giọng tiếng Việt.')),
        );
      }
      return;
    }
    if (tts.isSpeaking.value) {
      await tts.stop();
    } else {
      await tts.speak(widget.text);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tts = ref.read(ttsServiceProvider);
    return ValueListenableBuilder<bool>(
      valueListenable: tts.isSpeaking,
      builder: (context, speaking, _) => SizedBox(
        width: AppMetrics.minTouchTarget,
        height: AppMetrics.minTouchTarget,
        child: IconButton(
          onPressed: _toggle,
          tooltip: speaking ? 'Dừng đọc' : 'Đọc to',
          icon: Icon(speaking ? Icons.stop_circle_outlined : Icons.volume_up_outlined),
          color: speaking ? AppColors.destructive : AppColors.primary,
        ),
      ),
    );
  }
}
