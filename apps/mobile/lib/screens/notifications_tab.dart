import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/app_notification.dart';
import '../state/providers.dart';
import '../widgets/empty_state.dart';
import '../theme/app_theme.dart';

class NotificationsTab extends ConsumerStatefulWidget {
  const NotificationsTab({super.key});

  @override
  ConsumerState<NotificationsTab> createState() => _NotificationsTabState();
}

class _NotificationsTabState extends ConsumerState<NotificationsTab> {
  late Future<List<AppNotification>> _future;

  @override
  void initState() {
    super.initState();
    _future = ref.read(notificationsServiceProvider).getNotifications();
  }

  Future<void> _refresh() async {
    final future = ref.read(notificationsServiceProvider).getNotifications();
    setState(() => _future = future);
    await future;
  }

  Future<void> _markRead(String id) async {
    await ref.read(notificationsServiceProvider).markRead(id);
    await _refresh();
  }

  Future<void> _markAllRead() async {
    await ref.read(notificationsServiceProvider).markAllRead();
    await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<List<AppNotification>>(
        future: _future,
        builder: (context, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final notifications = snapshot.data!;
          if (notifications.isEmpty) {
            return const SingleChildScrollView(
              physics: AlwaysScrollableScrollPhysics(),
              child: EmptyState(title: 'Chưa có thông báo', body: 'Thông báo mới sẽ hiển thị ở đây.'),
            );
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(onPressed: _markAllRead, child: const Text('Đánh dấu đã đọc tất cả')),
              ),
              ...notifications.map((n) => Card(
                    color: n.isRead ? null : AppColors.primary.withValues(alpha: 0.05),
                    child: ListTile(
                      title: Text(n.title, style: TextStyle(fontWeight: n.isRead ? FontWeight.normal : FontWeight.w700)),
                      subtitle: Text(n.body),
                      trailing: n.isRead ? null : const Icon(Icons.circle, size: 10, color: AppColors.accent),
                      onTap: n.isRead ? null : () => _markRead(n.id),
                    ),
                  )),
            ],
          );
        },
      ),
    );
  }
}
