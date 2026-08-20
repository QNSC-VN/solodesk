import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Generative UI's "choice" step widget — tappable buttons for a closed,
/// small option set (research backing this: quick-reply buttons beat free
/// text at the start of a flow, especially for non-technical/elderly
/// users — see CLAUDE.md's "Onboarding — structured input widgets"
/// section). A `Wrap`, never a clipped single row or a horizontally
/// scrolling list — `ui-ux-pro-max`'s own chip-collection-reflow rule:
/// labels must stay whole, never truncate.
class ChoiceButtons extends StatelessWidget {
  final List<String> options;
  final ValueChanged<String> onSelect;
  final bool enabled;

  const ChoiceButtons({super.key, required this.options, required this.onSelect, this.enabled = true});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppMetrics.touchSpacing,
      runSpacing: AppMetrics.touchSpacing,
      children: options
          .map(
            (option) => Semantics(
              button: true,
              label: option,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: AppMetrics.minTouchTarget),
                child: OutlinedButton(
                  onPressed: enabled ? () => onSelect(option) : null,
                  style: OutlinedButton.styleFrom(backgroundColor: AppColors.card),
                  child: Text(option),
                ),
              ),
            ),
          )
          .toList(),
    );
  }
}
