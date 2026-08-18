import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { approveBorrow, createInternalRequest, executeInternalRequest, reviewInternalRequest } from "@/lib/services/internal";

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  const action = String(form.get("action") || "");
  try {
    if (action === "create") {
      await createInternalRequest(profile, {
        requestType: String(form.get("request_type")) as "exchange"|"borrow"|"return",
        productId: String(form.get("product_id")),
        quantity: Number(form.get("quantity") || 0),
        note: String(form.get("note") || ""),
      });
    } else if (action === "approve_borrow") {
      await approveBorrow(profile, String(form.get("request_id")));
    } else if (action === "execute") {
      await executeInternalRequest(
        profile,
        String(form.get("request_id")),
        Number(form.get("actual_qty") || 0),
        String(form.get("return_bucket") || "empty") as "full"|"empty",
      );
    } else if (action === "review_approve" || action === "review_feedback") {
      await reviewInternalRequest(profile, String(form.get("request_id")), action === "review_approve" ? "approve" : "feedback", String(form.get("feedback") || ""));
    } else throw new Error("Hành động không hợp lệ");
    return NextResponse.redirect(new URL("/internal?ok=1", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.redirect(new URL(`/internal?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}
