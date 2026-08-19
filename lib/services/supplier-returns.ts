import { sql } from "@/lib/db";
import type { Profile } from "@/types/app";
import { applyStockDelta, audit, getStockPointByCode } from "@/lib/stock";
import { resolvePriceRule, tripPriceType } from "@/lib/pricing";
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

export async function createSupplierReturn(profile: Profile, input: {
  returnDate: string;
  sourceLocationId: string;
  lines: { productId: string; quantity: number }[];
  tripId?: string | null;
  note?: string;
}) {
  if (!["workshop","warehouse_manager","storekeeper","mine_xsc"].includes(profile.role)) throw new Error("Không có quyền tạo Phiếu trả vỏ NCC");
  const lines = input.lines.filter((x) => x.productId && x.quantity > 0);
  if (!lines.length) throw new Error("Phiếu trả phải có ít nhất một dòng");
  const validProducts = await sql`SELECT id FROM products WHERE id IN ${sql(lines.map((x)=>x.productId))} AND active=true AND returnable_container=true`;
  if (validProducts.length !== new Set(lines.map((x)=>x.productId)).size) throw new Error("Phiếu trả chỉ được chọn sản phẩm có vỏ/bồn hoàn trả");
  const [supplier] = await sql`SELECT id FROM organizations WHERE kind='supplier' AND active=true ORDER BY name LIMIT 1`;
  if (!supplier) throw new Error("Chưa cấu hình NCC");

  return sql.begin(async (tx) => {
    const [loc] = await tx`SELECT code FROM locations WHERE id=${input.sourceLocationId}::uuid`;
    if (!loc) throw new Error("Địa điểm không hợp lệ");
    if (loc.code === "MINE" && profile.role !== "mine_xsc") throw new Error("Phiếu trả vỏ tại Mỏ chỉ do XSC Mỏ tạo");
    if (loc.code === "PLANT" && profile.role === "mine_xsc") throw new Error("XSC Mỏ không tạo Phiếu trả vỏ tại Nhà máy");
    let tripId = input.tripId || null;
    if (!tripId) {
      const visitsMine = loc.code === "MINE";
      const kind = visitsMine ? "mine" : "plant";
      const price = await resolvePriceRule(tripPriceType(visitsMine, false), input.returnDate, null, tx);
      if (!price) throw new Error("Chưa cấu hình đơn giá vận chuyển có hiệu lực cho ngày trả");
      const [trip] = await tx`
        INSERT INTO transport_trips(trip_code,trip_date,supplier_org_id,visits_plant,visits_mine,co2_liquid_special,trip_kind,price_rule_id,transport_unit_price,transport_amount,created_by,note)
        VALUES (('TMP-'||gen_random_uuid()::text),${input.returnDate}::date,${supplier.id}::uuid,${loc.code === "PLANT"},${visitsMine},false,${kind},${price?.id ?? null}::uuid,${Number(price?.unit_price ?? 0)},${Number(price?.unit_price ?? 0)},${profile.id}::uuid,${input.note || null})
        RETURNING id
      `;
      tripId = trip.id;
      await tx`UPDATE transport_trips SET trip_code=${stamp("CHUYEN",trip.id,input.returnDate)} WHERE id=${trip.id}`;
    } else {
      const [linkedTrip] = await tx`SELECT trip_date,supplier_org_id,co2_liquid_special FROM transport_trips WHERE id=${tripId}::uuid FOR UPDATE`;
      if (!linkedTrip) throw new Error("Không tìm thấy chuyến đã chọn");
      if (toDateKey(linkedTrip.trip_date) !== input.returnDate) throw new Error("Phiếu trả vỏ chỉ được ghép vào chuyến cùng ngày");
      if (linkedTrip.supplier_org_id && linkedTrip.supplier_org_id !== supplier.id) throw new Error("Chuyến không thuộc NCC này");
      if (loc.code === "MINE" && !linkedTrip.co2_liquid_special) {
      const price = await resolvePriceRule("trip_mine", input.returnDate, null, tx);
      if (!price) throw new Error("Chưa cấu hình đơn giá chuyến Mỏ có hiệu lực");
      await tx`
        UPDATE transport_trips SET visits_mine=true,trip_kind='mine',price_rule_id=${price?.id ?? null}::uuid,
          transport_unit_price=${Number(price?.unit_price ?? 0)},transport_amount=${Number(price?.unit_price ?? 0)}
        WHERE id=${tripId}::uuid AND co2_liquid_special=false
      `;
      }
    }

    const [ret] = await tx`
      INSERT INTO supplier_returns(return_code,trip_id,supplier_org_id,return_date,source_location_id,note,created_by)
      VALUES (('TMP-'||gen_random_uuid()::text),${tripId}::uuid,${supplier.id}::uuid,${input.returnDate}::date,${input.sourceLocationId}::uuid,${input.note || null},${profile.id}::uuid)
      RETURNING id
    `;
    const code = stamp("TRA-NCC",ret.id,input.returnDate);
    await tx`UPDATE supplier_returns SET return_code=${code} WHERE id=${ret.id}`;
    await tx`UPDATE transport_trips SET status='completed' WHERE id=${tripId}::uuid`;
    for (const line of lines) {
      await tx`INSERT INTO supplier_return_items(supplier_return_id,product_id,declared_qty) VALUES (${ret.id}::uuid,${line.productId}::uuid,${line.quantity})`;
    }
    await audit({ tx, actorUserId: profile.id, action: "create", entityType: "supplier_return", entityId: ret.id, after: { code, tripId, ...input } });
    return { id: ret.id as string, code, tripId };
  });
}

export async function confirmSupplierReturn(profile: Profile, returnId: string, itemActuals: { itemId: string; quantity: number }[], feedback?: string) {
  if (!["supplier"].includes(profile.role)) throw new Error("Chỉ NCC được xác nhận nhận vỏ");
  await sql.begin(async (tx) => {
    const rows = await tx`
      SELECT r.*,l.code AS location_code FROM supplier_returns r JOIN locations l ON l.id=r.source_location_id
      WHERE r.id=${returnId}::uuid FOR UPDATE
    `;
    const ret = rows[0];
    if (!ret || ret.status !== "pending") throw new Error("Phiếu không còn chờ NCC xác nhận; phiếu có phản hồi phải xử lý bằng điều chỉnh để tránh trừ tồn lần hai");
    if (profile.role === "supplier" && profile.organization_id !== ret.supplier_org_id) throw new Error("Phiếu không thuộc NCC này");

    const wh = await getStockPointByCode("WH-PHC", tx);
    const [mine] = await tx`SELECT sp.id FROM stock_points sp JOIN work_groups g ON g.id=sp.group_id WHERE g.code='COI' LIMIT 1`;
    let hasDifference = false;
    for (const actual of itemActuals) {
      const [item] = await tx`
        SELECT ri.*,p.code AS product_code,p.warehouse_split_full_empty,p.returnable_container
        FROM supplier_return_items ri JOIN products p ON p.id=ri.product_id
        WHERE ri.id=${actual.itemId}::uuid AND ri.supplier_return_id=${returnId}::uuid FOR UPDATE
      `;
      if (!item) continue;
      if (actual.quantity < 0) throw new Error("Số lượng nhận không hợp lệ");
      hasDifference ||= Number(actual.quantity) !== Number(item.declared_qty);
      const bucket = ret.location_code === "MINE" ? "managed" : item.warehouse_split_full_empty ? "empty" : "available";
      const pointId = ret.location_code === "MINE" ? mine?.id : wh.id;
      if (!pointId) throw new Error("Chưa cấu hình điểm tồn");
      await applyStockDelta({ tx, stockPointId: pointId, productId: item.product_id, bucket, delta: -actual.quantity, referenceType: "supplier_return", referenceId: returnId, actorUserId: profile.id, occurredDate: toDateKey(ret.return_date) });
      if (["LOX-XL45","LIN-XL45"].includes(item.product_code) && actual.quantity > 0) {
        await allocateXL45Return(tx, item.id, item.product_id, ret.source_location_id, toDateKey(ret.return_date), actual.quantity);
      }
      await tx`
        UPDATE supplier_return_items SET confirmed_qty=${actual.quantity},status=${Number(actual.quantity) === Number(item.declared_qty) ? "confirmed" : "feedback"},feedback=${Number(actual.quantity) === Number(item.declared_qty) ? null : feedback || "Số lượng NCC nhận khác số khai trả"}
        WHERE id=${actual.itemId}::uuid
      `;
    }
    await tx`
      UPDATE supplier_returns SET status=${hasDifference ? "feedback" : "completed"},supplier_confirmed_by=${profile.id}::uuid,supplier_confirmed_at=now()
      WHERE id=${returnId}::uuid
    `;
    await audit({ tx, actorUserId: profile.id, action: "supplier_confirm", entityType: "supplier_return", entityId: returnId, after: { itemActuals, hasDifference }, note: feedback });
  });
}

export async function listSupplierReturns(profile: Profile) {
  const supplierId = profile.role === "supplier" ? profile.organization_id : null;
  if (supplierId) {
    return sql`
      SELECT r.id,r.return_code,r.return_date,r.status,r.note,l.name AS source_location,t.trip_code,
        COALESCE(json_agg(json_build_object('id',ri.id,'product_name',p.name,'unit',p.unit,'declared_qty',ri.declared_qty,'confirmed_qty',ri.confirmed_qty,'status',ri.status,'feedback',ri.feedback) ORDER BY p.display_order),'[]'::json) AS items
      FROM supplier_returns r JOIN locations l ON l.id=r.source_location_id LEFT JOIN transport_trips t ON t.id=r.trip_id
      LEFT JOIN supplier_return_items ri ON ri.supplier_return_id=r.id LEFT JOIN products p ON p.id=ri.product_id
      WHERE r.supplier_org_id=${supplierId}::uuid
      GROUP BY r.id,l.name,t.trip_code ORDER BY r.return_date DESC,r.created_at DESC LIMIT 100
    `;
  }
  return sql`
    SELECT r.id,r.return_code,r.return_date,r.status,r.note,l.name AS source_location,t.trip_code,
      COALESCE(json_agg(json_build_object('id',ri.id,'product_name',p.name,'unit',p.unit,'declared_qty',ri.declared_qty,'confirmed_qty',ri.confirmed_qty,'status',ri.status,'feedback',ri.feedback) ORDER BY p.display_order),'[]'::json) AS items
    FROM supplier_returns r JOIN locations l ON l.id=r.source_location_id LEFT JOIN transport_trips t ON t.id=r.trip_id
    LEFT JOIN supplier_return_items ri ON ri.supplier_return_id=r.id LEFT JOIN products p ON p.id=ri.product_id
    GROUP BY r.id,l.name,t.trip_code ORDER BY r.return_date DESC,r.created_at DESC LIMIT 100
  `;
}
