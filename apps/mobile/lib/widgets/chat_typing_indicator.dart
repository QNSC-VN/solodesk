import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// 3-dot pulse, shown while waiting on a real agent-orchestrator response
/// — never a bare spinner with no context (`design-system/solodesk/pages/
/// mobile.md`'s Motion section). Respects `MediaQuery.disableAnimations`
/// (OS-level reduced-motion) by rendering static dots instead of pulsing.
class ChatTypingIndicator extends StatefulWidget {
  const ChatTypingIndicator({super.key});

  @override
  State<ChatTypingIndicator> createState() => _ChatTypingIndicatorState();
}

class _ChatTypingIndicatorState extends State<ChatTypingIndicator> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;

    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.card,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(AppMetrics.cardRadius + 4),
        ),
        child: reduceMotion
            ? const _Dots(opacities: [1, 1, 1])
            : AnimatedBuilder(
                animation: _controller,
                builder: (context, _) {
                  double dotOpacity(int index) {
                    final t = (_controller.value * 3 - index) % 3;
                    return t < 1 ? (0.3 + 0.7 * (1 - (t - 0.5).abs() * 2).clamp(0, 1)) : 0.3;
                  }

                  return _Dots(opacities: [dotOpacity(0), dotOpacity(1), dotOpacity(2)]);
                },
              ),
      ),
    );
  }
}

class _Dots extends StatelessWidget {
  final List<double> opacities;
  const _Dots({required this.opacities});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: opacities
          .map((o) => Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: Opacity(opacity: o, child: Container(width: 8, height: 8, decoration: const BoxDecoration(color: AppColors.mutedForeground, shape: BoxShape.circle))),
              ))
          .toList(),
    );
  }
}
