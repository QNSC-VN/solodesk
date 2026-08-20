import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../state/session_controller.dart';
import '../screens/login_screen.dart';
import '../screens/onboarding_chat_screen.dart';
import '../screens/home_shell.dart';
import '../screens/order_detail_screen.dart';
import '../screens/order_create_screen.dart';
import '../screens/stock_screen.dart';
import '../screens/outbound_queue_screen.dart';
import '../screens/bookings_screen.dart';
import '../screens/booking_create_screen.dart';
import '../screens/booking_detail_screen.dart';
import '../screens/resources_screen.dart';
import '../screens/tax_screen.dart';
import '../screens/customers_screen.dart';
import '../screens/customer_detail_screen.dart';

/// Three real top-level destinations, `SessionState.status` decides which
/// one — the redirect logic itself, not each screen guessing whether it
/// should be showing. Refreshes on every `sessionControllerProvider`
/// change (login, logout, and the onboarding screen's post-reply
/// re-check), so a status flip (e.g. `needsOnboarding` -> `ready`)
/// navigates immediately with no manual `context.go(...)` call needed at
/// the call site. `/home/*` sub-routes (order detail/create, stock) are
/// real pushed screens reached via `context.push(...)` from inside the
/// home shell's tabs — the redirect check matches on a PREFIX for `ready`
/// so pushing one of them doesn't get bounced back to bare `/home`.
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
      if (status == SessionStatus.ready) return path.startsWith('/home') ? null : '/home';

      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/onboarding', builder: (context, state) => const OnboardingChatScreen()),
      GoRoute(path: '/home', builder: (context, state) => const HomeShell()),
      GoRoute(path: '/home/orders/new', builder: (context, state) => const OrderCreateScreen()),
      GoRoute(path: '/home/orders/:id', builder: (context, state) => OrderDetailScreen(orderId: state.pathParameters['id']!)),
      GoRoute(path: '/home/stock', builder: (context, state) => const StockScreen()),
      GoRoute(path: '/home/outbound-queue', builder: (context, state) => const OutboundQueueScreen()),
      // Static segments before the `:id` param, same ordering discipline
      // as the orders pair above.
      GoRoute(path: '/home/bookings', builder: (context, state) => const BookingsScreen()),
      GoRoute(path: '/home/bookings/new', builder: (context, state) => const BookingCreateScreen()),
      GoRoute(path: '/home/bookings/resources', builder: (context, state) => const ResourcesScreen()),
      GoRoute(path: '/home/bookings/:id', builder: (context, state) => BookingDetailScreen(bookingId: state.pathParameters['id']!)),
      GoRoute(path: '/home/tax', builder: (context, state) => const TaxScreen()),
      // Static segment before the `:name` param, same ordering discipline
      // as the orders/bookings pairs above.
      GoRoute(path: '/home/customers', builder: (context, state) => const CustomersScreen()),
      GoRoute(path: '/home/customers/:name', builder: (context, state) => CustomerDetailScreen(name: state.pathParameters['name']!)),
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
