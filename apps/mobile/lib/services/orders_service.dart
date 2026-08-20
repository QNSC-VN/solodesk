import 'dart:convert';
import 'package:drift/drift.dart' show Value;
import 'package:uuid/uuid.dart';
import 'api_client.dart';
import '../local/local_database.dart';
import '../models/order.dart';

/// A single sell-flow order line, captured with a display snapshot
/// (product name/unit/unit price at the moment of sale) so a
/// not-yet-synced local order can render real numbers instead of zeros —
/// see `LocalOrders.linesJson`. Only `skuId`/`quantity` are ever sent to
/// backend-api (`OrderSyncWorker`); the rest is local display only.
class PendingOrderLine {
  final String skuId;
  final String skuName;
  final String unit;
  final String unitPrice;
  final String quantity;

  PendingOrderLine({required this.skuId, required this.skuName, required this.unit, required this.unitPrice, required this.quantity});

  Map<String, dynamic> toJson() => {'skuId': skuId, 'skuName': skuName, 'unit': unit, 'unitPrice': unitPrice, 'quantity': quantity};

  factory PendingOrderLine.fromJson(Map<String, dynamic> json) => PendingOrderLine(
        skuId: json['skuId'] as String,
        skuName: json['skuName'] as String? ?? '',
        unit: json['unit'] as String? ?? '',
        unitPrice: json['unitPrice'] as String? ?? '0',
        quantity: json['quantity'] as String,
      );
}

/// Local-first: every read comes from `LocalOrders` (synced server orders
/// upserted in by `refreshFromServer`, not-yet-synced ones created by
/// `createOrder`) — one table, one read model, matching the mockup's own
/// "local write IS the transaction" philosophy (see the offline-first
/// plan). `OrderSyncWorker` is the only thing that ever POSTs a locally
/// created order to backend-api.
class OrdersService {
  final ApiClient _client;
  final LocalDatabase _db;
  static const _uuid = Uuid();

  OrdersService(this._client, this._db);

  Future<List<Order>> getOrders() => _db.getAllOrders().then((rows) => rows.map(_toOrder).toList());

  Future<Order> getOrder(String id) async {
    final row = await _db.findByClientOrServerId(id);
    if (row != null) return _toOrder(row);
    return _client.get(ApiTarget.backendApi, '/orders/$id', (json) => Order.fromJson(json as Map<String, dynamic>));
  }

  /// Pull-sync: fetches the real order list and upserts it into
  /// `LocalOrders` matched by `serverId` — never creates a duplicate
  /// `pending` row for an order this device already knows about. Call on
  /// pull-to-refresh/app resume; never required for `getOrders()` to
  /// return real data, since local-first reads don't block on it.
  Future<void> refreshFromServer() async {
    final remote = await _client.get(ApiTarget.backendApi, '/orders', (json) => json as List<dynamic>);
    for (final entry in remote) {
      final map = entry as Map<String, dynamic>;
      await _db.upsertFromServer(
        serverId: map['id'] as String,
        channel: map['channel'] as String,
        customerName: map['customerName'] as String?,
        status: map['status'] as String,
        totalAmount: map['totalAmount'] as String,
        createdAt: DateTime.parse(map['createdAt'] as String),
        serverLinesJson: jsonEncode(map['lines'] ?? []),
      );
    }
  }

  /// Writes locally first and returns instantly — no network round-trip
  /// on the critical path, matching the mockup's own "Bán khi mất mạng"
  /// scenario. `OrderSyncWorker.drainPending()` (triggered on app start,
  /// reconnect, and manual retry) does the real POST in the background.
  Future<Order> createOrder({required List<PendingOrderLine> lines, String? customerName}) async {
    final clientId = _uuid.v4();
    final total = lines.fold<double>(0, (sum, l) => sum + (double.tryParse(l.unitPrice) ?? 0) * (double.tryParse(l.quantity) ?? 0));
    final row = await _db.upsertLocalOrder(LocalOrdersCompanion.insert(
      clientId: clientId,
      customerName: Value(customerName != null && customerName.isNotEmpty ? customerName : null),
      totalAmount: total.toStringAsFixed(0),
      linesJson: jsonEncode(lines.map((l) => l.toJson()).toList()),
      createdAt: DateTime.now(),
    ));
    return _toOrder(row);
  }

  Order _toOrder(LocalOrder row) {
    final lines = row.serverLinesJson != null
        ? (jsonDecode(row.serverLinesJson!) as List<dynamic>).map((l) => OrderLine.fromJson(l as Map<String, dynamic>)).toList()
        : (jsonDecode(row.linesJson) as List<dynamic>).map((l) {
            final pending = PendingOrderLine.fromJson(l as Map<String, dynamic>);
            final lineTotal = (double.tryParse(pending.quantity) ?? 0) * (double.tryParse(pending.unitPrice) ?? 0);
            return OrderLine(id: '', skuId: pending.skuId, lotId: '', quantity: pending.quantity, unitPrice: pending.unitPrice, lineTotal: lineTotal.toStringAsFixed(0));
          }).toList();

    return Order(
      id: row.serverId ?? row.clientId,
      channel: row.channel,
      status: row.status,
      customerName: row.customerName,
      totalAmount: row.totalAmount,
      createdAt: row.createdAt,
      lines: lines,
      syncStatus: row.syncStatus == 'synced' ? null : row.syncStatus,
      syncError: row.lastError,
    );
  }
}
