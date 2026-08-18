import { sql } from "@/lib/db";

export async function getProducts() {
  return sql`SELECT id,code,name,category,specification,unit,returnable_container,warehouse_split_full_empty,internal_group_tracking,cylinder_rental_eligible,active FROM products WHERE active=true ORDER BY display_order,name`;
}

export async function getGroups() {
  return sql`
    SELECT g.id,g.code,g.name,l.code AS location_code,l.name AS location_name
    FROM work_groups g JOIN locations l ON l.id=g.location_id
    WHERE g.active=true ORDER BY l.code,g.name
  `;
}

export async function getLocations() {
  return sql`SELECT id,code,name,kind FROM locations WHERE active=true ORDER BY code`;
}

export async function getSupplierOrg() {
  const rows = await sql`SELECT id,code,name FROM organizations WHERE kind='supplier' AND active=true ORDER BY name LIMIT 1`;
  return rows[0] ?? null;
}
