import { sql } from "@/lib/db";
import type { Profile } from "@/types/app";
import { applyStockDelta, audit, getStockPointByCode } from "@/lib/stock";
import { checkLowStock } from "@/lib/notifications/low-stock";
import { toDateKey } from "@/lib/utils";

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


export async function reviseTransferAfterFeedback(profile: Profile, transferId: string, inputItems: TransferItemInput[]) {
  const lowStockProductIds = new Set<string>();
  await sql.begin(async (tx) => {
    const [tr] = await tx`
      SELECT id,direction,transfer_date,status,feedback,created_by
      FROM transfers
      WHERE id=${transferId}::uuid
      FOR UPDATE
    `;
    if (!tr) throw new Error("Không tìm thấy phiếu điều chuyển");
    if (tr.status !== "feedback") throw new Error("Chỉ chỉnh được phiếu đang có phản hồi");

    const canRevise = tr.direction === "plant_to_mine"
      ? ["workshop","warehouse_manager"].includes(profile.role)
      : profile.role === "mine_xsc";
    if (!canRevise) throw new Error("Bạn không có quyền chỉnh phiếu điều chuyển này");

    const items = inputItems
      .filter((x) => x.productId && Number(x.quantity) > 0)
      .map((x) => ({
        productId: String(x.productId),
        quantity: Number(x.quantity),
        sourceBucket: tr.direction === "plant_to_mine"
          ? (x.sourceBucket === "empty" ? "empty" : "full") as "full"|"empty"
          : "managed" as const,
      }));
    if (!items.length) throw new Error("Phiếu phải còn ít nhất một loại khí");

    const seen = new Set<string>();
    for (const item of items) {
      const key = `${item.productId}:${item.sourceBucket}`;
      if (seen.has(key)) throw new Error("Một loại khí và loại chai không được lặp trong cùng phiếu");
      seen.add(key);
      const [valid] = await tx`
        SELECT id FROM products
        WHERE id=${item.productId}::uuid AND active=true AND returnable_container=true AND warehouse_split_full_empty=true
        LIMIT 1
      `;
      if (!valid) throw new Error("Có loại khí không hợp lệ cho điều chuyển chai/vỏ");
    }

    const oldRows = await tx`
      SELECT product_id,quantity::float8 AS quantity,source_bucket
      FROM transfer_items
      WHERE transfer_id=${transferId}::uuid
      FOR UPDATE
    `;
    const oldMap = new Map<string, any>();
    for (const row of oldRows as any[]) oldMap.set(`${row.product_id}:${row.source_bucket}`, row);
    const newMap = new Map<string, any>();
    for (const item of items) newMap.set(`${item.productId}:${item.sourceBucket}`, item);

    const wh = await getStockPointByCode("WH-PHC", tx);
    const mine = await getMineStockPoint(tx);
    const keys = new Set([...oldMap.keys(), ...newMap.keys()]);

    for (const key of keys) {
      const oldItem = oldMap.get(key);
      const newItem = newMap.get(key);
      const productId = String(newItem?.productId || oldItem?.product_id);
      const sourceBucket = String(newItem?.sourceBucket || oldItem?.source_bucket) as "full"|"empty"|"managed";
      const oldQty = Number(oldItem?.quantity || 0);
      const newQty = Number(newItem?.quantity || 0);
      const diff = newQty - oldQty;
      if (Math.abs(diff) < 0.000001) continue;

      if (tr.direction === "plant_to_mine") {
        await applyStockDelta({ tx, stockPointId: wh.id, productId, bucket: sourceBucket as "full"|"empty", delta: -diff, referenceType: "transfer_revision_out", referenceId: transferId, actorUserId: profile.id, occurredDate: toDateKey(tr.transfer_date), note: "Điều chỉnh điều chuyển sau phản hồi" });
        await applyStockDelta({ tx, stockPointId: mine.id, productId, bucket: "managed", delta: diff, referenceType: "transfer_revision_in", referenceId: transferId, actorUserId: profile.id, occurredDate: toDateKey(tr.transfer_date), note: "Điều chỉnh điều chuyển sau phản hồi" });
        if (sourceBucket === "full") lowStockProductIds.add(productId);
      } else {
        await applyStockDelta({ tx, stockPointId: mine.id, productId, bucket: "managed", delta: -diff, referenceType: "transfer_revision_out", referenceId: transferId, actorUserId: profile.id, occurredDate: toDateKey(tr.transfer_date), note: "Điều chỉnh điều chuyển sau phản hồi" });
        await applyStockDelta({ tx, stockPointId: wh.id, productId, bucket: "empty", delta: diff, referenceType: "transfer_revision_in", referenceId: transferId, actorUserId: profile.id, occurredDate: toDateKey(tr.transfer_date), note: "Điều chỉnh điều chuyển sau phản hồi" });
      }
    }

    await tx`DELETE FROM transfer_items WHERE transfer_id=${transferId}::uuid`;
    for (const item of items) {
      await tx`
        INSERT INTO transfer_items(transfer_id,product_id,quantity,source_bucket,received_qty)
        VALUES (${transferId}::uuid,${item.productId}::uuid,${item.quantity},${item.sourceBucket},${item.quantity})
      `;
    }
    await tx`
      UPDATE transfers
      SET status='completed',feedback=NULL,reviewed_by=NULL,reviewed_at=NULL,
          dispatched_by=${profile.id}::uuid,dispatched_at=now()
      WHERE id=${transferId}::uuid
    `;
    await audit({
      tx,
      actorUserId: profile.id,
      action: "transfer_revise_after_feedback",
      entityType: "transfer",
      entityId: transferId,
      before: { items: oldRows, feedback: tr.feedback },
      after: { items, status: "completed" },
      note: "Bên lập điều chuyển đã chỉnh số liệu theo phản hồi; tồn chỉ điều chỉnh phần chênh lệch.",
    });
  });

  for (const productId of lowStockProductIds) await checkLowStock(productId);
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

export type AdminTransferCorrectionLine = {
  itemId?: string | null;
  productId: string;
  quantity: number;
  sourceBucket?: "full" | "empty" | "managed";
  delete?: boolean;
};

async function applyAdminTransferEffect(params: {
  tx: any;
  transferId: string;
  direction: "plant_to_mine" | "mine_to_plant";
  productId: string;
  quantity: number;
  sourceBucket: "full" | "empty" | "managed";
  sign: 1 | -1;
  actorUserId: string;
  occurredDate: string;
}) {
  const { tx, transferId, direction, productId, quantity, sourceBucket, sign, actorUserId, occurredDate } = params;
  if (!(quantity > 0)) return;
  const wh = await getStockPointByCode("WH-PHC", tx);
  const mine = await getMineStockPoint(tx);
  const q = quantity * sign;
  if (direction === "plant_to_mine") {
    const bucket = sourceBucket === "empty" ? "empty" : "full";
    await applyStockDelta({ tx,stockPointId:wh.id,productId,bucket,delta:-q,referenceType:"transfer_admin_revision_out",referenceId:transferId,actorUserId,occurredDate,note:"Admin điều chỉnh điều chuyển" });
    await applyStockDelta({ tx,stockPointId:mine.id,productId,bucket:"managed",delta:q,referenceType:"transfer_admin_revision_in",referenceId:transferId,actorUserId,occurredDate,note:"Admin điều chỉnh điều chuyển" });
  } else {
    await applyStockDelta({ tx,stockPointId:mine.id,productId,bucket:"managed",delta:-q,referenceType:"transfer_admin_revision_out",referenceId:transferId,actorUserId,occurredDate,note:"Admin điều chỉnh điều chuyển" });
    await applyStockDelta({ tx,stockPointId:wh.id,productId,bucket:"empty",delta:q,referenceType:"transfer_admin_revision_in",referenceId:transferId,actorUserId,occurredDate,note:"Admin điều chỉnh điều chuyển" });
  }
}

export async function adminCorrectTransfer(profile: Profile, transferId: string, input: {
  direction: "plant_to_mine" | "mine_to_plant";
  transferDate: string;
  note?: string | null;
  reason: string;
  lines: AdminTransferCorrectionLine[];
}) {
  if (profile.role !== "admin") throw new Error("Chỉ Admin được chỉnh dữ liệu nghiệp vụ đã ghi nhận");
  const reason = String(input.reason || "").trim();
  if (!reason) throw new Error("Bắt buộc nhập lý do chỉnh sửa để lưu Audit");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.transferDate)) throw new Error("Ngày điều chuyển không hợp lệ");
  if (!["plant_to_mine","mine_to_plant"].includes(input.direction)) throw new Error("Chiều điều chuyển không hợp lệ");
  const lines = input.lines.filter((line) => !line.delete).map((line) => ({
    ...line,
    productId: String(line.productId || ""),
    quantity: Number(line.quantity || 0),
    sourceBucket: input.direction === "plant_to_mine" ? (line.sourceBucket === "empty" ? "empty" : "full") as "full"|"empty" : "managed" as const,
  }));
  if (!lines.length) throw new Error("Phiếu điều chuyển phải còn ít nhất một dòng");
  if (lines.some((line) => !line.productId || line.quantity <= 0)) throw new Error("Có dòng điều chuyển không hợp lệ");
  const keys = lines.map((line) => `${line.productId}:${line.sourceBucket}`);
  if (new Set(keys).size !== keys.length) throw new Error("Một loại khí và loại chai không được lặp trong cùng phiếu");

  await sql.begin(async (tx) => {
    const [tr] = await tx`SELECT * FROM transfers WHERE id=${transferId}::uuid FOR UPDATE`;
    if (!tr) throw new Error("Không tìm thấy Phiếu điều chuyển");
    const oldItems = await tx`
      SELECT ti.id,ti.product_id,ti.quantity::float8 AS quantity,ti.received_qty::float8 AS received_qty,ti.source_bucket,p.name AS product_name
      FROM transfer_items ti JOIN products p ON p.id=ti.product_id
      WHERE ti.transfer_id=${transferId}::uuid ORDER BY p.display_order,p.name FOR UPDATE OF ti
    `;
    const before = { transfer:{ direction:tr.direction,transfer_date:toDateKey(tr.transfer_date),status:tr.status,note:tr.note },items:oldItems };
    const effectsApplied = !["pending","cancelled"].includes(String(tr.status));
    const oldDate = toDateKey(tr.transfer_date);
    if (effectsApplied) {
      for (const old of oldItems as any[]) {
        await applyAdminTransferEffect({ tx,transferId,direction:tr.direction,productId:String(old.product_id),quantity:Number(old.quantity),sourceBucket:old.source_bucket,sign:-1,actorUserId:profile.id,occurredDate:oldDate });
      }
      for (const line of lines) {
        await applyAdminTransferEffect({ tx,transferId,direction:input.direction,productId:line.productId,quantity:line.quantity,sourceBucket:line.sourceBucket,sign:1,actorUserId:profile.id,occurredDate:input.transferDate });
      }
    }
    await tx`DELETE FROM transfer_items WHERE transfer_id=${transferId}::uuid`;
    for (const line of lines) {
      await tx`
        INSERT INTO transfer_items(transfer_id,product_id,quantity,source_bucket,received_qty)
        VALUES (${transferId}::uuid,${line.productId}::uuid,${line.quantity},${line.sourceBucket},${effectsApplied ? line.quantity : null})
      `;
    }
    await tx`UPDATE transfers SET direction=${input.direction},transfer_date=${input.transferDate}::date,note=${input.note || null} WHERE id=${transferId}::uuid`;
    const [adjustment] = await tx`
      INSERT INTO adjustment_notes(adjustment_code,original_reference_type,original_reference_id,reason,created_by)
      VALUES (('ADM-'||to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYYMMDDHH24MISS')||'-'||upper(substr(md5(random()::text),1,5))),
        'transfer',${transferId}::uuid,${reason},${profile.id}::uuid) RETURNING adjustment_code
    `;
    const afterItems = await tx`
      SELECT ti.id,ti.product_id,ti.quantity::float8 AS quantity,ti.received_qty::float8 AS received_qty,ti.source_bucket,p.name AS product_name
      FROM transfer_items ti JOIN products p ON p.id=ti.product_id WHERE ti.transfer_id=${transferId}::uuid ORDER BY p.display_order,p.name
    `;
    await audit({ tx,actorUserId:profile.id,action:"admin_correct",entityType:"transfer",entityId:transferId,before,
      after:{ transfer:{ direction:input.direction,transfer_date:input.transferDate,status:tr.status,note:input.note || null },items:afterItems,adjustment_code:adjustment.adjustment_code },note:reason });
  });
}
