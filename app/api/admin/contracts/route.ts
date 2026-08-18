import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { createContract } from "@/lib/services/admin";

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  try {
    await createContract(profile, {
      supplierOrgId: String(form.get("supplier_org_id") || ""),
      contractNo: String(form.get("contract_no") || ""),
      contractName: String(form.get("contract_name") || "") || null,
      signedDate: String(form.get("signed_date") || "") || null,
      validFrom: String(form.get("valid_from") || ""),
      validTo: String(form.get("valid_to") || "") || null,
    });
    return NextResponse.redirect(new URL("/admin?tab=prices&ok=1", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.redirect(new URL(`/admin?tab=prices&error=${encodeURIComponent(message)}`, request.url), 303);
  }
}
