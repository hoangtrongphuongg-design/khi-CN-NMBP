import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { confirmDeliveryItem, createSupplierDelivery, finalizeDeliveryByPhc, resubmitDeliveryItem } from "@/lib/services/deliveries";
import { confirmSupplierReturn, createSupplierReturn } from "@/lib/services/supplier-returns";

function back(request: Request, params: string) {
  return NextResponse.redirect(new URL(`/deliveries?${params}`, request.url), 303);
}

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  const action = String(form.get("action") || "");
  try {
    if (action === "create_delivery") {
      const lines = JSON.parse(String(form.get("lines") || "[]"));
      await createSupplierDelivery(profile, {
        deliveryDate: String(form.get("delivery_date")),
        lines,
        note: String(form.get("note") || ""),
        visitsMine: form.get("visits_mine") === "on",
        co2LiquidSpecial: form.get("co2_special") === "on",
      });
    } else if (action === "supplier_resubmit_delivery_item") {
      await resubmitDeliveryItem(profile, String(form.get("item_id")), Number(form.get("declared_qty") || 0));
    } else if (action === "confirm_delivery_item" || action === "feedback_delivery_item") {
      await confirmDeliveryItem(
        profile,
        String(form.get("item_id")),
        Number(form.get("actual_qty") || 0),
        action === "confirm_delivery_item" ? "confirm" : "feedback",
        String(form.get("feedback") || ""),
      );
    } else if (action === "finalize_delivery_phc") {
      await finalizeDeliveryByPhc(profile, String(form.get("delivery_id")));
    } else if (action === "create_supplier_return") {
      const lines = JSON.parse(String(form.get("lines") || "[]"));
      await createSupplierReturn(profile, {
        returnDate: String(form.get("return_date")),
        sourceLocationId: String(form.get("source_location_id")),
        tripId: String(form.get("trip_id") || "") || null,
        lines,
        note: String(form.get("note") || ""),
      });
    } else if (action === "confirm_supplier_return") {
      const itemActuals = JSON.parse(String(form.get("item_actuals") || "[]"));
      await confirmSupplierReturn(profile, String(form.get("return_id")), itemActuals, String(form.get("feedback") || ""));
    } else {
      throw new Error("Hành động không hợp lệ");
    }
    return back(request, "ok=1");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return back(request, `error=${encodeURIComponent(message)}`);
  }
}
