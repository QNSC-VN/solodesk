import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solodesk_mobile/local/local_database.dart';
import 'package:solodesk_mobile/screens/outbound_queue_screen.dart';
import 'package:solodesk_mobile/state/providers.dart';

void main() {
  testWidgets('OutboundQueueScreen shows the empty state when nothing is pending sync', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [localDatabaseProvider.overrideWithValue(LocalDatabase.forTesting(NativeDatabase.memory()))],
        child: const MaterialApp(home: OutboundQueueScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Không có đơn chờ đồng bộ'), findsOneWidget);
  });
}
