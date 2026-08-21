import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { createContract } from "@/lib/services/admin";

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  const month=String(form.get("return_month") || "");
  try {
    const contractId=await createContract(profile, {
      supplierOrgId: String(form.get("supplier_org_id") || ""),
      contractNo: String(form.get("contract_no") || ""),
      contractName: String(form.get("contract_name") || "") || null,
      signedDate: String(form.get("signed_date") || "") || null,
      validFrom: String(form.get("valid_from") || ""),
      validTo: String(form.get("valid_to") || "") || null,
    });
    const url=new URL("/admin",request.url);
    url.searchParams.set("tab","prices");
    url.searchParams.set("price_contract",contractId);
    if(month) url.searchParams.set("price_month",month);
    url.searchParams.set("ok","Đã tạo hợp đồng. Tiếp tục nhập bảng giá gốc hợp đồng.");
    return NextResponse.redirect(url,303);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const url=new URL("/admin",request.url);
    url.searchParams.set("tab","prices");
    if(month) url.searchParams.set("price_month",month);
    url.searchParams.set("error",message);
    return NextResponse.redirect(url,303);
  }
}
