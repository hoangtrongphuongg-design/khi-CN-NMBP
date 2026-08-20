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
  return profile.role === "workshop";
}

export function canFinalizePhcDelivery(profile: Profile) {
  return ["warehouse_manager","storekeeper"].includes(profile.role);
}

export function canConfirmMineDelivery(profile: Profile) {
  return profile.role === "mine_xsc";
}

export function isReadOnly(profile: Profile) {
  return profile.role === "management_board" || profile.role === "worker";
}

export function canFeedbackDelivery(profile: Profile) {
  return ["workshop","warehouse_manager","storekeeper","mine_xsc"].includes(profile.role);
}

/**
 * Báo cáo chi phí chỉ dành cho 4 vai trò đã chốt nghiệp vụ.
 * Cần dùng helper này đồng thời ở menu, page và API để tránh lộ dữ liệu qua URL trực tiếp.
 */
export function canViewCostReports(profile: Profile) {
  return ["workshop", "warehouse_manager", "management_board", "supplier"].includes(profile.role);
}
export function canRequestDataCorrection(profile: Profile) {
  return ["workshop", "warehouse_manager"].includes(profile.role);
}

