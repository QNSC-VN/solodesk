"use server";

import { redirect } from "next/navigation";
import { resetPassword, AuthError } from "@/lib/auth";

export interface ResetPasswordActionState {
  error?: string;
}

export async function resetPasswordAction(_prevState: ResetPasswordActionState, formData: FormData): Promise<ResetPasswordActionState> {
  const token = String(formData.get("token") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) {
    return { error: "Liên kết không hợp lệ." };
  }
  if (newPassword.length < 8) {
    return { error: "Mật khẩu phải có ít nhất 8 ký tự." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "Mật khẩu xác nhận không khớp." };
  }

  try {
    await resetPassword(token, newPassword);
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Liên kết không hợp lệ, đã được sử dụng, hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới." };
    }
    return { error: "Đã có lỗi xảy ra. Vui lòng thử lại." };
  }

  redirect("/login?reset=1");
}
