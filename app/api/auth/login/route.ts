import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") || "").trim().toUpperCase();
  const password = String(form.get("password") || "");
  if (!username || !password) return NextResponse.redirect(new URL("/login?error=Thiếu thông tin đăng nhập", request.url), 303);

  const [user] = await sql<{ id: string; password_hash: string; active: boolean; session_version: number }[]>`
    SELECT id,password_hash,active,session_version FROM users WHERE upper(username)=${username} LIMIT 1
  `;
  if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
    return NextResponse.redirect(new URL("/login?error=Tên đăng nhập hoặc mật khẩu không đúng", request.url), 303);
  }
  await createSession(user.id, user.session_version);
  return NextResponse.redirect(new URL("/dashboard", request.url), 303);
}
