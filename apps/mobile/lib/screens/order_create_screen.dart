import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../local/connectivity_service.dart';
import '../models/sku.dart';
import '../state/providers.dart';
import '../services/orders_service.dart';
import '../widgets/app_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/empty_state.dart';

/// Pushed from `OrdersTab`'s create action. A real, minimal counter-sale
/// flow: pick one SKU (server auto-picks the oldest available lot, FIFO,
/// same as every other single-line order path in this codebase), enter a
/// quantity, optionally a customer name. `unitPrice` is a local display
/// snapshot only (`PendingOrderLine`) — the real request backend-api
/// receives (built by `OrderSyncWorker`) only ever carries `skuId`/
/// `quantity`, so the server still snapshots its own current price,
/// exactly like every other order-creation caller.
///
/// `_submit()` writes locally first and returns immediately — no network
/// wait on the critical path (`OrdersService.createOrder`'s own doc
/// comment) — matching the CEO mockup's "Bán khi mất mạng" (sell while
/// offline) scenario. Sync happens in the background; the user is told
/// plainly which case they're in.
class OrderCreateScreen extends ConsumerStatefulWidget {
  const OrderCreateScreen({super.key});

  @override
  ConsumerState<OrderCreateScreen> createState() => _OrderCreateScreenState();
}

class _OrderCreateScreenState extends ConsumerState<OrderCreateScreen> {
  late Future<List<Sku>> _skusFuture;
  Sku? _selectedSku;
  final _quantity = TextEditingController(text: '1');
  final _customerName = TextEditingController();
  bool _isSubmitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _skusFuture = ref.read(skusServiceProvider).getSkus();
  }

  @override
  void dispose() {
    _quantity.dispose();
    _customerName.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final sku = _selectedSku;
    final quantity = _quantity.text.trim();
    if (sku == null) {
      setState(() => _error = 'Vui lòng chọn sản phẩm.');
      return;
    }
    if (quantity.isEmpty || (double.tryParse(quantity) ?? 0) <= 0) {
      setState(() => _error = 'Vui lòng nhập số lượng hợp lệ.');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _error = null;
    });
    try {
      await ref.read(ordersServiceProvider).createOrder(
        lines: [PendingOrderLine(skuId: sku.id, skuName: sku.name, unit: sku.unit, unitPrice: sku.unitPrice, quantity: quantity)],
        customerName: _customerName.text.trim(),
      );
      final isOnline = ref.read(connectivityProvider).valueOrNull ?? true;
      unawaited(ref.read(orderSyncWorkerProvider).drainPending());
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(isOnline ? 'Đã tạo đơn hàng — đang đồng bộ.' : 'Đã lưu — sẽ đồng bộ khi có mạng.'),
        ));
        Navigator.of(context).pop(true);
      }
    } catch (_) {
      setState(() {
        _isSubmitting = false;
        _error = 'Không thể lưu đơn hàng.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tạo đơn hàng')),
      body: FutureBuilder<List<Sku>>(
        future: _skusFuture,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return EmptyState(
              title: 'Không thể tải danh sách sản phẩm',
              body: 'Chưa có dữ liệu sản phẩm lưu sẵn trên máy. Kết nối mạng ít nhất một lần rồi thử lại.',
              actionLabel: 'Thử lại',
              onAction: () => setState(() => _skusFuture = ref.read(skusServiceProvider).getSkus()),
            );
          }
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final skus = snapshot.data!.where((s) => s.isActive).toList();
          if (skus.isEmpty) {
            return const EmptyState(title: 'Chưa có sản phẩm', body: 'Thêm sản phẩm ở Trợ lý AI hoặc trang quản lý trước khi tạo đơn hàng.');
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Sản phẩm', style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                DropdownButtonFormField<Sku>(
                  initialValue: _selectedSku,
                  items: skus.map((s) => DropdownMenuItem(value: s, child: Text('${s.name} (${s.unitPrice} đ/${s.unit})'))).toList(),
                  onChanged: (s) => setState(() => _selectedSku = s),
                  hint: const Text('Chọn sản phẩm'),
                ),
                const SizedBox(height: 16),
                AppTextField(label: 'Số lượng', controller: _quantity, keyboardType: const TextInputType.numberWithOptions(decimal: true)),
                const SizedBox(height: 16),
                AppTextField(label: 'Tên khách hàng (không bắt buộc)', controller: _customerName),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 24),
                AppButton(label: 'Xác nhận đơn hàng', onPressed: _submit, isLoading: _isSubmitting),
              ],
            ),
          );
        },
      ),
    );
  }
}
