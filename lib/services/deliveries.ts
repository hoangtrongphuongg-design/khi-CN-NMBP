import { sql } from "@/lib/db";
import type { Profile } from "@/types/app";
import { canConfirmMineDelivery, canConfirmPlantDelivery, canFeedbackDelivery } from "@/lib/auth/permissions";
import { applyStockDelta, audit, getStockPointByCode } from "@/lib/stock";
import { resolvePriceRule, tripPriceType } from "@/lib/pricing";
import { checkLowStock } from "@/lib/notifications/low-stock";

export type DeliveryLineInput = { productId: string; destinationLocationId: string; quantity: number };

function stamp(prefix: string, id: string, date: string) {
  return `${prefix}-${date.replaceAll("-", "")}-${id.slice(0, 6).toUpperCase()}`;
}

export async function createSupplierDelivery(profile: Profile, input: { deliveryDate: string; lines: DeliveryLineInput[]; note?: string; visitsMine?: boolean; co2LiquidSpecial?: boolean }) {
  if (profile.role !== 'supplier') throw new Error("Chỉ NCC được tạo Phiếu giao hàng");
  if (!profile.organization_id && profile.role === 'supplier') throw new Error("Tài khoản NCC chưa gắn nhà cung cấp");
  const supplierId = profile.organization_id;
  if (!supplierId) throw new Error("Chưa có NCC trong danh mục");
  const lines = input.lines.filter((x) => x.productId && x.destinationLocationId && Number(x.quantity) > 0);
  if (!lines.length) throw new Error("Phiếu giao phải có ít nhất một dòng hàng");

  return sql.begin(async (tx) => {
    const destinationRows = await tx`SELECT id,code FROM locations WHERE id IN ${tx(lines.map((x) => x.destinationLocationId))}`;
    const mineLocation = destinationRows.some((x: any) => x.code === 'MINE');
    const plantLocation = destinationRows.some((x: any) => x.code === 'PLANT');
    const productRows = await tx`SELECT id,code FROM products WHERE id IN ${tx(lines.map((x) => x.productId))}`;
    const co2Special = Boolean(input.co2LiquidSpecial || productRows.some((x: any) => x.code === 'LIQ-CO2'));
    const visitsMine = Boolean(input.visitsMine || mineLocation);
    const kind = co2Special ? 'co2_liquid' : visitsMine ? 'mine' : 'plant';
    const price = await resolvePriceRule(tripPriceType(visitsMine, co2Special), input.deliveryDate, null, tx);
    if (!price) throw new Error("Chưa cấu hình đơn giá vận chuyển có hiệu lực cho ngày giao");

    const [trip] = await tx`
      INSERT INTO transport_trips(trip_code,trip_date,supplier_org_id,visits_plant,visits_mine,co2_liquid_special,trip_kind,price_rule_id,transport_unit_price,transport_amount,created_by,note)
      VALUES (('TMP-'||gen_random_uuid()::text),${input.deliveryDate}::date,${supplierId}::uuid,${plantLocation},${visitsMine},${co2Special},${kind},${price?.id ?? null}::uuid,${Number(price?.unit_price ?? 0)},${Number(price?.unit_price ?? 0)},${profile.id}::uuid,${input.note || null})
      RETURNING id
    `;
    const tripCode = stamp('CHUYEN', trip.id, input.deliveryDate);
    await tx`UPDATE transport_trips SET trip_code=${tripCode} WHERE id=${trip.id}`;

    const [delivery] = await tx`
      INSERT INTO supplier_deliveries(delivery_code,trip_id,supplier_org_id,delivery_date,note,created_by)
      VALUES (('TMP-'||gen_random_uuid()::text),${trip.id}::uuid,${supplierId}::uuid,${input.deliveryDate}::date,${input.note || null},${profile.id}::uuid)
      RETURNING id
    `;
    const code = stamp('GH', delivery.id, input.deliveryDate);
    await tx`UPDATE supplier_deliveries SET delivery_code=${code} WHERE id=${delivery.id}`;
    for (const line of lines) {
      await tx`
        INSERT INTO supplier_delivery_items(delivery_id,product_id,destination_location_id,declared_qty)
        VALUES (${delivery.id}::uuid,${line.productId}::uuid,${line.destinationLocationId}::uuid,${line.quantity})
      `;
    }
    await audit({ tx, actorUserId: profile.id, action: 'create', entityType: 'supplier_delivery', entityId: delivery.id, after: { code, tripCode, lines, visitsMine, co2Special } });
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
      SET declared_qty=${declaredQty},confirmed_qty=NULL,status='pending',feedback=NULL,confirmed_by=NULL,confirmed_at=NULL
      WHERE id=${itemId}::uuid
    `;
    await tx`UPDATE supplier_deliveries SET status='pending' WHERE id=${item.delivery_id}::uuid`;
    await audit({ tx, actorUserId: profile.id, action: "resubmit", entityType: "supplier_delivery_item", entityId: itemId, before, after: { declared_qty: declaredQty, status: "pending" } });
  });
}

export async function confirmDeliveryItem(profile: Profile, itemId: string, actualQty: number, action: 'confirm'|'feedback', feedback?: string) {
  if (!(actualQty >= 0)) throw new Error("Số lượng không hợp lệ");
  let productId = '';
  let plantStockChanged = false;
  await sql.begin(async (tx) => {
    const rows = await tx`
      SELECT di.*,d.delivery_date,d.status AS delivery_status,l.code AS location_code,p.code AS product_code,p.name AS product_name,
        p.returnable_container,p.warehouse_split_full_empty,p.internal_group_tracking
      FROM supplier_delivery_items di
      JOIN supplier_deliveries d ON d.id=di.delivery_id
      JOIN locations l ON l.id=di.destination_location_id
      JOIN products p ON p.id=di.product_id
      WHERE di.id=${itemId}::uuid FOR UPDATE
    `;
    const item = rows[0];
    if (!item || item.status === 'confirmed') throw new Error("Dòng giao không còn chờ xác nhận");
    if (action === 'feedback' && !canFeedbackDelivery(profile)) throw new Error("Không có quyền phản hồi Phiếu giao");
    if (action === 'confirm' && item.location_code === 'PLANT' && !canConfirmPlantDelivery(profile)) throw new Error("Không có quyền xác nhận giao tại Nhà máy");
    if (action === 'confirm' && item.location_code === 'MINE' && !canConfirmMineDelivery(profile)) throw new Error("Chỉ XSC Mỏ được xác nhận giao tại Mỏ");

    if (action === 'feedback') {
      await tx`UPDATE supplier_delivery_items SET status='feedback',confirmed_qty=${actualQty},feedback=${feedback || 'Số liệu chưa thống nhất'},confirmed_by=${profile.id}::uuid,confirmed_at=now() WHERE id=${itemId}::uuid`;
      await tx`UPDATE supplier_deliveries SET status='feedback' WHERE id=${item.delivery_id}::uuid`;
      await tx`UPDATE transport_trips SET status='completed' WHERE id=(SELECT trip_id FROM supplier_deliveries WHERE id=${item.delivery_id}::uuid)`;
      await audit({ tx, actorUserId: profile.id, action: 'feedback', entityType: 'supplier_delivery_item', entityId: itemId, after: { actualQty, feedback } });
      return;
    }

    productId = item.product_id;
    const price = await resolvePriceRule('product', String(item.delivery_date).slice(0,10), item.product_id, tx);
    if (!price) throw new Error(`Chưa cấu hình đơn giá có hiệu lực cho ${item.product_name}`);
    const unitPrice = Number(price?.unit_price ?? 0);
    const amount = unitPrice * actualQty;

    if (item.location_code === 'PLANT' && item.returnable_container) {
      const wh = await getStockPointByCode('WH-PHC', tx);
      const bucket = item.warehouse_split_full_empty ? 'full' : 'available';
      await applyStockDelta({ tx, stockPointId: wh.id, productId: item.product_id, bucket, delta: actualQty, referenceType: 'supplier_delivery', referenceId: item.delivery_id, actorUserId: profile.id, occurredDate: String(item.delivery_date).slice(0,10) });
      plantStockChanged = bucket === 'full';
    } else if (item.location_code === 'MINE' && item.returnable_container) {
      const mineRows = await tx`SELECT sp.id FROM stock_points sp JOIN work_groups g ON g.id=sp.group_id WHERE g.code='COI' LIMIT 1`;
      if (!mineRows[0]) throw new Error("Chưa cấu hình điểm tồn Nhóm Cối/Mỏ");
      await applyStockDelta({ tx, stockPointId: mineRows[0].id, productId: item.product_id, bucket: 'managed', delta: actualQty, referenceType: 'supplier_delivery_mine', referenceId: item.delivery_id, actorUserId: profile.id, occurredDate: String(item.delivery_date).slice(0,10) });
    }

    await tx`
      UPDATE supplier_delivery_items SET status='confirmed',confirmed_qty=${actualQty},feedback=NULL,
        price_rule_id=${price?.id ?? null}::uuid,unit_price=${unitPrice},line_amount=${amount},confirmed_by=${profile.id}::uuid,confirmed_at=now()
      WHERE id=${itemId}::uuid
    `;
    if (["LOX-XL45","LIN-XL45"].includes(item.product_code) && actualQty > 0) {
      await tx`
        INSERT INTO xl45_lots(delivery_item_id,product_id,location_id,delivered_date,qty_received,qty_outstanding)
        VALUES (${itemId}::uuid,${item.product_id}::uuid,${item.destination_location_id}::uuid,${String(item.delivery_date).slice(0,10)}::date,${actualQty},${actualQty})
        ON CONFLICT(delivery_item_id) DO NOTHING
      `;
    }
    const [pending] = await tx`SELECT count(*)::int AS n FROM supplier_delivery_items WHERE delivery_id=${item.delivery_id}::uuid AND status<>'confirmed'`;
    await tx`UPDATE supplier_deliveries SET status=${pending.n === 0 ? 'completed' : 'pending'} WHERE id=${item.delivery_id}::uuid`;
    await tx`UPDATE transport_trips SET status='completed' WHERE id=(SELECT trip_id FROM supplier_deliveries WHERE id=${item.delivery_id}::uuid)`;
    await audit({ tx, actorUserId: profile.id, action: 'confirm', entityType: 'supplier_delivery_item', entityId: itemId, after: { actualQty, unitPrice, amount } });
  });
  if (productId && plantStockChanged) await checkLowStock(productId);
}

export async function listDeliveries(profile: Profile) {
  const supplierFilter = profile.role === 'supplier' && profile.organization_id ? profile.organization_id : null;
  if (supplierFilter) {
    return sql`
      SELECT d.id,d.delivery_code,d.delivery_date,d.status,d.note,t.trip_code,t.trip_kind,t.transport_amount::float8 AS transport_amount,o.name AS supplier_name,
        COALESCE(json_agg(json_build_object('id',di.id,'product_name',p.name,'unit',p.unit,'location_code',l.code,'location_name',l.name,'declared_qty',di.declared_qty,'confirmed_qty',di.confirmed_qty,'status',di.status,'feedback',di.feedback) ORDER BY l.code,p.display_order),'[]'::json) AS items
      FROM supplier_deliveries d
      JOIN organizations o ON o.id=d.supplier_org_id
      LEFT JOIN transport_trips t ON t.id=d.trip_id
      LEFT JOIN supplier_delivery_items di ON di.delivery_id=d.id
      LEFT JOIN products p ON p.id=di.product_id
      LEFT JOIN locations l ON l.id=di.destination_location_id
      WHERE d.supplier_org_id=${supplierFilter}::uuid
      GROUP BY d.id,t.id,o.name ORDER BY d.delivery_date DESC,d.created_at DESC LIMIT 100
    `;
  }
  return sql`
    SELECT d.id,d.delivery_code,d.delivery_date,d.status,d.note,t.trip_code,t.trip_kind,t.transport_amount::float8 AS transport_amount,o.name AS supplier_name,
      COALESCE(json_agg(json_build_object('id',di.id,'product_name',p.name,'unit',p.unit,'location_code',l.code,'location_name',l.name,'declared_qty',di.declared_qty,'confirmed_qty',di.confirmed_qty,'status',di.status,'feedback',di.feedback) ORDER BY l.code,p.display_order),'[]'::json) AS items
    FROM supplier_deliveries d
    JOIN organizations o ON o.id=d.supplier_org_id
    LEFT JOIN transport_trips t ON t.id=d.trip_id
    LEFT JOIN supplier_delivery_items di ON di.delivery_id=d.id
    LEFT JOIN products p ON p.id=di.product_id
    LEFT JOIN locations l ON l.id=di.destination_location_id
    GROUP BY d.id,t.id,o.name ORDER BY d.delivery_date DESC,d.created_at DESC LIMIT 100
  `;
}
