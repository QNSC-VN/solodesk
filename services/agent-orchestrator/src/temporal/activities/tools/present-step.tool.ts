/**
 * "Generative UI" for the onboarding conversation (2026's named pattern for
 * this exact problem — see CLAUDE.md's "Onboarding — structured input
 * widgets" section for the research this is based on): the model doesn't
 * just reply with prose, it also calls this tool to declare WHAT INPUT
 * WIDGET the app should render for its next question, from a fixed,
 * closed catalog (`choice` | `text` | `form`) — never model-generated
 * arbitrary UI, which is the real pitfall named by every source found
 * (unconstrained generation breaks UX / invites hallucinated widgets).
 *
 * This tool does nothing server-side (no HTTP call, unlike every other
 * onboarding tool) — its only job is carrying structured arguments back
 * out of the tool-use loop in `run-agent-turn.activity.ts`, which reads
 * them directly rather than routing through the generic handler dispatch.
 */

export type StepInputType = 'choice' | 'text' | 'form';

export interface StepField {
  name: string;
  label: string;
  inputType: 'text' | 'number';
}

export interface StepDescriptor {
  inputType: StepInputType;
  options?: string[];
  fields?: StepField[];
}

export const PRESENT_STEP_TOOL_NAME = 'present_step';

export const presentStepToolSchema = {
  name: PRESENT_STEP_TOOL_NAME,
  description:
    'Call this on EVERY turn that asks the user something, right after any data-saving tool calls, to describe the input widget the app should render for your next question. Pick the smallest correct type: "choice" for a closed yes/no or short fixed set of options (strongly preferred for this elderly/non-technical audience — always prefer tappable buttons over typing whenever the answer is one of a known, small set); "form" only for structured multi-field entry (e.g. a product\'s name/unit/price together); "text" only for genuinely open-ended answers (a business name, a SePay token) where no fixed option list exists. Do NOT call this on the final summary turn — no further input is needed there.',
  input_schema: {
    type: 'object' as const,
    properties: {
      inputType: { type: 'string' as const, enum: ['choice', 'text', 'form'], description: 'The widget type.' },
      options: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Button labels, in plain Vietnamese, required when inputType is "choice". Keep each label short.',
      },
      fields: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            name: { type: 'string' as const, description: 'Machine field key, e.g. "name", "unit", "unitPrice".' },
            label: { type: 'string' as const, description: 'Vietnamese field label shown above the input.' },
            inputType: { type: 'string' as const, enum: ['text', 'number'] },
          },
          required: ['name', 'label', 'inputType'],
          additionalProperties: false,
        },
        description: 'Form fields, required when inputType is "form".',
      },
    },
    required: ['inputType'],
    additionalProperties: false,
  },
};
