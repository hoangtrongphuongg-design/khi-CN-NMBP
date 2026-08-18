import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireProfile } from "@/lib/auth/current-user";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  if (profile.must_change_password) redirect("/change-password");
  return <AppShell profile={profile}>{children}</AppShell>;
}
