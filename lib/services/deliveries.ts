import { sql } from "@/lib/db";
import type { Profile } from "@/types/app";
import {
  canConfirmMineDelivery,
  canConfirmPlantDelivery,
  canFeedbackDelivery,
  canFinalizePhcDelivery,
} from "@/lib/auth/permissions";
import { applyStockDelta, audit, getStockPointByCode, getSystemOperationState, recordHistoricalSupplierMovement } from "@/lib/stock";
import { resolvePriceRule, tripPriceType } from "@/lib/pricing";
import { checkLowStock } from "@/lib/notifications/low-stock";
import { toDateKey } from "@/lib/utils";

export type DeliveryLineInput = { productId: string; destinationLocationId: string; quantity: number };

function stamp(prefix: string, id: string, date: string) {
  return `${prefix}-${date.replaceAll("-", "")}-${id.slice(0, 6).toUpperCase()}`;
}

export async function createSupplierDelivery(profile: Profile, input: { deliveryDate: string; lines: DeliveryLineInput[]; note?: string }) {
  if (profile.role !== "supplier") throw new Error("Chỉ NCC được tạo Phiếu giao hàng");
  if (!profile.organization_id) throw new Error("Tài khoản NCC chưa gắn nhà cung cấp");
  const supplierId = profile.organization_id;
  const lines = input.lines.filter((x) => x.productId && x.destinationLocationId && Number(x.quantity) > 0);
  if (!lines.length) throw new Error("Phiếu giao phải có ít nhất một dòng hàng tại Nhà máy hoặc Mỏ");

  const lineKeys = lines.map((x) => `${x.destinationLocationId}:${x.productId}`);
  if (new Set(lineKeys).size !== lineKeys.length) throw new Error("Mỗi loại khí chỉ nhập một lần tại cùng một địa điểm");

  return sql.begin(async (tx) => {
    const operationState = await getSystemOperationState(tx);
    if (operationState.mode === "live" && operationState.go_live_date && input.deliveryDate < toDateKey(operationState.go_live_date)) {
      throw new Error(`Hệ thống đã vận hành chính thức từ ${toDateKey(operationState.go_live_date)}; không nhập Phiếu giao lịch sử trước mốc này bằng luồng vận hành.`);
    }
    const destinationIds = Array.from(new Set(lines.map((x) => x.destinationLocationId)));
    const destinations = await tx`SELECT id,code,name FROM locations WHERE id IN ${tx(destinationIds)} AND active=true`;
    if (destinations.length !== destinationIds.length || (destinations as any[]).some((x:any) => !["PLANT", "MINE"].includes(x.code))) {
      throw new Error("Địa điểm giao không hợp lệ");
    }
    const destinationById = new Map((destinations as any[]).map((x:any) => [String(x.id), x]));

    const uniqueProductIds = Array.from(new Set(lines.map((x) => x.productId)));
    const productRows = await tx`SELECT id,code FROM products WHERE id IN ${tx(uniqueProductIds)} AND active=true`;
    if (productRows.length !== uniqueProductIds.length) throw new Error("Có loại khí không còn hoạt động");

    const visitsPlant = lines.some((x) => destinationById.get(x.destinationLocationId)?.code === "PLANT");
    const visitsMine = lines.some((x) => destinationById.get(x.destinationLocationId)?.code === "MINE");
    if (!visitsPlant && !visitsMine) throw new Error("Phiếu giao chưa có dữ liệu Nhà máy hoặc Mỏ");

    const co2Special = (productRows as any[]).some((x:any) => x.code === "LIQ-CO2");
    const kind = co2Special ? "co2_liquid" : visitsMine ? "mine" : "plant";
    const price = await resolvePriceRule(tripPriceType(visitsMine, co2Special), input.deliveryDate, null, tx, supplierId);
    if (!price) throw new Error("Chưa cấu hình đơn giá vận chuyển có hiệu lực cho ngày giao");

    // 1 Phiếu giao NCC = 1 chuyến = 1 cước.
    // Nếu có bất kỳ dòng giao tại Mỏ thì cả chuyến áp dụng cước Mỏ (trừ chuyến CO2 lỏng chuyên dụng).
    const [trip] = await tx`
      INSERT INTO transport_trips(trip_code,trip_date,supplier_org_id,visits_plant,visits_mine,co2_liquid_special,trip_kind,price_rule_id,transport_unit_price,transport_amount,created_by,note)
      VALUES (('TMP-'||gen_random_uuid()::text),${input.deliveryDate}::date,${supplierId}::uuid,${visitsPlant},${visitsMine},${co2Special},${kind},${price.id}::uuid,${Number(price.unit_price)},${Number(price.unit_price)},${profile.id}::uuid,${input.note || null})
      RETURNING id
    `;
    const tripCode = stamp("CHUYEN", trip.id, input.deliveryDate);
    await tx`UPDATE transport_trips SET trip_code=${tripCode} WHERE id=${trip.id}`;

    const [delivery] = await tx`
      INSERT INTO supplier_deliveries(delivery_code,trip_id,supplier_org_id,delivery_date,note,created_by)
      VALUES (('TMP-'||gen_random_uuid()::text),${trip.id}::uuid,${supplierId}::uuid,${input.deliveryDate}::date,${input.note || null},${profile.id}::uuid)
      RETURNING id
    `;
    const code = stamp("GH", delivery.id, input.deliveryDate);
    await tx`UPDATE supplier_deliveries SET delivery_code=${code} WHERE id=${delivery.id}`;

    for (const line of lines) {
      await tx`
        INSERT INTO supplier_delivery_items(delivery_id,product_id,destination_location_id,declared_qty)
        VALUES (${delivery.id}::uuid,${line.productId}::uuid,${line.destinationLocationId}::uuid,${line.quantity})
      `;
    }

    await audit({
      tx,
      actorUserId: profile.id,
      action: "create",
      entityType: "supplier_delivery",
      entityId: delivery.id,
      after: {
        code,
        tripCode,
        visitsPlant,
        visitsMine,
        lines,
        co2Special,
        transportAmount: Number(price.unit_price),
      },
    });
    return { id: delivery.id as string, code, tripId: trip.id as string, tripCode };
  });
}

export async function resubmitDeliveryItem(profile: Profile, itemId: string, declaredQty: number) {
  if (profile.role !== "supplier" || !profile.organization_id) throw new Error("Chỉ NCC được cập nhật dòng giao bị phản hồi");
  if (!(declaredQty > 0)) throw new Error("Số lượng phải lớn hơn 0");
  await sql.begin(async (tx) => {
    const [item] = await tx`
      SELECT di.id,di.delivery_id,di.status,di.declared_qty,di.confirmed_by,d.supplier_org_id
      FROM supplier_delivery_items di
      JOIN supplier_deliveries d ON d.id=di.delivery_id
      WHERE di.id=${itemId}::uuid FOR UPDATE
    `;
    if (!item || item.supplier_org_id !== profile.organization_id) throw new Error("Dòng giao không thuộc NCC này");
    if (item.status !== "feedback") throw new Error("Chỉ cập nhật dòng đang có phản hồi");
    if (item.confirmed_by) throw new Error("Phản hồi này dành cho bên nhận chỉnh số thực nhận, NCC không được sửa số khai báo");
    const before = { declared_qty: Number(item.declared_qty), status: item.status };
    await tx`
      UPDATE supplier_delivery_items
      SET declared_qty=${declaredQty},confirmed_qty=NULL,status='pending',feedback=NULL,confirmed_by=NULL,confirmed_at=NULL,
          price_rule_id=NULL,unit_price=NULL,line_amount=NULL
      WHERE id=${itemId}::uuid
    `;
    await tx`UPDATE supplier_deliveries SET status='pending',phc_confirmed_by=NULL,phc_confirmed_at=NULL WHERE id=${item.delivery_id}::uuid`;
    await audit({ tx, actorUserId: profile.id, action: "resubmit", entityType: "supplier_delivery_item", entityId: itemId, before, after: { declared_qty: declaredQty, status: "pending" } });
  });
}

// Bước 1: bên nhận xác nhận số lượng thực nhận theo địa điểm.
// Nhà máy: Thủ kho Hậu cần. Mỏ: XSC Mỏ.
// Bước này KHÔNG phụ thuộc đơn giá và CHƯA cập nhật tồn kho.
export async function confirmDeliveryItem(profile: Profile, itemId: string, actualQty: number, action: "confirm"|"feedback", feedback?: string) {
  if (!(actualQty >= 0)) throw new Error("Số lượng không hợp lệ");
  await sql.begin(async (tx) => {
    const [item] = await tx`
      SELECT di.*,d.delivery_date,d.status AS delivery_status,l.code AS location_code,p.name AS product_name
      FROM supplier_delivery_items di
      JOIN supplier_deliveries d ON d.id=di.delivery_id
      JOIN locations l ON l.id=di.destination_location_id
      JOIN products p ON p.id=di.product_id
      WHERE di.id=${itemId}::uuid FOR UPDATE
    `;
    if (!item || item.status === "confirmed") throw new Error("Dòng giao không còn chờ xác nhận");

    if (action === "feedback") {
      if (!canFeedbackDelivery(profile)) throw new Error("Không có quyền phản hồi Phiếu giao");
      if (item.status === "xsc_confirmed" && profile.role !== "warehouse_manager") {
        throw new Error("Sau khi bên nhận xác nhận, chỉ Trưởng kho Hậu cần được phản hồi trước bước duyệt nhận hàng");
      }
      if (item.status === "pending") {
        const allowedPendingFeedback =
          profile.role === "warehouse_manager" ||
          (item.location_code === "PLANT" && profile.role === "storekeeper") ||
          (item.location_code === "MINE" && profile.role === "mine_xsc");
        if (!allowedPendingFeedback) throw new Error("Không có quyền phản hồi dòng giao này");
      }
      const wasXscConfirmed = item.status === "xsc_confirmed";
      await tx`
        UPDATE supplier_delivery_items
        SET status='feedback',confirmed_qty=${wasXscConfirmed ? actualQty : null},feedback=${feedback || "Số liệu chưa thống nhất"},
            confirmed_by=${wasXscConfirmed ? item.confirmed_by : null}::uuid,
            confirmed_at=${wasXscConfirmed ? item.confirmed_at : null}::timestamptz
        WHERE id=${itemId}::uuid
      `;
      await tx`UPDATE supplier_deliveries SET status='feedback',phc_confirmed_by=NULL,phc_confirmed_at=NULL WHERE id=${item.delivery_id}::uuid`;
      await tx`UPDATE transport_trips SET status='open' WHERE id=(SELECT trip_id FROM supplier_deliveries WHERE id=${item.delivery_id}::uuid)`;
      await audit({ tx, actorUserId: profile.id, action: "feedback", entityType: "supplier_delivery_item", entityId: itemId, after: { actualQty, feedback } });
      return;
    }

    if (item.status !== "pending") throw new Error("Dòng giao chưa ở trạng thái chờ xác nhận thực nhận");
    if (item.location_code === "PLANT" && !canConfirmPlantDelivery(profile)) throw new Error("Chỉ Thủ kho Hậu cần được xác nhận thực nhận tại Nhà máy");
    if (item.location_code === "MINE" && !canConfirmMineDelivery(profile)) throw new Error("Chỉ XSC Mỏ được xác nhận giao tại Mỏ");

    await tx`
      UPDATE supplier_delivery_items
      SET status='xsc_confirmed',confirmed_qty=${actualQty},feedback=NULL,confirmed_by=${profile.id}::uuid,confirmed_at=now()
      WHERE id=${itemId}::uuid
    `;

    const [counts] = await tx`
      SELECT
        count(*) FILTER (WHERE status='feedback')::int AS feedback_count,
        count(*) FILTER (WHERE status<>'xsc_confirmed')::int AS not_xsc_count
      FROM supplier_delivery_items
      WHERE delivery_id=${item.delivery_id}::uuid
    `;
    const nextStatus = Number(counts.feedback_count) > 0 ? "feedback" : Number(counts.not_xsc_count) === 0 ? "phc_pending" : "pending";
    await tx`UPDATE supplier_deliveries SET status=${nextStatus},phc_confirmed_by=NULL,phc_confirmed_at=NULL WHERE id=${item.delivery_id}::uuid`;
    await tx`UPDATE transport_trips SET status='open' WHERE id=(SELECT trip_id FROM supplier_deliveries WHERE id=${item.delivery_id}::uuid)`;
    await audit({ tx, actorUserId: profile.id, action: "xsc_confirm", entityType: "supplier_delivery_item", entityId: itemId, after: { actualQty, nextStatus } });
  });
}


export async function reviseConfirmedDeliveryItem(profile: Profile, itemId: string, actualQty: number) {
  if (!(actualQty >= 0) || !Number.isFinite(actualQty)) throw new Error("Số lượng thực nhận không hợp lệ");
  await sql.begin(async (tx) => {
    const [item] = await tx`
      SELECT di.id,di.delivery_id,di.status,di.confirmed_by,di.confirmed_qty,di.feedback,
        l.code AS location_code,d.status AS delivery_status
      FROM supplier_delivery_items di
      JOIN supplier_deliveries d ON d.id=di.delivery_id
      JOIN locations l ON l.id=di.destination_location_id
      WHERE di.id=${itemId}::uuid
      FOR UPDATE OF di
    `;
    if (!item) throw new Error("Không tìm thấy dòng giao");
    if (item.status !== "feedback" || !item.confirmed_by) throw new Error("Dòng này không phải phản hồi sau xác nhận thực nhận");
    if (item.location_code === "PLANT" && !canConfirmPlantDelivery(profile)) throw new Error("Chỉ Thủ kho Hậu cần được chỉnh số thực nhận tại Nhà máy");
    if (item.location_code === "MINE" && !canConfirmMineDelivery(profile)) throw new Error("Chỉ XSC Mỏ được chỉnh phần giao Mỏ");

    const before = { confirmed_qty: Number(item.confirmed_qty || 0), feedback: item.feedback, status: item.status };
    await tx`
      UPDATE supplier_delivery_items
      SET confirmed_qty=${actualQty},status='xsc_confirmed',feedback=NULL,confirmed_by=${profile.id}::uuid,confirmed_at=now()
      WHERE id=${itemId}::uuid
    `;
    const [counts] = await tx`
      SELECT
        count(*) FILTER (WHERE status='feedback')::int AS feedback_count,
        count(*) FILTER (WHERE status='pending')::int AS pending_count,
        count(*) FILTER (WHERE status='xsc_confirmed')::int AS xsc_count,
        count(*)::int AS total_count
      FROM supplier_delivery_items
      WHERE delivery_id=${item.delivery_id}::uuid
    `;
    const nextStatus = Number(counts.feedback_count) > 0
      ? "feedback"
      : Number(counts.pending_count) > 0
        ? "pending"
        : Number(counts.xsc_count) === Number(counts.total_count)
          ? "phc_pending"
          : "pending";
    await tx`
      UPDATE supplier_deliveries
      SET status=${nextStatus},phc_confirmed_by=NULL,phc_confirmed_at=NULL
      WHERE id=${item.delivery_id}::uuid
    `;
    await audit({
      tx,
      actorUserId: profile.id,
      action: "xsc_revise_after_feedback",
      entityType: "supplier_delivery_item",
      entityId: itemId,
      before,
      after: { confirmed_qty: actualQty, status: "xsc_confirmed", delivery_status: nextStatus },
      note: "Bên nhận chỉnh số thực nhận theo phản hồi của Trưởng kho và gửi lại duyệt.",
    });
  });
}

// Bước 2: Trưởng kho Hậu cần duyệt nhận hàng sau khi Thủ kho/XSC Mỏ đã xác nhận đủ các dòng.
// Tại đây mới chốt đơn giá, cập nhật tồn và hoàn tất Phiếu.
export async function finalizeDeliveryByPhc(profile: Profile, deliveryId: string) {
  if (!canFinalizePhcDelivery(profile)) throw new Error("Chỉ Trưởng kho Hậu cần được duyệt nhận hàng và hoàn tất Phiếu giao NCC");
  const lowStockProductIds = new Set<string>();

  await sql.begin(async (tx) => {
    const [delivery] = await tx`
      SELECT d.*,t.id AS trip_id
      FROM supplier_deliveries d
      LEFT JOIN transport_trips t ON t.id=d.trip_id
      WHERE d.id=${deliveryId}::uuid
      FOR UPDATE OF d
    `;
    if (!delivery) throw new Error("Không tìm thấy Phiếu giao");
    if (delivery.status === "completed") throw new Error("Phiếu giao đã hoàn tất");

    const items = await tx`
      SELECT di.*,l.code AS location_code,p.code AS product_code,p.name AS product_name,
        p.returnable_container,p.warehouse_split_full_empty
      FROM supplier_delivery_items di
      JOIN locations l ON l.id=di.destination_location_id
      JOIN products p ON p.id=di.product_id
      WHERE di.delivery_id=${deliveryId}::uuid
      ORDER BY l.code,p.display_order
      FOR UPDATE OF di
    `;
    if (!items.length) throw new Error("Phiếu giao không có dòng hàng");

    const feedbackCount = (items as any[]).filter((item) => item.status === "feedback").length;
    const pendingCount = (items as any[]).filter((item) => item.status === "pending").length;
    const invalidCount = (items as any[]).filter((item) => !["xsc_confirmed", "confirmed", "feedback", "pending"].includes(item.status)).length;
    if (feedbackCount > 0) throw new Error(`Còn ${feedbackCount} dòng đang có phản hồi, chưa thể Trưởng kho duyệt nhận hàng`);
    if (pendingCount > 0) throw new Error(`Còn ${pendingCount} dòng chưa được bên nhận xác nhận thực tế`);
    if (invalidCount > 0) throw new Error("Trạng thái dòng giao chưa hợp lệ để Trưởng kho duyệt nhận hàng");

    // Không phụ thuộc trạng thái cha bị trễ. Nếu tất cả dòng đã được bên nhận xác nhận thì Trưởng kho được hoàn tất.
    const deliveryDate = toDateKey(delivery.delivery_date);
    const pricedItems: Array<{
      id: string;
      productId: string;
      actualQty: number;
      unitPrice: number | null;
      amount: number | null;
      priceRuleId: string | null;
      priceMissing: boolean;
    }> = [];

    for (const item of items as any[]) {
      const actualQty = Number(item.confirmed_qty ?? 0);
      const price = await resolvePriceRule("product", deliveryDate, item.product_id, tx, delivery.supplier_org_id);
      const unitPrice = price ? Number(price.unit_price ?? 0) : null;
      pricedItems.push({
        id: item.id,
        productId: item.product_id,
        actualQty,
        unitPrice,
        amount: unitPrice == null ? null : unitPrice * actualQty,
        priceRuleId: price?.id ?? null,
        priceMissing: !price,
      });
    }

    const operationState = await getSystemOperationState(tx);
    const historicalImport = operationState.mode === "historical_import";

    for (let index = 0; index < items.length; index += 1) {
      const item: any = items[index];
      const priced = pricedItems[index];

      // Trong chế độ hồi nhập lịch sử, NCC giao/trả chỉ dựng lịch sử chi phí + nợ vỏ.
      // Không giả lập tồn vật lý vì thiếu lịch sử Đổi/Mượn/Trả nội bộ; tồn thật sẽ được chốt bằng kiểm kê Admin.
      if (item.status !== "confirmed" && item.returnable_container) {
        const referenceType = item.location_code === "MINE" ? "supplier_delivery_mine" : "supplier_delivery";
        if (historicalImport) {
          await recordHistoricalSupplierMovement({
            tx, productId: item.product_id, delta: priced.actualQty, referenceType,
            referenceId: deliveryId, actorUserId: profile.id, occurredDate: deliveryDate,
            note: `Hồi nhập NCC giao ${item.location_code === "MINE" ? "Mỏ" : "Nhà máy"}; không cập nhật tồn vật lý`,
          });
        } else if (item.location_code === "PLANT") {
          const wh = await getStockPointByCode("WH-PHC", tx);
          const bucket = item.warehouse_split_full_empty ? "full" : "available";
          await applyStockDelta({
            tx, stockPointId: wh.id, productId: item.product_id, bucket, delta: priced.actualQty,
            referenceType, referenceId: deliveryId, actorUserId: profile.id, occurredDate: deliveryDate,
          });
          if (bucket === "full") lowStockProductIds.add(item.product_id);
        } else if (item.location_code === "MINE") {
          const mineRows = await tx`SELECT sp.id FROM stock_points sp JOIN work_groups g ON g.id=sp.group_id WHERE g.code='COI' LIMIT 1`;
          if (!mineRows[0]) throw new Error("Chưa cấu hình điểm tồn Nhóm Cối/Mỏ");
          await applyStockDelta({
            tx, stockPointId: mineRows[0].id, productId: item.product_id, bucket: "managed", delta: priced.actualQty,
            referenceType, referenceId: deliveryId, actorUserId: profile.id, occurredDate: deliveryDate,
          });
        }
      }

      await tx`
        UPDATE supplier_delivery_items
        SET status='confirmed',
            price_rule_id=${priced.priceRuleId}::uuid,
            unit_price=${priced.unitPrice},
            line_amount=${priced.amount}
        WHERE id=${item.id}::uuid
      `;

      if (["LOX-XL45", "LIN-XL45"].includes(item.product_code) && priced.actualQty > 0) {
        await tx`
          INSERT INTO xl45_lots(delivery_item_id,product_id,location_id,delivered_date,qty_received,qty_outstanding)
          VALUES (${item.id}::uuid,${item.product_id}::uuid,${item.destination_location_id}::uuid,${deliveryDate}::date,${priced.actualQty},${priced.actualQty})
          ON CONFLICT(delivery_item_id) DO NOTHING
        `;
      }
    }

    await tx`
      UPDATE supplier_deliveries
      SET status='completed',phc_confirmed_by=${profile.id}::uuid,phc_confirmed_at=now()
      WHERE id=${deliveryId}::uuid
    `;
    if (delivery.trip_id) await tx`UPDATE transport_trips SET status='completed' WHERE id=${delivery.trip_id}::uuid`;
    await audit({
      tx,
      actorUserId: profile.id,
      action: "phc_confirm",
      entityType: "supplier_delivery",
      entityId: deliveryId,
      after: {
        items: pricedItems,
        missingPriceItems: pricedItems.filter((x) => x.priceMissing).map((x) => x.productId),
      },
    });
  });

  for (const productId of lowStockProductIds) await checkLowStock(productId);
}

export async function listDeliveries(profile: Profile) {
  const supplierFilter = profile.role === "supplier" && profile.organization_id ? profile.organization_id : null;
  const query = supplierFilter ? sql`
    SELECT d.id,d.delivery_code,d.trip_id,d.delivery_date,d.created_at,d.status,d.note,d.phc_confirmed_at,
      phc.full_name AS phc_confirmed_by_name,
      t.trip_code,t.trip_kind,t.transport_amount::float8 AS transport_amount,o.name AS supplier_name,
      COALESCE(json_agg(json_build_object(
        'id',di.id,'product_name',p.name,'unit',p.unit,'location_code',l.code,'location_name',l.name,
        'declared_qty',di.declared_qty,'confirmed_qty',di.confirmed_qty,'status',di.status,'feedback',di.feedback,
        'confirmed_by_name',uc.full_name,'confirmed_at',di.confirmed_at,
        'unit_price',di.unit_price,'line_amount',di.line_amount
      ) ORDER BY l.code,p.display_order) FILTER (WHERE di.id IS NOT NULL),'[]'::json) AS items
    FROM supplier_deliveries d
    JOIN organizations o ON o.id=d.supplier_org_id
    LEFT JOIN users phc ON phc.id=d.phc_confirmed_by
    LEFT JOIN transport_trips t ON t.id=d.trip_id
    LEFT JOIN supplier_delivery_items di ON di.delivery_id=d.id
    LEFT JOIN products p ON p.id=di.product_id
    LEFT JOIN locations l ON l.id=di.destination_location_id
    LEFT JOIN users uc ON uc.id=di.confirmed_by
    WHERE d.supplier_org_id=${supplierFilter}::uuid
    GROUP BY d.id,t.id,o.name,phc.full_name
    ORDER BY CASE d.status WHEN 'feedback' THEN 0 WHEN 'pending' THEN 1 WHEN 'phc_pending' THEN 2 WHEN 'completed' THEN 4 WHEN 'cancelled' THEN 5 ELSE 3 END, d.delivery_date DESC,d.created_at DESC LIMIT 100
  ` : sql`
    SELECT d.id,d.delivery_code,d.trip_id,d.delivery_date,d.created_at,d.status,d.note,d.phc_confirmed_at,
      phc.full_name AS phc_confirmed_by_name,
      t.trip_code,t.trip_kind,t.transport_amount::float8 AS transport_amount,o.name AS supplier_name,
      COALESCE(json_agg(json_build_object(
        'id',di.id,'product_name',p.name,'unit',p.unit,'location_code',l.code,'location_name',l.name,
        'declared_qty',di.declared_qty,'confirmed_qty',di.confirmed_qty,'status',di.status,'feedback',di.feedback,
        'confirmed_by_name',uc.full_name,'confirmed_at',di.confirmed_at,
        'unit_price',di.unit_price,'line_amount',di.line_amount
      ) ORDER BY l.code,p.display_order) FILTER (WHERE di.id IS NOT NULL),'[]'::json) AS items
    FROM supplier_deliveries d
    JOIN organizations o ON o.id=d.supplier_org_id
    LEFT JOIN users phc ON phc.id=d.phc_confirmed_by
    LEFT JOIN transport_trips t ON t.id=d.trip_id
    LEFT JOIN supplier_delivery_items di ON di.delivery_id=d.id
    LEFT JOIN products p ON p.id=di.product_id
    LEFT JOIN locations l ON l.id=di.destination_location_id
    LEFT JOIN users uc ON uc.id=di.confirmed_by
    GROUP BY d.id,t.id,o.name,phc.full_name
    ORDER BY CASE d.status WHEN 'feedback' THEN 0 WHEN 'pending' THEN 1 WHEN 'phc_pending' THEN 2 WHEN 'completed' THEN 4 WHEN 'cancelled' THEN 5 ELSE 3 END, d.delivery_date DESC,d.created_at DESC LIMIT 100
  `;
  return query;
}

export type AdminDeliveryCorrectionLine = {
  itemId?: string | null;
  productId: string;
  destinationLocationId: string;
  declaredQty: number;
  confirmedQty: number;
  delete?: boolean;
};

async function applyAdminDeliveryEffect(params: {
  tx: any;
  product: any;
  locationCode: "PLANT" | "MINE";
  quantityDelta: number;
  deliveryId: string;
  actorUserId: string;
  occurredDate: string;
  historicalImport: boolean;
}) {
  const { tx, product, locationCode, quantityDelta, deliveryId, actorUserId, occurredDate, historicalImport } = params;
  if (!product.returnable_container || Math.abs(quantityDelta) < 0.000001) return;
  if (historicalImport) {
    await recordHistoricalSupplierMovement({
      tx,
      productId: product.id,
      delta: quantityDelta,
      referenceType: "supplier_delivery_revision",
      referenceId: deliveryId,
      actorUserId,
      occurredDate,
      note: "Admin điều chỉnh Phiếu giao NCC; bút toán chênh lệch có Audit",
    });
    return;
  }
  if (locationCode === "PLANT") {
    const wh = await getStockPointByCode("WH-PHC", tx);
    const bucket = product.warehouse_split_full_empty ? "full" : "available";
    await applyStockDelta({
      tx,
      stockPointId: wh.id,
      productId: product.id,
      bucket,
      delta: quantityDelta,
      referenceType: "supplier_delivery_revision",
      referenceId: deliveryId,
      actorUserId,
      occurredDate,
      note: "Admin điều chỉnh Phiếu giao NCC",
    });
    return;
  }
  const [mine] = await tx`
    SELECT sp.id FROM stock_points sp
    JOIN work_groups g ON g.id=sp.group_id
    WHERE g.code='COI' AND sp.active=true LIMIT 1
  `;
  if (!mine) throw new Error("Chưa cấu hình điểm tồn Nhóm Cối/Mỏ");
  await applyStockDelta({
    tx,
    stockPointId: mine.id,
    productId: product.id,
    bucket: "managed",
    delta: quantityDelta,
    referenceType: "supplier_delivery_revision",
    referenceId: deliveryId,
    actorUserId,
    occurredDate,
    note: "Admin điều chỉnh Phiếu giao NCC",
  });
}

async function repriceXL45AllocationsForLot(tx: any, lotId: string, deliveredDate: string) {
  const allocations = await tx`
    SELECT id,return_date,quantity::float8 AS quantity
    FROM xl45_return_allocations WHERE xl45_lot_id=${lotId}::uuid FOR UPDATE
  `;
  for (const allocation of allocations as any[]) {
    const [cost] = await tx`
      SELECT COUNT(*)::int AS charge_days,COALESCE(SUM((
        SELECT pr.unit_price FROM price_rules pr
        WHERE pr.price_type='xl45_rental_day' AND pr.effective_from<=d::date
          AND (pr.effective_to IS NULL OR pr.effective_to>=d::date)
        ORDER BY CASE pr.rule_kind WHEN 'adjustment' THEN 0 WHEN 'base' THEN 1 ELSE 2 END,pr.effective_from DESC,pr.created_at DESC LIMIT 1
      )),0)::float8 AS amount_per_bon
      FROM generate_series(${deliveredDate}::date + interval '15 day',${toDateKey(allocation.return_date)}::date - interval '1 day',interval '1 day') AS gs(d)
    `;
    await tx`UPDATE xl45_return_allocations SET charge_days=${Number(cost?.charge_days || 0)},rental_amount=${Number(cost?.amount_per_bon || 0)*Number(allocation.quantity || 0)} WHERE id=${allocation.id}::uuid`;
  }
}

/**
 * Admin sửa trực tiếp dữ liệu nghiệp vụ Phiếu giao NCC nhưng không sửa/xóa Audit.
 * Nếu Phiếu đã hoàn tất, hệ thống đảo ảnh hưởng cũ và áp dụng ảnh hưởng mới bằng bút toán chênh lệch.
 */
export async function adminCorrectSupplierDelivery(profile: Profile, deliveryId: string, input: {
  deliveryDate: string;
  note?: string | null;
  reason: string;
  lines: AdminDeliveryCorrectionLine[];
}) {
  if (profile.role !== "admin") throw new Error("Chỉ Admin được chỉnh dữ liệu nghiệp vụ đã ghi nhận");
  const reason = String(input.reason || "").trim();
  if (!reason) throw new Error("Bắt buộc nhập lý do chỉnh sửa để lưu Audit");
  const lines = input.lines.filter((line) => !line.delete).map((line) => ({
    ...line,
    productId: String(line.productId || ""),
    destinationLocationId: String(line.destinationLocationId || ""),
    declaredQty: Number(line.declaredQty || 0),
    confirmedQty: Number(line.confirmedQty || 0),
  }));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deliveryDate)) throw new Error("Ngày giao không hợp lệ");
  if (!lines.length) throw new Error("Phiếu giao phải còn ít nhất một dòng hàng");
  if (lines.some((line) => !line.productId || !line.destinationLocationId || line.declaredQty <= 0 || line.confirmedQty < 0)) {
    throw new Error("Có dòng hàng thiếu thông tin hoặc số lượng không hợp lệ");
  }
  const uniqueKeys = lines.map((line) => `${line.destinationLocationId}:${line.productId}`);
  if (new Set(uniqueKeys).size !== uniqueKeys.length) throw new Error("Mỗi loại khí chỉ được có một dòng tại cùng địa điểm");

  await sql.begin(async (tx) => {
    const [delivery] = await tx`
      SELECT d.*,t.id AS transport_trip_id,t.trip_date,t.visits_plant,t.visits_mine,t.trip_kind,t.transport_unit_price,t.transport_amount
      FROM supplier_deliveries d
      LEFT JOIN transport_trips t ON t.id=d.trip_id
      WHERE d.id=${deliveryId}::uuid
      FOR UPDATE OF d
    `;
    if (!delivery) throw new Error("Không tìm thấy Phiếu giao NCC");
    const oldItems = await tx`
      SELECT di.id,di.product_id,di.destination_location_id,di.declared_qty::float8 AS declared_qty,
        COALESCE(di.confirmed_qty,0)::float8 AS confirmed_qty,di.status,di.unit_price::float8 AS unit_price,
        p.code AS product_code,p.name AS product_name,p.returnable_container,p.warehouse_split_full_empty,
        l.code AS location_code,l.name AS location_name,
        xl.id AS xl45_lot_id,xl.qty_received::float8 AS xl45_qty_received,xl.qty_outstanding::float8 AS xl45_qty_outstanding,
        EXISTS(SELECT 1 FROM xl45_return_allocations xa WHERE xa.xl45_lot_id=xl.id) AS xl45_has_return
      FROM supplier_delivery_items di
      JOIN products p ON p.id=di.product_id
      JOIN locations l ON l.id=di.destination_location_id
      LEFT JOIN xl45_lots xl ON xl.delivery_item_id=di.id
      WHERE di.delivery_id=${deliveryId}::uuid
      ORDER BY l.code,p.display_order,p.name
      FOR UPDATE OF di
    `;
    const before = {
      delivery: {
        delivery_date: toDateKey(delivery.delivery_date),
        note: delivery.note,
        status: delivery.status,
        trip_id: delivery.trip_id,
        trip_date: delivery.trip_date ? toDateKey(delivery.trip_date) : null,
        visits_plant: delivery.visits_plant,
        visits_mine: delivery.visits_mine,
        trip_kind: delivery.trip_kind,
        transport_amount: Number(delivery.transport_amount || 0),
      },
      items: oldItems,
    };

    const productIds = Array.from(new Set([
      ...lines.map((line) => line.productId),
      ...(oldItems as any[]).map((item:any) => String(item.product_id)),
    ]));
    const locationIds = Array.from(new Set([
      ...lines.map((line) => line.destinationLocationId),
      ...(oldItems as any[]).map((item:any) => String(item.destination_location_id)),
    ]));
    const products = await tx`
      SELECT id,code,name,returnable_container,warehouse_split_full_empty,active
      FROM products WHERE id IN ${tx(productIds)}
    `;
    const locations = await tx`SELECT id,code,name,active FROM locations WHERE id IN ${tx(locationIds)}`;
    const productById = new Map((products as any[]).map((row:any) => [String(row.id), row]));
    const locationById = new Map((locations as any[]).map((row:any) => [String(row.id), row]));
    for (const line of lines) {
      const product = productById.get(line.productId) as any;
      const location = locationById.get(line.destinationLocationId) as any;
      if (!product?.active) throw new Error("Có loại khí không còn hoạt động");
      if (!location?.active || !["PLANT","MINE"].includes(location.code)) throw new Error("Địa điểm giao chỉ được là Nhà máy hoặc Mỏ");
    }

    const operationState = await getSystemOperationState(tx);
    const historicalImport = operationState.mode === "historical_import";
    const effectsApplied = delivery.status === "completed";
    const oldDate = toDateKey(delivery.delivery_date);

    if (effectsApplied) {
      for (const old of oldItems as any[]) {
        const product = productById.get(String(old.product_id)) as any;
        await applyAdminDeliveryEffect({
          tx,
          product,
          locationCode: old.location_code,
          quantityDelta: -Number(old.confirmed_qty || 0),
          deliveryId,
          actorUserId: profile.id,
          occurredDate: oldDate,
          historicalImport,
        });
      }
      for (const line of lines) {
        const product = productById.get(line.productId) as any;
        const location = locationById.get(line.destinationLocationId) as any;
        await applyAdminDeliveryEffect({
          tx,
          product,
          locationCode: location.code,
          quantityDelta: Number(line.confirmedQty || 0),
          deliveryId,
          actorUserId: profile.id,
          occurredDate: input.deliveryDate,
          historicalImport,
        });
      }
    }

    const lineById = new Map(lines.filter((line) => line.itemId).map((line) => [String(line.itemId), line]));
    for (const old of oldItems as any[]) {
      const next = lineById.get(String(old.id));
      if (!next) {
        if (old.xl45_has_return) throw new Error(`${old.product_name}: đã có lịch sử trả XL-45, không thể xóa dòng. Hãy điều chỉnh số lượng thay vì xóa.`);
        await tx`DELETE FROM supplier_delivery_items WHERE id=${old.id}::uuid`;
        continue;
      }
      if (old.xl45_has_return && (String(old.product_id) !== next.productId || String(old.destination_location_id) !== next.destinationLocationId)) {
        throw new Error(`${old.product_name}: đã có lịch sử trả XL-45, không thể đổi loại hoặc địa điểm.`);
      }
      await tx`
        UPDATE supplier_delivery_items
        SET product_id=${next.productId}::uuid,
            destination_location_id=${next.destinationLocationId}::uuid,
            declared_qty=${next.declaredQty},
            confirmed_qty=${next.confirmedQty}
        WHERE id=${old.id}::uuid
      `;
      if (old.xl45_lot_id) {
        const returned = Number(old.xl45_qty_received || 0) - Number(old.xl45_qty_outstanding || 0);
        if (next.confirmedQty + 0.000001 < returned) throw new Error(`${old.product_name}: số mới nhỏ hơn số bồn XL-45 đã trả.`);
        await tx`
          UPDATE xl45_lots SET product_id=${next.productId}::uuid,location_id=${next.destinationLocationId}::uuid,
            delivered_date=${input.deliveryDate}::date,qty_received=${next.confirmedQty},qty_outstanding=${Math.max(0,next.confirmedQty-returned)}
          WHERE id=${old.xl45_lot_id}::uuid
        `;
        if (old.xl45_has_return) await repriceXL45AllocationsForLot(tx,String(old.xl45_lot_id),input.deliveryDate);
      }
    }
    for (const line of lines.filter((line) => !line.itemId)) {
      const [created] = await tx`
        INSERT INTO supplier_delivery_items(delivery_id,product_id,destination_location_id,declared_qty,confirmed_qty,status,confirmed_by,confirmed_at)
        VALUES (${deliveryId}::uuid,${line.productId}::uuid,${line.destinationLocationId}::uuid,${line.declaredQty},${line.confirmedQty},
          ${effectsApplied ? "confirmed" : "pending"},${effectsApplied ? profile.id : null}::uuid,${effectsApplied ? new Date() : null}::timestamptz)
        RETURNING id
      `;
      const product = productById.get(line.productId) as any;
      if (effectsApplied && ["LOX-XL45","LIN-XL45"].includes(String(product.code)) && line.confirmedQty > 0) {
        await tx`
          INSERT INTO xl45_lots(delivery_item_id,product_id,location_id,delivered_date,qty_received,qty_outstanding)
          VALUES (${created.id}::uuid,${line.productId}::uuid,${line.destinationLocationId}::uuid,${input.deliveryDate}::date,${line.confirmedQty},${line.confirmedQty})
        `;
      }
    }

    await tx`UPDATE supplier_deliveries SET delivery_date=${input.deliveryDate}::date,note=${input.note || null} WHERE id=${deliveryId}::uuid`;

    const currentItems = await tx`
      SELECT di.id,di.product_id,di.destination_location_id,di.declared_qty::float8 AS declared_qty,
        COALESCE(di.confirmed_qty,0)::float8 AS confirmed_qty,di.status,p.code AS product_code,p.name AS product_name,
        l.code AS location_code,l.name AS location_name
      FROM supplier_delivery_items di
      JOIN products p ON p.id=di.product_id JOIN locations l ON l.id=di.destination_location_id
      WHERE di.delivery_id=${deliveryId}::uuid ORDER BY l.code,p.display_order,p.name
    `;
    const visitsPlant = (currentItems as any[]).some((item:any) => item.location_code === "PLANT");
    const visitsMine = (currentItems as any[]).some((item:any) => item.location_code === "MINE");
    const co2Special = (currentItems as any[]).some((item:any) => item.product_code === "LIQ-CO2");
    if (delivery.trip_id) {
      const returnLocations = await tx`
        SELECT DISTINCT l.code FROM supplier_returns r JOIN locations l ON l.id=r.source_location_id
        WHERE r.trip_id=${delivery.trip_id}::uuid AND r.status<>'cancelled'
      `;
      if ((returnLocations as any[]).some((row:any)=>row.code==='PLANT') && !visitsPlant) throw new Error("Chuyến đã có Phiếu trả vỏ Nhà máy; không thể xóa toàn bộ điểm giao Nhà máy khỏi chuyến");
      if ((returnLocations as any[]).some((row:any)=>row.code==='MINE') && !visitsMine) throw new Error("Chuyến đã có Phiếu trả vỏ Mỏ; không thể xóa toàn bộ điểm giao Mỏ khỏi chuyến");
    }
    const tripKind = co2Special ? "co2_liquid" : visitsMine ? "mine" : "plant";
    const tripPrice = await resolvePriceRule(tripPriceType(visitsMine,co2Special),input.deliveryDate,null,tx,delivery.supplier_org_id);
    if (!tripPrice) throw new Error("Không có đơn giá vận chuyển có hiệu lực cho ngày mới");
    if (delivery.trip_id) {
      await tx`
        UPDATE transport_trips SET trip_date=${input.deliveryDate}::date,visits_plant=${visitsPlant},visits_mine=${visitsMine},
          co2_liquid_special=${co2Special},trip_kind=${tripKind},price_rule_id=${tripPrice.id}::uuid,
          transport_unit_price=${Number(tripPrice.unit_price)},transport_amount=${Number(tripPrice.unit_price)},note=${input.note || null}
        WHERE id=${delivery.trip_id}::uuid
      `;
    }

    if (effectsApplied) {
      for (const item of currentItems as any[]) {
        const price = await resolvePriceRule("product",input.deliveryDate,item.product_id,tx,delivery.supplier_org_id);
        const unitPrice = price ? Number(price.unit_price) : null;
        const amount = unitPrice == null ? null : unitPrice * Number(item.confirmed_qty || 0);
        await tx`
          UPDATE supplier_delivery_items SET status='confirmed',price_rule_id=${price?.id || null}::uuid,
            unit_price=${unitPrice},line_amount=${amount}
          WHERE id=${item.id}::uuid
        `;
      }
    }

    const [adjustment] = await tx`
      INSERT INTO adjustment_notes(adjustment_code,original_reference_type,original_reference_id,reason,created_by)
      VALUES (('ADM-'||to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYYMMDDHH24MISS')||'-'||upper(substr(md5(random()::text),1,5))),
        'supplier_delivery',${deliveryId}::uuid,${reason},${profile.id}::uuid)
      RETURNING id,adjustment_code
    `;
    const after = {
      delivery: { delivery_date: input.deliveryDate, note: input.note || null, status: delivery.status, visits_plant: visitsPlant, visits_mine: visitsMine, trip_kind: tripKind, transport_amount: Number(tripPrice.unit_price) },
      items: currentItems,
      adjustment_code: adjustment.adjustment_code,
    };
    await audit({
      tx,
      actorUserId: profile.id,
      action: "admin_correct",
      entityType: "supplier_delivery",
      entityId: deliveryId,
      before,
      after,
      note: reason,
    });
  });
}
