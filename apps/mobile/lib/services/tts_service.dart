import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';

/// On-device text-to-speech (Android system TTS, `flutter_tts`) for the
/// elderly/non-technical audience — every AI/onboarding text can be HEARD,
/// not just read. Vietnamese voice availability varies by device (Google
/// TTS ships vi-VN voices on most GMS phones in Vietnam, but it is a
/// device-side install, not a guarantee), so [init] probes for any
/// Vietnamese voice and callers decide what to show when none exists —
/// the honest degradation, never a silent no-op button.
///
/// The public surface (init/speak/stop + reactive speaking state) is the
/// seam a future cloud-TTS adapter would implement — kept deliberately
/// small and free of flutter_tts types so that swap is mechanical, per
/// this repo's "don't abstract until the second case, but don't weld the
/// first one shut" discipline.
class TtsService {
  final FlutterTts _tts = FlutterTts();

  /// The text currently being spoken, null when idle. A single engine can
  /// only speak one thing at a time, so this one value disambiguates WHICH
  /// bubble's button shows the red stop state — `isSpeaking`-style bools
  /// made every button flip red together.
  final speakingText = ValueNotifier<String?>(null);
  final isVietnameseAvailable = ValueNotifier<bool>(false);

  /// The in-flight init, cached — a bool flag set before the awaits
  /// completes let a second concurrent caller race past an unloaded voice
  /// list and wrongly report "no Vietnamese voice".
  Future<void>? _initFuture;

  /// Slower than the default 1.0 — elderly listeners; Android's engine
  /// averages noticeably faster than iOS at the same rate.
  static const speechRate = 0.45;

  Future<void> init() {
    return _initFuture ??= () async {
      await _tts.setLanguage('vi-VN');
      await _tts.setSpeechRate(speechRate);
      _tts.setStartHandler(() {});
      _tts.setCompletionHandler(() => speakingText.value = null);
      _tts.setErrorHandler((_) => speakingText.value = null);
      _tts.setCancelHandler(() => speakingText.value = null);
      final voices = await _tts.getVoices;
      isVietnameseAvailable.value = voices is List &&
          voices.any((v) => v is Map && v['locale'] != null && (v['locale'] as String).toLowerCase().startsWith('vi'));
    }();
  }

  /// Speak [text], interrupting anything already being spoken (tapping a
  /// different bubble's button switches to that text — one engine, most
  /// recent request wins).
  Future<void> speak(String text) async {
    await init();
    if (!isVietnameseAvailable.value) return;
    await _tts.stop();
    speakingText.value = text;
    await _tts.speak(text);
  }

  Future<void> stop() async {
    if (_initFuture == null) return;
    await _tts.stop();
    speakingText.value = null;
  }

  void dispose() {
    speakingText.dispose();
    isVietnameseAvailable.dispose();
  }
}
