import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { upsertThreshold } from "@/lib/services/admin";

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  try {
    await upsertThreshold(profile, String(form.get("product_id")), Number(form.get("threshold_qty")), String(form.get("recipient_email") || ""), form.get("enabled") === "on");
    return NextResponse.redirect(new URL("/admin?tab=thresholds&ok=1", request.url), 303);
  } catch (error) {
    return NextResponse.redirect(new URL(`/admin?tab=thresholds&error=${encodeURIComponent(String(error instanceof Error ? error.message : error))}`, request.url), 303);
  }
}
