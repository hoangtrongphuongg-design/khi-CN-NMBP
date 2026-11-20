import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { createGroup, deactivateGroup } from "@/lib/services/admin";

export async function POST(request: Request) {
  const profile = await requireProfile();
  const form = await request.formData();
  try {
    if (String(form.get("action") || "") === "deactivate") {
      if (String(form.get("confirm") || "") !== "yes") throw new Error("Vui lòng tick xác nhận trước khi ngừng sử dụng nhóm");
      await deactivateGroup(profile, String(form.get("group_id") || ""), String(form.get("reason") || ""));
      return NextResponse.redirect(new URL(`/admin?tab=master&ok=${encodeURIComponent("Đã ngừng sử dụng nhóm. Lịch sử phiếu của nhóm vẫn được giữ nguyên.")}`, request.url), 303);
    }
    await createGroup(profile, String(form.get("code") || ""), String(form.get("name") || ""), String(form.get("location_id") || ""));
    return NextResponse.redirect(new URL("/admin?tab=master&ok=1", request.url), 303);
  } catch (error) {
    return NextResponse.redirect(new URL(`/admin?tab=master&error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`, request.url), 303);
  }
}
