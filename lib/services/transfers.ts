import { sql } from "@/lib/db";
import type { Profile } from "@/types/app";
import { applyStockDelta, audit, getStockPointByCode } from "@/lib/stock";
import { checkLowStock } from "@/lib/notifications/low-stock";

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
  productId: string;
  quantity: number;
  sourceBucket?: "full" | "empty" | "managed";
  note?: string;
}) {
  if (!(input.quantity > 0)) throw new Error("Số lượng phải lớn hơn 0");

  const [product] = await sql`
    SELECT id
    FROM products
    WHERE id=${input.productId}::uuid
      AND active=true
      AND returnable_container=true
      AND warehouse_split_full_empty=true
    LIMIT 1
  `;
  if (!product) throw new Error("Phiếu điều chuyển áp dụng cho chai khí đang quản lý theo số lượng");

  if (input.direction === "plant_to_mine" && !["workshop","warehouse_manager"].includes(profile.role)) {
    throw new Error("Chỉ Workshop hoặc Trưởng kho được điều chuyển Nhà máy → Mỏ");
  }
  if (input.direction === "mine_to_plant" && profile.role !== "mine_xsc") {
    throw new Error("Chỉ XSC Mỏ được điều chuyển Mỏ → Nhà máy");
  }

  let lowStockProduct = "";

  const result = await sql.begin(async (tx) => {
    const [tr] = await tx`
      INSERT INTO transfers(
        transfer_code,direction,transfer_date,status,note,
        created_by,dispatched_by,dispatched_at
      )
      VALUES (
        ('TMP-'||gen_random_uuid()::text),
        ${input.direction},
        ${input.transferDate}::date,
        'completed',
        ${input.note || null},
        ${profile.id}::uuid,
        ${profile.id}::uuid,
        now()
      )
      RETURNING id
    `;

    const transferCode = code(tr.id, input.transferDate);
    await tx`UPDATE transfers SET transfer_code=${transferCode} WHERE id=${tr.id}`;

    const wh = await getStockPointByCode("WH-PHC", tx);
    const mine = await getMineStockPoint(tx);
    const sourceBucket = input.direction === "plant_to_mine"
      ? (input.sourceBucket === "empty" ? "empty" : "full")
      : "managed";

    await tx`
      INSERT INTO transfer_items(transfer_id,product_id,quantity,source_bucket,received_qty)
      VALUES (
        ${tr.id}::uuid,
        ${input.productId}::uuid,
        ${input.quantity},
        ${sourceBucket},
        ${input.quantity}
      )
    `;

    if (input.direction === "plant_to_mine") {
      await applyStockDelta({
        tx,
        stockPointId: wh.id,
        productId: input.productId,
        bucket: sourceBucket,
        delta: -input.quantity,
        referenceType: "transfer_out",
        referenceId: tr.id,
        actorUserId: profile.id,
        occurredDate: input.transferDate,
      });
      await applyStockDelta({
        tx,
        stockPointId: mine.id,
        productId: input.productId,
        bucket: "managed",
        delta: input.quantity,
        referenceType: "transfer_in_auto",
        referenceId: tr.id,
        actorUserId: profile.id,
        occurredDate: input.transferDate,
      });
      if (sourceBucket === "full") lowStockProduct = input.productId;
    } else {
      await applyStockDelta({
        tx,
        stockPointId: mine.id,
        productId: input.productId,
        bucket: "managed",
        delta: -input.quantity,
        referenceType: "transfer_out",
        referenceId: tr.id,
        actorUserId: profile.id,
        occurredDate: input.transferDate,
      });
      await applyStockDelta({
        tx,
        stockPointId: wh.id,
        productId: input.productId,
        bucket: "empty",
        delta: input.quantity,
        referenceType: "transfer_in_auto",
        referenceId: tr.id,
        actorUserId: profile.id,
        occurredDate: input.transferDate,
      });
    }

    await audit({
      tx,
      actorUserId: profile.id,
      action: "transfer_confirmed",
      entityType: "transfer",
      entityId: tr.id,
      after: {
        ...input,
        transferCode,
        sourceBucket,
        destinationBucket: input.direction === "plant_to_mine" ? "managed" : "empty",
        stockUpdatedImmediately: true,
      },
    });

    return { id: tr.id as string, transferCode };
  });

  if (lowStockProduct) await checkLowStock(lowStockProduct);
  return result;
}

export async function submitTransferFeedback(profile: Profile, transferId: string, feedback: string) {
  const note = feedback.trim();
  if (!note) throw new Error("Vui lòng nhập nội dung phản hồi");

  const [tr] = await sql`
    SELECT id,direction,status
    FROM transfers
    WHERE id=${transferId}::uuid
    LIMIT 1
  `;
  if (!tr) throw new Error("Không tìm thấy phiếu điều chuyển");

  const allowed = tr.direction === "plant_to_mine"
    ? profile.role === "mine_xsc"
    : ["warehouse_manager","workshop"].includes(profile.role);

  if (!allowed) throw new Error("Bạn không có quyền phản hồi phiếu điều chuyển này");
  if (!["completed","feedback"].includes(tr.status)) {
    throw new Error("Phiếu này không còn ở trạng thái cho phép phản hồi");
  }

  await sql`
    UPDATE transfers
    SET status='feedback',
        reviewed_by=${profile.id}::uuid,
        reviewed_at=now(),
        feedback=${note}
    WHERE id=${transferId}::uuid
  `;

  await audit({
    actorUserId: profile.id,
    action: "transfer_feedback",
    entityType: "transfer",
    entityId: transferId,
    note,
  });
}

export async function listTransfers() {
  return sql`
    SELECT
      t.id,t.transfer_code,t.direction,t.transfer_date,t.status,t.note,t.feedback,
      ti.quantity::float8 AS quantity,
      ti.received_qty::float8 AS received_qty,
      ti.source_bucket,
      p.name AS product_name,p.unit,
      u.full_name AS created_by_name,
      ru.full_name AS feedback_by_name,
      t.reviewed_at AS feedback_at
    FROM transfers t
    JOIN transfer_items ti ON ti.transfer_id=t.id
    JOIN products p ON p.id=ti.product_id
    JOIN users u ON u.id=t.created_by
    LEFT JOIN users ru ON ru.id=t.reviewed_by
    ORDER BY t.transfer_date DESC,t.created_at DESC
    LIMIT 200
  `;
}
