import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../theme/app_theme.dart';

/// One point per day, oldest first. `ui-ux-pro-max`'s own chart guidance
/// for "trend over time" data: a line chart, but explicitly NOT when
/// fewer than 4 points exist (a stat card is more honest there) — the
/// caller (`HomeTab`) only renders this widget once it has ≥4 real days
/// of order history, never a chart stretched thin over 1-2 real points.
class SalesTrendChart extends StatelessWidget {
  final List<double> dailyRevenue;
  final List<String> dayLabels;

  const SalesTrendChart({super.key, required this.dailyRevenue, required this.dayLabels});

  @override
  Widget build(BuildContext context) {
    final maxY = dailyRevenue.isEmpty ? 1.0 : (dailyRevenue.reduce((a, b) => a > b ? a : b) * 1.2).clamp(1.0, double.infinity);

    return SizedBox(
      height: 160,
      child: LineChart(
        LineChartData(
          minY: 0,
          maxY: maxY,
          gridData: const FlGridData(show: false),
          borderData: FlBorderData(show: false),
          titlesData: FlTitlesData(
            leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 24,
                getTitlesWidget: (value, meta) {
                  final index = value.toInt();
                  if (index < 0 || index >= dayLabels.length) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(dayLabels[index], style: const TextStyle(fontSize: 11, color: AppColors.mutedForeground)),
                  );
                },
              ),
            ),
          ),
          lineTouchData: LineTouchData(
            touchTooltipData: LineTouchTooltipData(
              getTooltipItems: (spots) => spots
                  .map((s) => LineTooltipItem('${s.y.toStringAsFixed(0)} đ', const TextStyle(color: AppColors.onPrimary, fontWeight: FontWeight.w600)))
                  .toList(),
            ),
          ),
          lineBarsData: [
            LineChartBarData(
              spots: [for (var i = 0; i < dailyRevenue.length; i++) FlSpot(i.toDouble(), dailyRevenue[i])],
              isCurved: true,
              color: AppColors.primary,
              barWidth: 3,
              dotData: const FlDotData(show: true),
              belowBarData: BarAreaData(show: true, color: AppColors.primary.withValues(alpha: 0.12)),
            ),
          ],
        ),
      ),
    );
  }
}
