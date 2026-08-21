import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/customer_message.dart';
import '../state/providers.dart';
import '../services/api_error_message.dart';
import '../widgets/app_button.dart';
import '../widgets/app_text_field.dart';
import '../utils/format.dart';
import '../widgets/empty_state.dart';

/// One customer message: full text, the reply box (pre-filled empty — v1
/// has NO AI draft, a named cut), and "Gửi trả lời". The backend RECORDS
/// the answer and marks the exchange answered — it does not yet send to
/// Zalo (no real outbound API exists); the screen's success copy says
/// exactly that, never claiming a delivery that didn't happen.
class MessageDetailScreen extends ConsumerStatefulWidget {
  final String messageId;
  const MessageDetailScreen({super.key, required this.messageId});

  @override
  ConsumerState<MessageDetailScreen> createState() => _MessageDetailScreenState();
}

class _MessageDetailScreenState extends ConsumerState<MessageDetailScreen> {
  late Future<CustomerMessage> _future;
  final _reply = TextEditingController();
  bool _isSending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Future<CustomerMessage> _load() => ref.read(messagesServiceProvider).getMessage(widget.messageId);

  Future<void> _refresh() async {
    final future = _load();
    setState(() => _future = future);
    await future;
  }

  Future<void> _sendReply() async {
    final content = _reply.text.trim();
    if (content.isEmpty) {
      setState(() => _error = 'Vui lòng nhập nội dung trả lời.');
      return;
    }
    setState(() {
      _isSending = true;
      _error = null;
    });
    try {
      await ref.read(messagesServiceProvider).reply(widget.messageId, content);
      await _refresh();
      if (mounted) {
        setState(() => _isSending = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã lưu trả lời — tin đã được đánh dấu trả lời.')),
        );
      }
    } catch (e) {
      setState(() {
        _isSending = false;
        _error = apiErrorMessage(e, 'Không thể lưu trả lời. Kiểm tra kết nối mạng.');
      });
    }
  }

  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tin nhắn khách')),
      body: FutureBuilder<CustomerMessage>(
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
          final m = snapshot.data!;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(m.customerName, style: Theme.of(context).textTheme.titleLarge),
                        const SizedBox(height: 2),
                        Text('${formatDateTime(m.occurredAt)} · ${m.channel == 'zalo' ? 'Zalo' : m.channel}', style: Theme.of(context).textTheme.bodySmall),
                        const SizedBox(height: 12),
                        Text(m.content, style: Theme.of(context).textTheme.bodyLarge),
                      ],
                    ),
                  ),
                ),
                if (m.isAnswered && m.reply != null) ...[
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Đã trả lời', style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 4),
                          if (m.repliedAt != null)
                            Text(formatDateTime(m.repliedAt!), style: Theme.of(context).textTheme.bodySmall),
                          const SizedBox(height: 8),
                          Text(m.reply!, style: Theme.of(context).textTheme.bodyLarge),
                        ],
                      ),
                    ),
                  ),
                ],
                if (!m.isAnswered) ...[
                  const SizedBox(height: 16),
                  AppTextField(
                    label: 'Trả lời',
                    controller: _reply,
                    keyboardType: TextInputType.multiline,
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  ],
                  const SizedBox(height: 16),
                  AppButton(label: 'Gửi trả lời', onPressed: _sendReply, isLoading: _isSending),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}
