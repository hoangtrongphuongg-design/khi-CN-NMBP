import { sql } from "@/lib/db";
import { getInventory } from "@/lib/services/inventory";
import {
  getCylinderRentalDaily,
  getGoodsCostDetails,
  getTransportCostDetails,
  getXL45RentalDaily,
} from "@/lib/services/costs";
import { toDateInput } from "@/lib/utils";
import type { DashboardData, Profile } from "@/types/app";

function addDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getDashboardData(profile?: Profile): Promise<DashboardData> {
  const [inventoryAll, pendingRows, tripRows] = await Promise.all([
    getInventory(),
    sql<{ count: number }[]>`
      SELECT (
        (SELECT count(*) FROM internal_requests WHERE status IN ('pending','approved','executed_pending_review','feedback')) +
        (SELECT count(*) FROM supplier_deliveries WHERE status IN ('pending','phc_pending','feedback')) +
        (SELECT count(*) FROM supplier_returns WHERE status IN ('pending','feedback')) +
        (SELECT count(*) FROM transfers WHERE status='feedback')
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
  const lowStock = inventoryAll.filter((x) =>
    x.point_kind === "warehouse" &&
    Number(x.unclassified_qty || 0) <= 0 &&
    x.low_threshold != null &&
    Number(x.full_qty) <= Number(x.low_threshold)
  );
  return { lowStock, inventory, pendingCount, monthTrips: tripRows[0]?.count ?? 0, monthCost: tripRows[0]?.cost ?? 0 };
}

export async function getSupplierDashboard(profile: Profile) {
  if (!profile.organization_id) return { pending: 0, monthTrips: 0, monthCost: 0, monthDeliveries: 0 };
  const [row] = await sql<{ pending: number; month_trips: number; month_cost: number; month_deliveries: number }[]>`
    SELECT
      ((SELECT count(*) FROM supplier_deliveries WHERE supplier_org_id=${profile.organization_id}::uuid AND status IN ('pending','phc_pending','feedback')) +
       (SELECT count(*) FROM supplier_returns WHERE supplier_org_id=${profile.organization_id}::uuid AND status='feedback'))::int AS pending,
      (SELECT count(*) FROM transport_trips WHERE supplier_org_id=${profile.organization_id}::uuid AND trip_date>=date_trunc('month',CURRENT_DATE)::date AND status='completed')::int AS month_trips,
      (SELECT COALESCE(sum(transport_amount),0) FROM transport_trips WHERE supplier_org_id=${profile.organization_id}::uuid AND trip_date>=date_trunc('month',CURRENT_DATE)::date AND status='completed')::float8 AS month_cost,
      (SELECT count(*) FROM supplier_deliveries WHERE supplier_org_id=${profile.organization_id}::uuid AND delivery_date>=date_trunc('month',CURRENT_DATE)::date)::int AS month_deliveries
  `;
  return { pending: row?.pending ?? 0, monthTrips: row?.month_trips ?? 0, monthCost: row?.month_cost ?? 0, monthDeliveries: row?.month_deliveries ?? 0 };
}

export type CostSnapshot = {
  monthStart: string;
  yearStart: string;
  asOfDate: string;
  monthTotal: number;
  yearTotal: number;
};

/** Tổng chi phí cấp cao dùng riêng cho KPI Tổng quan. Chi tiết vẫn thuộc trang Báo cáo. */
export async function getCostSnapshot(profile: Profile): Promise<CostSnapshot> {
  const today = toDateInput();
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const monthStart = `${today.slice(0, 7)}-01`;
  const endDateExclusive = addDays(today, 1);
  const supplierOrgId = profile.role === "supplier" ? profile.organization_id : null;

  const [goods, transport, cylinder, xl45] = await Promise.all([
    getGoodsCostDetails({ startDate: yearStart, endDateExclusive, supplierOrgId }),
    getTransportCostDetails({ startDate: yearStart, endDateExclusive, supplierOrgId }),
    getCylinderRentalDaily({ startDate: yearStart, endDateExclusive }),
    getXL45RentalDaily({ startDate: yearStart, endDateExclusive, supplierOrgId }),
  ]);

  const sum = (rows: Array<{ amount?: number; rental_amount?: number }>, from: string) => rows.reduce((total, row: any) => {
    const day = String(row.delivery_date || row.trip_date || row.day || "");
    if (day < from) return total;
    return total + Number(row.amount ?? row.rental_amount ?? 0);
  }, 0);

  return {
    monthStart,
    yearStart,
    asOfDate: today,
    monthTotal: sum(goods, monthStart) + sum(transport, monthStart) + sum(cylinder, monthStart) + sum(xl45, monthStart),
    yearTotal: sum(goods, yearStart) + sum(transport, yearStart) + sum(cylinder, yearStart) + sum(xl45, yearStart),
  };
}

export type RentalSnapshotRow = {
  product_code: string;
  product_name: string;
  opening_qty: number;
  supplier_in: number;
  supplier_out: number;
  current_qty: number;
};

export type RentalSnapshot = {
  asOfDate: string;
  totalOpening: number;
  totalIn: number;
  totalOut: number;
  totalCurrent: number;
  rows: RentalSnapshotRow[];
};

/**
 * Vỏ đang thuê NCC = số dư đầu kỳ + NCC giao - trả NCC.
 * Không dùng phân bổ Kho/Nhóm/Mỏ để tránh đếm đôi.
 */
export async function getRentalSnapshot(): Promise<RentalSnapshot> {
  const today = toDateInput();
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const endDateExclusive = addDays(today, 1);
  const [opening, daily] = await Promise.all([
    sql<any[]>`
      SELECT p.code AS product_code,p.name AS product_name,COALESCE(ob.qty,0)::float8 AS opening_qty
      FROM products p
      LEFT JOIN supplier_container_opening_balances ob ON ob.product_id=p.id AND ob.opening_date=${yearStart}::date
      WHERE p.active=true AND p.cylinder_rental_eligible=true
      ORDER BY p.display_order,p.name
    `,
    getCylinderRentalDaily({ startDate: yearStart, endDateExclusive }),
  ]);

  const byProduct = new Map<string, RentalSnapshotRow>();
  for (const row of opening) {
    byProduct.set(String(row.product_code), {
      product_code: String(row.product_code),
      product_name: String(row.product_name),
      opening_qty: Number(row.opening_qty || 0),
      supplier_in: 0,
      supplier_out: 0,
      current_qty: Number(row.opening_qty || 0),
    });
  }
  for (const row of daily) {
    const item = byProduct.get(row.product_code) || {
      product_code: row.product_code,
      product_name: row.product_name,
      opening_qty: 0,
      supplier_in: 0,
      supplier_out: 0,
      current_qty: 0,
    };
    item.supplier_in += Number(row.supplier_in || 0);
    item.supplier_out += Number(row.supplier_out || 0);
    if (row.day === today) item.current_qty = Number(row.held_qty || 0);
    byProduct.set(row.product_code, item);
  }
  const rows = [...byProduct.values()].filter((x) => x.opening_qty > 0 || x.supplier_in > 0 || x.supplier_out > 0 || x.current_qty > 0);
  return {
    asOfDate: today,
    totalOpening: rows.reduce((s, x) => s + x.opening_qty, 0),
    totalIn: rows.reduce((s, x) => s + x.supplier_in, 0),
    totalOut: rows.reduce((s, x) => s + x.supplier_out, 0),
    totalCurrent: rows.reduce((s, x) => s + x.current_qty, 0),
    rows,
  };
}
