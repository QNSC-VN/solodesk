import 'package:flutter/foundation.dart';
import 'package:speech_to_text/speech_to_text.dart';

/// On-device speech-to-text (Android's Google recognizer via
/// `speech_to_text`) for ChatGPT-style dictation in the chat input. Tap
/// the mic to start, tap again to stop; partial transcripts stream into
/// the text field so the user SEES and can EDIT what was heard before
/// sending — the transcript is never auto-sent, same "the human presses
/// the button" boundary as every AI write in this product.
///
/// Honest limits, stated here because they matter for support: the
/// recognizer is the DEVICE's own (quality varies by phone; GMS phones in
/// Vietnam generally recognize vi-VN well), it is effectively
/// online-only, and Android emulators often lack a recognizer entirely —
/// real-device verification is the only meaningful test. If field accents
/// defeat it, the documented v2 path is a Whisper endpoint on
/// ml-analytics (docs Section 8's own named plan).
class SttService {
  final SpeechToText _stt = SpeechToText();

  final isListening = ValueNotifier<bool>(false);
  final isAvailable = ValueNotifier<bool>(false);

  Future<void>? _initFuture;

  /// Future-cached, not bool-flagged — two rapid callers must not race the
  /// recognizer probe (a bool set before the await lets the second caller
  /// read a not-yet-resolved availability).
  Future<void> init() {
    return _initFuture ??= () async {
      try {
        isAvailable.value = await _stt.initialize(onError: (_) {}, onStatus: (s) => isListening.value = s == 'listening');
      } catch (_) {
        isAvailable.value = false; // no recognizer on this device/emulator
      }
    }();
  }

  /// Starts dictation. [onPartial] fires continuously as words are heard
  /// (the input field shows the live transcript); [onFinal] fires once
  /// when the recognizer settles a phrase — same text, one authoritative
  /// copy.
  Future<void> start({required ValueChanged<String> onPartial, required ValueChanged<String> onFinal}) async {
    await init();
    if (!isAvailable.value || isListening.value) return;
    await _stt.listen(
      onResult: (result) {
        if (result.finalResult) {
          onFinal(result.recognizedWords);
        } else {
          onPartial(result.recognizedWords);
        }
      },
      listenOptions: SpeechListenOptions(
        localeId: 'vi_VN',
        partialResults: true,
        cancelOnError: true,
        autoPunctuation: true,
      ),
    );
  }

  Future<void> stop() async {
    if (_initFuture == null) return;
    await _stt.stop();
    isListening.value = false;
  }
}
