import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { finalizeInventoryCutover, saveInventoryCutoverDraft, setStockBalance, type CutoverCountInput } from "@/lib/services/admin";
import { adminCorrectSupplierDelivery } from "@/lib/services/deliveries";
import { adminCorrectSupplierReturn } from "@/lib/services/supplier-returns";
import { adminCorrectInternalRequest } from "@/lib/services/internal";
import { adminCorrectTransfer } from "@/lib/services/transfers";

function redirect(request: Request, params: Record<string,string>) {
  const url = new URL("/admin", request.url);
  for (const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
  return NextResponse.redirect(url,303);
}

function parseLines(form: FormData) {
  const groups = new Map<string,Record<string,string>>();
  for (const [name,value] of form.entries()) {
    if (!name.startsWith("line__")) continue;
    const rest = name.slice("line__".length);
    const splitAt = rest.indexOf("__");
    if (splitAt < 1) continue;
    const key = rest.slice(0,splitAt);
    const field = rest.slice(splitAt+2);
    const row = groups.get(key) || {};
    row[field] = String(value);
    groups.set(key,row);
  }
  return Array.from(groups.entries()).map(([key,row]) => ({ key,row }));
}

function numberOrZero(value?: string) {
  const n = Number(String(value ?? "").replace(",","."));
  return Number.isFinite(n) ? n : 0;
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

    if (action.startsWith("correct_") && String(form.get("confirm") || "") !== "yes") {
      throw new Error("Vui lòng xác nhận trước khi Admin cập nhật dữ liệu nghiệp vụ");
    }

    if (action === "correct_supplier_delivery") {
      const lines = parseLines(form).filter(({key,row}) => !key.startsWith("new-") || Boolean(row.product_id)).map(({key,row}) => ({
        itemId: key.startsWith("new-") ? null : key,
        productId: row.product_id || "",
        destinationLocationId: row.location_id || "",
        declaredQty: numberOrZero(row.declared_qty),
        confirmedQty: numberOrZero(row.confirmed_qty),
        delete: row.delete === "yes",
      }));
      const id = String(form.get("entity_id") || "");
      await adminCorrectSupplierDelivery(profile,id,{
        deliveryDate:String(form.get("event_date") || ""),note:String(form.get("note") || "").trim() || null,
        reason:String(form.get("reason") || ""),lines,
      });
      return redirect(request,{ tab:"data",type:"supplier_delivery",edit:id,ok:"Đã chỉnh Phiếu giao NCC và lưu Audit trước/sau." });
    }
    if (action === "correct_supplier_return") {
      const lines = parseLines(form).filter(({key,row}) => !key.startsWith("new-") || Boolean(row.product_id)).map(({key,row}) => ({
        itemId:key.startsWith("new-") ? null : key,productId:row.product_id || "",quantity:numberOrZero(row.quantity),delete:row.delete === "yes",
      }));
      const id = String(form.get("entity_id") || "");
      await adminCorrectSupplierReturn(profile,id,{
        returnDate:String(form.get("event_date") || ""),sourceLocationId:String(form.get("location_id") || ""),note:String(form.get("note") || "").trim() || null,
        reason:String(form.get("reason") || ""),lines,
      });
      return redirect(request,{ tab:"data",type:"supplier_return",edit:id,ok:"Đã chỉnh Phiếu trả vỏ NCC và lưu Audit trước/sau." });
    }
    if (action === "correct_internal_request") {
      const lines = parseLines(form).filter(({key,row}) => !key.startsWith("new-") || Boolean(row.product_id)).map(({key,row}) => ({
        itemId:key.startsWith("new-") ? null : key,productId:row.product_id || "",requestedQty:numberOrZero(row.requested_qty),actualQty:numberOrZero(row.actual_qty),
        returnBucket:row.return_bucket === "full" ? "full" as const : "empty" as const,delete:row.delete === "yes",
      }));
      const id = String(form.get("entity_id") || "");
      await adminCorrectInternalRequest(profile,id,{
        requestType:String(form.get("request_type") || "exchange") as "exchange"|"borrow"|"return",groupId:String(form.get("group_id") || ""),
        requestedDate:String(form.get("event_date") || ""),note:String(form.get("note") || "").trim() || null,reason:String(form.get("reason") || ""),lines,
      });
      return redirect(request,{ tab:"data",type:"internal_request",edit:id,ok:"Đã chỉnh Phiếu nội bộ và lưu Audit trước/sau." });
    }
    if (action === "correct_transfer") {
      const direction = String(form.get("direction") || "plant_to_mine") as "plant_to_mine"|"mine_to_plant";
      const lines = parseLines(form).filter(({key,row}) => !key.startsWith("new-") || Boolean(row.product_id)).map(({key,row}) => ({
        itemId:key.startsWith("new-") ? null : key,productId:row.product_id || "",quantity:numberOrZero(row.quantity),
        sourceBucket:direction === "mine_to_plant" ? "managed" as const : row.source_bucket === "empty" ? "empty" as const : "full" as const,delete:row.delete === "yes",
      }));
      const id = String(form.get("entity_id") || "");
      await adminCorrectTransfer(profile,id,{
        direction,transferDate:String(form.get("event_date") || ""),note:String(form.get("note") || "").trim() || null,reason:String(form.get("reason") || ""),lines,
      });
      return redirect(request,{ tab:"data",type:"transfer",edit:id,ok:"Đã chỉnh Phiếu điều chuyển và lưu Audit trước/sau." });
    }

    await setStockBalance(profile, String(form.get("stock_point_id")), String(form.get("product_id")), String(form.get("bucket")) as any, Number(form.get("qty") || 0));
    return redirect(request,{ tab:"master",ok:"1" });
  } catch (error) {
    const dataAction = action.startsWith("correct_");
    const entityType = action === "correct_supplier_delivery" ? "supplier_delivery" : action === "correct_supplier_return" ? "supplier_return" : action === "correct_internal_request" ? "internal_request" : action === "correct_transfer" ? "transfer" : "all";
    return redirect(request,{ tab: dataAction ? "data" : action.includes("cutover") ? "cutover" : "master", type: entityType, edit: dataAction ? String(form.get("entity_id") || "") : "", error: error instanceof Error ? error.message : String(error) });
  }
}
