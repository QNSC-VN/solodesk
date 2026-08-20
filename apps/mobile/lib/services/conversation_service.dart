import 'api_client.dart';
import '../models/conversation_message.dart';

/// Calls agent-orchestrator's real `/v1/conversations*` endpoints — same
/// bearer token as backend-api (one identity provider across services).
class ConversationService {
  final ApiClient _client;
  ConversationService(this._client);

  Future<String> start({required String mode}) => _client.post(
        ApiTarget.agentOrchestrator,
        '/conversations',
        {'mode': mode},
        (json) => (json as Map<String, dynamic>)['conversationId'] as String,
      );

  Future<String> sendMessage(String conversationId, String message) => _client.post(
        ApiTarget.agentOrchestrator,
        '/conversations/$conversationId/messages',
        {'message': message},
        (json) => (json as Map<String, dynamic>)['assistantMessage'] as String,
      );

  Future<List<ConversationMessage>> getHistory(String conversationId) => _client.get(
        ApiTarget.agentOrchestrator,
        '/conversations/$conversationId',
        (json) => (json as List<dynamic>).map((m) => ConversationMessage.fromJson(m as Map<String, dynamic>)).toList(),
      );
}
