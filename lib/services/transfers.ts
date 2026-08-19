import { sql } from "@/lib/db";
import type { Profile } from "@/types/app";
import { applyStockDelta, audit, getStockPointByCode } from "@/lib/stock";
import { checkLowStock } from "@/lib/notifications/low-stock";

type TransferItemInput = {
  productId: string;
  quantity: number;
  sourceBucket?: "full" | "empty" | "managed";
};

function code(id: string, date: string) {
  return `DC-${date.replaceAll("-", "")}-${id.slice(0, 6).toUpperCase()}`;
}

async function getMineStockPoint(tx: any = sql) {
  const [mine] = await tx`
    SELECT sp.id,sp.code,sp.name
    FROM stock_points sp
    JOIN work_groups g ON g.id=sp.group_id
    WHERE g.code='COI' AND sp.active=true
    LIMIT 1
  `;
  if (!mine) throw new Error("Chưa cấu hình tồn Nhóm Cối/Mỏ");
  return mine;
}

export async function createAndConfirmTransfer(profile: Profile, input: {
  direction: "plant_to_mine" | "mine_to_plant";
  transferDate: string;
  items: TransferItemInput[];
  note?: string;
}) {
  if (input.direction === "plant_to_mine" && !["workshop","warehouse_manager"].includes(profile.role)) {
    throw new Error("Chỉ Workshop hoặc Trưởng kho được điều chuyển Nhà máy → Mỏ");
  }
  if (input.direction === "mine_to_plant" && profile.role !== "mine_xsc") {
    throw new Error("Chỉ XSC Mỏ được điều chuyển Mỏ → Nhà máy");
  }
  const items = input.items.filter((x) => x.productId && Number(x.quantity) > 0).map((x) => ({
    productId: x.productId,
    quantity: Number(x.quantity),
    sourceBucket: input.direction === "plant_to_mine" ? (x.sourceBucket === "empty" ? "empty" : "full") as "full"|"empty" : "managed" as const,
  }));
  if (!items.length) throw new Error("Vui lòng thêm ít nhất một loại khí");
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.productId}:${item.sourceBucket}`;
    if (seen.has(key)) throw new Error("Một loại khí và loại chai không được lặp trong cùng phiếu");
    seen.add(key);
  }
  const ids = Array.from(new Set(items.map((x) => x.productId)));
  for (const productId of ids) {
    const [valid] = await sql`
      SELECT id FROM products
      WHERE id=${productId}::uuid AND active=true AND returnable_container=true AND warehouse_split_full_empty=true
      LIMIT 1
    `;
    if (!valid) throw new Error("Có loại khí không hợp lệ cho điều chuyển chai/vỏ");
  }

  const lowStockProductIds = new Set<string>();
  const result = await sql.begin(async (tx) => {
    const [tr] = await tx`
      INSERT INTO transfers(transfer_code,direction,transfer_date,status,note,created_by,dispatched_by,dispatched_at)
      VALUES (('TMP-'||gen_random_uuid()::text),${input.direction},${input.transferDate}::date,'completed',${input.note || null},${profile.id}::uuid,${profile.id}::uuid,now())
      RETURNING id
    `;
    const transferCode = code(tr.id, input.transferDate);
    await tx`UPDATE transfers SET transfer_code=${transferCode} WHERE id=${tr.id}`;
    const wh = await getStockPointByCode("WH-PHC", tx);
    const mine = await getMineStockPoint(tx);

    for (const item of items) {
      await tx`
        INSERT INTO transfer_items(transfer_id,product_id,quantity,source_bucket,received_qty)
        VALUES (${tr.id}::uuid,${item.productId}::uuid,${item.quantity},${item.sourceBucket},${item.quantity})
      `;
      if (input.direction === "plant_to_mine") {
        await applyStockDelta({ tx, stockPointId: wh.id, productId: item.productId, bucket: item.sourceBucket, delta: -item.quantity, referenceType: "transfer_out", referenceId: tr.id, actorUserId: profile.id, occurredDate: input.transferDate });
        await applyStockDelta({ tx, stockPointId: mine.id, productId: item.productId, bucket: "managed", delta: item.quantity, referenceType: "transfer_in_auto", referenceId: tr.id, actorUserId: profile.id, occurredDate: input.transferDate });
        if (item.sourceBucket === "full") lowStockProductIds.add(item.productId);
      } else {
        await applyStockDelta({ tx, stockPointId: mine.id, productId: item.productId, bucket: "managed", delta: -item.quantity, referenceType: "transfer_out", referenceId: tr.id, actorUserId: profile.id, occurredDate: input.transferDate });
        await applyStockDelta({ tx, stockPointId: wh.id, productId: item.productId, bucket: "empty", delta: item.quantity, referenceType: "transfer_in_auto", referenceId: tr.id, actorUserId: profile.id, occurredDate: input.transferDate });
      }
    }

    await audit({ tx, actorUserId: profile.id, action: "transfer_confirmed", entityType: "transfer", entityId: tr.id, after: { direction: input.direction, transferDate: input.transferDate, items, transferCode, stockUpdatedImmediately: true } });
    return { id: tr.id as string, transferCode };
  });
  for (const productId of lowStockProductIds) await checkLowStock(productId);
  return result;
}

export async function submitTransferFeedback(profile: Profile, transferId: string, feedback: string) {
  const note = feedback.trim();
  if (!note) throw new Error("Vui lòng nhập nội dung phản hồi");
  const [tr] = await sql`SELECT id,direction,status FROM transfers WHERE id=${transferId}::uuid LIMIT 1`;
  if (!tr) throw new Error("Không tìm thấy phiếu điều chuyển");
  const allowed = tr.direction === "plant_to_mine" ? profile.role === "mine_xsc" : ["warehouse_manager","workshop"].includes(profile.role);
  if (!allowed) throw new Error("Bạn không có quyền phản hồi phiếu điều chuyển này");
  if (!["completed","feedback"].includes(tr.status)) throw new Error("Phiếu này không còn ở trạng thái cho phép phản hồi");
  await sql`UPDATE transfers SET status='feedback',reviewed_by=${profile.id}::uuid,reviewed_at=now(),feedback=${note} WHERE id=${transferId}::uuid`;
  await audit({ actorUserId: profile.id, action: "transfer_feedback", entityType: "transfer", entityId: transferId, note });
}

export async function listTransfers() {
  return sql`
    SELECT t.id,t.transfer_code,t.direction,t.transfer_date,t.status,t.note,t.feedback,
      u.full_name AS created_by_name,ru.full_name AS feedback_by_name,t.reviewed_at AS feedback_at,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id',ti.id,'quantity',ti.quantity::float8,'received_qty',ti.received_qty::float8,'source_bucket',ti.source_bucket,
        'product_id',p.id,'product_code',p.code,'product_name',p.name,'unit',p.unit
      ) ORDER BY p.display_order,p.name) FILTER (WHERE ti.id IS NOT NULL),'[]'::jsonb) AS items
    FROM transfers t
    JOIN users u ON u.id=t.created_by
    LEFT JOIN users ru ON ru.id=t.reviewed_by
    LEFT JOIN transfer_items ti ON ti.transfer_id=t.id
    LEFT JOIN products p ON p.id=ti.product_id
    GROUP BY t.id,u.full_name,ru.full_name
    ORDER BY t.transfer_date DESC,t.created_at DESC
    LIMIT 100
  `;
}
