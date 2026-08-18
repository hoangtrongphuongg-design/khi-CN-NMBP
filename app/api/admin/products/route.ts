import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { upsertProduct } from "@/lib/services/admin";

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  try {
    await upsertProduct(profile, {
      code: String(form.get("code") || ""),
      name: String(form.get("name") || ""),
      category: String(form.get("category") || ""),
      specification: String(form.get("specification") || "") || null,
      unit: String(form.get("unit") || ""),
      returnableContainer: form.get("returnable_container") === "on",
      warehouseSplitFullEmpty: form.get("warehouse_split_full_empty") === "on",
      internalGroupTracking: form.get("internal_group_tracking") === "on",
      cylinderRentalEligible: form.get("cylinder_rental_eligible") === "on",
    });
    return NextResponse.redirect(new URL("/admin?tab=master&ok=1", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.redirect(new URL(`/admin?tab=master&error=${encodeURIComponent(message)}`, request.url), 303);
  }
}
