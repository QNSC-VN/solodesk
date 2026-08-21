import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/expense.dart';
import '../state/providers.dart';
import '../widgets/empty_state.dart';
import '../theme/app_theme.dart';
import '../utils/format.dart';

/// Pushed from Home's quick action (`/home/expenses`). Real spend this
/// month — total, per-category breakdown, and two real compliance flags
/// (no-documentation spend, personal-wallet spend), the mockup's own
/// "Khoản chi" screen (NOT the separate, static "Chi phí của tôi"
/// program-fee roadmap — see CLAUDE.md's "Expense domain" section).
class ExpensesScreen extends ConsumerStatefulWidget {
  const ExpensesScreen({super.key});

  @override
  ConsumerState<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends ConsumerState<ExpensesScreen> {
  late Future<_ExpensesData> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_ExpensesData> _load() async {
    final service = ref.read(expensesServiceProvider);
    final results = await Future.wait([service.getExpenses(), service.getSummary()]);
    return _ExpensesData(expenses: results[0] as List<Expense>, summary: results[1] as ExpenseSummary);
  }

  Future<void> _refresh() async {
    final future = _load();
    setState(() => _future = future);
    await future;
  }


  String formatDate(DateTime d) {
    final local = d.toLocal();
    return '${local.day}/${local.month}/${local.year}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Khoản chi')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final created = await context.push<bool>('/home/expenses/new');
          if (!mounted) return;
          if (created == true) _refresh();
        },
        icon: const Icon(Icons.add),
        label: const Text('Ghi khoản chi'),
        backgroundColor: AppColors.accent,
        foregroundColor: AppColors.onAccent,
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<_ExpensesData>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return EmptyState(title: 'Không thể tải khoản chi', body: 'Kiểm tra kết nối mạng rồi thử lại.', actionLabel: 'Thử lại', onAction: _refresh);
            }
            if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
            final data = snapshot.data!;
            final summary = data.summary;

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 88), // clears the FAB
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Chi tháng này: ${formatVnd(summary.total)}', style: Theme.of(context).textTheme.titleLarge),
                        const SizedBox(height: 4),
                        Text('${summary.count} khoản chi', style: Theme.of(context).textTheme.bodyMedium),
                        if (double.tryParse(summary.noDocumentationTotal) != null && double.parse(summary.noDocumentationTotal) > 0) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Không có chứng từ: ${formatVnd(summary.noDocumentationTotal)} — sẽ không được khấu trừ khi lên doanh nghiệp.',
                            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.accent),
                          ),
                        ],
                        if (double.tryParse(summary.personalWalletTotal) != null && double.parse(summary.personalWalletTotal) > 0) ...[
                          const SizedBox(height: 4),
                          Text(
                            'Trả từ tiền cá nhân: ${formatVnd(summary.personalWalletTotal)}',
                            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.mutedForeground),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                if (summary.byCategory.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text('Theo loại', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  for (final cat in summary.byCategory)
                    Card(
                      margin: const EdgeInsets.only(bottom: 6),
                      child: ListTile(
                        dense: true,
                        title: Text(expenseCategoryLabel(cat.category)),
                        trailing: Text(formatVnd(cat.total)),
                      ),
                    ),
                ],
                const SizedBox(height: 20),
                Text('Lịch sử', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                if (data.expenses.isEmpty)
                  const EmptyState(title: 'Chưa có khoản chi', body: 'Khoản chi sẽ hiển thị ở đây sau khi ghi.')
                else
                  for (final expense in data.expenses)
                    Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        title: Text(expense.description),
                        subtitle: Text('${expenseCategoryLabel(expense.category)} · ${formatDate(expense.spentAt)}'),
                        trailing: Text(formatVnd(expense.amount), style: Theme.of(context).textTheme.titleMedium),
                      ),
                    ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ExpensesData {
  final List<Expense> expenses;
  final ExpenseSummary summary;
  _ExpensesData({required this.expenses, required this.summary});
}
