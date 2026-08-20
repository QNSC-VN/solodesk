import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/tax_estimate.dart';
import '../state/providers.dart';
import '../services/api_error_message.dart';
import '../widgets/app_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/choice_buttons.dart';
import '../widgets/empty_state.dart';
import '../theme/app_theme.dart';

/// Pushed from Home's quick action (`/home/tax`). The mockup's own quarterly
/// HKD tax estimate — real revenue, real exemption/rate math, a real filing
/// deadline and "đóng sổ kỳ" (close-the-quarter) action — ported at v1's
/// deliberately narrower scope (see CLAUDE.md's "Tax/filing v1" section for
/// the full list of what's cut: DN regime, per-SKU attribution, marketplace
/// withholding, S1a/S2a books, the b2g clock).
class TaxScreen extends ConsumerStatefulWidget {
  const TaxScreen({super.key});

  @override
  ConsumerState<TaxScreen> createState() => _TaxScreenState();
}

class _TaxScreenState extends ConsumerState<TaxScreen> {
  late Future<TaxEstimate> _future;
  bool _isBusy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<TaxEstimate> _load() => ref.read(taxServiceProvider).getEstimate();

  Future<void> _refresh() async {
    final future = _load();
    setState(() {
      _future = future;
      _error = null;
    });
    await future;
  }

  Future<void> _pickRateGroup(String code) async {
    setState(() {
      _isBusy = true;
      _error = null;
    });
    try {
      await ref.read(taxServiceProvider).setTaxGroupDefault(code);
      await _refresh();
      setState(() => _isBusy = false);
    } catch (e) {
      setState(() {
        _isBusy = false;
        _error = apiErrorMessage(e, 'Không thể lưu. Kiểm tra kết nối mạng.');
      });
    }
  }

  Future<void> _openFilingDialog(TaxEstimate estimate) async {
    final controller = TextEditingController();
    final receiptCode = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Nhập mã biên nhận, đóng sổ kỳ'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Quý ${estimate.quarter}/${estimate.year} — nộp trên cổng eTax Mobile trước, sau đó dán mã biên nhận vào đây.', style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 12),
            AppTextField(label: 'Mã biên nhận', controller: controller),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Huỷ')),
          FilledButton(
            onPressed: () {
              final value = controller.text.trim();
              if (value.isEmpty) return;
              Navigator.of(context).pop(value);
            },
            child: const Text('Lưu và đóng sổ'),
          ),
        ],
      ),
    );
    if (receiptCode == null) return;

    setState(() {
      _isBusy = true;
      _error = null;
    });
    try {
      await ref.read(taxServiceProvider).recordFiling(quarter: estimate.quarter, year: estimate.year, receiptCode: receiptCode);
      await _refresh();
      if (mounted) {
        setState(() => _isBusy = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Đã đóng sổ kỳ với mã $receiptCode.')));
      }
    } catch (e) {
      setState(() {
        _isBusy = false;
        _error = switch (apiErrorCode(e)) {
          'QUARTER_ALREADY_FILED' => 'Quý này đã được khai và đóng sổ trước đó.',
          _ => apiErrorMessage(e, 'Không thể lưu. Kiểm tra kết nối mạng.'),
        };
      });
    }
  }

  String _formatVnd(String amount) => '${double.tryParse(amount)?.toStringAsFixed(0) ?? amount} đ';

  String _formatDate(DateTime d) => '${d.day}/${d.month}/${d.year}';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Thuế & khai báo')),
      body: FutureBuilder<TaxEstimate>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return EmptyState(
              title: 'Không thể tải số liệu thuế',
              body: 'Kiểm tra kết nối mạng rồi thử lại.',
              actionLabel: 'Thử lại',
              onAction: _refresh,
            );
          }
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final estimate = snapshot.data!;

          if (estimate.rateGroup == null) return _buildSetup(context);
          return _buildEstimate(context, estimate);
        },
      ),
    );
  }

  Widget _buildSetup(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Chọn nhóm ngành nghề tính thuế', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text(
          'Chọn nhóm phù hợp nhất với hoạt động chính của hộ — dùng để tính thuế GTGT và TNCN ước tính theo quý.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.mutedForeground),
        ),
        const SizedBox(height: 20),
        ChoiceButtons(
          enabled: !_isBusy,
          options: kRateGroupOptions.map((o) => o.label).toList(),
          onSelect: (label) {
            final option = kRateGroupOptions.firstWhere((o) => o.label == label);
            _pickRateGroup(option.code);
          },
        ),
        if (_error != null) ...[
          const SizedBox(height: 16),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
      ],
    );
  }

  Widget _buildEstimate(BuildContext context, TaxEstimate estimate) {
    final daysRemaining = estimate.filingDeadline.difference(DateTime.now()).inDays;
    final isUrgent = !estimate.isFiled && daysRemaining <= 14;

    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (estimate.rateGroup!.isDraft)
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(color: AppColors.accent.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(AppMetrics.cardRadius)),
              child: Text(
                'Số liệu tạm tính, dùng biểu tỷ lệ bản nháp — cần đối chiếu văn bản hiện hành trước khi nộp.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.accent),
              ),
            ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Quý ${estimate.quarter}/${estimate.year} — ${estimate.rateGroup!.name}', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 12),
                  Text('Doanh thu: ${_formatVnd(estimate.revenue)}', style: Theme.of(context).textTheme.bodyLarge),
                  if (estimate.isExempt) ...[
                    const SizedBox(height: 4),
                    Text('Doanh thu luỹ kế năm chưa quá 200 triệu — miễn thuế GTGT và TNCN.', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.primary)),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _amountRow(context, 'Thuế GTGT', estimate.gtgt),
                  const SizedBox(height: 8),
                  _amountRow(context, 'Thuế TNCN', estimate.tncn),
                  const Divider(height: 24),
                  _amountRow(context, 'Tổng tạm tính', estimate.total, emphasize: true),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            color: isUrgent ? AppColors.destructive.withValues(alpha: 0.08) : null,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Hạn kê khai và nộp thuế', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(
                    estimate.isFiled
                        ? 'Đã đóng sổ kỳ này.'
                        : daysRemaining >= 0
                            ? 'Còn $daysRemaining ngày — hạn ${_formatDate(estimate.filingDeadline)}.'
                            : 'Đã quá hạn ${-daysRemaining} ngày — hạn ${_formatDate(estimate.filingDeadline)}.',
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: isUrgent ? AppColors.destructive : null, fontWeight: isUrgent ? FontWeight.w600 : null),
                  ),
                ],
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 20),
          if (!estimate.isFiled)
            AppButton(label: 'Nhập mã biên nhận, đóng sổ kỳ', isLoading: _isBusy, onPressed: () => _openFilingDialog(estimate)),
        ],
      ),
    );
  }

  Widget _amountRow(BuildContext context, String label, String amount, {bool emphasize = false}) {
    final style = emphasize ? Theme.of(context).textTheme.headlineSmall : Theme.of(context).textTheme.bodyLarge;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: Theme.of(context).textTheme.bodyMedium),
        Text(_formatVnd(amount), style: style),
      ],
    );
  }
}
