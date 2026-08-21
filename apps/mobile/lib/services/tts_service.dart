import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';

/// On-device text-to-speech (Android system TTS, `flutter_tts`) for the
/// elderly/non-technical audience — every AI/onboarding text can be HEARD,
/// not just read. Vietnamese voice availability varies by device (Google
/// TTS ships vi-VN voices on most GMS phones in Vietnam, but it is a
/// device-side install, not a guarantee), so [init] probes for any
/// Vietnamese voice and callers decide what to show when none exists —
/// the honest degradation, never a silent no-op button.
class TtsService {
  final FlutterTts _tts = FlutterTts();

  /// Reactive for UI (a speaking toggle that flips to a stop button).
  final isSpeaking = ValueNotifier<bool>(false);
  final isVietnameseAvailable = ValueNotifier<bool>(false);

  bool _initialized = false;

  /// Slower than the default 1.0 — elderly listeners; Android's engine
  /// averages noticeably faster than iOS at the same rate.
  static const speechRate = 0.45;

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;
    await _tts.setLanguage('vi-VN');
    await _tts.setSpeechRate(speechRate);
    _tts.setStartHandler(() => isSpeaking.value = true);
    _tts.setCompletionHandler(() => isSpeaking.value = false);
    _tts.setErrorHandler((_) => isSpeaking.value = false);
    _tts.setCancelHandler(() => isSpeaking.value = false);
    final voices = await _tts.getVoices;
    isVietnameseAvailable.value = voices is List &&
        voices.any((v) => v is Map && v['locale'] != null && (v['locale'] as String).toLowerCase().startsWith('vi'));
  }

  /// Speak [text], interrupting anything already being spoken (the button
  /// doubles as stop/replay — one control, one mental model).
  Future<void> speak(String text) async {
    await init();
    if (!isVietnameseAvailable.value) return;
    await _tts.stop();
    await _tts.speak(text);
  }

  Future<void> stop() async {
    if (!_initialized) return;
    await _tts.stop();
    isSpeaking.value = false;
  }

  void dispose() {
    isSpeaking.dispose();
    isVietnameseAvailable.dispose();
  }
}
