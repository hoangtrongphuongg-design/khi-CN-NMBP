import { sql } from "@/lib/db";

export async function getXL45Outstanding() {
  return sql`
    SELECT x.id,p.name AS product_name,l.name AS location_name,x.delivered_date,
      x.qty_outstanding::float8 AS qty_outstanding,
      (CURRENT_DATE-x.delivered_date+1)::int AS days_held,
      GREATEST(0,(CURRENT_DATE-x.delivered_date-14))::int AS charge_days,
      (COALESCE((
        SELECT SUM((
          SELECT pr.unit_price FROM price_rules pr
          WHERE pr.price_type='xl45_rental_day'
            AND pr.effective_from<=d::date
          AND (pr.effective_to IS NULL OR pr.effective_to>=d::date)
          ORDER BY pr.effective_from DESC LIMIT 1
        ))
        FROM generate_series(x.delivered_date+interval '15 day',CURRENT_DATE,interval '1 day') gs(d)
      ),0)*x.qty_outstanding)::float8 AS accrued_rental
    FROM xl45_lots x
    JOIN products p ON p.id=x.product_id
    JOIN locations l ON l.id=x.location_id
    WHERE x.qty_outstanding>0
    ORDER BY x.delivered_date
  `;
}
