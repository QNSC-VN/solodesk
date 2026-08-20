import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'local_database.g.dart';

/// The mockup's own headline demo scenario ("Bán khi mất mạng" — sell while
/// offline) ported as: the local write IS the transaction, network send is
/// a retryable side-channel (see `OrderSyncWorker`). One table, not a
/// generic multi-kind outbox — order creation is the only offline-capable
/// write in this cut (YAGNI: a second one earns a generic table later).
///
/// `linesJson` holds the request payload PLUS a display snapshot
/// (skuId/skuName/unit/unitPrice/quantity) captured at creation time, so a
/// not-yet-synced order can render real product names and a provisional
/// total instead of zeros — never sent to the server as-is, only
/// skuId/quantity are (see `OrdersRepository.createOrder`).
/// `serverLinesJson` holds the real `OrderLine` list once the backend
/// response comes back, and takes over as the display source from then on.
class LocalOrders extends Table {
  TextColumn get clientId => text()();
  TextColumn get serverId => text().nullable()();
  TextColumn get channel => text().withDefault(const Constant('counter'))();
  TextColumn get customerName => text().nullable()();
  TextColumn get status => text().withDefault(const Constant('pending'))();
  TextColumn get totalAmount => text()();
  TextColumn get linesJson => text()();
  TextColumn get serverLinesJson => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
  TextColumn get syncStatus => text().withDefault(const Constant('pending'))(); // pending | synced | failed
  TextColumn get lastError => text().nullable()();
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  DateTimeColumn get lastAttemptAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {clientId};
}

/// A read-through cache of `GET /v1/skus`, upserted on every successful
/// online fetch. Without this, `OrderCreateScreen` — the one screen the
/// whole "sell while offline" scenario runs through — would have no
/// product list to sell from the moment it's opened offline (discovered
/// via the real emulator smoke test: `SkusService.getSkus()` used to be
/// a bare remote call with no fallback). `LocalOrders` is written straight
/// to for orders; this table exists purely so the CREATE screen has
/// something to read when there's no network, not a general write path.
class CachedSkus extends Table {
  TextColumn get id => text()();
  TextColumn get skuCode => text()();
  TextColumn get name => text()();
  TextColumn get unit => text()();
  TextColumn get unitPrice => text()();
  BoolColumn get isActive => boolean()();

  @override
  Set<Column> get primaryKey => {id};
}

@DriftDatabase(tables: [LocalOrders, CachedSkus])
class LocalDatabase extends _$LocalDatabase {
  LocalDatabase() : super(_openConnection());
  LocalDatabase.forTesting(super.executor);

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        onUpgrade: (m, from, to) async {
          if (from < 2) await m.createTable(cachedSkus);
        },
      );

  Future<void> replaceCachedSkus(List<CachedSkusCompanion> rows) async {
    await batch((b) {
      b.deleteAll(cachedSkus);
      b.insertAll(cachedSkus, rows);
    });
  }

  Future<List<CachedSkusData>> getCachedSkus() => select(cachedSkus).get();

  static QueryExecutor _openConnection() => driftDatabase(name: 'solodesk_local');

  Future<LocalOrder> upsertLocalOrder(LocalOrdersCompanion row) async {
    await into(localOrders).insertOnConflictUpdate(row);
    return (select(localOrders)..where((t) => t.clientId.equals(row.clientId.value))).getSingle();
  }

  Stream<List<LocalOrder>> watchAllOrders() =>
      (select(localOrders)..orderBy([(t) => OrderingTerm.desc(t.createdAt)])).watch();

  Future<List<LocalOrder>> getAllOrders() =>
      (select(localOrders)..orderBy([(t) => OrderingTerm.desc(t.createdAt)])).get();

  Future<LocalOrder?> findByClientOrServerId(String id) =>
      (select(localOrders)..where((t) => t.clientId.equals(id) | t.serverId.equals(id))).getSingleOrNull();

  Future<List<LocalOrder>> getPendingSyncOrders() => (select(localOrders)..where((t) => t.syncStatus.equals('pending'))).get();

  Future<void> markSynced({
    required String clientId,
    required String serverId,
    required String status,
    required String totalAmount,
    required DateTime createdAt,
    required String serverLinesJson,
  }) {
    return (update(localOrders)..where((t) => t.clientId.equals(clientId))).write(LocalOrdersCompanion(
      serverId: Value(serverId),
      status: Value(status),
      totalAmount: Value(totalAmount),
      createdAt: Value(createdAt),
      serverLinesJson: Value(serverLinesJson),
      syncStatus: const Value('synced'),
      lastError: const Value(null),
    ));
  }

  Future<void> markAttemptFailed({required String clientId, required bool retryable, required String reason}) {
    return (update(localOrders)..where((t) => t.clientId.equals(clientId))).write(LocalOrdersCompanion(
      syncStatus: Value(retryable ? 'pending' : 'failed'),
      lastError: Value(reason),
      lastAttemptAt: Value(DateTime.now()),
    ));
  }

  Future<void> incrementAttempts(String clientId) async {
    final row = await (select(localOrders)..where((t) => t.clientId.equals(clientId))).getSingle();
    await (update(localOrders)..where((t) => t.clientId.equals(clientId)))
        .write(LocalOrdersCompanion(attempts: Value(row.attempts + 1), lastAttemptAt: Value(DateTime.now())));
  }

  /// Upserts a real, already-synced server order into the same table (so
  /// `LocalOrders` stays the single read model for the Orders tab/Home) —
  /// matched by `serverId`, never creates a duplicate `pending` row.
  Future<void> upsertFromServer({
    required String serverId,
    required String channel,
    required String? customerName,
    required String status,
    required String totalAmount,
    required DateTime createdAt,
    required String serverLinesJson,
  }) async {
    final existing = (select(localOrders)..where((t) => t.serverId.equals(serverId))).getSingleOrNull();
    final found = await existing;
    final clientId = found?.clientId ?? serverId;
    await into(localOrders).insertOnConflictUpdate(LocalOrdersCompanion(
      clientId: Value(clientId),
      serverId: Value(serverId),
      channel: Value(channel),
      customerName: Value(customerName),
      status: Value(status),
      totalAmount: Value(totalAmount),
      linesJson: Value(found?.linesJson ?? '[]'),
      serverLinesJson: Value(serverLinesJson),
      createdAt: Value(createdAt),
      syncStatus: const Value('synced'),
      lastError: const Value(null),
    ));
  }
}
