import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { confirmDeliveryItem, createSupplierDelivery, finalizeDeliveryByPhc, resubmitDeliveryItem } from "@/lib/services/deliveries";
import { createSupplierReturn, feedbackSupplierReturnItem } from "@/lib/services/supplier-returns";
import { createDataCorrectionRequest } from "@/lib/services/admin";

function back(request: Request, params: string) {
  return NextResponse.redirect(new URL(`/deliveries?${params}`, request.url), 303);
}

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  const action = String(form.get("action") || "");
  let tab = "deliveries";
  try {
    if (action === "create_delivery") {
      const lines = JSON.parse(String(form.get("lines") || "[]"));
      await createSupplierDelivery(profile, {
        deliveryDate: String(form.get("delivery_date")),
        lines,
        note: String(form.get("note") || ""),
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
        deliveryId: String(form.get("delivery_id")),
        lines,
        note: String(form.get("note") || ""),
      });
    } else if (action === "feedback_supplier_return_item") {
      tab = "returns";
      await feedbackSupplierReturnItem(profile, String(form.get("item_id")), String(form.get("feedback") || ""));
    } else if (action === "create_data_correction_request") {
      const targetType = String(form.get("target_type") || "") as "supplier_delivery" | "supplier_return";
      tab = targetType === "supplier_return" ? "returns" : "deliveries";
      await createDataCorrectionRequest(profile, {
        targetType,
        targetId: String(form.get("target_id") || ""),
        reason: String(form.get("reason") || ""),
        requestedChange: String(form.get("requested_change") || ""),
      });
    } else {
      throw new Error("Hành động không hợp lệ");
    }
    return back(request, `tab=${tab}&ok=1`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return back(request, `tab=${tab}&error=${encodeURIComponent(message)}`);
  }
}
