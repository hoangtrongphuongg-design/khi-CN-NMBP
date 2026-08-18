import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { createUser, resetPassword, setUserActive } from "@/lib/services/admin";
import type { AppRole } from "@/types/app";

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  const action = String(form.get("action") || "create");
  try {
    if (action === "create") {
      await createUser(profile, {
        username: String(form.get("username") || ""),
        fullName: String(form.get("full_name") || ""),
        password: String(form.get("password") || ""),
        role: String(form.get("role") || "worker") as AppRole,
        groupId: String(form.get("group_id") || "") || null,
        locationId: String(form.get("location_id") || "") || null,
        organizationId: String(form.get("organization_id") || "") || null,
        email: String(form.get("email") || "") || null,
      });
    } else if (action === "reset_password") {
      await resetPassword(profile, String(form.get("user_id")), String(form.get("password") || ""));
    } else if (action === "set_active") {
      await setUserActive(profile, String(form.get("user_id")), String(form.get("active")) === "true");
    }
    return NextResponse.redirect(new URL("/admin?tab=users&ok=1", request.url), 303);
  } catch (error) {
    return NextResponse.redirect(new URL(`/admin?tab=users&error=${encodeURIComponent(String(error instanceof Error ? error.message : error))}`, request.url), 303);
  }
}
