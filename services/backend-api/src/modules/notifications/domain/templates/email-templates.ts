import type { NotificationType } from '../../../../db/schema/notifications';

/** Compile-time-checked vars per template — same idea as rally/opshub's typed template registry, no template/vars drift possible. */
export interface EmailTemplateVars {
  EMAIL_VERIFY: { verifyUrl: string };
  PASSWORD_RESET: { resetUrl: string };
  EINVOICE_THRESHOLD_CROSSED: { tenantName: string };
  // v1's filing-deadline reminder is in-app only (FilingDeadlineSweepService
  // never passes `email` to notify()) — this entry exists purely to satisfy
  // EMAIL_TEMPLATES' exhaustiveness so a real email channel can be added
  // later without a template/vars registry gap.
  FILING_DEADLINE_APPROACHING: { tenantName: string; quarter: number; year: number; deadline: string };
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

export const EMAIL_TEMPLATES: {
  [K in NotificationType]: (vars: EmailTemplateVars[K]) => RenderedEmail;
} = {
  EMAIL_VERIFY: ({ verifyUrl }) => ({
    subject: 'Xác thực email SoloDesk',
    html: `<p>Nhấn vào liên kết sau để xác thực email và bắt đầu sử dụng SoloDesk:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>Liên kết có hiệu lực trong 24 giờ.</p>`,
  }),
  PASSWORD_RESET: ({ resetUrl }) => ({
    subject: 'Đặt lại mật khẩu SoloDesk',
    html: `<p>Nhấn vào liên kết sau để đặt lại mật khẩu:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Liên kết có hiệu lực trong 1 giờ. Nếu bạn không yêu cầu điều này, hãy bỏ qua email này.</p>`,
  }),
  EINVOICE_THRESHOLD_CROSSED: ({ tenantName }) => ({
    subject: 'SoloDesk: Doanh nghiệp của bạn cần hóa đơn điện tử',
    html: `<p>Doanh thu lũy kế năm nay của <strong>${tenantName}</strong> đã vượt ngưỡng yêu cầu hóa đơn điện tử. Các hóa đơn tiếp theo sẽ cần phát hành hóa đơn điện tử theo quy định.</p>`,
  }),
  FILING_DEADLINE_APPROACHING: ({ tenantName, quarter, year, deadline }) => ({
    subject: `SoloDesk: Sắp đến hạn kê khai thuế quý ${quarter}/${year}`,
    html: `<p><strong>${tenantName}</strong> sắp đến hạn kê khai và nộp thuế quý ${quarter}/${year} — hạn ${deadline}. Số liệu tạm tính, cần đối chiếu văn bản hiện hành trước khi nộp.</p>`,
  }),
};

/** Renders a template by name — the one call site both `EmailDispatcher` and any test need. */
export function renderEmailTemplate<K extends NotificationType>(name: K, vars: EmailTemplateVars[K]): RenderedEmail {
  return EMAIL_TEMPLATES[name](vars);
}
