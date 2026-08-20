import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/expense.dart';
import '../state/providers.dart';
import '../services/api_error_message.dart';
import '../widgets/app_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/choice_buttons.dart';

/// Pushed from `ExpensesScreen`'s FAB. The mockup's own "Khoản chi" create
/// form: category, description, amount, documentation type (defaults to
/// "Không có" — an absent receipt is a real, common state, never
/// invented as present), optional supplier free text, personal-wallet
/// flag.
class ExpenseCreateScreen extends ConsumerStatefulWidget {
  const ExpenseCreateScreen({super.key});

  @override
  ConsumerState<ExpenseCreateScreen> createState() => _ExpenseCreateScreenState();
}

class _ExpenseCreateScreenState extends ConsumerState<ExpenseCreateScreen> {
  String? _category;
  final _description = TextEditingController();
  final _amount = TextEditingController();
  final _supplierName = TextEditingController();
  String _documentation = 'khong';
  bool _isPersonalWallet = false;
  bool _isSubmitting = false;
  String? _error;

  static const _documentationLabels = {'hoa-don': 'Hoá đơn', 'phieu-chi': 'Phiếu chi', 'khong': 'Không có'};

  @override
  void dispose() {
    _description.dispose();
    _amount.dispose();
    _supplierName.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final category = _category;
    final description = _description.text.trim();
    final amount = _amount.text.trim();
    if (category == null) {
      setState(() => _error = 'Vui lòng chọn loại chi phí.');
      return;
    }
    if (description.isEmpty) {
      setState(() => _error = 'Vui lòng nhập mô tả.');
      return;
    }
    if (amount.isEmpty || (double.tryParse(amount) ?? 0) <= 0) {
      setState(() => _error = 'Vui lòng nhập số tiền hợp lệ.');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _error = null;
    });
    try {
      await ref.read(expensesServiceProvider).recordExpense(
            category: category,
            description: description,
            amount: amount,
            documentation: _documentation,
            supplierName: _supplierName.text.trim(),
            isPersonalWallet: _isPersonalWallet,
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() {
        _isSubmitting = false;
        _error = apiErrorMessage(e, 'Không thể lưu. Kiểm tra kết nối mạng.');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ghi khoản chi')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Loại chi phí', style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              initialValue: _category,
              items: kExpenseCategoryOptions.map((o) => DropdownMenuItem(value: o.code, child: Text(o.label))).toList(),
              onChanged: (v) => setState(() => _category = v),
              hint: const Text('Chọn loại chi phí'),
            ),
            const SizedBox(height: 16),
            AppTextField(label: 'Mô tả', controller: _description),
            const SizedBox(height: 16),
            AppTextField(label: 'Số tiền', controller: _amount, keyboardType: const TextInputType.numberWithOptions(decimal: true)),
            const SizedBox(height: 16),
            AppTextField(label: 'Nhà cung cấp (không bắt buộc)', controller: _supplierName),
            const SizedBox(height: 16),
            Text('Chứng từ', style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            ChoiceButtons(
              options: _documentationLabels.values.toList(),
              onSelect: (label) {
                final code = _documentationLabels.entries.firstWhere((e) => e.value == label).key;
                setState(() => _documentation = code);
              },
            ),
            Text('Đã chọn: ${_documentationLabels[_documentation]}', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 8),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Trả từ tiền cá nhân'),
              value: _isPersonalWallet,
              onChanged: (v) => setState(() => _isPersonalWallet = v),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 24),
            AppButton(label: 'Lưu khoản chi', onPressed: _submit, isLoading: _isSubmitting),
          ],
        ),
      ),
    );
  }
}
