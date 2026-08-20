"use server";

import { forgotPassword } from "@/lib/auth";

export interface ForgotPasswordActionState {
  submitted?: boolean;
  error?: string;
}

export async function forgotPasswordAction(_prevState: ForgotPasswordActionState, formData: FormData): Promise<ForgotPasswordActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Vui lòng nhập email." };
  }

  const { rateLimited } = await forgotPassword(email);
  if (rateLimited) {
    return { error: "Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau." };
  }

  // Same message whether or not the email exists — no enumeration leak,
  // matching backend-api's own design (see auth.controller.ts).
  return { submitted: true };
}
