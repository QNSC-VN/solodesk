import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// One real number, one label, optional trend note — the Home tab's one
/// repeating shape (`design-system/solodesk/pages/mobile.md`: "one real
/// number per card, large type, no dense table on this persona's primary
/// surface").
class HomeSummaryCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color? accentColor;

  const HomeSummaryCard({super.key, required this.label, required this.value, required this.icon, this.accentColor});

  @override
  Widget build(BuildContext context) {
    final color = accentColor ?? AppColors.primary;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(AppMetrics.cardRadius)),
              child: Icon(icon, color: color),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.mutedForeground)),
                  const SizedBox(height: 2),
                  Text(value, style: Theme.of(context).textTheme.headlineSmall),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
