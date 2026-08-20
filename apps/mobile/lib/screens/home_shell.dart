import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../state/session_controller.dart';
import 'home_tab.dart';
import 'orders_tab.dart';
import 'assistant_tab.dart';
import 'notifications_tab.dart';

/// The 4-tab bottom-nav shell for "daily-use home" (Mode 2 in
/// `design-system/solodesk/pages/mobile.md`), reached only once a tenant
/// is `activatedAt`-set. 4 tabs max (ui-ux-pro-max's own `bottom-nav-limit`
/// rule): Trang chủ / Đơn hàng / Trợ lý AI / Thông báo.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  static const _tabs = [HomeTab(), OrdersTab(), AssistantTab(), NotificationsTab()];
  static const _titles = ['Trang chủ', 'Đơn hàng', 'Trợ lý AI', 'Thông báo'];

  @override
  Widget build(BuildContext context) {
    final tenant = ref.watch(sessionControllerProvider).tenant;

    return Scaffold(
      appBar: AppBar(
        title: Text(_index == 0 ? (tenant?.legalName ?? 'SoloDesk') : _titles[_index]),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Đăng xuất',
            onPressed: () => ref.read(sessionControllerProvider.notifier).logout(),
          ),
        ],
      ),
      body: IndexedStack(index: _index, children: _tabs),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home_outlined), activeIcon: Icon(Icons.home), label: 'Trang chủ'),
          BottomNavigationBarItem(icon: Icon(Icons.receipt_long_outlined), activeIcon: Icon(Icons.receipt_long), label: 'Đơn hàng'),
          BottomNavigationBarItem(icon: Icon(Icons.smart_toy_outlined), activeIcon: Icon(Icons.smart_toy), label: 'Trợ lý AI'),
          BottomNavigationBarItem(icon: Icon(Icons.notifications_outlined), activeIcon: Icon(Icons.notifications), label: 'Thông báo'),
        ],
      ),
    );
  }
}
