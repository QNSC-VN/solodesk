import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solodesk_mobile/screens/login_screen.dart';

void main() {
  testWidgets('LoginScreen renders email/password fields and a login button', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: LoginScreen())),
    );

    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Mật khẩu'), findsOneWidget);
    expect(find.widgetWithText(ElevatedButton, 'Đăng nhập'), findsOneWidget);
  });
}
