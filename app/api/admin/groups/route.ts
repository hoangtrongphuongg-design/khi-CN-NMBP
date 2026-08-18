import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { createGroup } from "@/lib/services/admin";

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  try {
    await createGroup(profile, String(form.get("code") || ""), String(form.get("name") || ""), String(form.get("location_id") || ""));
    return NextResponse.redirect(new URL("/admin?tab=master&ok=1", request.url), 303);
  } catch (error) {
    return NextResponse.redirect(new URL(`/admin?tab=master&error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`, request.url), 303);
  }
}
