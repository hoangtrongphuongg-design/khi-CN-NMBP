export { getCurrentProfile, requireProfile } from "@/lib/auth/session";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import type { AppRole } from "@/types/app";

export async function requireRole(roles: AppRole[]) {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/dashboard");
  return profile;
}
