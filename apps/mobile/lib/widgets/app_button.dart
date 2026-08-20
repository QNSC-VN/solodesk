import 'package:flutter/material.dart';

enum AppButtonVariant { primary, secondary }

/// 48dp min height (Android real touch-target guidance, see
/// `design-system/solodesk/pages/mobile.md`) — comes from the theme's
/// `ElevatedButtonThemeData`/`OutlinedButtonThemeData`, this widget just
/// picks which one.
class AppButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final bool isLoading;

  const AppButton({super.key, required this.label, required this.onPressed, this.variant = AppButtonVariant.primary, this.isLoading = false});

  @override
  Widget build(BuildContext context) {
    final child = isLoading
        ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
        : Text(label);

    return variant == AppButtonVariant.primary
        ? ElevatedButton(onPressed: isLoading ? null : onPressed, child: child)
        : OutlinedButton(onPressed: isLoading ? null : onPressed, child: child);
  }
}
