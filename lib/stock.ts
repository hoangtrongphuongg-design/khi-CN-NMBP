import { sql } from "@/lib/db";

export type StockBucket = "full" | "empty" | "unclassified" | "managed" | "available" | "transit";

export async function getStockPointByCode(code: string, tx: any = sql) {
  const rows = await tx`SELECT id,code,name,kind,group_id,location_id FROM stock_points WHERE code=${code} AND active=true LIMIT 1`;
  if (!rows[0]) throw new Error(`Không tìm thấy điểm tồn ${code}`);
  return rows[0];
}

export async function getGroupStockPoint(groupId: string, tx: any = sql) {
  const rows = await tx`SELECT id,code,name,kind,group_id,location_id FROM stock_points WHERE group_id=${groupId}::uuid AND active=true LIMIT 1`;
  if (!rows[0]) throw new Error("Nhóm chưa được cấu hình điểm tồn");
  return rows[0];
}

export async function applyStockDelta(params: {
  stockPointId: string;
  productId: string;
  bucket: StockBucket;
  delta: number;
  referenceType: string;
  referenceId?: string | null;
  note?: string | null;
  actorUserId?: string | null;
  occurredDate?: string | null;
  tx?: any;
}) {
  const tx = params.tx ?? sql;
  const existing = await tx`
    SELECT qty FROM stock_balances
    WHERE stock_point_id=${params.stockPointId}::uuid AND product_id=${params.productId}::uuid AND bucket=${params.bucket}
    FOR UPDATE
  `;
  const before = Number(existing[0]?.qty ?? 0);
  const after = before + Number(params.delta);
  if (after < -0.000001) throw new Error("Tồn không đủ để thực hiện giao dịch");
  await tx`
    INSERT INTO stock_balances(stock_point_id,product_id,bucket,qty,updated_at)
    VALUES (${params.stockPointId}::uuid,${params.productId}::uuid,${params.bucket},${after},now())
    ON CONFLICT (stock_point_id,product_id,bucket)
    DO UPDATE SET qty=EXCLUDED.qty,updated_at=now()
  `;
  await tx`
    INSERT INTO stock_ledger(stock_point_id,product_id,bucket,delta,balance_after,reference_type,reference_id,note,occurred_at,created_by)
    VALUES (${params.stockPointId}::uuid,${params.productId}::uuid,${params.bucket},${params.delta},${after},${params.referenceType},${params.referenceId ?? null}::uuid,${params.note ?? null},
      CASE WHEN ${params.occurredDate ?? null}::date IS NULL THEN now() ELSE ((${params.occurredDate ?? null}::date + time '12:00') AT TIME ZONE 'Asia/Ho_Chi_Minh') END,
      ${params.actorUserId ?? null}::uuid)
  `;
  return after;
}

export async function audit(params: { actorUserId?: string | null; action: string; entityType: string; entityId?: string | null; before?: unknown; after?: unknown; note?: string | null; tx?: any }) {
  const tx = params.tx ?? sql;
  await tx`
    INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,note)
    VALUES (${params.actorUserId ?? null}::uuid,${params.action},${params.entityType},${params.entityId ?? null}::uuid,${params.before ? JSON.stringify(params.before) : null}::jsonb,${params.after ? JSON.stringify(params.after) : null}::jsonb,${params.note ?? null})
  `;
}
