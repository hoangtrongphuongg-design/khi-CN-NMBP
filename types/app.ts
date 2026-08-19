export type AppRole =
  | "admin"
  | "workshop"
  | "warehouse_manager"
  | "storekeeper"
  | "mine_xsc"
  | "foreman"
  | "supervisor"
  | "worker"
  | "management_board"
  | "supplier";

export type Profile = {
  id: string;
  username: string;
  full_name: string;
  role: AppRole;
  group_id: string | null;
  group_name?: string | null;
  location_id: string | null;
  location_code?: string | null;
  organization_id: string | null;
  organization_name?: string | null;
  active: boolean;
  must_change_password?: boolean;
};

export type InventoryRow = {
  point_code: string;
  point_name: string;
  point_kind: "warehouse" | "group" | "transit";
  product_code: string;
  product_name: string;
  unit: string;
  full_qty: number;
  empty_qty: number;
  unclassified_qty: number;
  total_qty: number;
  low_threshold?: number | null;
};

export type DashboardData = {
  lowStock: InventoryRow[];
  inventory: InventoryRow[];
  pendingCount: number;
  monthTrips: number;
  monthCost: number;
};
