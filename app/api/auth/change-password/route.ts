import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { sql } from "@/lib/db";
import { audit } from "@/lib/stock";

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  const password = String(form.get("password") || "");
  const confirm = String(form.get("confirm_password") || "");
  if (password.length < 6) return NextResponse.redirect(new URL("/change-password?error=Mật khẩu tối thiểu 6 ký tự", request.url), 303);
  if (password !== confirm) return NextResponse.redirect(new URL("/change-password?error=Mật khẩu xác nhận không khớp", request.url), 303);
  const hash = await bcrypt.hash(password, 12);
  await sql`UPDATE users SET password_hash=${hash},must_change_password=false,updated_at=now() WHERE id=${profile.id}::uuid`;
  await audit({ actorUserId: profile.id, action: "change_password", entityType: "user", entityId: profile.id });
  return NextResponse.redirect(new URL("/dashboard", request.url), 303);
}
