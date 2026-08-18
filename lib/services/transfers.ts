import { sql } from "@/lib/db";
import type { Profile } from "@/types/app";
import { applyStockDelta, audit, getStockPointByCode } from "@/lib/stock";
import { checkLowStock } from "@/lib/notifications/low-stock";

function code(id: string, date: string) {
  return `DC-${date.replaceAll("-", "")}-${id.slice(0, 6).toUpperCase()}`;
}

export async function createAndDispatchTransfer(profile: Profile, input: {
  direction: "plant_to_mine" | "mine_to_plant";
  transferDate: string;
  productId: string;
  quantity: number;
  sourceBucket?: "full" | "empty" | "managed";
  note?: string;
}) {
  if (!(input.quantity > 0)) throw new Error("Số lượng phải lớn hơn 0");
  const [product] = await sql`SELECT id FROM products WHERE id=${input.productId}::uuid AND active=true AND returnable_container=true AND warehouse_split_full_empty=true LIMIT 1`;
  if (!product) throw new Error("Phiếu điều chuyển V1 áp dụng cho chai khí quản lý đầy/rỗng");
  if (input.direction === "plant_to_mine" && !["workshop","warehouse_manager"].includes(profile.role)) {
    throw new Error("Chỉ Workshop hoặc Trưởng kho được điều chuyển Nhà máy → Mỏ");
  }
  if (input.direction === "mine_to_plant" && !["mine_xsc"].includes(profile.role)) {
    throw new Error("Chỉ XSC Mỏ được điều chuyển Mỏ → Nhà máy");
  }

  let lowStockProduct = "";
  const result = await sql.begin(async (tx) => {
    const [tr] = await tx`
      INSERT INTO transfers(transfer_code,direction,transfer_date,status,note,created_by,dispatched_by,dispatched_at)
      VALUES (('TMP-'||gen_random_uuid()::text),${input.direction},${input.transferDate}::date,'in_transit',${input.note || null},${profile.id}::uuid,${profile.id}::uuid,now())
      RETURNING id
    `;
    const transferCode = code(tr.id, input.transferDate);
    await tx`UPDATE transfers SET transfer_code=${transferCode} WHERE id=${tr.id}`;

    const wh = await getStockPointByCode("WH-PHC", tx);
    const transit = await getStockPointByCode("TRANSIT", tx);
    const [mine] = await tx`SELECT sp.id FROM stock_points sp JOIN work_groups g ON g.id=sp.group_id WHERE g.code='COI' LIMIT 1`;
    if (!mine) throw new Error("Chưa cấu hình tồn Nhóm Cối/Mỏ");

    const sourceBucket = input.direction === "plant_to_mine" ? (input.sourceBucket === "empty" ? "empty" : "full") : "managed";
    await tx`
      INSERT INTO transfer_items(transfer_id,product_id,quantity,source_bucket)
      VALUES (${tr.id}::uuid,${input.productId}::uuid,${input.quantity},${sourceBucket})
    `;

    if (input.direction === "plant_to_mine") {
      await applyStockDelta({ tx, stockPointId: wh.id, productId: input.productId, bucket: sourceBucket, delta: -input.quantity, referenceType: "transfer_out", referenceId: tr.id, actorUserId: profile.id });
      if (sourceBucket === "full") lowStockProduct = input.productId;
    } else {
      await applyStockDelta({ tx, stockPointId: mine.id, productId: input.productId, bucket: "managed", delta: -input.quantity, referenceType: "transfer_out", referenceId: tr.id, actorUserId: profile.id });
    }
    await applyStockDelta({ tx, stockPointId: transit.id, productId: input.productId, bucket: "transit", delta: input.quantity, referenceType: "transfer_transit", referenceId: tr.id, actorUserId: profile.id });
    await audit({ tx, actorUserId: profile.id, action: "dispatch", entityType: "transfer", entityId: tr.id, after: { ...input, transferCode, sourceBucket } });
    return { id: tr.id as string, transferCode };
  });
  if (lowStockProduct) await checkLowStock(lowStockProduct);
  return result;
}

export async function receiveTransfer(profile: Profile, transferId: string, receivedQty: number, destinationBucket: "full" | "empty" = "empty") {
  if (!(receivedQty > 0)) throw new Error("Số lượng nhận phải lớn hơn 0");
  await sql.begin(async (tx) => {
    const rows = await tx`
      SELECT t.*,ti.id AS item_id,ti.product_id,ti.quantity,ti.source_bucket
      FROM transfers t JOIN transfer_items ti ON ti.transfer_id=t.id
      WHERE t.id=${transferId}::uuid FOR UPDATE
    `;
    const tr = rows[0];
    if (!tr || tr.status !== "in_transit") throw new Error("Phiếu không ở trạng thái đang vận chuyển");
    if (tr.direction === "plant_to_mine" && !["mine_xsc"].includes(profile.role)) throw new Error("Chỉ XSC Mỏ được xác nhận nhận tại Mỏ");
    if (tr.direction === "mine_to_plant" && profile.role !== "storekeeper") throw new Error("Không có quyền nhận điều chuyển tại Nhà máy");

    const transit = await getStockPointByCode("TRANSIT", tx);
    const wh = await getStockPointByCode("WH-PHC", tx);
    const [mine] = await tx`SELECT sp.id FROM stock_points sp JOIN work_groups g ON g.id=sp.group_id WHERE g.code='COI' LIMIT 1`;
    if (!mine) throw new Error("Chưa cấu hình tồn Nhóm Cối/Mỏ");

    await applyStockDelta({ tx, stockPointId: transit.id, productId: tr.product_id, bucket: "transit", delta: -receivedQty, referenceType: "transfer_receive", referenceId: tr.id, actorUserId: profile.id });
    if (tr.direction === "plant_to_mine") {
      await applyStockDelta({ tx, stockPointId: mine.id, productId: tr.product_id, bucket: "managed", delta: receivedQty, referenceType: "transfer_receive", referenceId: tr.id, actorUserId: profile.id });
    } else {
      await applyStockDelta({ tx, stockPointId: wh.id, productId: tr.product_id, bucket: destinationBucket, delta: receivedQty, referenceType: "transfer_receive", referenceId: tr.id, actorUserId: profile.id });
    }

    const exact = Number(receivedQty) === Number(tr.quantity);
    const status = exact
      ? (tr.direction === "mine_to_plant" ? "received_pending_review" : "completed")
      : "feedback";
    await tx`UPDATE transfer_items SET received_qty=${receivedQty} WHERE id=${tr.item_id}::uuid`;
    await tx`UPDATE transfers SET status=${status},received_by=${profile.id}::uuid,received_at=now(),feedback=${exact ? null : "Số lượng nhận khác số lượng xuất"} WHERE id=${tr.id}::uuid`;
    await audit({ tx, actorUserId: profile.id, action: "receive", entityType: "transfer", entityId: tr.id, after: { receivedQty, destinationBucket, status } });
  });
}

export async function reviewTransfer(profile: Profile, transferId: string, action: "approve" | "feedback", feedback?: string) {
  if (!["warehouse_manager","workshop"].includes(profile.role)) throw new Error("Không có quyền hậu kiểm điều chuyển");
  const [tr] = await sql`SELECT status,direction FROM transfers WHERE id=${transferId}::uuid`;
  if (!tr || tr.direction !== "mine_to_plant" || tr.status !== "received_pending_review") throw new Error("Phiếu không chờ hậu kiểm");
  await sql`
    UPDATE transfers SET status=${action === "approve" ? "completed" : "feedback"},reviewed_by=${profile.id}::uuid,reviewed_at=now(),feedback=${action === "feedback" ? feedback || "Cần kiểm tra lại" : null}
    WHERE id=${transferId}::uuid
  `;
  await audit({ actorUserId: profile.id, action: action === "approve" ? "review_approve" : "review_feedback", entityType: "transfer", entityId: transferId, note: feedback });
}

export async function listTransfers() {
  return sql`
    SELECT t.id,t.transfer_code,t.direction,t.transfer_date,t.status,t.note,t.feedback,ti.quantity::float8 AS quantity,ti.received_qty::float8 AS received_qty,
      ti.source_bucket,p.name AS product_name,p.unit,u.full_name AS created_by_name
    FROM transfers t
    JOIN transfer_items ti ON ti.transfer_id=t.id
    JOIN products p ON p.id=ti.product_id
    JOIN users u ON u.id=t.created_by
    ORDER BY t.transfer_date DESC,t.created_at DESC LIMIT 200
  `;
}
