import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { finalizeInventoryCutover, saveInventoryCutoverDraft, setStockBalance, type CutoverCountInput } from "@/lib/services/admin";

function redirect(request: Request, params: Record<string,string>) {
  const url = new URL("/admin", request.url);
  for (const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
  return NextResponse.redirect(url,303);
}

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  const action = String(form.get("action") || "set_stock");
  try {
    if (action === "save_cutover") {
      const counts: CutoverCountInput[] = [];
      for (const [name,value] of form.entries()) {
        if (!name.startsWith("count__")) continue;
        const [,stockPointId,productId,bucket] = name.split("__");
        const raw = String(value).trim();
        const qty = raw === "" ? 0 : Number(raw);
        counts.push({ stockPointId, productId, bucket: bucket as CutoverCountInput["bucket"], qty });
      }
      await saveInventoryCutoverDraft(profile, {
        stocktakeDate: String(form.get("stocktake_date") || ""),
        goLiveDate: String(form.get("go_live_date") || ""),
        note: String(form.get("note") || "").trim() || null,
        counts,
      });
      return redirect(request,{ tab:"cutover",ok:"Đã lưu bản kiểm kê nháp. Hãy kiểm tra bảng đối chiếu trước khi chốt." });
    }
    if (action === "finalize_cutover") {
      if (String(form.get("confirm") || "") !== "yes") throw new Error("Vui lòng xác nhận trước khi chốt vận hành");
      await finalizeInventoryCutover(profile,String(form.get("cutover_id") || ""),String(form.get("discrepancy_reason") || ""));
      return redirect(request,{ tab:"cutover",ok:"Đã chốt kiểm kê và chuyển sang Vận hành chính thức." });
    }

    await setStockBalance(profile, String(form.get("stock_point_id")), String(form.get("product_id")), String(form.get("bucket")) as any, Number(form.get("qty") || 0));
    return redirect(request,{ tab:"master",ok:"1" });
  } catch (error) {
    return redirect(request,{ tab: action.includes("cutover") ? "cutover" : "master", error: error instanceof Error ? error.message : String(error) });
  }
}
