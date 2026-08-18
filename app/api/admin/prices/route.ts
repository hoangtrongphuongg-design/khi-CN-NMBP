import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { createPriceVersion } from "@/lib/services/admin";
import type { PriceType } from "@/lib/pricing";

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  try {
    await createPriceVersion(profile, {
      priceType: String(form.get("price_type")) as PriceType,
      productId: String(form.get("product_id") || "") || null,
      unit: String(form.get("unit") || ""),
      unitPrice: Number(form.get("unit_price") || 0),
      effectiveFrom: String(form.get("effective_from") || ""),
      contractId: String(form.get("contract_id") || "") || null,
      note: String(form.get("note") || ""),
    });
    return NextResponse.redirect(new URL("/admin?tab=prices&ok=1", request.url), 303);
  } catch (error) {
    return NextResponse.redirect(new URL(`/admin?tab=prices&error=${encodeURIComponent(String(error instanceof Error ? error.message : error))}`, request.url), 303);
  }
}
