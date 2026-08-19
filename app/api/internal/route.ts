import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { approveBorrow, createInternalRequest, executeInternalRequest, reviewInternalRequest } from "@/lib/services/internal";

function wantsJson(request: Request) {
  return (request.headers.get("accept") || "").includes("application/json");
}

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  const action = String(form.get("action") || "");
  try {
    if (action === "create") {
      let items: { productId: string; quantity: number }[] = [];
      const rawItems = String(form.get("items_json") || "");
      if (rawItems) {
        const parsed = JSON.parse(rawItems);
        if (!Array.isArray(parsed)) throw new Error("Danh sách loại khí không hợp lệ");
        items = parsed.map((x: any) => ({ productId: String(x.productId || ""), quantity: Number(x.quantity || 0) }));
      } else {
        items = [{ productId: String(form.get("product_id") || ""), quantity: Number(form.get("quantity") || 0) }];
      }
      await createInternalRequest(profile, {
        requestType: String(form.get("request_type")) as "exchange"|"borrow"|"return",
        items,
        note: String(form.get("note") || ""),
      });
    } else if (action === "approve_borrow") {
      await approveBorrow(profile, String(form.get("request_id")));
    } else if (action === "execute") {
      const ids = String(form.get("item_ids") || "").split(",").map((x) => x.trim()).filter(Boolean);
      const execution = ids.map((id) => ({
        itemId: id,
        actualQty: Number(form.get(`actual_${id}`) || 0),
        returnBucket: String(form.get(`bucket_${id}`) || "empty") as "full"|"empty",
      }));
      if (!execution.length) {
        execution.push({ itemId: String(form.get("request_id")), actualQty: Number(form.get("actual_qty") || 0), returnBucket: String(form.get("return_bucket") || "empty") as "full"|"empty" });
      }
      await executeInternalRequest(profile, String(form.get("request_id")), execution);
    } else if (action === "review_approve" || action === "review_feedback") {
      await reviewInternalRequest(profile, String(form.get("request_id")), action === "review_approve" ? "approve" : "feedback", String(form.get("feedback") || ""));
    } else throw new Error("Hành động không hợp lệ");

    if (wantsJson(request)) return NextResponse.json({ ok: true });
    return NextResponse.redirect(new URL("/internal?ok=1", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (wantsJson(request)) return NextResponse.json({ ok: false, error: message }, { status: 400 });
    return NextResponse.redirect(new URL(`/internal?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}
