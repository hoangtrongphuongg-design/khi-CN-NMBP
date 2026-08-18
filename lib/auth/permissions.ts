import type { AppRole, Profile } from "@/types/app";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  workshop: "Workshop",
  warehouse_manager: "Trưởng kho Hậu cần",
  storekeeper: "Thủ kho",
  mine_xsc: "XSC Mỏ",
  foreman: "Đốc công",
  supervisor: "Giám sát",
  worker: "Công nhân",
  management_board: "Ban quản đốc",
  supplier: "NCC",
};

export function canViewAllInternal(profile: Profile) {
  return ["admin","workshop","warehouse_manager","storekeeper","mine_xsc","management_board"].includes(profile.role);
}

export function canCreateGroupRequest(profile: Profile) {
  return ["foreman","supervisor"].includes(profile.role) && Boolean(profile.group_id);
}

export function canApproveOfficeBorrow(profile: Profile) {
  return ["workshop","warehouse_manager"].includes(profile.role);
}

export function canExecuteWarehouse(profile: Profile) {
  return profile.role === "storekeeper";
}

export function canReviewWarehouse(profile: Profile) {
  return ["warehouse_manager","workshop"].includes(profile.role);
}

export function canConfirmPlantDelivery(profile: Profile) {
  return ["workshop","warehouse_manager","storekeeper"].includes(profile.role);
}

export function canConfirmMineDelivery(profile: Profile) {
  return ["mine_xsc"].includes(profile.role);
}

export function isReadOnly(profile: Profile) {
  return profile.role === "management_board" || profile.role === "worker";
}

export function canFeedbackDelivery(profile: Profile) {
  return ["workshop","warehouse_manager","storekeeper","mine_xsc"].includes(profile.role);
}
