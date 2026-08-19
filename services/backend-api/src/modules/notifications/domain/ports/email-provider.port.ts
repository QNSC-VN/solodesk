export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Provider-agnostic — `EmailDispatcher` resolves the active implementation
 * (`EMAIL_PROVIDER=resend|ses`), and is the ONE place `isConfigured()` is
 * checked (log instead of throw when a real credential hasn't been entered
 * yet — "let key, I will input later", same pattern as every other 3rd
 * party credential in this repo).
 */
export interface IEmailProvider {
  send(input: SendEmailInput): Promise<void>;
  isConfigured(): boolean;
}
