import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/connector_status.dart';
import '../state/providers.dart';
import '../widgets/empty_state.dart';
import '../services/api_client.dart';
import '../theme/app_theme.dart';

/// Pushed from Home's quick action (`/home/connectors`). Read-only v1 —
/// shows the full 13-provider catalog and lets a tenant re-run a real
/// verify() check on an already-configured provider. Does NOT include a
/// "set credentials" form: entering a real API key is still done via
/// agent-orchestrator's conversational onboarding tool (`connect_sepay` and
/// friends), matching how the real system enters credentials today — see
/// CLAUDE.md's "Connector status v1" section for the full scope cut.
class ConnectorsScreen extends ConsumerStatefulWidget {
  const ConnectorsScreen({super.key});

  @override
  ConsumerState<ConnectorsScreen> createState() => _ConnectorsScreenState();
}

class _ConnectorsScreenState extends ConsumerState<ConnectorsScreen> {
  late Future<List<ConnectorStatus>> _future;
  final Set<String> _verifying = {};

  static const _labels = <String, String>{
    'sepay': 'SePay',
    'ghn': 'Giao Hàng Nhanh',
    'ghtk': 'Giao Hàng Tiết Kiệm',
    'shopee': 'Shopee',
    'tiktok_shop': 'TikTok Shop',
    'lazada': 'Lazada',
    'viettelpost': 'Viettel Post',
    'misa_meinvoice': 'MISA meInvoice',
    'viettel_sinvoice': 'Viettel S-Invoice',
    'vnpt_invoice': 'VNPT Invoice',
    'booking_com': 'Booking.com',
    'agoda': 'Agoda',
    'national_free_platform': 'Hóa đơn điện tử miễn phí (Tổng cục Thuế)',
  };

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<ConnectorStatus>> _load() => ref.read(connectorsServiceProvider).getStatus();

  Future<void> _refresh() async {
    final future = _load();
    setState(() => _future = future);
    await future;
  }

  Future<void> _verify(String provider) async {
    setState(() => _verifying.add(provider));
    try {
      final ok = await ref.read(connectorsServiceProvider).verify(provider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ok ? 'Kết nối hoạt động tốt' : 'Kết nối lỗi — kiểm tra lại thông tin đã cấu hình')));
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Không thể kiểm tra: ${e.body}')));
    } finally {
      if (mounted) setState(() => _verifying.remove(provider));
      await _refresh();
    }
  }

  String _formatDate(DateTime d) {
    final local = d.toLocal();
    return '${local.day}/${local.month}/${local.year} ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Kết nối')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<ConnectorStatus>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return EmptyState(title: 'Không thể tải danh sách kết nối', body: 'Kiểm tra kết nối mạng rồi thử lại.', actionLabel: 'Thử lại', onAction: _refresh);
            }
            if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
            final connectors = snapshot.data!;
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: connectors.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) => _ConnectorTile(
                status: connectors[index],
                label: _labels[connectors[index].provider] ?? connectors[index].provider,
                isVerifying: _verifying.contains(connectors[index].provider),
                onVerify: () => _verify(connectors[index].provider),
                formatDate: _formatDate,
              ),
            );
          },
        ),
      ),
    );
  }
}

class _ConnectorTile extends StatelessWidget {
  final ConnectorStatus status;
  final String label;
  final bool isVerifying;
  final VoidCallback onVerify;
  final String Function(DateTime) formatDate;

  const _ConnectorTile({required this.status, required this.label, required this.isVerifying, required this.onVerify, required this.formatDate});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(label, style: Theme.of(context).textTheme.titleMedium)),
                _statusChip(context),
              ],
            ),
            const SizedBox(height: 6),
            Text(_subtitle(), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.mutedForeground)),
            if (status.isConfigured && status.isImplemented) ...[
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: isVerifying ? null : onVerify,
                  child: isVerifying ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Kiểm tra kết nối'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _subtitle() {
    if (!status.isImplemented) return 'Chưa hỗ trợ trong hệ thống';
    if (!status.isConfigured) return 'Chưa cấu hình';
    if (!status.isActive) return 'Đã tắt';
    if (status.lastVerifiedAt == null) return 'Chưa từng kiểm tra kết nối';
    final when = formatDate(status.lastVerifiedAt!);
    return status.lastVerificationOk == true ? 'Kiểm tra gần nhất: $when — thành công' : 'Kiểm tra gần nhất: $when — lỗi';
  }

  Widget _statusChip(BuildContext context) {
    late final Color bg;
    late final Color fg;
    late final String text;
    if (!status.isImplemented) {
      bg = AppColors.muted;
      fg = AppColors.mutedForeground;
      text = 'Chưa hỗ trợ';
    } else if (!status.isConfigured) {
      bg = AppColors.muted;
      fg = AppColors.mutedForeground;
      text = 'Chưa cấu hình';
    } else if (status.isActive && status.lastVerificationOk == true) {
      bg = AppColors.secondary.withValues(alpha: 0.18);
      fg = const Color(0xFF166534);
      text = 'Hoạt động';
    } else if (status.isActive && status.lastVerificationOk == false) {
      bg = AppColors.destructive.withValues(alpha: 0.12);
      fg = AppColors.destructive;
      text = 'Lỗi';
    } else {
      bg = AppColors.accent.withValues(alpha: 0.18);
      fg = const Color(0xFF854D0E);
      text = status.isActive ? 'Chưa kiểm tra' : 'Đã tắt';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(text, style: TextStyle(color: fg, fontSize: 13, fontWeight: FontWeight.w600)),
    );
  }
}
