"use server";

import { redirect } from "next/navigation";
import { loginWithPassword, loginWithGoogle, AuthError } from "@/lib/auth";
import { persistSession } from "@/lib/session";

export interface LoginActionState {
  error?: string;
}

export async function loginAction(_prevState: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Vui lòng nhập email và mật khẩu." };
  }

  let session;
  try {
    session = await loginWithPassword(email, password);
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Email hoặc mật khẩu không đúng, hoặc email chưa được xác thực." };
    }
    return { error: "Đã có lỗi xảy ra. Vui lòng thử lại." };
  }

  await persistSession(session);
  redirect("/");
}

export async function googleLoginAction(idToken: string): Promise<LoginActionState> {
  let session;
  try {
    session = await loginWithGoogle(idToken);
  } catch {
    return { error: "Đăng nhập Google thất bại. Vui lòng thử lại." };
  }

  await persistSession(session);
  redirect("/");
}
