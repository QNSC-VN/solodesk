import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/resource.dart';
import '../state/providers.dart';
import '../services/api_error_message.dart';
import '../widgets/app_button.dart';
import '../widgets/app_text_field.dart';
import '../widgets/empty_state.dart';

/// Minimal resource management, ONE screen: the tenant's resources (what
/// the create-booking picker offers) plus an inline add form — a fresh
/// tourism tenant has no resources, and without a way to add one the whole
/// booking flow would be a dead end. Explicitly NOT here: edit,
/// deactivate, the mockup's capacity-reduction guard (backend has none of
/// these — YAGNI until it does).
class ResourcesScreen extends ConsumerStatefulWidget {
  const ResourcesScreen({super.key});

  @override
  ConsumerState<ResourcesScreen> createState() => _ResourcesScreenState();
}

class _ResourcesScreenState extends ConsumerState<ResourcesScreen> {
  late Future<List<Resource>> _future;
  final _name = TextEditingController();
  final _type = TextEditingController();
  final _capacity = TextEditingController();
  bool _isSubmitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _future = ref.read(bookingsServiceProvider).getResources();
  }

  @override
  void dispose() {
    _name.dispose();
    _type.dispose();
    _capacity.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    final future = ref.read(bookingsServiceProvider).getResources();
    setState(() => _future = future);
    await future;
  }

  Future<void> _submit() async {
    final name = _name.text.trim();
    final type = _type.text.trim();
    final capacity = int.tryParse(_capacity.text.trim()) ?? 0;
    if (name.isEmpty || type.isEmpty || capacity < 1) {
      setState(() => _error = 'Vui lòng nhập tên, loại và sức chứa (từ 1 trở lên).');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _error = null;
    });
    try {
      await ref.read(bookingsServiceProvider).createResource(name: name, resourceType: type, capacity: capacity);
      _name.clear();
      _type.clear();
      _capacity.clear();
      await _refresh();
      if (mounted) {
        setState(() => _isSubmitting = false);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Đã thêm tài nguyên.')));
      }
    } catch (e) {
      setState(() {
        _isSubmitting = false;
        _error = apiErrorMessage(e, 'Không thể thêm tài nguyên. Kiểm tra kết nối mạng.');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tài nguyên')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<Resource>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: EmptyState(
                  title: 'Không thể tải tài nguyên',
                  body: 'Kiểm tra kết nối mạng rồi thử lại.',
                  actionLabel: 'Thử lại',
                  onAction: _refresh,
                ),
              );
            }
            if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
            final resources = snapshot.data!;

            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (resources.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 8),
                    child: EmptyState(title: 'Chưa có tài nguyên', body: 'Tài nguyên là phòng, bàn, cano, tour... mà khách đặt chỗ.'),
                  ),
                for (final r in resources)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      title: Text(r.name),
                      subtitle: Text('${r.resourceType} · sức chứa ${r.capacity}'),
                    ),
                  ),
                const SizedBox(height: 16),
                Text('Thêm tài nguyên', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        AppTextField(label: 'Tên tài nguyên (VD: Cano 1)', controller: _name),
                        const SizedBox(height: 16),
                        AppTextField(label: 'Loại (phòng, bàn, cano, tour...)', controller: _type),
                        const SizedBox(height: 16),
                        AppTextField(label: 'Sức chứa (số chỗ)', controller: _capacity, keyboardType: TextInputType.number),
                        if (_error != null) ...[
                          const SizedBox(height: 12),
                          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                        ],
                        const SizedBox(height: 16),
                        AppButton(label: 'Thêm tài nguyên', onPressed: _submit, isLoading: _isSubmitting),
                      ],
                    ),
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
