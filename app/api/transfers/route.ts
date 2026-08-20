import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { createAndConfirmTransfer, reviseTransferAfterFeedback, submitTransferFeedback } from "@/lib/services/transfers";

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  const action = String(form.get("action") || "");
  try {
    if (action === "create") {
      let items: Array<{ productId: string; quantity: number; sourceBucket?: "full"|"empty"|"managed" }> = [];
      try { items = JSON.parse(String(form.get("items") || "[]")); } catch { items = []; }
      // Tương thích form cũ nếu còn cache/deploy cũ.
      if (!items.length && form.get("product_id")) items = [{ productId: String(form.get("product_id")), quantity: Number(form.get("quantity") || 0), sourceBucket: String(form.get("source_bucket") || "full") as "full"|"empty"|"managed" }];
      await createAndConfirmTransfer(profile, { direction: String(form.get("direction")) as "plant_to_mine"|"mine_to_plant", transferDate: String(form.get("transfer_date")), items, note: String(form.get("note") || "") });
    } else if (action === "revise_after_feedback") {
      let items: Array<{ productId: string; quantity: number; sourceBucket?: "full"|"empty"|"managed" }> = [];
      try { items = JSON.parse(String(form.get("items") || "[]")); } catch { items = []; }
      await reviseTransferAfterFeedback(profile, String(form.get("transfer_id")), items);
    } else if (action === "feedback") {
      await submitTransferFeedback(profile, String(form.get("transfer_id")), String(form.get("feedback") || ""));
    } else throw new Error("Hành động không hợp lệ");
    return NextResponse.redirect(new URL("/transfers?ok=1", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.redirect(new URL(`/transfers?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}
