import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { confirmDeliveryItem, createSupplierDelivery, finalizeDeliveryByPhc, resubmitDeliveryItem, reviseConfirmedDeliveryItem } from "@/lib/services/deliveries";
import { createSupplierReturn, feedbackSupplierReturnItem, reviewSupplierReturnByWarehouseManager, reviseSupplierReturn } from "@/lib/services/supplier-returns";

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
    } else if (action === "xsc_revise_delivery_item") {
      await reviseConfirmedDeliveryItem(profile, String(form.get("item_id")), Number(form.get("actual_qty") || 0));
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
    } else if (action === "revise_supplier_return") {
      tab = String(form.get("return_tab") || "returns") === "deliveries" ? "deliveries" : "returns";
      const lines = JSON.parse(String(form.get("lines") || "[]"));
      await reviseSupplierReturn(profile, String(form.get("return_id")), lines);
    } else if (action === "feedback_supplier_return_item") {
      tab = "returns";
      await feedbackSupplierReturnItem(profile, String(form.get("item_id")), String(form.get("feedback") || ""));
    } else if (action === "review_supplier_return") {
      tab = String(form.get("return_tab") || "returns") === "deliveries" ? "deliveries" : "returns";
      const decision = String(form.get("decision") || "");
      if (decision !== "approve" && decision !== "feedback") throw new Error("Quyết định duyệt không hợp lệ");
      await reviewSupplierReturnByWarehouseManager(
        profile,
        String(form.get("return_id")),
        decision,
        String(form.get("review_note") || ""),
      );
    } else {
      throw new Error("Hành động không hợp lệ");
    }
    return back(request, `tab=${tab}&ok=1`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return back(request, `tab=${tab}&error=${encodeURIComponent(message)}`);
  }
}
