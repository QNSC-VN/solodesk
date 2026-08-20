import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/secure_session_store.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/tenant_service.dart';
import '../services/conversation_service.dart';
import '../services/orders_service.dart';
import '../services/stock_service.dart';
import '../services/notifications_service.dart';
import '../services/skus_service.dart';

/// Plain constructor-injected services, one instance per app run — no DI
/// framework needed for a dependency graph this shallow.
final secureSessionStoreProvider = Provider((ref) => SecureSessionStore());
final apiClientProvider = Provider((ref) => ApiClient(ref.watch(secureSessionStoreProvider)));
final authServiceProvider = Provider((ref) => AuthService(ref.watch(apiClientProvider)));
final tenantServiceProvider = Provider((ref) => TenantService(ref.watch(apiClientProvider)));
final conversationServiceProvider = Provider((ref) => ConversationService(ref.watch(apiClientProvider)));
final ordersServiceProvider = Provider((ref) => OrdersService(ref.watch(apiClientProvider)));
final stockServiceProvider = Provider((ref) => StockService(ref.watch(apiClientProvider)));
final notificationsServiceProvider = Provider((ref) => NotificationsService(ref.watch(apiClientProvider)));
final skusServiceProvider = Provider((ref) => SkusService(ref.watch(apiClientProvider)));
