import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import {
  cancelZoneCount,
  closeStocktakeRound,
  confirmZoneCount,
  openStocktakeRound,
  startZoneCount,
  type ZoneCountInput,
} from "@/lib/services/stocktake";

function redirect(request: Request, params: Record<string,string>) {
  const url = new URL("/admin", request.url);
  url.searchParams.set("tab","cutover");
  for (const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
  return NextResponse.redirect(url,303);
}

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  const action = String(form.get("action") || "");
  try {
    if (action === "open_round") {
      const result = await openStocktakeRound(profile,{
        startDate:String(form.get("start_date") || ""),
        note:String(form.get("note") || "").trim() || null,
      });
      return redirect(request,{ ok: result.switchedToLive
        ? `Đã mở đợt kiểm kê ${result.roundCode} và chuyển hệ thống sang Vận hành chính thức.`
        : `Đã mở đợt kiểm kê ${result.roundCode}.` });
    }
    if (action === "start_zone") {
      await startZoneCount(profile,String(form.get("stock_point_id") || ""));
      return redirect(request,{ ok:"Đã bắt đầu kiểm kê khu. Số máy đã được chụp lại; nhập số đếm rồi Xác nhận." });
    }
    if (action === "confirm_zone") {
      if (String(form.get("confirm") || "") !== "yes") throw new Error("Vui lòng tick xác nhận số đếm là số thực tế");
      const counts: ZoneCountInput[] = [];
      for (const [name,value] of form.entries()) {
        if (!name.startsWith("count__")) continue;
        const [,productId,bucket] = name.split("__");
        const raw = String(value).trim();
        counts.push({ productId, bucket, qty: raw === "" ? Number.NaN : Number(raw.replace(",",".")) });
      }
      const pointName = await confirmZoneCount(profile,String(form.get("zone_id") || ""),counts,String(form.get("note") || "").trim() || null);
      return redirect(request,{ ok:`Đã chốt kiểm kê ${pointName}.` });
    }
    if (action === "cancel_zone") {
      await cancelZoneCount(profile,String(form.get("zone_id") || ""));
      return redirect(request,{ ok:"Đã hủy khu đang kiểm kê; tồn không thay đổi." });
    }
    if (action === "close_round") {
      if (String(form.get("confirm") || "") !== "yes") throw new Error("Vui lòng tick xác nhận trước khi đóng đợt");
      await closeStocktakeRound(profile,String(form.get("round_id") || ""),String(form.get("discrepancy_reason") || ""));
      return redirect(request,{ ok:"Đã đóng đợt kiểm kê." });
    }
    throw new Error("Thao tác không hợp lệ");
  } catch (error) {
    return redirect(request,{ error: error instanceof Error ? error.message : String(error) });
  }
}
