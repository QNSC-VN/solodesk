import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/customer_message.dart';
import '../state/providers.dart';
import '../widgets/empty_state.dart';
import '../widgets/status_badge.dart';
import '../theme/app_theme.dart';

/// The customer inbox ("Hội thoại với khách") — a FLAT message list, newest
/// first, no threads (the mockup's own shape). "Unread" == not yet replied:
/// an unanswered row is highlighted and carries a gold "Chưa trả lời" badge.
/// Online-only by the app's documented cut — error state with retry.
class MessagesScreen extends ConsumerStatefulWidget {
  const MessagesScreen({super.key});

  @override
  ConsumerState<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends ConsumerState<MessagesScreen> {
  late Future<List<CustomerMessage>> _future;

  @override
  void initState() {
    super.initState();
    _future = ref.read(messagesServiceProvider).getMessages();
  }

  Future<void> _refresh() async {
    final future = ref.read(messagesServiceProvider).getMessages();
    setState(() => _future = future);
    await future;
  }

  String _fmt(DateTime dt) {
    final local = dt.toLocal();
    return '${local.day}/${local.month}/${local.year} ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tin nhắn khách')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<CustomerMessage>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: EmptyState(
                  title: 'Không thể tải tin nhắn',
                  body: 'Kiểm tra kết nối mạng rồi thử lại.',
                  actionLabel: 'Thử lại',
                  onAction: _refresh,
                ),
              );
            }
            if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
            final messages = snapshot.data!;
            if (messages.isEmpty) {
              return const SingleChildScrollView(
                physics: AlwaysScrollableScrollPhysics(),
                child: EmptyState(
                  title: 'Chưa có tin nhắn',
                  body: 'Tin nhắn khách gửi qua Zalo sẽ hiện ở đây.',
                ),
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: messages.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final m = messages[i];
                return Card(
                  color: m.isAnswered ? null : AppColors.primary.withValues(alpha: 0.05),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(AppMetrics.cardRadius),
                    onTap: () async {
                      await context.push('/home/messages/${m.id}');
                      if (!mounted) return;
                      _refresh();
                    },
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(m.customerName, style: Theme.of(context).textTheme.titleMedium),
                                const SizedBox(height: 2),
                                Text(
                                  m.content.length > 80 ? '${m.content.substring(0, 80)}…' : m.content,
                                  style: Theme.of(context).textTheme.bodyMedium,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 2),
                                Text('${_fmt(m.occurredAt)} · ${m.channel == 'zalo' ? 'Zalo' : m.channel}', style: Theme.of(context).textTheme.bodySmall),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          m.isAnswered
                              ? const StatusBadge(status: 'confirmed', label: 'Đã trả lời')
                              : const StatusBadge(status: 'pending', label: 'Chưa trả lời'),
                        ],
                      ),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
