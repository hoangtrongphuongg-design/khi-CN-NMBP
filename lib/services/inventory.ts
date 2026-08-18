import { sql } from "@/lib/db";
import type { InventoryRow } from "@/types/app";

export async function getInventory(): Promise<InventoryRow[]> {
  const rows = await sql<InventoryRow[]>`
    SELECT point_code,point_name,point_kind,product_code,product_name,unit,
      full_qty::float8 AS full_qty,empty_qty::float8 AS empty_qty,total_qty::float8 AS total_qty,
      low_threshold::float8 AS low_threshold
    FROM inventory_status_v
    ORDER BY CASE point_kind WHEN 'warehouse' THEN 1 WHEN 'group' THEN 2 ELSE 3 END, point_name, product_name
  `;
  return rows;
}

export async function getWarehouseInventory() {
  const rows = await getInventory();
  return rows.filter((x) => x.point_kind === "warehouse");
}


export async function getInventoryTotals() {
  return sql`
    SELECT product_code,product_name,unit,
      SUM(CASE WHEN point_kind='warehouse' THEN total_qty ELSE 0 END)::float8 AS warehouse_qty,
      SUM(CASE WHEN point_kind='group' THEN total_qty ELSE 0 END)::float8 AS group_qty,
      SUM(CASE WHEN point_kind='transit' THEN total_qty ELSE 0 END)::float8 AS transit_qty,
      SUM(total_qty)::float8 AS system_total
    FROM inventory_status_v
    GROUP BY product_code,product_name,unit
    HAVING SUM(total_qty)<>0
    ORDER BY product_name
  `;
}
