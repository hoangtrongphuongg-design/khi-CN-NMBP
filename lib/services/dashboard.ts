import { sql } from "@/lib/db";
import { getInventory } from "@/lib/services/inventory";
import type { DashboardData, Profile } from "@/types/app";

export async function getDashboardData(profile?: Profile): Promise<DashboardData> {
  const [inventoryAll, pendingRows, tripRows] = await Promise.all([
    getInventory(),
    sql<{ count: number }[]>`
      SELECT (
        (SELECT count(*) FROM internal_requests WHERE status IN ('pending','approved','executed_pending_review','feedback')) +
        (SELECT count(*) FROM supplier_deliveries WHERE status IN ('pending','feedback')) +
        (SELECT count(*) FROM supplier_returns WHERE status IN ('pending','feedback')) +
        (SELECT count(*) FROM transfers WHERE status IN ('pending','in_transit','received_pending_review','feedback'))
      )::int AS count
    `,
    sql<{ count: number; cost: number }[]>`
      SELECT count(*)::int AS count,COALESCE(sum(transport_amount),0)::float8 AS cost
      FROM transport_trips
      WHERE trip_date>=date_trunc('month',CURRENT_DATE)::date AND status='completed'
    `,
  ]);
  let inventory = inventoryAll;
  let pendingCount = pendingRows[0]?.count ?? 0;
  if (profile && ["foreman","supervisor","worker"].includes(profile.role)) {
    const pointCode = profile.group_id ? await sql<{ code: string }[]>`SELECT 'GRP-'||code AS code FROM work_groups WHERE id=${profile.group_id}::uuid` : [];
    inventory = pointCode[0] ? inventoryAll.filter((x) => x.point_code === pointCode[0].code) : [];
    if (profile.group_id) {
      const [row] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM internal_requests WHERE group_id=${profile.group_id}::uuid AND status IN ('pending','approved','executed_pending_review','feedback')`;
      pendingCount = row?.count ?? 0;
    }
  }
  const lowStock = inventory.filter((x) => x.point_kind === "warehouse" && x.low_threshold != null && Number(x.full_qty) <= Number(x.low_threshold));
  return { lowStock, inventory, pendingCount, monthTrips: tripRows[0]?.count ?? 0, monthCost: tripRows[0]?.cost ?? 0 };
}

export async function getSupplierDashboard(profile: Profile) {
  if (!profile.organization_id) return { pending: 0, monthTrips: 0, monthCost: 0, monthDeliveries: 0 };
  const [row] = await sql<{ pending: number; month_trips: number; month_cost: number; month_deliveries: number }[]>`
    SELECT
      ((SELECT count(*) FROM supplier_deliveries WHERE supplier_org_id=${profile.organization_id}::uuid AND status IN ('pending','feedback')) +
       (SELECT count(*) FROM supplier_returns WHERE supplier_org_id=${profile.organization_id}::uuid AND status='pending'))::int AS pending,
      (SELECT count(*) FROM transport_trips WHERE supplier_org_id=${profile.organization_id}::uuid AND trip_date>=date_trunc('month',CURRENT_DATE)::date AND status='completed')::int AS month_trips,
      (SELECT COALESCE(sum(transport_amount),0) FROM transport_trips WHERE supplier_org_id=${profile.organization_id}::uuid AND trip_date>=date_trunc('month',CURRENT_DATE)::date AND status='completed')::float8 AS month_cost,
      (SELECT count(*) FROM supplier_deliveries WHERE supplier_org_id=${profile.organization_id}::uuid AND delivery_date>=date_trunc('month',CURRENT_DATE)::date)::int AS month_deliveries
  `;
  return { pending: row?.pending ?? 0, monthTrips: row?.month_trips ?? 0, monthCost: row?.month_cost ?? 0, monthDeliveries: row?.month_deliveries ?? 0 };
}
