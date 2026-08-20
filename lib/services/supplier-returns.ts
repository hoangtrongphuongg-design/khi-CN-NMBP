import { sql } from "@/lib/db";
import type { Profile } from "@/types/app";
import { applyStockDelta, audit, getStockPointByCode } from "@/lib/stock";
import { toDateKey } from "@/lib/utils";

function stamp(prefix: string, id: string, date: string) {
  return `${prefix}-${date.replaceAll("-", "")}-${id.slice(0, 6).toUpperCase()}`;
}

async function allocateXL45Return(tx: any, supplierReturnItemId: string, productId: string, locationId: string, returnDate: string, quantity: number) {
  let remaining = quantity;
  const lots = await tx`
    SELECT id,delivered_date,qty_outstanding::float8 AS qty_outstanding
    FROM xl45_lots
    WHERE product_id=${productId}::uuid AND location_id=${locationId}::uuid AND qty_outstanding>0
    ORDER BY delivered_date,id
    FOR UPDATE
  `;
  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(lot.qty_outstanding));
    const [cost] = await tx`
      SELECT COUNT(*)::int AS charge_days, COALESCE(SUM((
        SELECT pr.unit_price FROM price_rules pr
        WHERE pr.price_type='xl45_rental_day'
          AND pr.effective_from<=d::date
          AND (pr.effective_to IS NULL OR pr.effective_to>=d::date)
        ORDER BY pr.effective_from DESC LIMIT 1
      )),0)::float8 AS amount_per_bon
      FROM generate_series(${toDateKey(lot.delivered_date)}::date + interval '15 day',${returnDate}::date,interval '1 day') AS gs(d)
    `;
    const rentalAmount = Number(cost?.amount_per_bon ?? 0) * take;
    await tx`
      INSERT INTO xl45_return_allocations(supplier_return_item_id,xl45_lot_id,return_date,quantity,charge_days,rental_amount)
      VALUES (${supplierReturnItemId}::uuid,${lot.id}::uuid,${returnDate}::date,${take},${Number(cost?.charge_days ?? 0)},${rentalAmount})
    `;
    await tx`UPDATE xl45_lots SET qty_outstanding=qty_outstanding-${take} WHERE id=${lot.id}::uuid`;
    remaining -= take;
  }
  if (remaining > 0.000001) throw new Error("Số bồn XL-45 trả vượt số bồn đang lưu theo lịch sử giao nhận");
}

/**
 * Trả vỏ NCC chỉ được tạo từ một Phiếu giao đã có.
 * Phiếu trả dùng lại trip_id, ngày, NCC và địa điểm của Phiếu giao; không tạo chuyến/cước mới.
 * Người Nhà máy/Mỏ xác nhận là cập nhật tồn ngay; NCC chỉ xem và phản hồi nếu có sai sót.
 */
export async function createSupplierReturn(profile: Profile, input: {
  deliveryId: string;
  lines: { productId: string; quantity: number }[];
  note?: string;
}) {
  if (!["storekeeper", "mine_xsc"].includes(profile.role)) {
    throw new Error("Chỉ Thủ kho Nhà máy hoặc XSC Mỏ được tạo trả vỏ cùng chuyến");
  }
  const lines = input.lines.filter((x) => x.productId && Number(x.quantity) > 0);
  if (!lines.length) throw new Error("Phiếu trả phải có ít nhất một loại vỏ");
  if (new Set(lines.map((x) => x.productId)).size !== lines.length) throw new Error("Mỗi loại vỏ chỉ nhập một dòng");

  return sql.begin(async (tx) => {
    const [delivery] = await tx`
      SELECT d.id,d.delivery_code,d.trip_id,d.supplier_org_id,d.delivery_date,d.status
      FROM supplier_deliveries d
      WHERE d.id=${input.deliveryId}::uuid
      FOR UPDATE
    `;
    if (!delivery) throw new Error("Không tìm thấy Phiếu giao NCC");
    if (!delivery.trip_id) throw new Error("Phiếu giao chưa có chuyến vận chuyển");
    if (delivery.status === "cancelled") throw new Error("Phiếu giao đã hủy, không thể trả vỏ cùng chuyến");

    const allowedLocationCode = profile.role === "mine_xsc" ? "MINE" : "PLANT";
    const [loc] = await tx`
      SELECT DISTINCT l.id,l.code,l.name
      FROM supplier_delivery_items di
      JOIN locations l ON l.id=di.destination_location_id
      WHERE di.delivery_id=${delivery.id}::uuid
        AND l.code=${allowedLocationCode}
      LIMIT 1
    `;
    if (!loc) {
      throw new Error(allowedLocationCode === "MINE"
        ? "Chuyến này không có giao tại Mỏ Tà Thiết nên XSC Mỏ không được tạo trả vỏ"
        : "Chuyến này không có giao tại Nhà máy nên Thủ kho không được tạo trả vỏ");
    }

    const [existing] = await tx`
      SELECT id,return_code FROM supplier_returns
      WHERE trip_id=${delivery.trip_id}::uuid AND source_location_id=${loc.id}::uuid AND status<>'cancelled'
      ORDER BY created_at DESC LIMIT 1
    `;
    if (existing) throw new Error(`Chuyến này đã có Phiếu trả vỏ ${existing.return_code}`);

    const validProducts = await tx`
      SELECT id,code,name,warehouse_split_full_empty,returnable_container
      FROM products
      WHERE id IN ${tx(lines.map((x) => x.productId))} AND active=true AND returnable_container=true
    `;
    if (validProducts.length !== lines.length) throw new Error("Phiếu trả chỉ được chọn sản phẩm có vỏ/bồn hoàn trả");
    const productById = new Map((validProducts as any[]).map((p) => [String(p.id), p]));

    const [ret] = await tx`
      INSERT INTO supplier_returns(return_code,trip_id,supplier_org_id,return_date,source_location_id,status,note,created_by,warehouse_review_status)
      VALUES (('TMP-'||gen_random_uuid()::text),${delivery.trip_id}::uuid,${delivery.supplier_org_id}::uuid,${toDateKey(delivery.delivery_date)}::date,${loc.id}::uuid,'completed',${input.note || null},${profile.id}::uuid,'pending')
      RETURNING id
    `;
    const code = stamp("TRA-NCC", ret.id, toDateKey(delivery.delivery_date));
    await tx`UPDATE supplier_returns SET return_code=${code} WHERE id=${ret.id}`;

    const wh = loc.code === "PLANT" ? await getStockPointByCode("WH-PHC", tx) : null;
    const [mine] = loc.code === "MINE"
      ? await tx`SELECT sp.id FROM stock_points sp JOIN work_groups g ON g.id=sp.group_id WHERE g.code='COI' LIMIT 1`
      : [null];

    for (const line of lines) {
      const product = productById.get(line.productId) as any;
      const quantity = Number(line.quantity);
      const [item] = await tx`
        INSERT INTO supplier_return_items(supplier_return_id,product_id,declared_qty,confirmed_qty,status)
        VALUES (${ret.id}::uuid,${line.productId}::uuid,${quantity},${quantity},'confirmed')
        RETURNING id
      `;

      const pointId = loc.code === "MINE" ? mine?.id : wh?.id;
      if (!pointId) throw new Error("Chưa cấu hình điểm tồn để trả vỏ");

      if (loc.code === "MINE") {
        await applyStockDelta({
          tx,
          stockPointId: pointId,
          productId: line.productId,
          bucket: "managed",
          delta: -quantity,
          referenceType: "supplier_return",
          referenceId: ret.id,
          actorUserId: profile.id,
          occurredDate: toDateKey(delivery.delivery_date),
          note: `Trả vỏ cùng chuyến ${delivery.delivery_code}`,
        });
      } else if (product.warehouse_split_full_empty) {
        // Tồn đầu kỳ 01/01/2026 chưa có dữ liệu tách đầy/rỗng.
        // Khi người dùng xác nhận trả vỏ, hành động này chính là bằng chứng số lượng đó
        // đang được xuất trả NCC: ưu tiên trừ kho "Rỗng", phần thiếu mới trừ "Đầu kỳ chưa phân loại".
        const balanceRows = await tx`
          SELECT bucket,qty::float8 AS qty
          FROM stock_balances
          WHERE stock_point_id=${pointId}::uuid
            AND product_id=${line.productId}::uuid
            AND bucket IN ('empty','unclassified')
          FOR UPDATE
        `;
        const emptyQty = Number((balanceRows as any[]).find((x:any)=>x.bucket==='empty')?.qty || 0);
        const unclassifiedQty = Number((balanceRows as any[]).find((x:any)=>x.bucket==='unclassified')?.qty || 0);
        if (quantity > emptyQty + unclassifiedQty + 0.000001) {
          throw new Error(`${product.name}: số vỏ trả ${quantity} lớn hơn số rỗng + đầu kỳ chưa phân loại trong Kho (${emptyQty + unclassifiedQty})`);
        }

        const fromEmpty = Math.min(quantity, emptyQty);
        const fromUnclassified = quantity - fromEmpty;

        if (fromEmpty > 0) {
          await applyStockDelta({
            tx,
            stockPointId: pointId,
            productId: line.productId,
            bucket: "empty",
            delta: -fromEmpty,
            referenceType: "supplier_return",
            referenceId: ret.id,
            actorUserId: profile.id,
            occurredDate: toDateKey(delivery.delivery_date),
            note: `Trả vỏ rỗng cùng chuyến ${delivery.delivery_code}`,
          });
        }
        if (fromUnclassified > 0) {
          await applyStockDelta({
            tx,
            stockPointId: pointId,
            productId: line.productId,
            bucket: "unclassified",
            delta: -fromUnclassified,
            referenceType: "supplier_return",
            referenceId: ret.id,
            actorUserId: profile.id,
            occurredDate: toDateKey(delivery.delivery_date),
            note: `Trả từ tồn đầu kỳ chưa phân loại cùng chuyến ${delivery.delivery_code}`,
          });
        }
      } else {
        await applyStockDelta({
          tx,
          stockPointId: pointId,
          productId: line.productId,
          bucket: "available",
          delta: -quantity,
          referenceType: "supplier_return",
          referenceId: ret.id,
          actorUserId: profile.id,
          occurredDate: toDateKey(delivery.delivery_date),
          note: `Trả vỏ cùng chuyến ${delivery.delivery_code}`,
        });
      }

      if (["LOX-XL45", "LIN-XL45"].includes(String(product.code)) && quantity > 0) {
        await allocateXL45Return(tx, item.id, line.productId, loc.id, toDateKey(delivery.delivery_date), quantity);
      }
    }

    await audit({
      tx,
      actorUserId: profile.id,
      action: "return_with_delivery",
      entityType: "supplier_return",
      entityId: ret.id,
      after: {
        code,
        deliveryId: delivery.id,
        deliveryCode: delivery.delivery_code,
        tripId: delivery.trip_id,
        locationCode: loc.code,
        lines,
        extraTransportCost: 0,
      },
    });
    return { id: ret.id as string, code, tripId: delivery.trip_id as string };
  });
}

export async function feedbackSupplierReturnItem(profile: Profile, itemId: string, feedback: string) {
  if (profile.role !== "supplier" || !profile.organization_id) throw new Error("Chỉ NCC được phản hồi Phiếu trả vỏ");
  const message = feedback.trim();
  if (!message) throw new Error("Vui lòng nhập nội dung phản hồi");

  await sql.begin(async (tx) => {
    const [item] = await tx`
      SELECT ri.id,ri.supplier_return_id,r.supplier_org_id,r.status
      FROM supplier_return_items ri
      JOIN supplier_returns r ON r.id=ri.supplier_return_id
      WHERE ri.id=${itemId}::uuid
      FOR UPDATE OF ri
    `;
    if (!item || item.supplier_org_id !== profile.organization_id) throw new Error("Dòng trả vỏ không thuộc NCC này");
    if (item.status === "cancelled") throw new Error("Phiếu đã hủy");

    await tx`UPDATE supplier_return_items SET status='feedback',feedback=${message} WHERE id=${itemId}::uuid`;
    await tx`UPDATE supplier_returns SET status='feedback' WHERE id=${item.supplier_return_id}::uuid`;
    await audit({
      tx,
      actorUserId: profile.id,
      action: "supplier_feedback",
      entityType: "supplier_return_item",
      entityId: itemId,
      after: { feedback: message },
      note: "Chỉ phản hồi; không tự đảo tồn. Sai lệch được xử lý bằng điều chỉnh có lịch sử.",
    });
  });
}

export async function reviewSupplierReturnByWarehouseManager(
  profile: Profile,
  returnId: string,
  decision: "approve" | "feedback",
  note?: string,
) {
  if (profile.role !== "warehouse_manager") throw new Error("Chỉ Trưởng kho Hậu cần được duyệt hậu kiểm Phiếu trả vỏ NCC");
  const reviewNote = String(note || "").trim();
  if (decision === "feedback" && !reviewNote) throw new Error("Vui lòng nhập nội dung phản hồi");

  await sql.begin(async (tx) => {
    const [ret] = await tx`
      SELECT id,return_code,status,warehouse_review_status,source_location_id
      FROM supplier_returns
      WHERE id=${returnId}::uuid
      FOR UPDATE
    `;
    if (!ret) throw new Error("Không tìm thấy Phiếu trả vỏ");
    if (ret.status === "cancelled") throw new Error("Phiếu trả vỏ đã hủy");

    const before = {
      warehouse_review_status: ret.warehouse_review_status,
    };
    const nextStatus = decision === "approve" ? "approved" : "feedback";

    await tx`
      UPDATE supplier_returns
      SET warehouse_review_status=${nextStatus},
          warehouse_review_note=${reviewNote || null},
          warehouse_reviewed_by=${profile.id}::uuid,
          warehouse_reviewed_at=now()
      WHERE id=${returnId}::uuid
    `;

    await audit({
      tx,
      actorUserId: profile.id,
      action: decision === "approve" ? "warehouse_review_approve" : "warehouse_review_feedback",
      entityType: "supplier_return",
      entityId: returnId,
      before,
      after: { warehouse_review_status: nextStatus, warehouse_review_note: reviewNote || null },
      note: decision === "approve"
        ? "Duyệt hậu kiểm; không phát sinh bút toán tồn vì tồn đã cập nhật khi Thủ kho/XSC Mỏ xác nhận trả vỏ."
        : "Phản hồi hậu kiểm; không tự hoàn tác tồn kho.",
    });
  });
}

export async function listSupplierReturns(profile: Profile) {
  const supplierId = profile.role === "supplier" ? profile.organization_id : null;
  if (supplierId) {
    return sql`
      SELECT r.id,r.return_code,r.return_date,r.status,r.note,r.trip_id,l.name AS source_location,l.code AS source_location_code,t.trip_code,
        r.warehouse_review_status,r.warehouse_review_note,r.warehouse_reviewed_at,wr.full_name AS warehouse_reviewed_by_name,
        d.delivery_code,
        COALESCE(json_agg(json_build_object(
          'id',ri.id,'product_id',ri.product_id,'product_name',p.name,'unit',p.unit,
          'declared_qty',ri.declared_qty,'confirmed_qty',ri.confirmed_qty,'status',ri.status,'feedback',ri.feedback
        ) ORDER BY p.display_order) FILTER (WHERE ri.id IS NOT NULL),'[]'::json) AS items
      FROM supplier_returns r
      JOIN locations l ON l.id=r.source_location_id
      LEFT JOIN transport_trips t ON t.id=r.trip_id
      LEFT JOIN users wr ON wr.id=r.warehouse_reviewed_by
      LEFT JOIN LATERAL (
        SELECT sd.delivery_code FROM supplier_deliveries sd
        WHERE sd.trip_id=r.trip_id
        ORDER BY sd.created_at LIMIT 1
      ) d ON true
      LEFT JOIN supplier_return_items ri ON ri.supplier_return_id=r.id
      LEFT JOIN products p ON p.id=ri.product_id
      WHERE r.supplier_org_id=${supplierId}::uuid
      GROUP BY r.id,l.name,l.code,t.trip_code,d.delivery_code,wr.full_name
      ORDER BY r.return_date DESC,r.created_at DESC LIMIT 100
    `;
  }
  return sql`
    SELECT r.id,r.return_code,r.return_date,r.status,r.note,r.trip_id,l.name AS source_location,l.code AS source_location_code,t.trip_code,
      r.warehouse_review_status,r.warehouse_review_note,r.warehouse_reviewed_at,wr.full_name AS warehouse_reviewed_by_name,
      d.delivery_code,
      COALESCE(json_agg(json_build_object(
        'id',ri.id,'product_id',ri.product_id,'product_name',p.name,'unit',p.unit,
        'declared_qty',ri.declared_qty,'confirmed_qty',ri.confirmed_qty,'status',ri.status,'feedback',ri.feedback
      ) ORDER BY p.display_order) FILTER (WHERE ri.id IS NOT NULL),'[]'::json) AS items
    FROM supplier_returns r
    JOIN locations l ON l.id=r.source_location_id
    LEFT JOIN transport_trips t ON t.id=r.trip_id
    LEFT JOIN users wr ON wr.id=r.warehouse_reviewed_by
    LEFT JOIN LATERAL (
      SELECT sd.delivery_code FROM supplier_deliveries sd
      WHERE sd.trip_id=r.trip_id
      ORDER BY sd.created_at LIMIT 1
    ) d ON true
    LEFT JOIN supplier_return_items ri ON ri.supplier_return_id=r.id
    LEFT JOIN products p ON p.id=ri.product_id
    GROUP BY r.id,l.name,l.code,t.trip_code,d.delivery_code,wr.full_name
    ORDER BY r.return_date DESC,r.created_at DESC LIMIT 100
  `;
}
