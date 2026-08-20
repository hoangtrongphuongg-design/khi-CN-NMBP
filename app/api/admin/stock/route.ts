import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { setStockBalance } from "@/lib/services/admin";

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  try {
    await setStockBalance(profile, String(form.get("stock_point_id")), String(form.get("product_id")), String(form.get("bucket")) as any, Number(form.get("qty") || 0));
    return NextResponse.redirect(new URL("/admin?tab=master&ok=1", request.url), 303);
  } catch (error) {
    return NextResponse.redirect(new URL(`/admin?tab=master&error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`, request.url), 303);
  }
}
