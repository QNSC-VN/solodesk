import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../state/session_controller.dart';
import '../screens/login_screen.dart';
import '../screens/onboarding_chat_screen.dart';
import '../screens/home_shell.dart';

/// Three real routes, `SessionState.status` decides which one — the
/// redirect logic itself, not each screen guessing whether it should be
/// showing. Refreshes on every `sessionControllerProvider` change (login,
/// logout, and the onboarding screen's post-reply re-check), so a status
/// flip (e.g. `needsOnboarding` -> `ready`) navigates immediately with no
/// manual `context.go(...)` call needed at the call site.
final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    refreshListenable: _SessionListenable(ref),
    initialLocation: '/login',
    redirect: (context, state) {
      final status = ref.read(sessionControllerProvider).status;
      final path = state.matchedLocation;

      if (status == SessionStatus.loading) return null;

      if (status == SessionStatus.unauthenticated) return path == '/login' ? null : '/login';
      if (status == SessionStatus.needsOnboarding) return path == '/onboarding' ? null : '/onboarding';
      if (status == SessionStatus.ready) return path == '/home' ? null : '/home';

      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/onboarding', builder: (context, state) => const OnboardingChatScreen()),
      GoRoute(path: '/home', builder: (context, state) => const HomeShell()),
    ],
  );
});

/// Bridges Riverpod's `StateNotifier` state changes into a `Listenable`
/// go_router's `refreshListenable` expects — go_router has no native
/// Riverpod integration in this version, this is the small real glue.
class _SessionListenable extends ChangeNotifier {
  _SessionListenable(Ref ref) {
    ref.listen(sessionControllerProvider, (_, _) => notifyListeners());
  }
}
