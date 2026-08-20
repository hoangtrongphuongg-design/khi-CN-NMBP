import { sql } from "@/lib/db";
import type { Profile } from "@/types/app";
import { isOfficeHours } from "@/lib/working-hours";
import { applyStockDelta, audit, getGroupStockPoint, getStockPointByCode } from "@/lib/stock";
import { checkLowStock } from "@/lib/notifications/low-stock";
import { canApproveOfficeBorrow, canExecuteWarehouse, canReviewWarehouse } from "@/lib/auth/permissions";

type RequestType = "exchange" | "borrow" | "return";
export type InternalRequestItemInput = { productId: string; quantity: number };
export type InternalExecuteItemInput = { itemId: string; actualQty: number; returnBucket?: "full" | "empty" };

function requestPrefix(type: RequestType) {
  return type === "exchange" ? "DOI" : type === "borrow" ? "MUON" : "TRA";
}

export async function getGroupQuickData(profile: Profile) {
  if (!profile.group_id) return [];
  const rows = await sql`
    SELECT p.id,p.code,p.name,p.unit,
      COALESCE(gb.qty,0)::float8 AS group_qty,
      COALESCE(wf.qty,0)::float8 AS warehouse_full,
      COALESCE(we.qty,0)::float8 AS warehouse_empty,
      COALESCE(wu.qty,0)::float8 AS warehouse_unclassified,
      COALESCE(gn.norm_qty,0)::float8 AS norm_qty
    FROM products p
    LEFT JOIN stock_points gp ON gp.group_id=${profile.group_id}::uuid AND gp.active=true
    LEFT JOIN stock_balances gb ON gb.stock_point_id=gp.id AND gb.product_id=p.id AND gb.bucket='managed'
    LEFT JOIN stock_points wh ON wh.code='WH-PHC' AND wh.active=true
    LEFT JOIN stock_balances wf ON wf.stock_point_id=wh.id AND wf.product_id=p.id AND wf.bucket='full'
    LEFT JOIN stock_balances we ON we.stock_point_id=wh.id AND we.product_id=p.id AND we.bucket='empty'
    LEFT JOIN stock_balances wu ON wu.stock_point_id=wh.id AND wu.product_id=p.id AND wu.bucket='unclassified'
    LEFT JOIN group_norms gn ON gn.group_id=${profile.group_id}::uuid AND gn.product_id=p.id
    WHERE p.active=true AND p.internal_group_tracking=true
    ORDER BY p.display_order,p.name
  `;
  return rows.map((r: any) => ({
    id: String(r.id), code: String(r.code), name: String(r.name), unit: String(r.unit),
    groupQty: Number(r.group_qty || 0), warehouseFull: Number(r.warehouse_full || 0),
    warehouseEmpty: Number(r.warehouse_empty || 0), warehouseUnclassified: Number(r.warehouse_unclassified || 0), normQty: Number(r.norm_qty || 0),
  }));
}

export async function createInternalRequest(profile: Profile, input: { requestType: RequestType; items: InternalRequestItemInput[]; note?: string }) {
  if (!["foreman","supervisor"].includes(profile.role) || !profile.group_id) throw new Error("Không có quyền tạo phiếu cho nhóm");
  const [group] = await sql`SELECT code FROM work_groups WHERE id=${profile.group_id}::uuid LIMIT 1`;
  if (group?.code === "COI") throw new Error("Nhóm Cối/Mỏ chỉ theo dõi số chai; khi cần đổi liên hệ Workshop qua Zalo");

  const items = input.items
    .map((x) => ({ productId: String(x.productId || ""), quantity: Math.floor(Number(x.quantity || 0)) }))
    .filter((x) => x.productId);
  if (!items.length) throw new Error("Phiếu phải có ít nhất một loại khí");
  if (items.length > 12) throw new Error("Một phiếu tối đa 12 loại khí");
  if (new Set(items.map((x) => x.productId)).size !== items.length) throw new Error("Một loại khí chỉ được xuất hiện một lần trong phiếu");
  if (items.some((x) => !(x.quantity > 0))) throw new Error("Số lượng phải lớn hơn 0");

  let requestId = "";
  await sql.begin(async (tx) => {
    const groupPoint = await getGroupStockPoint(profile.group_id!, tx);
    const validProducts: any[] = [];
    for (const item of items) {
      const [product] = await tx`SELECT id,name FROM products WHERE id=${item.productId}::uuid AND active=true AND internal_group_tracking=true LIMIT 1`;
      if (!product) throw new Error("Có loại khí không áp dụng nghiệp vụ mượn/đổi/trả nội bộ");
      validProducts.push(product);
      if (input.requestType === "exchange" || input.requestType === "return") {
        const [balance] = await tx`SELECT COALESCE(qty,0)::float8 AS qty FROM stock_balances WHERE stock_point_id=${groupPoint.id}::uuid AND product_id=${item.productId}::uuid AND bucket='managed'`;
        const held = Number(balance?.qty || 0);
        if (item.quantity > held) throw new Error(`${product.name}: số lượng yêu cầu ${item.quantity} lớn hơn số chai tại nhóm (${held})`);
      }
    }

    const first = items[0];
    const [row] = await tx`
      INSERT INTO internal_requests(request_code,request_type,group_id,product_id,requested_qty,requested_by,note,approval_mode)
      VALUES ('TMP-'||gen_random_uuid()::text,${input.requestType},${profile.group_id}::uuid,${first.productId}::uuid,${first.quantity},${profile.id}::uuid,${input.note || null},
        CASE WHEN ${input.requestType}='borrow' THEN NULL ELSE 'not_required' END)
      RETURNING id
    `;
    requestId = String(row.id);
    const code = `${requestPrefix(input.requestType)}-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${requestId.slice(0,6).toUpperCase()}`;
    await tx`UPDATE internal_requests SET request_code=${code} WHERE id=${requestId}::uuid`;

    for (const item of items) {
      await tx`
        INSERT INTO internal_request_items(internal_request_id,product_id,requested_qty)
        VALUES (${requestId}::uuid,${item.productId}::uuid,${item.quantity})
      `;
    }
    await audit({ tx, actorUserId: profile.id, action: "create", entityType: "internal_request", entityId: requestId, after: { requestType: input.requestType, items, note: input.note || null, code } });
  });
  return requestId;
}

export async function approveBorrow(profile: Profile, requestId: string) {
  if (!(await isOfficeHours())) throw new Error("Ngoài giờ hành chính: Thủ kho có thể cấp mượn và chuyển hậu kiểm");
  if (!canApproveOfficeBorrow(profile)) throw new Error("Không có quyền duyệt mượn trong giờ hành chính");
  const [row] = await sql`SELECT * FROM internal_requests WHERE id=${requestId}::uuid FOR UPDATE`;
  if (!row || row.request_type !== "borrow" || row.status !== "pending") throw new Error("Phiếu không ở trạng thái chờ duyệt");
  await sql`UPDATE internal_requests SET status='approved',approval_mode='office_hours',approved_by=${profile.id}::uuid,approved_at=now() WHERE id=${requestId}::uuid`;
  await audit({ actorUserId: profile.id, action: "approve", entityType: "internal_request", entityId: requestId, after: { status: "approved" } });
}

export async function executeInternalRequest(profile: Profile, requestId: string, inputs: InternalExecuteItemInput[]) {
  if (!canExecuteWarehouse(profile)) throw new Error("Không có quyền thực hiện nghiệp vụ kho");
  const affectedProducts: string[] = [];

  await sql.begin(async (tx) => {
    const [req] = await tx`SELECT * FROM internal_requests WHERE id=${requestId}::uuid FOR UPDATE`;
    if (!req) throw new Error("Không tìm thấy phiếu");
    const office = await isOfficeHours();
    if (req.request_type === "borrow") {
      if (office && req.status !== "approved") throw new Error("Trong giờ hành chính phải được Workshop/Trưởng kho duyệt trước khi Thủ kho cấp");
      if (!office && !["pending","approved"].includes(req.status)) throw new Error("Phiếu mượn không thể thực hiện");
    } else if (req.status !== "pending") throw new Error("Phiếu không ở trạng thái chờ xử lý");

    let items = await tx`
      SELECT iri.id,iri.product_id,iri.requested_qty::float8 AS requested_qty,p.name AS product_name
      FROM internal_request_items iri JOIN products p ON p.id=iri.product_id
      WHERE iri.internal_request_id=${requestId}::uuid ORDER BY iri.created_at,iri.id FOR UPDATE OF iri
    `;
    if (!items.length) {
      const inserted = await tx`
        INSERT INTO internal_request_items(internal_request_id,product_id,requested_qty,actual_qty,return_bucket,line_status)
        VALUES (${requestId}::uuid,${req.product_id}::uuid,${req.requested_qty},${req.actual_qty},${req.return_bucket},CASE WHEN ${req.actual_qty} IS NULL THEN 'pending' ELSE 'executed' END)
        RETURNING id,product_id,requested_qty::float8 AS requested_qty
      `;
      items = inserted;
    }

    const inputMap = new Map(inputs.map((x) => [String(x.itemId), x]));
    if (items.some((item: any) => !inputMap.has(String(item.id)))) throw new Error("Cần nhập số lượng thực tế cho toàn bộ các dòng của phiếu");

    const wh = await getStockPointByCode("WH-PHC", tx);
    const gp = await getGroupStockPoint(req.group_id, tx);
    let totalActual = 0;

    for (const item of items as any[]) {
      const input = inputMap.get(String(item.id))!;
      const actualQty = Math.max(0, Math.floor(Number(input.actualQty || 0)));
      if (!Number.isFinite(actualQty)) throw new Error("Số lượng thực tế không hợp lệ");
      const productId = String(item.product_id);
      affectedProducts.push(productId);

      if (actualQty > 0) {
        if (req.request_type === "exchange") {
          await applyStockDelta({ tx, stockPointId: wh.id, productId, bucket: "full", delta: -actualQty, referenceType: "internal_exchange", referenceId: req.id, actorUserId: profile.id });
          await applyStockDelta({ tx, stockPointId: wh.id, productId, bucket: "empty", delta: actualQty, referenceType: "internal_exchange", referenceId: req.id, actorUserId: profile.id });
        } else if (req.request_type === "borrow") {
          await applyStockDelta({ tx, stockPointId: wh.id, productId, bucket: "full", delta: -actualQty, referenceType: "internal_borrow", referenceId: req.id, actorUserId: profile.id });
          await applyStockDelta({ tx, stockPointId: gp.id, productId, bucket: "managed", delta: actualQty, referenceType: "internal_borrow", referenceId: req.id, actorUserId: profile.id });
        } else {
          const bucket = input.returnBucket === "full" ? "full" : "empty";
          await applyStockDelta({ tx, stockPointId: gp.id, productId, bucket: "managed", delta: -actualQty, referenceType: "internal_return", referenceId: req.id, actorUserId: profile.id });
          await applyStockDelta({ tx, stockPointId: wh.id, productId, bucket, delta: actualQty, referenceType: "internal_return", referenceId: req.id, actorUserId: profile.id });
        }
      }
      totalActual += actualQty;
      await tx`
        UPDATE internal_request_items SET actual_qty=${actualQty},return_bucket=${req.request_type === "return" ? (input.returnBucket === "full" ? "full" : "empty") : null},line_status='executed',executed_at=now()
        WHERE id=${item.id}::uuid
      `;
    }

    const needsReview = req.request_type === "exchange" || req.request_type === "return" || (req.request_type === "borrow" && !office);
    await tx`
      UPDATE internal_requests SET actual_qty=${totalActual},return_bucket=NULL,executed_by=${profile.id}::uuid,executed_at=now(),
        approval_mode=CASE WHEN request_type='borrow' THEN ${office ? "office_hours" : "after_hours"} ELSE approval_mode END,
        status=${needsReview ? "executed_pending_review" : "completed"}
      WHERE id=${requestId}::uuid
    `;
    await audit({ tx, actorUserId: profile.id, action: "execute", entityType: "internal_request", entityId: requestId, after: { items: inputs, totalActual, status: needsReview ? "executed_pending_review" : "completed" } });
  });

  for (const productId of [...new Set(affectedProducts)]) await checkLowStock(productId);
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


export async function reviseInternalRequestAfterFeedback(profile: Profile, requestId: string, inputs: InternalExecuteItemInput[]) {
  if (profile.role !== "storekeeper") throw new Error("Chỉ Thủ kho được chỉnh số thực tế sau phản hồi hậu kiểm");
  const affectedProducts = new Set<string>();

  await sql.begin(async (tx) => {
    const [req] = await tx`SELECT * FROM internal_requests WHERE id=${requestId}::uuid FOR UPDATE`;
    if (!req) throw new Error("Không tìm thấy phiếu");
    if (req.status !== "feedback") throw new Error("Chỉ chỉnh được phiếu đang có phản hồi");

    const items = await tx`
      SELECT iri.id,iri.product_id,iri.requested_qty::float8 AS requested_qty,
        iri.actual_qty::float8 AS actual_qty,iri.return_bucket,p.name AS product_name
      FROM internal_request_items iri
      JOIN products p ON p.id=iri.product_id
      WHERE iri.internal_request_id=${requestId}::uuid
      ORDER BY iri.created_at,iri.id
      FOR UPDATE OF iri
    `;
    if (!items.length) throw new Error("Phiếu chưa có dòng chi tiết để chỉnh");

    const inputMap = new Map(inputs.map((x) => [String(x.itemId), x]));
    if ((items as any[]).some((item: any) => !inputMap.has(String(item.id)))) {
      throw new Error("Cần nhập lại số lượng thực tế cho toàn bộ các dòng");
    }

    const wh = await getStockPointByCode("WH-PHC", tx);
    const gp = await getGroupStockPoint(req.group_id, tx);
    const beforeItems = (items as any[]).map((item: any) => ({
      itemId: String(item.id),
      productId: String(item.product_id),
      actualQty: Number(item.actual_qty || 0),
      returnBucket: item.return_bucket || null,
    }));
    const afterItems: Array<{ itemId: string; productId: string; actualQty: number; returnBucket: "full" | "empty" | null }> = [];
    let totalActual = 0;

    for (const item of items as any[]) {
      const input = inputMap.get(String(item.id))!;
      const oldQty = Number(item.actual_qty || 0);
      const newQty = Math.max(0, Math.floor(Number(input.actualQty)));
      if (!Number.isFinite(newQty)) throw new Error(`${item.product_name}: số lượng thực tế không hợp lệ`);
      const productId = String(item.product_id);
      const diff = newQty - oldQty;
      affectedProducts.add(productId);

      if (req.request_type === "exchange") {
        if (diff !== 0) {
          await applyStockDelta({ tx, stockPointId: wh.id, productId, bucket: "full", delta: -diff, referenceType: "internal_exchange_revision", referenceId: req.id, actorUserId: profile.id, note: "Điều chỉnh số thực tế sau phản hồi" });
          await applyStockDelta({ tx, stockPointId: wh.id, productId, bucket: "empty", delta: diff, referenceType: "internal_exchange_revision", referenceId: req.id, actorUserId: profile.id, note: "Điều chỉnh số thực tế sau phản hồi" });
        }
      } else if (req.request_type === "borrow") {
        if (diff !== 0) {
          await applyStockDelta({ tx, stockPointId: wh.id, productId, bucket: "full", delta: -diff, referenceType: "internal_borrow_revision", referenceId: req.id, actorUserId: profile.id, note: "Điều chỉnh số thực tế sau phản hồi" });
          await applyStockDelta({ tx, stockPointId: gp.id, productId, bucket: "managed", delta: diff, referenceType: "internal_borrow_revision", referenceId: req.id, actorUserId: profile.id, note: "Điều chỉnh số thực tế sau phản hồi" });
        }
      } else {
        const oldBucket = item.return_bucket === "full" ? "full" : "empty";
        const newBucket = input.returnBucket === "full" ? "full" : "empty";
        if (oldBucket === newBucket) {
          if (diff !== 0) {
            await applyStockDelta({ tx, stockPointId: gp.id, productId, bucket: "managed", delta: -diff, referenceType: "internal_return_revision", referenceId: req.id, actorUserId: profile.id, note: "Điều chỉnh số thực tế sau phản hồi" });
            await applyStockDelta({ tx, stockPointId: wh.id, productId, bucket: newBucket, delta: diff, referenceType: "internal_return_revision", referenceId: req.id, actorUserId: profile.id, note: "Điều chỉnh số thực tế sau phản hồi" });
          }
        } else {
          const groupDiff = oldQty - newQty;
          if (groupDiff !== 0) {
            await applyStockDelta({ tx, stockPointId: gp.id, productId, bucket: "managed", delta: groupDiff, referenceType: "internal_return_revision", referenceId: req.id, actorUserId: profile.id, note: "Điều chỉnh số thực tế sau phản hồi" });
          }
          if (oldQty > 0) {
            await applyStockDelta({ tx, stockPointId: wh.id, productId, bucket: oldBucket, delta: -oldQty, referenceType: "internal_return_revision", referenceId: req.id, actorUserId: profile.id, note: "Đổi tình trạng chai sau phản hồi" });
          }
          if (newQty > 0) {
            await applyStockDelta({ tx, stockPointId: wh.id, productId, bucket: newBucket, delta: newQty, referenceType: "internal_return_revision", referenceId: req.id, actorUserId: profile.id, note: "Đổi tình trạng chai sau phản hồi" });
          }
        }
      }

      const nextBucket = req.request_type === "return" ? (input.returnBucket === "full" ? "full" : "empty") : null;
      await tx`
        UPDATE internal_request_items
        SET actual_qty=${newQty},return_bucket=${nextBucket},line_status='executed',executed_at=now()
        WHERE id=${item.id}::uuid
      `;
      totalActual += newQty;
      afterItems.push({ itemId: String(item.id), productId, actualQty: newQty, returnBucket: nextBucket });
    }

    await tx`
      UPDATE internal_requests
      SET actual_qty=${totalActual},status='executed_pending_review',feedback=NULL,
          executed_by=${profile.id}::uuid,executed_at=now(),reviewed_by=NULL,reviewed_at=NULL
      WHERE id=${requestId}::uuid
    `;
    await audit({
      tx,
      actorUserId: profile.id,
      action: "revise_after_feedback",
      entityType: "internal_request",
      entityId: requestId,
      before: { items: beforeItems, feedback: req.feedback },
      after: { items: afterItems, status: "executed_pending_review" },
      note: "Thủ kho chỉnh số thực tế theo phản hồi và gửi lại hậu kiểm.",
    });
  });

  for (const productId of affectedProducts) await checkLowStock(productId);
}

export async function listInternalRequests(profile: Profile) {
  const base = `
    SELECT ir.id,ir.request_code,ir.request_type,ir.requested_qty::float8 AS requested_qty,ir.actual_qty::float8 AS actual_qty,
      ir.status,ir.requested_at,ir.note,ir.feedback,g.name AS group_name,u.full_name AS requested_by_name,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id',iri.id,'product_id',iri.product_id,'product_code',p.code,'product_name',p.name,'unit',p.unit,
          'requested_qty',iri.requested_qty::float8,'actual_qty',iri.actual_qty::float8,'return_bucket',iri.return_bucket,'line_status',iri.line_status
        ) ORDER BY iri.created_at,iri.id)
        FROM internal_request_items iri JOIN products p ON p.id=iri.product_id
        WHERE iri.internal_request_id=ir.id
      ), jsonb_build_array(jsonb_build_object(
        'id',ir.id,'product_id',ir.product_id,'product_code',legacy.code,'product_name',legacy.name,'unit',legacy.unit,
        'requested_qty',ir.requested_qty::float8,'actual_qty',ir.actual_qty::float8,'return_bucket',ir.return_bucket,'line_status',CASE WHEN ir.actual_qty IS NULL THEN 'pending' ELSE 'executed' END
      ))) AS items
    FROM internal_requests ir
    JOIN work_groups g ON g.id=ir.group_id
    JOIN users u ON u.id=ir.requested_by
    JOIN products legacy ON legacy.id=ir.product_id
  `;
  if (["foreman","supervisor","worker"].includes(profile.role) && profile.group_id) {
    return sql.unsafe(`${base} WHERE ir.group_id=$1 ORDER BY ir.requested_at DESC LIMIT 200`, [profile.group_id]);
  }
  return sql.unsafe(`${base} ORDER BY ir.requested_at DESC LIMIT 200`);
}
