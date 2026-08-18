import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { createAndDispatchTransfer, receiveTransfer, reviewTransfer } from "@/lib/services/transfers";

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  const action = String(form.get("action") || "");
  try {
    if (action === "create") {
      await createAndDispatchTransfer(profile, {
        direction: String(form.get("direction")) as "plant_to_mine"|"mine_to_plant",
        transferDate: String(form.get("transfer_date")),
        productId: String(form.get("product_id")),
        quantity: Number(form.get("quantity") || 0),
        sourceBucket: String(form.get("source_bucket") || "full") as "full"|"empty"|"managed",
        note: String(form.get("note") || ""),
      });
    } else if (action === "receive") {
      await receiveTransfer(profile, String(form.get("transfer_id")), Number(form.get("received_qty") || 0), String(form.get("destination_bucket") || "empty") as "full"|"empty");
    } else if (action === "review_approve" || action === "review_feedback") {
      await reviewTransfer(profile, String(form.get("transfer_id")), action === "review_approve" ? "approve" : "feedback", String(form.get("feedback") || ""));
    } else throw new Error("Hành động không hợp lệ");
    return NextResponse.redirect(new URL("/transfers?ok=1", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.redirect(new URL(`/transfers?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}
