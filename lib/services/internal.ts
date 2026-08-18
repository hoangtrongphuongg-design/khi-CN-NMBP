import { sql } from "@/lib/db";
import type { Profile } from "@/types/app";
import { isOfficeHours } from "@/lib/working-hours";
import { applyStockDelta, audit, getGroupStockPoint, getStockPointByCode } from "@/lib/stock";
import { checkLowStock } from "@/lib/notifications/low-stock";
import { canApproveOfficeBorrow, canExecuteWarehouse, canReviewWarehouse } from "@/lib/auth/permissions";

export async function createInternalRequest(profile: Profile, input: { requestType: "exchange"|"borrow"|"return"; productId: string; quantity: number; note?: string }) {
  if (!["foreman","supervisor"].includes(profile.role) || !profile.group_id) throw new Error("Không có quyền tạo phiếu cho nhóm");
  const [group] = await sql`SELECT code FROM work_groups WHERE id=${profile.group_id}::uuid LIMIT 1`;
  if (group?.code === "COI") throw new Error("Nhóm Cối/Mỏ chỉ theo dõi số chai; khi cần đổi liên hệ Workshop qua Zalo");
  if (!(input.quantity > 0)) throw new Error("Số lượng phải lớn hơn 0");
  const [product] = await sql`SELECT id FROM products WHERE id=${input.productId}::uuid AND active=true AND internal_group_tracking=true LIMIT 1`;
  if (!product) throw new Error("Loại khí này không áp dụng nghiệp vụ mượn/đổi/trả nội bộ");
  const [row] = await sql`
    INSERT INTO internal_requests(request_code,request_type,group_id,product_id,requested_qty,requested_by,note,approval_mode)
    VALUES (
      ('TMP-'||gen_random_uuid()::text),${input.requestType},${profile.group_id}::uuid,${input.productId}::uuid,${input.quantity},${profile.id}::uuid,${input.note || null},
      CASE WHEN ${input.requestType}='borrow' THEN NULL ELSE 'not_required' END
    )
    RETURNING id
  `;
  const code = `${input.requestType === "exchange" ? "DOI" : input.requestType === "borrow" ? "MUON" : "TRA"}-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${String(row.id).slice(0,6).toUpperCase()}`;
  await sql`UPDATE internal_requests SET request_code=${code} WHERE id=${row.id}`;
  await audit({ actorUserId: profile.id, action: "create", entityType: "internal_request", entityId: row.id, after: { ...input, code } });
  return row.id as string;
}

export async function approveBorrow(profile: Profile, requestId: string) {
  if (!(await isOfficeHours())) throw new Error("Ngoài giờ hành chính: Thủ kho có thể cấp mượn và chuyển hậu kiểm");
  if (!canApproveOfficeBorrow(profile)) throw new Error("Không có quyền duyệt mượn trong giờ hành chính");
  const [row] = await sql`SELECT * FROM internal_requests WHERE id=${requestId}::uuid FOR UPDATE`;
  if (!row || row.request_type !== "borrow" || row.status !== "pending") throw new Error("Phiếu không ở trạng thái chờ duyệt");
  await sql`UPDATE internal_requests SET status='approved',approval_mode='office_hours',approved_by=${profile.id}::uuid,approved_at=now() WHERE id=${requestId}::uuid`;
  await audit({ actorUserId: profile.id, action: "approve", entityType: "internal_request", entityId: requestId, after: { status: "approved" } });
}

export async function executeInternalRequest(profile: Profile, requestId: string, actualQty: number, returnBucket: "full"|"empty" = "empty") {
  if (!canExecuteWarehouse(profile)) throw new Error("Không có quyền thực hiện nghiệp vụ kho");
  if (!(actualQty > 0)) throw new Error("Số lượng thực tế phải lớn hơn 0");
  let productId = "";
  await sql.begin(async (tx) => {
    const rows = await tx`SELECT * FROM internal_requests WHERE id=${requestId}::uuid FOR UPDATE`;
    const req = rows[0];
    if (!req) throw new Error("Không tìm thấy phiếu");
    productId = req.product_id;
    const office = await isOfficeHours();
    if (req.request_type === "borrow") {
      if (office && req.status !== "approved") throw new Error("Trong giờ hành chính phải được Workshop/Trưởng kho duyệt trước khi Thủ kho cấp");
      if (!office && !["pending","approved"].includes(req.status)) throw new Error("Phiếu mượn không thể thực hiện");
    }
    if (req.request_type !== "borrow" && req.status !== "pending") throw new Error("Phiếu không ở trạng thái chờ xử lý");

    const wh = await getStockPointByCode("WH-PHC", tx);
    const gp = await getGroupStockPoint(req.group_id, tx);

    if (req.request_type === "exchange") {
      await applyStockDelta({ tx, stockPointId: wh.id, productId: req.product_id, bucket: "full", delta: -actualQty, referenceType: "internal_exchange", referenceId: req.id, actorUserId: profile.id });
      await applyStockDelta({ tx, stockPointId: wh.id, productId: req.product_id, bucket: "empty", delta: actualQty, referenceType: "internal_exchange", referenceId: req.id, actorUserId: profile.id });
    } else if (req.request_type === "borrow") {
      await applyStockDelta({ tx, stockPointId: wh.id, productId: req.product_id, bucket: "full", delta: -actualQty, referenceType: "internal_borrow", referenceId: req.id, actorUserId: profile.id });
      await applyStockDelta({ tx, stockPointId: gp.id, productId: req.product_id, bucket: "managed", delta: actualQty, referenceType: "internal_borrow", referenceId: req.id, actorUserId: profile.id });
    } else {
      await applyStockDelta({ tx, stockPointId: gp.id, productId: req.product_id, bucket: "managed", delta: -actualQty, referenceType: "internal_return", referenceId: req.id, actorUserId: profile.id });
      await applyStockDelta({ tx, stockPointId: wh.id, productId: req.product_id, bucket: returnBucket, delta: actualQty, referenceType: "internal_return", referenceId: req.id, actorUserId: profile.id });
    }

    const needsReview = req.request_type === "exchange" || req.request_type === "return" || (req.request_type === "borrow" && !office);
    await tx`
      UPDATE internal_requests SET actual_qty=${actualQty},return_bucket=${req.request_type === "return" ? returnBucket : null},executed_by=${profile.id}::uuid,executed_at=now(),
        approval_mode=CASE WHEN request_type='borrow' THEN ${office ? "office_hours" : "after_hours"} ELSE approval_mode END,
        status=${needsReview ? "executed_pending_review" : "completed"}
      WHERE id=${requestId}::uuid
    `;
    await audit({ tx, actorUserId: profile.id, action: "execute", entityType: "internal_request", entityId: requestId, after: { actualQty, status: needsReview ? "executed_pending_review" : "completed" } });
  });
  if (productId) await checkLowStock(productId);
}

export async function reviewInternalRequest(profile: Profile, requestId: string, action: "approve"|"feedback", feedback?: string) {
  if (!canReviewWarehouse(profile)) throw new Error("Không có quyền hậu kiểm");
  const [row] = await sql`SELECT status FROM internal_requests WHERE id=${requestId}::uuid`;
  if (!row || row.status !== "executed_pending_review") throw new Error("Phiếu không chờ hậu kiểm");
  await sql`
    UPDATE internal_requests SET status=${action === "approve" ? "completed" : "feedback"},reviewed_by=${profile.id}::uuid,reviewed_at=now(),feedback=${action === "feedback" ? feedback || "Cần kiểm tra lại" : null}
    WHERE id=${requestId}::uuid
  `;
  await audit({ actorUserId: profile.id, action: action === "approve" ? "review_approve" : "review_feedback", entityType: "internal_request", entityId: requestId, note: feedback });
}

export async function listInternalRequests(profile: Profile) {
  const base = `
    SELECT ir.id,ir.request_code,ir.request_type,ir.requested_qty::float8 AS requested_qty,ir.actual_qty::float8 AS actual_qty,
      ir.status,ir.requested_at,ir.note,ir.feedback,g.name AS group_name,p.name AS product_name,p.unit,
      u.full_name AS requested_by_name
    FROM internal_requests ir
    JOIN work_groups g ON g.id=ir.group_id
    JOIN products p ON p.id=ir.product_id
    JOIN users u ON u.id=ir.requested_by
  `;
  if (["foreman","supervisor","worker"].includes(profile.role) && profile.group_id) {
    return sql.unsafe(`${base} WHERE ir.group_id=$1 ORDER BY ir.requested_at DESC LIMIT 200`, [profile.group_id]);
  }
  return sql.unsafe(`${base} ORDER BY ir.requested_at DESC LIMIT 200`);
}
