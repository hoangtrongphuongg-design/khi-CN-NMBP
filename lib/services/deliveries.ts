import { sql } from "@/lib/db";
import type { Profile } from "@/types/app";
import {
  canConfirmMineDelivery,
  canConfirmPlantDelivery,
  canFeedbackDelivery,
  canFinalizePhcDelivery,
} from "@/lib/auth/permissions";
import { applyStockDelta, audit, getStockPointByCode } from "@/lib/stock";
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
    const price = await resolvePriceRule(tripPriceType(visitsMine, co2Special), input.deliveryDate, null, tx);
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
      SELECT di.id,di.delivery_id,di.status,di.declared_qty,d.supplier_org_id
      FROM supplier_delivery_items di
      JOIN supplier_deliveries d ON d.id=di.delivery_id
      WHERE di.id=${itemId}::uuid FOR UPDATE
    `;
    if (!item || item.supplier_org_id !== profile.organization_id) throw new Error("Dòng giao không thuộc NCC này");
    if (item.status !== "feedback") throw new Error("Chỉ cập nhật dòng đang có phản hồi");
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

// Bước 1: XSC xác nhận số lượng thực nhận theo địa điểm.
// Nhà máy: Workshop. Mỏ: XSC Mỏ.
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
      const wasXscConfirmed = item.status === "xsc_confirmed";
      await tx`
        UPDATE supplier_delivery_items
        SET status='feedback',confirmed_qty=${actualQty},feedback=${feedback || "Số liệu chưa thống nhất"},
            confirmed_by=${wasXscConfirmed ? item.confirmed_by : profile.id}::uuid,
            confirmed_at=${wasXscConfirmed ? item.confirmed_at : new Date()}::timestamptz
        WHERE id=${itemId}::uuid
      `;
      await tx`UPDATE supplier_deliveries SET status='feedback',phc_confirmed_by=NULL,phc_confirmed_at=NULL WHERE id=${item.delivery_id}::uuid`;
      await tx`UPDATE transport_trips SET status='open' WHERE id=(SELECT trip_id FROM supplier_deliveries WHERE id=${item.delivery_id}::uuid)`;
      await audit({ tx, actorUserId: profile.id, action: "feedback", entityType: "supplier_delivery_item", entityId: itemId, after: { actualQty, feedback } });
      return;
    }

    if (item.status !== "pending") throw new Error("Dòng giao chưa ở trạng thái chờ XSC xác nhận");
    if (item.location_code === "PLANT" && !canConfirmPlantDelivery(profile)) throw new Error("Chỉ Workshop được xác nhận giao tại Nhà máy");
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

// Bước 2: PHC xác nhận toàn Phiếu sau khi XSC đã xác nhận đủ các dòng.
// Tại đây mới chốt đơn giá, cập nhật tồn và hoàn tất Phiếu.
export async function finalizeDeliveryByPhc(profile: Profile, deliveryId: string) {
  if (!canFinalizePhcDelivery(profile)) throw new Error("Chỉ PHC (Trưởng kho/Thủ kho) được xác nhận bước cuối");
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
    if (feedbackCount > 0) throw new Error(`Còn ${feedbackCount} dòng đang có phản hồi, chưa thể PHC hoàn tất`);
    if (pendingCount > 0) throw new Error(`Còn ${pendingCount} dòng chưa được XSC xác nhận`);
    if (invalidCount > 0) throw new Error("Trạng thái dòng giao chưa hợp lệ để PHC hoàn tất");

    // Không phụ thuộc trạng thái cha bị trễ. Nếu tất cả dòng đã XSC xác nhận thì PHC được hoàn tất.
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
      const price = await resolvePriceRule("product", deliveryDate, item.product_id, tx);
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

    for (let index = 0; index < items.length; index += 1) {
      const item: any = items[index];
      const priced = pricedItems[index];

      // Dòng đã confirmed chỉ có thể phát sinh từ một lần hoàn tất trước đó; không cộng tồn lần hai.
      if (item.status !== "confirmed") {
        if (item.location_code === "PLANT" && item.returnable_container) {
          const wh = await getStockPointByCode("WH-PHC", tx);
          const bucket = item.warehouse_split_full_empty ? "full" : "available";
          await applyStockDelta({
            tx,
            stockPointId: wh.id,
            productId: item.product_id,
            bucket,
            delta: priced.actualQty,
            referenceType: "supplier_delivery",
            referenceId: deliveryId,
            actorUserId: profile.id,
            occurredDate: deliveryDate,
          });
          if (bucket === "full") lowStockProductIds.add(item.product_id);
        } else if (item.location_code === "MINE" && item.returnable_container) {
          const mineRows = await tx`SELECT sp.id FROM stock_points sp JOIN work_groups g ON g.id=sp.group_id WHERE g.code='COI' LIMIT 1`;
          if (!mineRows[0]) throw new Error("Chưa cấu hình điểm tồn Nhóm Cối/Mỏ");
          await applyStockDelta({
            tx,
            stockPointId: mineRows[0].id,
            productId: item.product_id,
            bucket: "managed",
            delta: priced.actualQty,
            referenceType: "supplier_delivery_mine",
            referenceId: deliveryId,
            actorUserId: profile.id,
            occurredDate: deliveryDate,
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
    SELECT d.id,d.delivery_code,d.trip_id,d.delivery_date,d.status,d.note,d.phc_confirmed_at,
      phc.full_name AS phc_confirmed_by_name,
      (SELECT cr.status FROM data_correction_requests cr WHERE cr.target_type='supplier_delivery' AND cr.target_id=d.id ORDER BY cr.requested_at DESC LIMIT 1) AS correction_status,
      (SELECT cr.request_code FROM data_correction_requests cr WHERE cr.target_type='supplier_delivery' AND cr.target_id=d.id ORDER BY cr.requested_at DESC LIMIT 1) AS correction_request_code,
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
    ORDER BY d.delivery_date DESC,d.created_at DESC LIMIT 100
  ` : sql`
    SELECT d.id,d.delivery_code,d.trip_id,d.delivery_date,d.status,d.note,d.phc_confirmed_at,
      phc.full_name AS phc_confirmed_by_name,
      (SELECT cr.status FROM data_correction_requests cr WHERE cr.target_type='supplier_delivery' AND cr.target_id=d.id ORDER BY cr.requested_at DESC LIMIT 1) AS correction_status,
      (SELECT cr.request_code FROM data_correction_requests cr WHERE cr.target_type='supplier_delivery' AND cr.target_id=d.id ORDER BY cr.requested_at DESC LIMIT 1) AS correction_request_code,
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
    ORDER BY d.delivery_date DESC,d.created_at DESC LIMIT 100
  `;
  return query;
}
