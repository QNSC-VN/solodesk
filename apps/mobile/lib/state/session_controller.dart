import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/tenant.dart';
import '../models/session.dart';
import '../services/api_client.dart';
import 'providers.dart';

enum SessionStatus { loading, unauthenticated, needsOnboarding, ready }

class SessionState {
  final SessionStatus status;
  final Tenant? tenant;
  final SessionUser? user;

  const SessionState({required this.status, this.tenant, this.user});

  static const initial = SessionState(status: SessionStatus.loading);
}

/// The one source of truth `app_router.dart`'s redirect logic reads —
/// `SessionStatus.needsOnboarding` (tenant exists, `activatedAt` still
/// null) is what routes a freshly-logged-in owner into the onboarding
/// conversation instead of the home shell; `ready` is everyone after that,
/// forever (this app never re-enters onboarding once activated).
class SessionController extends StateNotifier<SessionState> {
  final Ref _ref;
  SessionController(this._ref) : super(SessionState.initial) {
    _init();
  }

  Future<void> _init() async {
    final store = _ref.read(secureSessionStoreProvider);
    if (!await store.hasSession) {
      state = const SessionState(status: SessionStatus.unauthenticated);
      return;
    }
    await _loadTenant();
  }

  Future<void> _loadTenant() async {
    final store = _ref.read(secureSessionStoreProvider);
    final tenantId = await store.tenantId;
    final user = await store.user;
    if (tenantId == null) {
      state = const SessionState(status: SessionStatus.unauthenticated);
      return;
    }
    try {
      final tenant = await _ref.read(tenantServiceProvider).getTenant(tenantId);
      await store.cacheTenant(tenant);
      state = SessionState(status: tenant.isOnboarded ? SessionStatus.ready : SessionStatus.needsOnboarding, tenant: tenant, user: user);
    } on SessionExpiredException {
      state = const SessionState(status: SessionStatus.unauthenticated);
    } catch (_) {
      // Not a real auth failure (network/timeout/5xx) — a cold app start
      // with no network must never look like a logout, or the CEO
      // mockup's own headline "sell while offline" scenario can't even
      // reach its first screen. Fall back to the last-known tenant; only
      // a NEVER-successfully-loaded device (no cache at all) has nothing
      // honest to show and stays unauthenticated.
      final cached = await store.cachedTenant;
      if (cached == null) {
        state = const SessionState(status: SessionStatus.unauthenticated);
        return;
      }
      state = SessionState(status: cached.isOnboarded ? SessionStatus.ready : SessionStatus.needsOnboarding, tenant: cached, user: user);
    }
  }

  Future<void> loginWithPassword(String email, String password) async {
    final session = await _ref.read(authServiceProvider).loginWithPassword(email, password);
    await _ref.read(secureSessionStoreProvider).save(session);
    await _loadTenant();
  }

  /// Called once the onboarding conversation's final turn has run —
  /// re-fetches the tenant so `activatedAt` (set by agent-orchestrator's
  /// `complete_onboarding` tool) flips this controller over to `ready`.
  Future<void> refreshAfterOnboarding() => _loadTenant();

  Future<void> logout() async {
    final store = _ref.read(secureSessionStoreProvider);
    final token = await store.accessToken;
    if (token != null) {
      try {
        await _ref.read(authServiceProvider).logout(token);
      } catch (_) {
        // Best-effort — clearing the local session matters more than the
        // server-side denylist call succeeding, same as web-accounting's
        // logoutAction never blocking on it.
      }
    }
    await store.clear();
    state = const SessionState(status: SessionStatus.unauthenticated);
  }
}

final sessionControllerProvider = StateNotifierProvider<SessionController, SessionState>((ref) => SessionController(ref));
