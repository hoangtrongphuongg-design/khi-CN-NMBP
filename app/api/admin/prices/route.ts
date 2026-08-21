import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import {
  deleteMonthlyAdjustment,
  lockPriceMonth,
  saveContractBasePrices,
  saveMonthlyAdjustment,
  unlockPriceMonth,
  type BasePriceInput,
  type RepriceImpact,
} from "@/lib/services/prices";
import type { PriceType } from "@/lib/pricing";

function redirectUrl(request: Request, month: string, contractId: string, params: { ok?: string; error?: string }) {
  const url = new URL("/admin", request.url);
  url.searchParams.set("tab","prices");
  if (month) url.searchParams.set("price_month",month);
  if (contractId) url.searchParams.set("price_contract",contractId);
  if (params.ok) url.searchParams.set("ok",params.ok);
  if (params.error) url.searchParams.set("error",params.error);
  return url;
}

function impactMessage(prefix: string, impact?: RepriceImpact) {
  if (!impact) return prefix;
  const delta = Math.round(Number(impact.amountDelta || 0));
  return `${prefix}. Tự tính lại ${impact.deliveryLines} dòng giao, ${impact.tripRows} chuyến, ${impact.xl45Allocations} phân bổ XL-45; chênh lệch ${delta.toLocaleString("vi-VN")} đ`;
}

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  const action = String(form.get("action") || "");
  const month = String(form.get("month") || form.get("return_month") || "");
  const contractId = String(form.get("contract_id") || "");

  try {
    if (action === "save_base_prices") {
      const entries: BasePriceInput[] = [];
      for (const [key,value] of form.entries()) {
        const raw = String(value ?? "").trim();
        if (!raw) continue;
        if (key.startsWith("base_product__")) {
          entries.push({ priceType:"product",productId:key.slice("base_product__".length),unitPrice:Number(raw) });
        } else if (key.startsWith("base_service__")) {
          entries.push({ priceType:key.slice("base_service__".length) as PriceType,productId:null,unitPrice:Number(raw) });
        }
      }
      const result = await saveContractBasePrices(profile,contractId,entries);
      return NextResponse.redirect(redirectUrl(request,month,contractId,{ ok:impactMessage(`Đã lưu ${result.changed} đơn giá gốc hợp đồng`,result.impact) }),303);
    }

    if (action === "save_adjustment") {
      const impact=await saveMonthlyAdjustment(profile,{
        ruleId:String(form.get("rule_id") || "") || null,
        contractId,
        priceType:String(form.get("price_type") || "") as PriceType,
        productId:String(form.get("product_id") || "") || null,
        unitPrice:Number(form.get("unit_price") || 0),
        effectiveFrom:String(form.get("effective_from") || ""),
        effectiveTo:String(form.get("effective_to") || ""),
        note:String(form.get("note") || "") || null,
      });
      return NextResponse.redirect(redirectUrl(request,month,contractId,{ ok:impactMessage("Đã lưu điều chỉnh giá",impact) }),303);
    }

    if (action === "delete_adjustment") {
      const impact=await deleteMonthlyAdjustment(profile,String(form.get("rule_id") || ""));
      return NextResponse.redirect(redirectUrl(request,month,contractId,{ ok:impactMessage("Đã xóa điều chỉnh; ngoài khoảng này dùng lại giá HĐ",impact) }),303);
    }

    if (action === "lock_month") {
      await lockPriceMonth(profile,contractId,month);
      return NextResponse.redirect(redirectUrl(request,month,contractId,{ ok:`Đã chốt và khóa bảng giá tháng ${month}` }),303);
    }

    if (action === "unlock_month") {
      await unlockPriceMonth(profile,contractId,month,String(form.get("reason") || ""));
      return NextResponse.redirect(redirectUrl(request,month,contractId,{ ok:`Đã mở khóa bảng giá tháng ${month}` }),303);
    }

    throw new Error("Thao tác đơn giá không hợp lệ");
  } catch (error) {
    const message=error instanceof Error?error.message:String(error);
    return NextResponse.redirect(redirectUrl(request,month,contractId,{ error:message }),303);
  }
}
