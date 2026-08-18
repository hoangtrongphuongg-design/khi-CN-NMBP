import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { deleteCalendarException, upsertCalendarException } from "@/lib/services/admin";

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  try {
    const date = String(form.get("date") || "");
    if (String(form.get("action")) === "delete") await deleteCalendarException(profile, date);
    else await upsertCalendarException(profile, date, String(form.get("type")) as "holiday"|"workday", String(form.get("note") || ""));
    return NextResponse.redirect(new URL("/admin?tab=calendar&ok=1", request.url), 303);
  } catch (error) {
    return NextResponse.redirect(new URL(`/admin?tab=calendar&error=${encodeURIComponent(String(error instanceof Error ? error.message : error))}`, request.url), 303);
  }
}
