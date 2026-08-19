import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { createAndConfirmTransfer, submitTransferFeedback } from "@/lib/services/transfers";

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  const action = String(form.get("action") || "");

  try {
    if (action === "create") {
      await createAndConfirmTransfer(profile, {
        direction: String(form.get("direction")) as "plant_to_mine"|"mine_to_plant",
        transferDate: String(form.get("transfer_date")),
        productId: String(form.get("product_id")),
        quantity: Number(form.get("quantity") || 0),
        sourceBucket: String(form.get("source_bucket") || "full") as "full"|"empty"|"managed",
        note: String(form.get("note") || ""),
      });
    } else if (action === "feedback") {
      await submitTransferFeedback(
        profile,
        String(form.get("transfer_id")),
        String(form.get("feedback") || ""),
      );
    } else {
      throw new Error("Hành động không hợp lệ");
    }

    return NextResponse.redirect(new URL("/transfers?ok=1", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.redirect(new URL(`/transfers?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}
