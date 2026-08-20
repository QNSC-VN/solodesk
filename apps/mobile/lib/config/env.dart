import 'package:flutter_dotenv/flutter_dotenv.dart';

/// "Let key, I will input later" — same convention as every other app in
/// this repo. `main.dart` calls [Env.load] once before `runApp`.
class Env {
  static Future<void> load() => dotenv.load(fileName: '.env');

  static String get backendApiBaseUrl => dotenv.env['BACKEND_API_BASE_URL'] ?? 'http://localhost:3000/v1';

  static String get agentOrchestratorBaseUrl => dotenv.env['AGENT_ORCHESTRATOR_BASE_URL'] ?? 'http://localhost:3002/v1';
}
