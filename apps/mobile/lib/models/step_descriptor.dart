enum StepInputType { choice, text, form }

class StepField {
  final String name;
  final String label;
  final String inputType; // 'text' | 'number'

  StepField({required this.name, required this.label, required this.inputType});

  factory StepField.fromJson(Map<String, dynamic> json) => StepField(
        name: json['name'] as String,
        label: json['label'] as String,
        inputType: json['inputType'] as String,
      );
}

/// Generative UI (2026's named pattern for "model declares the input
/// widget, client renders from a fixed closed catalog, never model-
/// generated arbitrary UI") — mirrors agent-orchestrator's
/// `present-step.tool.ts`. See `design-system/solodesk/pages/mobile.md`'s
/// "Onboarding — structured input widgets" section for why this replaced
/// a single free-text box for every onboarding question.
class StepDescriptor {
  final StepInputType inputType;
  final List<String>? options;
  final List<StepField>? fields;

  StepDescriptor({required this.inputType, this.options, this.fields});

  factory StepDescriptor.fromJson(Map<String, dynamic> json) => StepDescriptor(
        inputType: StepInputType.values.byName(json['inputType'] as String),
        options: (json['options'] as List<dynamic>?)?.cast<String>(),
        fields: (json['fields'] as List<dynamic>?)?.map((f) => StepField.fromJson(f as Map<String, dynamic>)).toList(),
      );
}

class SendMessageResult {
  final String assistantMessage;
  final StepDescriptor? step;

  SendMessageResult({required this.assistantMessage, this.step});

  factory SendMessageResult.fromJson(Map<String, dynamic> json) => SendMessageResult(
        assistantMessage: json['assistantMessage'] as String,
        step: json['step'] == null ? null : StepDescriptor.fromJson(json['step'] as Map<String, dynamic>),
      );
}
