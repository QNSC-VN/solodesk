import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Real network-status detection (`connectivity_plus`) — deliberately NOT
/// a fake manual toggle the way the CEO mockup's own demo "✈︎ Chế độ máy
/// bay" button works; this is a real app, so a real connectivity state
/// drives both `OfflineBanner` and `OrderSyncWorker`'s reconnect trigger.
/// Yields the real current state first (not just future changes), so a
/// widget that starts already offline shows that immediately.
Stream<bool> _isOnlineStream() async* {
  final connectivity = Connectivity();
  yield !(await connectivity.checkConnectivity()).contains(ConnectivityResult.none);
  yield* connectivity.onConnectivityChanged.map((results) => !results.contains(ConnectivityResult.none));
}

final connectivityProvider = StreamProvider<bool>((ref) => _isOnlineStream());
