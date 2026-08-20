import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../state/session_controller.dart';
import '../widgets/app_button.dart';
import '../widgets/app_text_field.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _isSubmitting = false;
  String? _error;

  Future<void> _submit() async {
    setState(() {
      _isSubmitting = true;
      _error = null;
    });
    try {
      await ref.read(sessionControllerProvider.notifier).loginWithPassword(_email.text.trim(), _password.text);
    } catch (_) {
      setState(() => _error = 'Email hoặc mật khẩu không đúng, hoặc email chưa được xác thực.');
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('SoloDesk', style: Theme.of(context).textTheme.headlineLarge, textAlign: TextAlign.center),
                const SizedBox(height: 8),
                Text(
                  'Đăng nhập để quản lý việc kinh doanh của bạn.',
                  style: Theme.of(context).textTheme.bodyMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 32),
                AppTextField(label: 'Email', controller: _email, keyboardType: TextInputType.emailAddress),
                const SizedBox(height: 16),
                AppTextField(label: 'Mật khẩu', controller: _password, obscureText: true),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 24),
                AppButton(label: 'Đăng nhập', onPressed: _submit, isLoading: _isSubmitting),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
