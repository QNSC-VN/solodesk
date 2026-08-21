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
import '../services/bookings_service.dart';
import '../services/tax_service.dart';
import '../services/customers_service.dart';
import '../services/expenses_service.dart';
import '../services/connectors_service.dart';
import '../services/messages_service.dart';
import '../services/compliance_service.dart';
import '../services/tts_service.dart';
import '../services/stt_service.dart';
import '../local/local_database.dart';
import '../local/order_sync_worker.dart';

/// Plain constructor-injected services, one instance per app run — no DI
/// framework needed for a dependency graph this shallow.
final secureSessionStoreProvider = Provider((ref) => SecureSessionStore());
final apiClientProvider = Provider((ref) => ApiClient(ref.watch(secureSessionStoreProvider)));
final authServiceProvider = Provider((ref) => AuthService(ref.watch(apiClientProvider)));
final tenantServiceProvider = Provider((ref) => TenantService(ref.watch(apiClientProvider)));
final conversationServiceProvider = Provider((ref) => ConversationService(ref.watch(apiClientProvider)));

/// One local SQLite connection for the app's lifetime — the offline-first
/// order outbox (see `LocalDatabase`'s own doc comment for why one table,
/// not a generic multi-kind outbox).
final localDatabaseProvider = Provider((ref) => LocalDatabase());
final ordersServiceProvider = Provider((ref) => OrdersService(ref.watch(apiClientProvider), ref.watch(localDatabaseProvider)));
final orderSyncWorkerProvider = Provider((ref) => OrderSyncWorker(ref.watch(apiClientProvider), ref.watch(localDatabaseProvider)));
final stockServiceProvider = Provider((ref) => StockService(ref.watch(apiClientProvider)));
final notificationsServiceProvider = Provider((ref) => NotificationsService(ref.watch(apiClientProvider)));
final skusServiceProvider = Provider((ref) => SkusService(ref.watch(apiClientProvider), ref.watch(localDatabaseProvider)));
final bookingsServiceProvider = Provider((ref) => BookingsService(ref.watch(apiClientProvider)));
final taxServiceProvider = Provider((ref) => TaxService(ref.watch(apiClientProvider)));
final customersServiceProvider = Provider((ref) => CustomersService(ref.watch(apiClientProvider)));
final expensesServiceProvider = Provider((ref) => ExpensesService(ref.watch(apiClientProvider)));
final connectorsServiceProvider = Provider((ref) => ConnectorsService(ref.watch(apiClientProvider)));
final messagesServiceProvider = Provider((ref) => MessagesService(ref.watch(apiClientProvider)));
final complianceServiceProvider = Provider((ref) => ComplianceService(ref.watch(apiClientProvider)));

/// Voice v1 — on-device, app-lifetime singletons (the TTS engine and the
/// recognizer each hold native state; one instance each, like ApiClient's
/// shared http.Client).
final ttsServiceProvider = Provider((ref) => TtsService());
final sttServiceProvider = Provider((ref) => SttService());
