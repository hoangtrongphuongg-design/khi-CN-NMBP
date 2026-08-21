import { sql } from "@/lib/db";
import { audit } from "@/lib/stock";
import { SERVICE_PRICE_ITEMS, type PriceType } from "@/lib/pricing";
import type { Profile } from "@/types/app";
import { toDateInput, toDateKey } from "@/lib/utils";

function assertAdmin(profile: Profile) {
  if (profile.role !== "admin") throw new Error("Chỉ Admin được thay đổi đơn giá");
}

function normalizeMonth(value?: string | null) {
  const fallback = toDateInput().slice(0, 7);
  return value && /^\d{4}-\d{2}$/.test(value) ? value : fallback;
}

function addMonths(month: string, delta: number) {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

function addDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthBounds(monthInput?: string | null) {
  const month = normalizeMonth(monthInput);
  const start = `${month}-01`;
  const nextStart = `${addMonths(month, 1)}-01`;
  const end = addDays(nextStart, -1);
  return { month, start, end, nextStart };
}

function isSameMonth(a: string, b: string) {
  return a.slice(0, 7) === b.slice(0, 7);
}

function serviceUnit(priceType: PriceType) {
  if (priceType === "product") return "";
  return SERVICE_PRICE_ITEMS.find((x) => x.priceType === priceType)?.unit ?? "đơn vị";
}

export type BasePriceInput = {
  priceType: PriceType;
  productId?: string | null;
  unitPrice: number;
};

export type RepriceImpact = {
  deliveryLines: number;
  tripRows: number;
  xl45Allocations: number;
  amountDelta: number;
};

function emptyImpact(): RepriceImpact {
  return { deliveryLines: 0, tripRows: 0, xl45Allocations: 0, amountDelta: 0 };
}

async function repriceContractRange(tx: any, contractId: string, fromDate: string, toDate: string): Promise<RepriceImpact> {
  const [contract] = await tx`
    SELECT id,supplier_org_id FROM contracts WHERE id=${contractId}::uuid LIMIT 1
  `;
  if (!contract) throw new Error("Không tìm thấy hợp đồng để tính lại đơn giá");

  const impact = emptyImpact();

  const deliveryRows = await tx`
    WITH resolved AS (
      SELECT di.id,COALESCE(di.line_amount,0)::numeric AS old_amount,di.confirmed_qty,
        pr.id AS new_rule_id,pr.unit_price AS new_unit_price
      FROM supplier_delivery_items di
      JOIN supplier_deliveries d ON d.id=di.delivery_id
      JOIN LATERAL (
        SELECT x.id,x.unit_price
        FROM price_rules x
        WHERE x.contract_id=${contractId}::uuid
          AND x.rule_kind IN ('adjustment','base')
          AND x.price_type='product'
          AND x.product_id=di.product_id
          AND x.effective_from<=d.delivery_date
          AND (x.effective_to IS NULL OR x.effective_to>=d.delivery_date)
        ORDER BY CASE x.rule_kind WHEN 'adjustment' THEN 0 ELSE 1 END,x.effective_from DESC,x.created_at DESC
        LIMIT 1
      ) pr ON true
      WHERE d.supplier_org_id=${contract.supplier_org_id}::uuid
        AND d.delivery_date>=${fromDate}::date AND d.delivery_date<=${toDate}::date
        AND d.status<>'cancelled'
        AND di.confirmed_qty IS NOT NULL
    ), updated AS (
      UPDATE supplier_delivery_items di
      SET price_rule_id=r.new_rule_id,
          unit_price=r.new_unit_price,
          line_amount=(COALESCE(r.confirmed_qty,0)*r.new_unit_price)
      FROM resolved r
      WHERE di.id=r.id
      RETURNING r.old_amount,di.line_amount AS new_amount
    )
    SELECT old_amount::float8,new_amount::float8 FROM updated
  `;
  impact.deliveryLines = deliveryRows.length;
  for (const row of deliveryRows as any[]) impact.amountDelta += Number(row.new_amount || 0) - Number(row.old_amount || 0);

  const tripRows = await tx`
    WITH resolved AS (
      SELECT t.id,COALESCE(t.transport_amount,0)::numeric AS old_amount,pr.id AS new_rule_id,pr.unit_price AS new_unit_price
      FROM transport_trips t
      JOIN LATERAL (
        SELECT x.id,x.unit_price
        FROM price_rules x
        WHERE x.contract_id=${contractId}::uuid
          AND x.rule_kind IN ('adjustment','base')
          AND x.price_type=CASE t.trip_kind
            WHEN 'mine' THEN 'trip_mine'
            WHEN 'co2_liquid' THEN 'trip_co2_liquid'
            ELSE 'trip_plant' END
          AND x.product_id IS NULL
          AND x.effective_from<=t.trip_date
          AND (x.effective_to IS NULL OR x.effective_to>=t.trip_date)
        ORDER BY CASE x.rule_kind WHEN 'adjustment' THEN 0 ELSE 1 END,x.effective_from DESC,x.created_at DESC
        LIMIT 1
      ) pr ON true
      WHERE t.supplier_org_id=${contract.supplier_org_id}::uuid
        AND t.trip_date>=${fromDate}::date AND t.trip_date<=${toDate}::date
        AND t.status<>'cancelled'
    ), updated AS (
      UPDATE transport_trips t
      SET price_rule_id=r.new_rule_id,transport_unit_price=r.new_unit_price,transport_amount=r.new_unit_price
      FROM resolved r
      WHERE t.id=r.id
      RETURNING r.old_amount,t.transport_amount AS new_amount
    )
    SELECT old_amount::float8,new_amount::float8 FROM updated
  `;
  impact.tripRows = tripRows.length;
  for (const row of tripRows as any[]) impact.amountDelta += Number(row.new_amount || 0) - Number(row.old_amount || 0);

  // Phân bổ XL-45 là snapshot khi trả bồn. Nếu khoảng chịu phí giao với khoảng giá vừa sửa,
  // tính lại toàn bộ tiền thuê của allocation để chi tiết trả bồn luôn khớp báo cáo theo ngày.
  const xl45Rows = await tx`
    WITH calc AS (
      SELECT a.id,COALESCE(a.rental_amount,0)::numeric AS old_amount,
        (
          COALESCE((
            SELECT SUM(COALESCE((
              SELECT x.unit_price
              FROM price_rules x
              WHERE x.contract_id=${contractId}::uuid
                AND x.rule_kind IN ('adjustment','base')
                AND x.price_type='xl45_rental_day'
                AND x.product_id IS NULL
                AND x.effective_from<=gs.day::date
                AND (x.effective_to IS NULL OR x.effective_to>=gs.day::date)
              ORDER BY CASE x.rule_kind WHEN 'adjustment' THEN 0 ELSE 1 END,x.effective_from DESC,x.created_at DESC
              LIMIT 1
            ),0))
            FROM generate_series(l.delivered_date+interval '15 day',a.return_date,interval '1 day') AS gs(day)
          ),0) * a.quantity
        )::numeric AS new_amount
      FROM xl45_return_allocations a
      JOIN xl45_lots l ON l.id=a.xl45_lot_id
      JOIN supplier_delivery_items di ON di.id=l.delivery_item_id
      JOIN supplier_deliveries d ON d.id=di.delivery_id
      WHERE d.supplier_org_id=${contract.supplier_org_id}::uuid
        AND a.return_date>=${fromDate}::date
        AND (l.delivered_date+15)<=${toDate}::date
    ), updated AS (
      UPDATE xl45_return_allocations a
      SET rental_amount=c.new_amount
      FROM calc c
      WHERE a.id=c.id
      RETURNING c.old_amount,a.rental_amount AS new_amount
    )
    SELECT old_amount::float8,new_amount::float8 FROM updated
  `;
  impact.xl45Allocations = xl45Rows.length;
  for (const row of xl45Rows as any[]) impact.amountDelta += Number(row.new_amount || 0) - Number(row.old_amount || 0);

  return impact;
}

async function assertMonthOpen(tx: any, contractId: string, month: string) {
  const { start } = monthBounds(month);
  const [row] = await tx`
    SELECT status FROM price_month_locks
    WHERE contract_id=${contractId}::uuid AND month_start=${start}::date
    LIMIT 1
  `;
  if (row?.status === "locked") throw new Error(`Bảng giá tháng ${month} đã khóa. Hãy mở khóa trước khi điều chỉnh.`);
}

export async function getPriceAdminData(input?: { month?: string | null; contractId?: string | null }) {
  const bounds = monthBounds(input?.month);
  const contracts = await sql`
    SELECT c.id,c.contract_no,c.contract_name,c.signed_date,c.valid_from,c.valid_to,c.active,
      o.id AS supplier_org_id,o.code AS supplier_code,o.name AS supplier_name
    FROM contracts c
    JOIN organizations o ON o.id=c.supplier_org_id
    ORDER BY c.valid_from DESC,c.created_at DESC
  `;

  let selectedContract: any = null;
  if (input?.contractId) selectedContract = (contracts as any[]).find((c:any)=>String(c.id)===String(input.contractId)) ?? null;
  if (!selectedContract) {
    selectedContract = (contracts as any[]).find((c:any)=>
      c.active && toDateKey(c.valid_from) <= bounds.end && (!c.valid_to || toDateKey(c.valid_to) >= bounds.start)
    ) ?? (contracts as any[]).find((c:any)=>c.active) ?? contracts[0] ?? null;
  }

  const products = await sql`
    SELECT id,code,name,unit,display_order,active
    FROM products WHERE active=true ORDER BY display_order,name
  `;

  if (!selectedContract) {
    return { ...bounds, contracts, selectedContract: null, products, baseRules: [], adjustments: [], monthLock: null };
  }

  const [baseRules, adjustments, locks] = await Promise.all([
    sql`
      SELECT pr.id,pr.price_type,pr.product_id,pr.unit,pr.unit_price::float8 AS unit_price,
        pr.effective_from,pr.effective_to,pr.note,pr.rule_kind
      FROM price_rules pr
      WHERE pr.contract_id=${selectedContract.id}::uuid AND pr.rule_kind='base'
      ORDER BY pr.price_type,pr.product_id,pr.created_at DESC
    `,
    sql`
      SELECT pr.id,pr.price_type,pr.product_id,pr.unit,pr.unit_price::float8 AS unit_price,
        pr.effective_from,pr.effective_to,pr.note,pr.created_at
      FROM price_rules pr
      WHERE pr.contract_id=${selectedContract.id}::uuid AND pr.rule_kind='adjustment'
        AND pr.effective_from<=${bounds.end}::date
        AND pr.effective_to>=${bounds.start}::date
      ORDER BY pr.price_type,pr.product_id,pr.effective_from,pr.created_at
    `,
    sql`
      SELECT status,locked_at,locked_by,unlocked_at,unlocked_by,unlock_reason
      FROM price_month_locks
      WHERE contract_id=${selectedContract.id}::uuid AND month_start=${bounds.start}::date
      LIMIT 1
    `,
  ]);

  return { ...bounds, contracts, selectedContract, products, baseRules, adjustments, monthLock: locks[0] ?? null };
}

export async function saveContractBasePrices(profile: Profile, contractId: string, entries: BasePriceInput[]) {
  assertAdmin(profile);
  if (!contractId) throw new Error("Chưa chọn hợp đồng");
  const clean = entries.filter((x) => Number.isFinite(x.unitPrice) && x.unitPrice >= 0);
  if (!clean.length) throw new Error("Chưa nhập đơn giá hợp đồng");

  return sql.begin(async (tx) => {
    const [contract] = await tx`
      SELECT c.*,o.name AS supplier_name FROM contracts c JOIN organizations o ON o.id=c.supplier_org_id
      WHERE c.id=${contractId}::uuid FOR UPDATE OF c
    `;
    if (!contract) throw new Error("Không tìm thấy hợp đồng");

    const productIds = clean.filter((x)=>x.priceType==="product" && x.productId).map((x)=>String(x.productId));
    const productRows = productIds.length ? await tx`
      SELECT id,unit,name FROM products WHERE id IN ${tx(productIds)}
    ` : [];
    const productMap = new Map((productRows as any[]).map((p:any)=>[String(p.id),p]));

    const beforeRows = await tx`
      SELECT id,price_type,product_id,unit,unit_price::float8 AS unit_price,effective_from,effective_to,note
      FROM price_rules WHERE contract_id=${contractId}::uuid AND rule_kind='base'
    `;
    const beforeMap = new Map((beforeRows as any[]).map((r:any)=>[`${r.price_type}:${r.product_id || ""}`,r]));
    const changes: any[] = [];

    for (const entry of clean) {
      const productId = entry.priceType === "product" ? (entry.productId || null) : null;
      if (entry.priceType === "product" && !productId) continue;
      const product = productId ? productMap.get(String(productId)) : null;
      if (entry.priceType === "product" && !product) throw new Error("Sản phẩm không hợp lệ");
      const unit = entry.priceType === "product" ? String(product.unit) : serviceUnit(entry.priceType);
      const key = `${entry.priceType}:${productId || ""}`;
      const before = beforeMap.get(key);
      if (before && Number(before.unit_price) === Number(entry.unitPrice) && String(before.unit) === unit && toDateKey(before.effective_from) === toDateKey(contract.valid_from) && ((!before.effective_to && !contract.valid_to) || (before.effective_to && contract.valid_to && toDateKey(before.effective_to) === toDateKey(contract.valid_to)))) {
        continue;
      }
      changes.push({ entry, productId, unit, before });
    }

    if (!changes.length) return { changed: 0, impact: emptyImpact() };

    const [lockCount] = await tx`
      SELECT COUNT(*)::int AS qty FROM price_month_locks
      WHERE contract_id=${contractId}::uuid AND status='locked'
    `;
    if (Number(lockCount?.qty || 0) > 0) {
      throw new Error("Hợp đồng đã có tháng khóa. Hãy mở khóa các tháng liên quan trước khi sửa giá gốc hợp đồng.");
    }

    for (const change of changes) {
      if (change.before) {
        await tx`
          UPDATE price_rules SET unit=${change.unit},unit_price=${change.entry.unitPrice},
            effective_from=${toDateKey(contract.valid_from)}::date,effective_to=${contract.valid_to ? toDateKey(contract.valid_to) : null}::date,
            note=${`Giá gốc ${contract.contract_no}`}
          WHERE id=${change.before.id}::uuid
        `;
      } else {
        await tx`
          INSERT INTO price_rules(contract_id,price_type,product_id,unit,unit_price,effective_from,effective_to,note,created_by,rule_kind)
          VALUES (${contractId}::uuid,${change.entry.priceType},${change.productId}::uuid,${change.unit},${change.entry.unitPrice},
            ${toDateKey(contract.valid_from)}::date,${contract.valid_to ? toDateKey(contract.valid_to) : null}::date,${`Giá gốc ${contract.contract_no}`},${profile.id}::uuid,'base')
        `;
      }
    }

    const impact = await repriceContractRange(
      tx,
      contractId,
      toDateKey(contract.valid_from),
      contract.valid_to ? toDateKey(contract.valid_to) : "9999-12-31",
    );
    await audit({
      tx,actorUserId: profile.id,action:"save_base_prices",entityType:"contract",entityId:contractId,
      before: changes.map((x)=>x.before || null),
      after: changes.map((x)=>({ priceType:x.entry.priceType,productId:x.productId,unit:x.unit,unitPrice:x.entry.unitPrice })),
      note:`Cập nhật ${changes.length} đơn giá gốc; tự tính lại ${impact.deliveryLines} dòng giao, ${impact.tripRows} chuyến, ${impact.xl45Allocations} phân bổ XL45`,
    });
    return { changed: changes.length, impact };
  });
}

export async function saveMonthlyAdjustment(profile: Profile, input: {
  ruleId?: string | null;
  contractId: string;
  priceType: PriceType;
  productId?: string | null;
  unitPrice: number;
  effectiveFrom: string;
  effectiveTo: string;
  note?: string | null;
}) {
  assertAdmin(profile);
  if (!input.contractId || !input.effectiveFrom || !input.effectiveTo) throw new Error("Thiếu hợp đồng hoặc thời gian áp dụng");
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) throw new Error("Đơn giá không hợp lệ");
  if (input.effectiveTo < input.effectiveFrom) throw new Error("Đến ngày phải bằng hoặc sau Từ ngày");
  if (!isSameMonth(input.effectiveFrom,input.effectiveTo)) throw new Error("Một lần điều chỉnh chỉ được nằm trong cùng một tháng");
  const month = input.effectiveFrom.slice(0,7);

  return sql.begin(async (tx) => {
    await assertMonthOpen(tx,input.contractId,month);
    const [contract] = await tx`
      SELECT * FROM contracts WHERE id=${input.contractId}::uuid AND active=true FOR UPDATE
    `;
    if (!contract) throw new Error("Hợp đồng không tồn tại hoặc đã ngừng hiệu lực");
    const contractFrom = toDateKey(contract.valid_from);
    const contractTo = contract.valid_to ? toDateKey(contract.valid_to) : "9999-12-31";
    if (input.effectiveFrom < contractFrom || input.effectiveTo > contractTo) throw new Error("Khoảng điều chỉnh phải nằm trong thời hạn hợp đồng");

    const productId = input.priceType === "product" ? (input.productId || null) : null;
    if (input.priceType === "product" && !productId) throw new Error("Điều chỉnh giá hàng hóa phải chọn sản phẩm");
    let unit = serviceUnit(input.priceType);
    if (input.priceType === "product") {
      const [product] = await tx`SELECT id,unit FROM products WHERE id=${productId}::uuid AND active=true`;
      if (!product) throw new Error("Sản phẩm không hợp lệ");
      unit = String(product.unit);
    }

    const [base] = await tx`
      SELECT id,unit_price::float8 AS unit_price FROM price_rules
      WHERE contract_id=${input.contractId}::uuid AND rule_kind='base' AND price_type=${input.priceType}
        AND (${productId}::uuid IS NULL OR product_id=${productId}::uuid)
        AND (${input.priceType === "product"} OR product_id IS NULL)
      LIMIT 1
    `;
    if (!base) throw new Error("Chưa có giá gốc hợp đồng cho hạng mục này");

    const [overlap] = await tx`
      SELECT id,effective_from,effective_to FROM price_rules
      WHERE contract_id=${input.contractId}::uuid AND rule_kind='adjustment' AND price_type=${input.priceType}
        AND (${productId}::uuid IS NULL OR product_id=${productId}::uuid)
        AND (${input.priceType === "product"} OR product_id IS NULL)
        AND id<>COALESCE(${input.ruleId || null}::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
        AND daterange(effective_from,effective_to,'[]') && daterange(${input.effectiveFrom}::date,${input.effectiveTo}::date,'[]')
      LIMIT 1
    `;
    if (overlap) throw new Error(`Khoảng thời gian bị trùng với điều chỉnh đã có ${toDateKey(overlap.effective_from)} → ${toDateKey(overlap.effective_to)}`);

    let before: any = null;
    let ruleId = input.ruleId || null;
    let repriceFrom = input.effectiveFrom;
    let repriceTo = input.effectiveTo;
    if (ruleId) {
      const rows = await tx`
        SELECT id,contract_id,price_type,product_id,unit,unit_price::float8 AS unit_price,effective_from,effective_to,note
        FROM price_rules WHERE id=${ruleId}::uuid AND rule_kind='adjustment' FOR UPDATE
      `;
      before = rows[0];
      if (!before || String(before.contract_id)!==String(input.contractId)) throw new Error("Không tìm thấy dòng điều chỉnh");
      const oldFrom = toDateKey(before.effective_from);
      const oldTo = toDateKey(before.effective_to);
      repriceFrom = oldFrom < repriceFrom ? oldFrom : repriceFrom;
      repriceTo = oldTo > repriceTo ? oldTo : repriceTo;
      await tx`
        UPDATE price_rules SET price_type=${input.priceType},product_id=${productId}::uuid,unit=${unit},unit_price=${input.unitPrice},
          effective_from=${input.effectiveFrom}::date,effective_to=${input.effectiveTo}::date,note=${input.note || null}
        WHERE id=${ruleId}::uuid
      `;
    } else {
      const [created] = await tx`
        INSERT INTO price_rules(contract_id,price_type,product_id,unit,unit_price,effective_from,effective_to,note,created_by,rule_kind)
        VALUES (${input.contractId}::uuid,${input.priceType},${productId}::uuid,${unit},${input.unitPrice},${input.effectiveFrom}::date,${input.effectiveTo}::date,${input.note || null},${profile.id}::uuid,'adjustment')
        RETURNING id
      `;
      ruleId = created.id;
    }

    const impact = await repriceContractRange(tx,input.contractId,repriceFrom,repriceTo);
    await audit({
      tx,actorUserId:profile.id,action:before?"update_price_adjustment":"create_price_adjustment",entityType:"price_rule",entityId:ruleId,
      before,
      after:{ contractId:input.contractId,priceType:input.priceType,productId,unitPrice:input.unitPrice,effectiveFrom:input.effectiveFrom,effectiveTo:input.effectiveTo,note:input.note || null,basePrice:Number(base.unit_price) },
      note:`Tự tính lại ${impact.deliveryLines} dòng giao, ${impact.tripRows} chuyến, ${impact.xl45Allocations} phân bổ XL45`,
    });
    return impact;
  });
}

export async function deleteMonthlyAdjustment(profile: Profile, ruleId: string) {
  assertAdmin(profile);
  if (!ruleId) throw new Error("Thiếu dòng điều chỉnh");
  return sql.begin(async (tx) => {
    const [before] = await tx`
      SELECT id,contract_id,price_type,product_id,unit,unit_price::float8 AS unit_price,effective_from,effective_to,note
      FROM price_rules WHERE id=${ruleId}::uuid AND rule_kind='adjustment' FOR UPDATE
    `;
    if (!before) throw new Error("Không tìm thấy dòng điều chỉnh");
    const fromDate=toDateKey(before.effective_from),toDate=toDateKey(before.effective_to);
    await assertMonthOpen(tx,String(before.contract_id),fromDate.slice(0,7));
    // Hạ rule về legacy trước để resolver bỏ qua, tính lại snapshot về giá HĐ/điều chỉnh còn lại,
    // sau đó mới xóa. Làm theo thứ tự này để không vướng FK price_rule_id của giao dịch.
    await tx`UPDATE price_rules SET rule_kind='legacy' WHERE id=${ruleId}::uuid`;
    const impact=await repriceContractRange(tx,String(before.contract_id),fromDate,toDate);
    await tx`DELETE FROM price_rules WHERE id=${ruleId}::uuid`;
    await audit({ tx,actorUserId:profile.id,action:"delete_price_adjustment",entityType:"price_rule",entityId:ruleId,before,note:`Xóa điều chỉnh; tự quay về giá HĐ/tính lại ${impact.deliveryLines} dòng giao, ${impact.tripRows} chuyến, ${impact.xl45Allocations} phân bổ XL45` });
    return impact;
  });
}

export async function lockPriceMonth(profile: Profile, contractId: string, monthInput: string) {
  assertAdmin(profile);
  const { month,start,end }=monthBounds(monthInput);
  return sql.begin(async (tx)=>{
    const [contract]=await tx`SELECT * FROM contracts WHERE id=${contractId}::uuid FOR UPDATE`;
    if(!contract) throw new Error("Không tìm thấy hợp đồng");
    const cFrom=toDateKey(contract.valid_from),cTo=contract.valid_to?toDateKey(contract.valid_to):"9999-12-31";
    if(end<cFrom || start>cTo) throw new Error("Tháng chọn không nằm trong thời hạn hợp đồng");
    await tx`
      INSERT INTO price_month_locks(contract_id,month_start,status,locked_at,locked_by,updated_at)
      VALUES (${contractId}::uuid,${start}::date,'locked',now(),${profile.id}::uuid,now())
      ON CONFLICT(contract_id,month_start) DO UPDATE SET status='locked',locked_at=now(),locked_by=EXCLUDED.locked_by,unlocked_at=NULL,unlocked_by=NULL,unlock_reason=NULL,updated_at=now()
    `;
    await audit({tx,actorUserId:profile.id,action:"lock",entityType:"price_month",entityId:contractId,after:{month,status:"locked"},note:`Khóa bảng giá tháng ${month}`});
  });
}

export async function unlockPriceMonth(profile: Profile, contractId: string, monthInput: string, reason: string) {
  assertAdmin(profile);
  const {month,start}=monthBounds(monthInput);
  if(!reason.trim()) throw new Error("Mở khóa tháng bắt buộc nhập lý do");
  await sql.begin(async(tx)=>{
    const [before]=await tx`SELECT status,locked_at,locked_by FROM price_month_locks WHERE contract_id=${contractId}::uuid AND month_start=${start}::date FOR UPDATE`;
    if(!before || before.status!=="locked") throw new Error("Tháng này chưa ở trạng thái khóa");
    await tx`
      UPDATE price_month_locks SET status='open',unlocked_at=now(),unlocked_by=${profile.id}::uuid,unlock_reason=${reason.trim()},updated_at=now()
      WHERE contract_id=${contractId}::uuid AND month_start=${start}::date
    `;
    await audit({tx,actorUserId:profile.id,action:"unlock",entityType:"price_month",entityId:contractId,before,after:{month,status:"open",reason:reason.trim()},note:`Mở khóa bảng giá tháng ${month}: ${reason.trim()}`});
  });
}
