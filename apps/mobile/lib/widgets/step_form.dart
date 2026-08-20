import 'package:flutter/material.dart';
import '../models/step_descriptor.dart';
import 'app_button.dart';

/// Generative UI's "form" step widget — a small, closed set of labeled
/// fields (`StepField`). Submits the raw field-name -> value map (NOT a
/// pre-encoded string) so the caller can build both the wire format sent
/// to agent-orchestrator (`"key=value; key2=value2"`, using each field's
/// machine `name` — order-independent, unlike the old single comma-split
/// free-text line this replaced, see CLAUDE.md) AND a human-readable chat
/// bubble using each field's display `label` — a raw `key=value` string
/// would be a confusing thing to show a real user in their own chat
/// history.
class StepForm extends StatefulWidget {
  final List<StepField> fields;
  final ValueChanged<Map<String, String>> onSubmit;
  final bool enabled;

  const StepForm({super.key, required this.fields, required this.onSubmit, this.enabled = true});

  @override
  State<StepForm> createState() => _StepFormState();
}

class _StepFormState extends State<StepForm> {
  late final Map<String, TextEditingController> _controllers = {for (final f in widget.fields) f.name: TextEditingController()};

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _submit() {
    widget.onSubmit({for (final f in widget.fields) f.name: _controllers[f.name]!.text.trim()});
  }

  bool get _allFilled => widget.fields.every((f) => _controllers[f.name]!.text.trim().isNotEmpty);

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final field in widget.fields) ...[
              Text(field.label, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              TextField(
                controller: _controllers[field.name],
                enabled: widget.enabled,
                keyboardType: field.inputType == 'number' ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.text,
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 12),
            ],
            AppButton(label: 'Xác nhận', onPressed: (_allFilled && widget.enabled) ? _submit : null),
          ],
        ),
      ),
    );
  }
}
