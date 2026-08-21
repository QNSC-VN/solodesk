import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/compliance_document.dart';
import '../state/providers.dart';
import '../services/api_error_message.dart';
import '../widgets/app_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/empty_state.dart';
import '../widgets/status_badge.dart';
import '../theme/app_theme.dart';

/// "Hồ sơ để bán cho khách tổ chức" (mockup's Kho-tab card, now its own
/// screen): the tenant's compliance documents with DERIVED status chips
/// (Chưa có / Hết hạn / Còn n ngày / Còn hạn), the "N mục chưa đủ" header
/// count, an inline add card, and per-doc edit (pushed) / delete. Renewal
/// is simply editing the expiry date — the mockup has no separate renewal
/// flow either, and this screen doesn't invent one.
class ComplianceScreen extends ConsumerStatefulWidget {
  const ComplianceScreen({super.key});

  @override
  ConsumerState<ComplianceScreen> createState() => _ComplianceScreenState();
}

class _ComplianceScreenState extends ConsumerState<ComplianceScreen> {
  late Future<List<ComplianceDocument>> _future;

  @override
  void initState() {
    super.initState();
    _future = ref.read(complianceServiceProvider).getDocuments();
  }

  Future<void> _refresh() async {
    final future = ref.read(complianceServiceProvider).getDocuments();
    setState(() => _future = future);
    await future;
  }

  StatusBadge _statusBadge(ComplianceDocument d) => switch (d.status) {
        'missing' => const StatusBadge(status: 'cancelled', label: 'Chưa có'),
        'expired' => const StatusBadge(status: 'cancelled', label: 'Hết hạn'),
        'expiring' => StatusBadge(status: 'pending', label: d.daysRemaining != null ? 'Còn ${d.daysRemaining} ngày' : 'Sắp hết hạn'),
        _ => const StatusBadge(status: 'confirmed', label: 'Còn hạn'),
      };

  Future<void> _confirmDelete(ComplianceDocument d) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Xoá "${d.docType}"?'),
        content: const Text('Bản ghi giấy tờ này sẽ bị xoá khỏi danh sách.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Không')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Xoá')),
        ],
      ),
    );
    if (yes != true) return;
    try {
      await ref.read(complianceServiceProvider).deleteDocument(d.id);
      await _refresh();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e, 'Không thể xoá. Kiểm tra kết nối mạng.'))));
      }
    }
  }

  void _openEdit(ComplianceDocument d) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => _EditDocumentScreen(existing: d, onSaved: _refresh),
        fullscreenDialog: true,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Hồ sơ giấy tờ')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<ComplianceDocument>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: EmptyState(
                  title: 'Không thể tải hồ sơ',
                  body: 'Kiểm tra kết nối mạng rồi thử lại.',
                  actionLabel: 'Thử lại',
                  onAction: _refresh,
                ),
              );
            }
            if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
            final docs = snapshot.data!;
            final incomplete = docs.isNotEmpty ? docs.first.incompleteCount : 0;

            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (docs.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 8),
                    child: EmptyState(
                      title: 'Chưa có giấy tờ nào',
                      body: 'Thêm giấy chứng nhận ATTP, đăng kiểm, tự công bố sản phẩm... để theo dõi hạn.',
                    ),
                  ),
                if (docs.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      incomplete > 0 ? 'Có $incomplete mục chưa đủ' : 'Đủ giấy tờ cần thiết',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            color: incomplete > 0 ? AppColors.destructive : AppColors.secondary,
                          ),
                    ),
                  ),
                for (final d in docs)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(child: Text(d.docType, style: Theme.of(context).textTheme.titleMedium)),
                                _statusBadge(d),
                              ],
                            ),
                            const SizedBox(height: 4),
                            if (d.documentNumber != null || d.expiresOn != null)
                              Text(
                                [
                                  if (d.documentNumber != null) 'Số ${d.documentNumber}',
                                  if (d.expiresOn != null) 'Hết hạn ${d.expiresOn}',
                                ].join(' · '),
                                style: Theme.of(context).textTheme.bodyMedium,
                              ),
                            if (d.isMandatory)
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Text('Bắt buộc', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.accent, fontWeight: FontWeight.w600)),
                              ),
                            if (d.notes != null && d.notes!.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text(d.notes!, style: Theme.of(context).textTheme.bodySmall),
                              ),
                            Align(
                              alignment: Alignment.centerRight,
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  TextButton(onPressed: () => _openEdit(d), child: const Text('Sửa')),
                                  TextButton(
                                    onPressed: () => _confirmDelete(d),
                                    child: Text('Xoá', style: TextStyle(color: Theme.of(context).colorScheme.error)),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                const SizedBox(height: 8),
                Text('Thêm giấy tờ', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                _AddDocumentCard(onSaved: _refresh),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// ONE shared field-set widget — the inline add card and the pushed edit
/// screen are the same fields, pre-filled only when `existing` is given.
/// Submit behavior differs (create vs patch), so the submit button lives
/// with each caller... no — simpler and still one shape: this widget owns
/// the submit too, branching on `existing`.
class _DocumentForm extends ConsumerStatefulWidget {
  final ComplianceDocument? existing;
  final VoidCallback onSaved;
  final VoidCallback? onDone;

  const _DocumentForm({required this.existing, required this.onSaved, this.onDone});

  @override
  ConsumerState<_DocumentForm> createState() => _DocumentFormState();
}

class _DocumentFormState extends ConsumerState<_DocumentForm> {
  late final TextEditingController _docType;
  late final TextEditingController _number;
  late final TextEditingController _notes;
  late DateTime? _issuedOn;
  late DateTime? _expiresOn;
  late bool _mandatory;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final d = widget.existing;
    _docType = TextEditingController(text: d?.docType ?? '');
    _number = TextEditingController(text: d?.documentNumber ?? '');
    _notes = TextEditingController(text: d?.notes ?? '');
    _issuedOn = d?.issuedOn != null ? DateTime.parse('${d!.issuedOn}T00:00:00Z') : null;
    _expiresOn = d?.expiresOn != null ? DateTime.parse('${d!.expiresOn}T00:00:00Z') : null;
    _mandatory = d?.isMandatory ?? false;
  }

  @override
  void dispose() {
    _docType.dispose();
    _number.dispose();
    _notes.dispose();
    super.dispose();
  }

  String? get _isoIssued => _issuedOn == null ? null : _iso(_issuedOn!);
  String? get _isoExpires => _expiresOn == null ? null : _iso(_expiresOn!);

  String _iso(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _submit() async {
    final docType = _docType.text.trim();
    if (docType.isEmpty) {
      setState(() => _error = 'Vui lòng nhập tên giấy tờ.');
      return;
    }
    setState(() { _submitting = true; _error = null; });
    final service = ref.read(complianceServiceProvider);
    try {
      final existing = widget.existing;
      if (existing == null) {
        await service.createDocument(
          docType: docType,
          documentNumber: _number.text.trim(),
          issuedOn: _isoIssued,
          expiresOn: _isoExpires,
          isMandatory: _mandatory,
          notes: _notes.text.trim(),
        );
        _docType.clear();
        _number.clear();
        _notes.clear();
        setState(() { _issuedOn = null; _expiresOn = null; _mandatory = false; });
      } else {
        await service.updateDocument(existing.id, {
          'docType': docType,
          'documentNumber': _number.text.trim(),
          'issuedOn': _isoIssued,
          'expiresOn': _isoExpires,
          'isMandatory': _mandatory,
          'notes': _notes.text.trim(),
        });
      }
      widget.onSaved();
      if (mounted) {
        setState(() => _submitting = false);
        widget.onDone?.call();
      }
    } catch (e) {
      setState(() { _submitting = false; _error = apiErrorMessage(e, 'Không thể lưu. Kiểm tra kết nối mạng.'); });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppTextField(label: 'Tên giấy tờ (VD: Giấy ATTP)', controller: _docType),
        const SizedBox(height: 16),
        AppTextField(label: 'Số giấy tờ (bỏ trống nếu chưa có)', controller: _number),
        const SizedBox(height: 16),
        _DateField(label: 'Ngày cấp', value: _issuedOn, onChanged: (d) => setState(() => _issuedOn = d)),
        const SizedBox(height: 16),
        _DateField(label: 'Ngày hết hạn', value: _expiresOn, onChanged: (d) => setState(() => _expiresOn = d)),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Bắt buộc để bán cho khách tổ chức'),
          value: _mandatory,
          onChanged: (v) => setState(() => _mandatory = v),
        ),
        AppTextField(label: 'Ghi chú (không bắt buộc)', controller: _notes),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        const SizedBox(height: 16),
        AppButton(label: widget.existing == null ? 'Thêm giấy tờ' : 'Lưu', onPressed: _submit, isLoading: _submitting),
      ],
    );
  }
}

class _AddDocumentCard extends StatelessWidget {
  final VoidCallback onSaved;
  const _AddDocumentCard({required this.onSaved});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: _DocumentForm(existing: null, onSaved: onSaved),
      ),
    );
  }
}

class _EditDocumentScreen extends StatelessWidget {
  final ComplianceDocument existing;
  final VoidCallback onSaved;
  const _EditDocumentScreen({required this.existing, required this.onSaved});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sửa giấy tờ')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: _DocumentForm(
          existing: existing,
          onSaved: onSaved,
          onDone: () => Navigator.of(context).pop(),
        ),
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  final String label;
  final DateTime? value;
  final ValueChanged<DateTime?> onChanged;

  const _DateField({required this.label, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () async {
        final picked = await showDatePicker(
          context: context,
          initialDate: value ?? DateTime.now(),
          firstDate: DateTime(2000),
          lastDate: DateTime(2100),
        );
        if (picked != null) onChanged(picked);
      },
      borderRadius: BorderRadius.circular(8),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          prefixIcon: Icon(Icons.calendar_today),
          border: OutlineInputBorder(),
        ),
        child: Text(
          value != null ? '${value!.day}/${value!.month}/${value!.year}' : 'Chọn ngày',
          style: Theme.of(context).textTheme.bodyLarge,
        ),
      ),
    );
  }
}
