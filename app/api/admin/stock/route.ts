import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { applyDataCorrection, rejectDataCorrection, setStockBalance } from "@/lib/services/admin";

function redirectAdmin(request: Request, tab: string, message: string, isError = false) {
  const key = isError ? "error" : "ok";
  return NextResponse.redirect(new URL(`/admin?tab=${tab}&${key}=${encodeURIComponent(message)}`, request.url), 303);
}

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  const action = String(form.get("action") || "set_stock");
  try {
    if (action === "apply_data_correction") {
      const existingLines = Array.from(form.entries())
        .filter(([key]) => key.startsWith("qty_"))
        .map(([key, value]) => ({ itemId: key.slice(4), quantity: Number(value) }));
      const newLines = [1, 2, 3]
        .map((index) => ({
          productId: String(form.get(`new_product_${index}`) || ""),
          destinationLocationId: String(form.get(`new_location_${index}`) || "") || null,
          quantity: Number(form.get(`new_qty_${index}`) || 0),
        }))
        .filter((line) => line.productId && line.quantity > 0);
      await applyDataCorrection(profile, {
        requestId: String(form.get("request_id") || ""),
        existingLines,
        newLines,
        adminNote: String(form.get("admin_note") || ""),
      });
      return redirectAdmin(request, "corrections", "Đã điều chỉnh dữ liệu và ghi lịch sử");
    }
    if (action === "reject_data_correction") {
      await rejectDataCorrection(profile, String(form.get("request_id") || ""), String(form.get("admin_note") || ""));
      return redirectAdmin(request, "corrections", "Đã từ chối đề nghị sửa dữ liệu");
    }

    await setStockBalance(
      profile,
      String(form.get("stock_point_id")),
      String(form.get("product_id")),
      String(form.get("bucket")) as any,
      Number(form.get("qty") || 0),
    );
    return redirectAdmin(request, "master", "Đã cập nhật số dư");
  } catch (error) {
    return redirectAdmin(request, action.includes("correction") ? "corrections" : "master", error instanceof Error ? error.message : String(error), true);
  }
}
