import 'package:flutter_dotenv/flutter_dotenv.dart';

/// "Let key, I will input later" — same convention as every other app in
/// this repo. `main.dart` calls [Env.load] once before `runApp`.
///
/// Precedence: `--dart-define` beats `.env`. The bundled `.env` asset is
/// the DEV default (10.0.2.2 emulator URLs); a release build points at
/// the real deployment WITHOUT touching the asset —
/// `flutter build appbundle --release --dart-define=BACKEND_API_BASE_URL=https://api.example.vn/v1 --dart-define=AGENT_ORCHESTRATOR_BASE_URL=https://ai.example.vn/v1`
/// — so one source tree produces both dev and prod binaries.
class Env {
  static Future<void> load() => dotenv.load(fileName: '.env');

  static String get _backendOverride => const String.fromEnvironment('BACKEND_API_BASE_URL');

  static String get _agentOverride => const String.fromEnvironment('AGENT_ORCHESTRATOR_BASE_URL');

  static String get _connectorHubOverride => const String.fromEnvironment('CONNECTOR_HUB_BASE_URL');

  static String get backendApiBaseUrl =>
      _backendOverride.isNotEmpty ? _backendOverride : dotenv.env['BACKEND_API_BASE_URL'] ?? 'http://localhost:3000/v1';

  static String get agentOrchestratorBaseUrl =>
      _agentOverride.isNotEmpty ? _agentOverride : dotenv.env['AGENT_ORCHESTRATOR_BASE_URL'] ?? 'http://localhost:3002/v1';

  static String get connectorHubBaseUrl =>
      _connectorHubOverride.isNotEmpty ? _connectorHubOverride : dotenv.env['CONNECTOR_HUB_BASE_URL'] ?? 'http://localhost:3001/v1';
}
