import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'app_button.dart';

/// Never a blank screen — same rule as the web apps' `EmptyState` component.
class EmptyState extends StatelessWidget {
  final String title;
  final String body;
  final String? actionLabel;
  final VoidCallback? onAction;

  const EmptyState({super.key, required this.title, required this.body, this.actionLabel, this.onAction});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 64),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.inbox_outlined, size: 48, color: AppColors.border),
          const SizedBox(height: 16),
          Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text(body, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.mutedForeground)),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 20),
            AppButton(label: actionLabel!, onPressed: onAction),
          ],
        ],
      ),
    );
  }
}
