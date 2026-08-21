import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { applyStockDelta, audit } from "@/lib/stock";
import { closePreviousPriceRule, type PriceType } from "@/lib/pricing";
import type { Profile, AppRole } from "@/types/app";
import { checkLowStock } from "@/lib/notifications/low-stock";
import { toDateInput, toDateKey } from "@/lib/utils";

function assertAdmin(profile: Profile) {
  if (profile.role !== "admin") throw new Error("Chỉ Admin được thay đổi cấu hình hệ thống");
}

export async function listUsers() {
  return sql`
    SELECT u.id,u.username,u.full_name,u.role,u.email,u.active,u.must_change_password,u.created_at,
      u.group_id,u.location_id,u.organization_id,
      g.name AS group_name,l.name AS location_name,o.name AS organization_name
    FROM users u
    LEFT JOIN work_groups g ON g.id=u.group_id
    LEFT JOIN locations l ON l.id=u.location_id
    LEFT JOIN organizations o ON o.id=u.organization_id
    ORDER BY u.active DESC,u.full_name
  `;
}

export async function createUser(profile: Profile, input: {
  username: string; fullName: string; password: string; role: AppRole;
  groupId?: string | null; locationId?: string | null; organizationId?: string | null; email?: string | null;
}) {
  assertAdmin(profile);
  const username = input.username.trim().toUpperCase();
  if (!username || !input.fullName.trim() || input.password.length < 6) throw new Error("Thiếu thông tin hoặc mật khẩu dưới 6 ký tự");
  if (["foreman","supervisor","worker"].includes(input.role) && !input.groupId) throw new Error("Đốc công/Giám sát/Công nhân phải gắn với một nhóm");
  if (input.role === "supplier" && !input.organizationId) throw new Error("Tài khoản NCC phải gắn với nhà cung cấp");
  let locationId = input.locationId || null;
  if (!locationId && input.role === "mine_xsc") {
    const [mine] = await sql`SELECT id FROM locations WHERE code='MINE' LIMIT 1`;
    locationId = mine?.id || null;
  }
  if (!locationId && ["workshop","warehouse_manager","storekeeper","management_board","admin"].includes(input.role)) {
    const [plant] = await sql`SELECT id FROM locations WHERE code='PLANT' LIMIT 1`;
    locationId = plant?.id || null;
  }
  const passwordHash = await bcrypt.hash(input.password, 12);
  const [row] = await sql`
    INSERT INTO users(username,full_name,password_hash,role,group_id,location_id,organization_id,email,active,must_change_password)
    VALUES (${username},${input.fullName.trim()},${passwordHash},${input.role},${input.groupId || null}::uuid,${locationId}::uuid,${input.organizationId || null}::uuid,${input.email || null},true,true)
    RETURNING id
  `;
  await audit({ actorUserId: profile.id, action: "create", entityType: "user", entityId: row.id, after: { ...input, password: "***" } });
  return row.id as string;
}

export async function updateUser(profile: Profile, userId: string, input: {
  fullName: string; role: AppRole;
  groupId?: string | null; locationId?: string | null; organizationId?: string | null; email?: string | null;
}) {
  assertAdmin(profile);
  if (!userId || !input.fullName.trim()) throw new Error("Thiếu thông tin tài khoản");
  if (profile.id === userId && input.role !== "admin") throw new Error("Không thể tự bỏ quyền Admin của tài khoản đang đăng nhập");
  if (["foreman","supervisor","worker"].includes(input.role) && !input.groupId) throw new Error("Đốc công/Giám sát/Công nhân phải gắn với một nhóm");
  if (input.role === "supplier" && !input.organizationId) throw new Error("Tài khoản NCC phải gắn với nhà cung cấp");

  let locationId = input.locationId || null;
  if (input.role === "mine_xsc") {
    const [mine] = await sql`SELECT id FROM locations WHERE code='MINE' LIMIT 1`;
    locationId = mine?.id || null;
  } else if (!locationId && ["workshop","warehouse_manager","storekeeper","management_board","admin"].includes(input.role)) {
    const [plant] = await sql`SELECT id FROM locations WHERE code='PLANT' LIMIT 1`;
    locationId = plant?.id || null;
  }

  const [before] = await sql`
    SELECT username,full_name,role,group_id,location_id,organization_id,email,active
    FROM users WHERE id=${userId}::uuid LIMIT 1
  `;
  if (!before) throw new Error("Không tìm thấy tài khoản");

  await sql`
    UPDATE users SET
      full_name=${input.fullName.trim()},
      role=${input.role},
      group_id=${input.groupId || null}::uuid,
      location_id=${locationId}::uuid,
      organization_id=${input.organizationId || null}::uuid,
      email=${input.email || null},
      session_version=session_version+1,
      updated_at=now()
    WHERE id=${userId}::uuid
  `;
  await sql`DELETE FROM user_sessions WHERE user_id=${userId}::uuid`;
  await audit({
    actorUserId: profile.id,
    action: "update",
    entityType: "user",
    entityId: userId,
    before,
    after: { fullName: input.fullName.trim(), role: input.role, groupId: input.groupId || null, locationId, organizationId: input.organizationId || null, email: input.email || null },
    note: "Thay đổi thông tin/phân quyền user; session cũ đã bị vô hiệu"
  });
}

export async function resetPassword(profile: Profile, userId: string, password: string) {
  assertAdmin(profile);
  if (password.length < 6) throw new Error("Mật khẩu tối thiểu 6 ký tự");
  const hash = await bcrypt.hash(password, 12);
  await sql`
    UPDATE users SET password_hash=${hash},must_change_password=true,session_version=session_version+1,updated_at=now()
    WHERE id=${userId}::uuid
  `;
  await sql`DELETE FROM user_sessions WHERE user_id=${userId}::uuid`;
  await audit({ actorUserId: profile.id, action: "reset_password", entityType: "user", entityId: userId });
}

export async function setUserActive(profile: Profile, userId: string, active: boolean) {
  assertAdmin(profile);
  await sql`UPDATE users SET active=${active},session_version=session_version+1,updated_at=now() WHERE id=${userId}::uuid`;
  if (!active) await sql`DELETE FROM user_sessions WHERE user_id=${userId}::uuid`;
  await audit({ actorUserId: profile.id, action: active ? "activate" : "deactivate", entityType: "user", entityId: userId });
}

export async function listThresholds() {
  return sql`
    SELECT p.id AS product_id,p.code,p.name,p.unit,t.threshold_qty::float8 AS threshold_qty,t.recipient_email,t.enabled
    FROM products p LEFT JOIN low_stock_thresholds t ON t.product_id=p.id
    WHERE p.active AND p.warehouse_split_full_empty
    ORDER BY p.display_order
  `;
}

export async function upsertThreshold(profile: Profile, productId: string, threshold: number, recipient: string, enabled: boolean) {
  assertAdmin(profile);
  if (threshold < 0 || !recipient.includes("@")) throw new Error("Ngưỡng hoặc email không hợp lệ");
  await sql`
    INSERT INTO low_stock_thresholds(product_id,threshold_qty,recipient_email,enabled,updated_by)
    VALUES (${productId}::uuid,${threshold},${recipient},${enabled},${profile.id}::uuid)
    ON CONFLICT(product_id) DO UPDATE SET threshold_qty=EXCLUDED.threshold_qty,recipient_email=EXCLUDED.recipient_email,enabled=EXCLUDED.enabled,updated_at=now(),updated_by=EXCLUDED.updated_by
  `;
  await audit({ actorUserId: profile.id, action: "upsert", entityType: "low_stock_threshold", entityId: productId, after: { threshold, recipient, enabled } });
  // Cấu hình ngưỡng không được tự phát email. Chỉ đồng bộ trạng thái hiện tại;
  // email được tạo khi tồn kho thực tế chuyển từ trên ngưỡng xuống chạm/thấp hơn ngưỡng.
  const [stock] = await sql`
    SELECT COALESCE(sb.qty,0)::float8 AS full_qty
    FROM products p
    JOIN stock_points sp ON sp.code='WH-PHC' AND sp.active=true
    LEFT JOIN stock_balances sb ON sb.stock_point_id=sp.id AND sb.product_id=p.id AND sb.bucket='full'
    WHERE p.id=${productId}::uuid LIMIT 1
  `;
  const qty = Number(stock?.full_qty ?? 0);
  const isLow = enabled && qty <= threshold;
  await sql`
    INSERT INTO low_stock_states(product_id,is_low,last_qty,last_recovered_at)
    VALUES (${productId}::uuid,${isLow},${qty},CASE WHEN ${isLow} THEN NULL ELSE now() END)
    ON CONFLICT(product_id) DO UPDATE SET is_low=EXCLUDED.is_low,last_qty=EXCLUDED.last_qty,
      last_recovered_at=CASE WHEN EXCLUDED.is_low THEN low_stock_states.last_recovered_at ELSE now() END
  `;
}

export async function listCalendarExceptions() {
  return sql`SELECT exception_date,exception_type,note FROM calendar_exceptions WHERE exception_date>=CURRENT_DATE-interval '90 days' ORDER BY exception_date`;
}

export async function upsertCalendarException(profile: Profile, date: string, type: "holiday"|"workday", note?: string) {
  assertAdmin(profile);
  await sql`
    INSERT INTO calendar_exceptions(exception_date,exception_type,note,created_by)
    VALUES (${date}::date,${type},${note || null},${profile.id}::uuid)
    ON CONFLICT(exception_date) DO UPDATE SET exception_type=EXCLUDED.exception_type,note=EXCLUDED.note,created_at=now(),created_by=EXCLUDED.created_by
  `;
  await audit({ actorUserId: profile.id, action: "upsert", entityType: "calendar_exception", note: `${date} ${type} ${note || ""}` });
}

export async function deleteCalendarException(profile: Profile, date: string) {
  assertAdmin(profile);
  await sql`DELETE FROM calendar_exceptions WHERE exception_date=${date}::date`;
  await audit({ actorUserId: profile.id, action: "delete", entityType: "calendar_exception", note: date });
}

export async function listPriceRules() {
  return sql`
    SELECT pr.id,pr.price_type,pr.unit,pr.unit_price::float8 AS unit_price,pr.effective_from,pr.effective_to,pr.note,
      p.id AS product_id,p.name AS product_name,c.contract_no
    FROM price_rules pr
    LEFT JOIN products p ON p.id=pr.product_id
    LEFT JOIN contracts c ON c.id=pr.contract_id
    ORDER BY COALESCE(p.display_order,999),pr.price_type,pr.effective_from DESC
  `;
}

export async function createPriceVersion(profile: Profile, input: { priceType: PriceType; productId?: string | null; unit: string; unitPrice: number; effectiveFrom: string; contractId?: string | null; note?: string }) {
  assertAdmin(profile);
  if (input.unitPrice < 0) throw new Error("Đơn giá không hợp lệ");
  const productId = input.priceType === "product" ? (input.productId || null) : null;
  if (input.priceType === "product" && !productId) throw new Error("Giá hàng hóa phải chọn sản phẩm");
  await sql.begin(async (tx) => {
    const [sameDate] = await tx`
      SELECT id FROM price_rules
      WHERE price_type=${input.priceType}
        AND (${productId}::uuid IS NULL OR product_id=${productId}::uuid)
        AND effective_from=${input.effectiveFrom}::date
      LIMIT 1
    `;
    if (sameDate) throw new Error("Đã có đơn giá cùng ngày hiệu lực; hãy chọn ngày khác hoặc dùng phiên bản đã có");
    const [nextRule] = await tx`
      SELECT effective_from::text AS effective_from FROM price_rules
      WHERE price_type=${input.priceType}
        AND (${productId}::uuid IS NULL OR product_id=${productId}::uuid)
        AND effective_from>${input.effectiveFrom}::date
      ORDER BY effective_from ASC LIMIT 1
    `;
    await closePreviousPriceRule(input.priceType, input.effectiveFrom, productId, tx);
    const [row] = await tx`
      INSERT INTO price_rules(contract_id,price_type,product_id,unit,unit_price,effective_from,effective_to,note,created_by)
      VALUES (${input.contractId || null}::uuid,${input.priceType},${productId}::uuid,${input.unit},${input.unitPrice},${input.effectiveFrom}::date,
        CASE WHEN ${nextRule?.effective_from ? toDateKey(nextRule.effective_from) : null}::date IS NULL THEN NULL ELSE (${nextRule?.effective_from ? toDateKey(nextRule.effective_from) : null}::date - interval '1 day')::date END,
        ${input.note || null},${profile.id}::uuid)
      RETURNING id
    `;
    // Nếu trước đây PHC đã hoàn tất Phiếu khi chưa có đơn giá, bổ sung giá cho đúng
    // khoảng hiệu lực vừa tạo. Chỉ backfill các dòng chưa có snapshot giá.
    if (input.priceType === "product" && productId) {
      await tx`
        UPDATE supplier_delivery_items di
        SET price_rule_id=${row.id}::uuid,
            unit_price=${input.unitPrice},
            line_amount=(COALESCE(di.confirmed_qty,0) * ${input.unitPrice})
        FROM supplier_deliveries d
        WHERE d.id=di.delivery_id
          AND di.product_id=${productId}::uuid
          AND di.unit_price IS NULL
          AND d.delivery_date>=${input.effectiveFrom}::date
          AND (${nextRule?.effective_from ? toDateKey(nextRule.effective_from) : null}::date IS NULL OR d.delivery_date<${nextRule?.effective_from ? toDateKey(nextRule.effective_from) : null}::date)
      `;
    }
    await audit({ tx, actorUserId: profile.id, action: "create_version", entityType: "price_rule", entityId: row.id, after: input });
  });
}

export async function createGroup(profile: Profile, code: string, name: string, locationId: string) {
  assertAdmin(profile);
  const [group] = await sql`
    INSERT INTO work_groups(code,name,location_id) VALUES (${code.trim().toUpperCase()},${name.trim()},${locationId}::uuid)
    RETURNING id,code,name
  `;
  await sql`INSERT INTO stock_points(code,name,kind,location_id,group_id) VALUES (${`GRP-${group.code}`},${group.name},'group',${locationId}::uuid,${group.id}::uuid)`;
  await audit({ actorUserId: profile.id, action: "create", entityType: "work_group", entityId: group.id, after: { code, name, locationId } });
  return group.id as string;
}

export async function upsertGroupNorm(profile: Profile, groupId: string, productId: string, normQty: number) {
  assertAdmin(profile);
  await sql`
    INSERT INTO group_norms(group_id,product_id,norm_qty,updated_by)
    VALUES (${groupId}::uuid,${productId}::uuid,${normQty},${profile.id}::uuid)
    ON CONFLICT(group_id,product_id) DO UPDATE SET norm_qty=EXCLUDED.norm_qty,updated_at=now(),updated_by=EXCLUDED.updated_by
  `;
  await audit({ actorUserId: profile.id, action: "upsert", entityType: "group_norm", after: { groupId, productId, normQty } });
}

export async function setStockBalance(profile: Profile, stockPointId: string, productId: string, bucket: "full"|"empty"|"managed"|"available", targetQty: number) {
  assertAdmin(profile);
  if (targetQty < 0) throw new Error("Số lượng không được âm");
  const [point] = await sql`SELECT id,kind FROM stock_points WHERE id=${stockPointId}::uuid AND active=true`;
  const [product] = await sql`SELECT returnable_container,warehouse_split_full_empty,internal_group_tracking FROM products WHERE id=${productId}::uuid AND active=true`;
  if (!point || point.kind === 'transit') throw new Error("Điểm tồn không hợp lệ");
  if (!product || !product.returnable_container) throw new Error("Sản phẩm này không quản lý tồn chai/bồn trong hệ thống");
  if (point.kind === 'warehouse' && product.warehouse_split_full_empty && !['full','empty'].includes(bucket)) throw new Error("Loại này tại Kho phải tách chai đầy/rỗng");
  if (point.kind === 'warehouse' && !product.warehouse_split_full_empty && bucket !== 'available') throw new Error("Loại này tại Kho dùng tồn khả dụng");
  if (point.kind === 'group' && (!product.internal_group_tracking || bucket !== 'managed')) throw new Error("Nhóm chỉ quản lý tổng chai/bồn được phép theo dõi nội bộ");
  const [current] = await sql`SELECT qty FROM stock_balances WHERE stock_point_id=${stockPointId}::uuid AND product_id=${productId}::uuid AND bucket=${bucket}`;
  const before = Number(current?.qty ?? 0);
  const delta = targetQty - before;
  if (Math.abs(delta) < 0.000001) return;
  await applyStockDelta({ stockPointId, productId, bucket, delta, referenceType: "admin_stock_set", note: "Admin thiết lập số dư", actorUserId: profile.id });
  await audit({ actorUserId: profile.id, action: "set_stock", entityType: "stock_balance", before: { qty: before }, after: { stockPointId, productId, bucket, qty: targetQty } });
  if (point.kind === "warehouse" && bucket === "full") await checkLowStock(productId);
}

export async function upsertProduct(profile: Profile, input: {
  code: string;
  name: string;
  category: string;
  specification?: string | null;
  unit: string;
  returnableContainer: boolean;
  warehouseSplitFullEmpty: boolean;
  internalGroupTracking: boolean;
  cylinderRentalEligible: boolean;
}) {
  assertAdmin(profile);
  const code = input.code.trim().toUpperCase();
  if (!code || !input.name.trim() || !input.category.trim() || !input.unit.trim()) throw new Error("Thiếu thông tin danh mục sản phẩm");
  if (input.warehouseSplitFullEmpty && !input.returnableContainer) throw new Error("Chỉ sản phẩm có vỏ/bình mới tách chai đầy - chai rỗng");
  const [row] = await sql`
    INSERT INTO products(code,name,category,specification,unit,returnable_container,warehouse_split_full_empty,internal_group_tracking,cylinder_rental_eligible,active)
    VALUES (${code},${input.name.trim()},${input.category.trim()},${input.specification || null},${input.unit.trim()},${input.returnableContainer},${input.warehouseSplitFullEmpty},${input.internalGroupTracking},${input.cylinderRentalEligible},true)
    ON CONFLICT(code) DO UPDATE SET
      name=EXCLUDED.name,category=EXCLUDED.category,specification=EXCLUDED.specification,unit=EXCLUDED.unit,
      returnable_container=EXCLUDED.returnable_container,warehouse_split_full_empty=EXCLUDED.warehouse_split_full_empty,
      internal_group_tracking=EXCLUDED.internal_group_tracking,cylinder_rental_eligible=EXCLUDED.cylinder_rental_eligible,active=true
    RETURNING id
  `;
  await audit({ actorUserId: profile.id, action: "upsert", entityType: "product", entityId: row.id, after: { ...input, code } });
  return row.id as string;
}

export async function createContract(profile: Profile, input: {
  supplierOrgId: string;
  contractNo: string;
  contractName?: string | null;
  signedDate?: string | null;
  validFrom: string;
  validTo?: string | null;
}) {
  assertAdmin(profile);
  if (!input.supplierOrgId || !input.contractNo.trim() || !input.validFrom) throw new Error("Thiếu thông tin hợp đồng");
  if (input.validTo && input.validTo < input.validFrom) throw new Error("Ngày hết hiệu lực phải sau ngày bắt đầu");
  const [row] = await sql`
    INSERT INTO contracts(supplier_org_id,contract_no,contract_name,signed_date,valid_from,valid_to,active,created_by)
    VALUES (${input.supplierOrgId}::uuid,${input.contractNo.trim()},${input.contractName || null},${input.signedDate || null}::date,${input.validFrom}::date,${input.validTo || null}::date,true,${profile.id}::uuid)
    RETURNING id
  `;
  await audit({ actorUserId: profile.id, action: "create", entityType: "contract", entityId: row.id, after: input });
  return row.id as string;
}

export async function listAuditLogs(limit = 300) {
  return sql`
    SELECT a.id,a.action,a.entity_type,a.entity_id,a.note,a.before_data,a.after_data,a.created_at,
      u.full_name AS actor_name,u.username AS actor_username
    FROM audit_logs a
    LEFT JOIN users u ON u.id=a.actor_user_id
    ORDER BY a.created_at DESC
    LIMIT ${limit}
  `;
}


export type CutoverCountInput = {
  stockPointId: string;
  productId: string;
  bucket: "full" | "empty" | "available" | "managed";
  qty: number;
};

async function expectedCutoverKeys(tx: any = sql) {
  return tx`
    SELECT sp.id AS stock_point_id,p.id AS product_id,'full'::text AS bucket
    FROM stock_points sp CROSS JOIN products p
    WHERE sp.active AND sp.kind='warehouse' AND p.active AND p.returnable_container AND p.warehouse_split_full_empty
    UNION ALL
    SELECT sp.id,p.id,'empty'::text
    FROM stock_points sp CROSS JOIN products p
    WHERE sp.active AND sp.kind='warehouse' AND p.active AND p.returnable_container AND p.warehouse_split_full_empty
    UNION ALL
    SELECT sp.id,p.id,'available'::text
    FROM stock_points sp CROSS JOIN products p
    WHERE sp.active AND sp.kind='warehouse' AND p.active AND p.returnable_container AND NOT p.warehouse_split_full_empty
    UNION ALL
    SELECT sp.id,p.id,'managed'::text
    FROM stock_points sp CROSS JOIN products p
    LEFT JOIN work_groups g ON g.id=sp.group_id
    WHERE sp.active AND sp.kind='group' AND p.active AND p.returnable_container
      AND (p.internal_group_tracking OR g.code='COI')
  `;
}

async function supplierContainerSnapshotAt(dateKey: string, cutoverId?: string | null, tx: any = sql) {
  return tx`
    WITH counted AS (
      SELECT product_id,COALESCE(SUM(counted_qty),0)::numeric AS counted_qty
      FROM inventory_cutover_items
      WHERE cutover_id=${cutoverId ?? null}::uuid
      GROUP BY product_id
    )
    SELECT p.id AS product_id,p.code AS product_code,p.name AS product_name,p.unit,p.display_order,
      GREATEST(0,COALESCE(opening.qty,0)+COALESCE(mv.net_delta,0))::float8 AS supplier_qty,
      COALESCE(c.counted_qty,0)::float8 AS counted_qty,
      (COALESCE(c.counted_qty,0)-GREATEST(0,COALESCE(opening.qty,0)+COALESCE(mv.net_delta,0)))::float8 AS difference
    FROM products p
    LEFT JOIN LATERAL (
      SELECT ob.opening_date,ob.qty
      FROM supplier_container_opening_balances ob
      WHERE ob.product_id=p.id AND ob.opening_date<=${dateKey}::date
      ORDER BY ob.opening_date DESC LIMIT 1
    ) opening ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(CASE
        WHEN sl.reference_type IN ('supplier_delivery','supplier_delivery_mine') AND sl.delta>0 THEN sl.delta
              WHEN sl.reference_type='supplier_delivery_revision' THEN sl.delta
        WHEN sl.reference_type='supplier_return' AND sl.delta<0 THEN sl.delta
        WHEN sl.reference_type='supplier_return_revision' THEN sl.delta
        ELSE 0 END),0)::numeric AS net_delta
      FROM stock_ledger sl
      WHERE sl.product_id=p.id
        AND sl.occurred_at >= COALESCE(
          (opening.opening_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'),
          '1900-01-01 00:00:00+07'::timestamptz)
        AND sl.occurred_at < ((${dateKey}::date + interval '1 day') AT TIME ZONE 'Asia/Ho_Chi_Minh')
    ) mv ON true
    LEFT JOIN counted c ON c.product_id=p.id
    WHERE p.active AND p.returnable_container
    ORDER BY p.display_order,p.name
  `;
}

export async function getInventoryCutoverAdminData() {
  const [state] = await sql`
    SELECT s.mode,s.stocktake_date,s.go_live_date,s.active_cutover_id,s.updated_at,
      c.id AS finalized_cutover_id,c.note AS finalized_note,c.discrepancy_reason,c.finalized_at,
      u.full_name AS finalized_by_name
    FROM system_operation_state s
    LEFT JOIN inventory_cutovers c ON c.id=s.active_cutover_id
    LEFT JOIN users u ON u.id=c.finalized_by
    WHERE s.id=1 LIMIT 1
  `;
  const [draft] = await sql`
    SELECT c.id,c.stocktake_date,c.go_live_date,c.note,c.created_at,c.updated_at,u.full_name AS created_by_name
    FROM inventory_cutovers c LEFT JOIN users u ON u.id=c.created_by
    WHERE c.status='draft' ORDER BY c.updated_at DESC LIMIT 1
  `;
  const snapshotDate = draft?.stocktake_date ? toDateKey(draft.stocktake_date) : toDateInput();
  const items = draft ? await sql`
    SELECT stock_point_id,product_id,bucket,counted_qty::float8 AS counted_qty
    FROM inventory_cutover_items WHERE cutover_id=${draft.id}::uuid
  ` : [];
  const supplierRows = await supplierContainerSnapshotAt(snapshotDate, draft?.id ?? null);
  const [pending] = await sql`
    SELECT
      (SELECT count(*) FROM supplier_deliveries WHERE delivery_date<=${snapshotDate}::date AND status NOT IN ('completed','cancelled'))::int AS delivery_pending,
      (SELECT count(*) FROM supplier_returns WHERE return_date<=${snapshotDate}::date AND status<>'cancelled' AND (status<>'completed' OR warehouse_review_status<>'approved'))::int AS return_pending
  `;
  return {
    state: state ?? { mode: "historical_import", stocktake_date: null, go_live_date: null },
    draft: draft ?? null,
    items,
    supplierRows,
    snapshotDate,
    pending: pending ?? { delivery_pending: 0, return_pending: 0 },
  };
}

export async function saveInventoryCutoverDraft(profile: Profile, input: {
  stocktakeDate: string;
  goLiveDate: string;
  note?: string | null;
  counts: CutoverCountInput[];
}) {
  assertAdmin(profile);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.stocktakeDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.goLiveDate)) throw new Error("Ngày kiểm kê/vận hành không hợp lệ");
  if (input.goLiveDate <= input.stocktakeDate) throw new Error("Ngày vận hành chính thức phải sau ngày kiểm kê");
  if (!input.counts.length) throw new Error("Chưa có số liệu kiểm kê");
  if (input.counts.some((x) => !Number.isFinite(x.qty) || x.qty < 0)) throw new Error("Số kiểm kê không được âm");

  return sql.begin(async (tx) => {
    const [state] = await tx`SELECT mode FROM system_operation_state WHERE id=1 FOR UPDATE`;
    if (!state) throw new Error("Chưa chạy SQL 15");
    if (state.mode === "live") throw new Error("Hệ thống đã chốt vận hành; không thể tạo lại kiểm kê chuyển đổi");

    const expected = await expectedCutoverKeys(tx);
    const expectedSet = new Set((expected as any[]).map((x:any)=>`${x.stock_point_id}:${x.product_id}:${x.bucket}`));
    const supplied = new Map<string,CutoverCountInput>();
    for (const item of input.counts) {
      const key = `${item.stockPointId}:${item.productId}:${item.bucket}`;
      if (!expectedSet.has(key)) throw new Error("Có dòng kiểm kê không hợp lệ");
      if (supplied.has(key)) throw new Error("Dữ liệu kiểm kê bị trùng dòng");
      supplied.set(key,item);
    }
    if (supplied.size !== expectedSet.size) throw new Error("Vui lòng nhập đủ toàn bộ Kho Hậu cần, các nhóm và Mỏ trước khi lưu kiểm kê");

    let [draft] = await tx`SELECT id FROM inventory_cutovers WHERE status='draft' LIMIT 1 FOR UPDATE`;
    if (!draft) {
      [draft] = await tx`
        INSERT INTO inventory_cutovers(stocktake_date,go_live_date,note,created_by)
        VALUES (${input.stocktakeDate}::date,${input.goLiveDate}::date,${input.note || null},${profile.id}::uuid)
        RETURNING id
      `;
    } else {
      await tx`
        UPDATE inventory_cutovers SET stocktake_date=${input.stocktakeDate}::date,go_live_date=${input.goLiveDate}::date,
          note=${input.note || null},updated_at=now()
        WHERE id=${draft.id}::uuid
      `;
      await tx`DELETE FROM inventory_cutover_items WHERE cutover_id=${draft.id}::uuid`;
    }

    for (const item of supplied.values()) {
      await tx`
        INSERT INTO inventory_cutover_items(cutover_id,stock_point_id,product_id,bucket,counted_qty)
        VALUES (${draft.id}::uuid,${item.stockPointId}::uuid,${item.productId}::uuid,${item.bucket},${item.qty})
      `;
    }
    await audit({ tx, actorUserId: profile.id, action: "save_draft", entityType: "inventory_cutover", entityId: draft.id,
      after: { stocktakeDate: input.stocktakeDate, goLiveDate: input.goLiveDate, itemCount: supplied.size, note: input.note || null },
      note: "Lưu số kiểm kê chuyển đổi; chưa thay đổi tồn kho thực tế." });
    return draft.id as string;
  });
}

export async function finalizeInventoryCutover(profile: Profile, cutoverId: string, discrepancyReason?: string | null) {
  assertAdmin(profile);
  const lowStockProducts = new Set<string>();
  await sql.begin(async (tx) => {
    const [state] = await tx`SELECT mode FROM system_operation_state WHERE id=1 FOR UPDATE`;
    if (!state) throw new Error("Chưa chạy SQL 15");
    if (state.mode === "live") throw new Error("Hệ thống đã được chốt vận hành trước đó");
    const [cutover] = await tx`
      SELECT * FROM inventory_cutovers WHERE id=${cutoverId}::uuid AND status='draft' FOR UPDATE
    `;
    if (!cutover) throw new Error("Không tìm thấy bản kiểm kê nháp");
    const stocktakeDate = toDateKey(cutover.stocktake_date);
    const goLiveDate = toDateKey(cutover.go_live_date);
    if (stocktakeDate > toDateInput()) throw new Error("Chưa đến ngày kiểm kê; không thể chốt vận hành trước ngày kiểm kê thực tế");

    const [pending] = await tx`
      SELECT
        (SELECT count(*) FROM supplier_deliveries WHERE delivery_date<=${stocktakeDate}::date AND status NOT IN ('completed','cancelled'))::int AS delivery_pending,
        (SELECT count(*) FROM supplier_returns WHERE return_date<=${stocktakeDate}::date AND status<>'cancelled' AND (status<>'completed' OR warehouse_review_status<>'approved'))::int AS return_pending
    `;
    if (Number(pending?.delivery_pending || 0) > 0 || Number(pending?.return_pending || 0) > 0) {
      throw new Error(`Còn ${Number(pending?.delivery_pending || 0)} Phiếu giao và ${Number(pending?.return_pending || 0)} Phiếu trả chưa hoàn tất/duyệt đến ngày kiểm kê`);
    }

    const expected = await expectedCutoverKeys(tx);
    const items = await tx`
      SELECT stock_point_id,product_id,bucket,counted_qty::float8 AS counted_qty
      FROM inventory_cutover_items WHERE cutover_id=${cutoverId}::uuid
      FOR UPDATE
    `;
    if (items.length !== expected.length) throw new Error("Bản kiểm kê chưa đủ điểm tồn/loại khí; hãy lưu lại kiểm kê trước khi chốt");

    const comparison = await supplierContainerSnapshotAt(stocktakeDate, cutoverId, tx);
    const hasDifference = (comparison as any[]).some((x:any)=>Math.abs(Number(x.difference || 0)) > 0.000001);
    const reason = String(discrepancyReason || "").trim();
    if (hasDifference && !reason) throw new Error("Có chênh lệch giữa kiểm kê và số vỏ theo NCC; vui lòng nhập lý do trước khi chốt");

    const beforeRows = await tx`
      SELECT stock_point_id,product_id,bucket,qty::float8 AS qty
      FROM stock_balances
      WHERE stock_point_id IN ${tx(Array.from(new Set((items as any[]).map((x:any)=>x.stock_point_id))))}
    `;

    for (const item of items as any[]) {
      const [current] = await tx`
        SELECT qty::float8 AS qty FROM stock_balances
        WHERE stock_point_id=${item.stock_point_id}::uuid AND product_id=${item.product_id}::uuid AND bucket=${item.bucket}
        FOR UPDATE
      `;
      const before = Number(current?.qty ?? 0);
      const target = Number(item.counted_qty ?? 0);
      const delta = target - before;
      if (Math.abs(delta) > 0.000001) {
        await applyStockDelta({ tx, stockPointId: item.stock_point_id, productId: item.product_id, bucket: item.bucket,
          delta, referenceType: "inventory_cutover", referenceId: cutoverId, actorUserId: profile.id, occurredDate: goLiveDate,
          note: `Chốt kiểm kê chuyển đổi ${stocktakeDate}; vận hành từ ${goLiveDate}` });
      }
      if (item.bucket === "full") lowStockProducts.add(String(item.product_id));
    }

    // Mọi số "đầu kỳ chưa phân loại" cũ phải về 0 khi bắt đầu vận hành chính thức.
    const unclassified = await tx`
      SELECT sb.stock_point_id,sb.product_id,sb.qty::float8 AS qty
      FROM stock_balances sb JOIN stock_points sp ON sp.id=sb.stock_point_id
      WHERE sp.active AND sp.kind='warehouse' AND sb.bucket='unclassified' AND sb.qty<>0
      FOR UPDATE OF sb
    `;
    for (const row of unclassified as any[]) {
      await applyStockDelta({ tx, stockPointId: row.stock_point_id, productId: row.product_id, bucket: "unclassified",
        delta: -Number(row.qty), referenceType: "inventory_cutover", referenceId: cutoverId, actorUserId: profile.id,
        occurredDate: goLiveDate, note: "Xóa số đầu kỳ chưa phân loại tại mốc chốt vận hành" });
    }

    await tx`
      UPDATE inventory_cutovers SET status='finalized',discrepancy_reason=${reason || null},finalized_at=now(),finalized_by=${profile.id}::uuid,updated_at=now()
      WHERE id=${cutoverId}::uuid
    `;
    await tx`
      UPDATE system_operation_state SET mode='live',active_cutover_id=${cutoverId}::uuid,stocktake_date=${stocktakeDate}::date,
        go_live_date=${goLiveDate}::date,updated_at=now(),updated_by=${profile.id}::uuid WHERE id=1
    `;
    await audit({ tx, actorUserId: profile.id, action: "finalize", entityType: "inventory_cutover", entityId: cutoverId,
      before: { stockBalances: beforeRows },
      after: { stocktakeDate, goLiveDate, comparison, discrepancyReason: reason || null },
      note: "Chốt kiểm kê và chuyển hệ thống từ Hồi nhập lịch sử sang Vận hành chính thức." });
  });
  for (const productId of lowStockProducts) await checkLowStock(productId);
}

export type AdminOperationalType = "supplier_delivery" | "supplier_return" | "internal_request" | "transfer";

export async function listAdminOperationalRecords(params?: { q?: string; type?: string; limit?: number }) {
  const q = String(params?.q || "").trim();
  const type = String(params?.type || "all");
  const limit = Math.min(Math.max(Number(params?.limit || 120),20),300);
  return sql`
    WITH records AS (
      SELECT d.id,'supplier_delivery'::text AS entity_type,d.delivery_code AS code,d.delivery_date::date AS event_date,
        d.status,o.name AS owner_name,d.note,d.created_at
      FROM supplier_deliveries d JOIN organizations o ON o.id=d.supplier_org_id
      UNION ALL
      SELECT r.id,'supplier_return',r.return_code,r.return_date::date,
        CASE WHEN r.warehouse_review_status='feedback' THEN 'feedback' ELSE r.status END,o.name,r.note,r.created_at
      FROM supplier_returns r JOIN organizations o ON o.id=r.supplier_org_id
      UNION ALL
      SELECT ir.id,'internal_request',ir.request_code,(ir.requested_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
        ir.status,g.name,ir.note,ir.created_at
      FROM internal_requests ir JOIN work_groups g ON g.id=ir.group_id
      UNION ALL
      SELECT t.id,'transfer',t.transfer_code,t.transfer_date::date,t.status,
        CASE WHEN t.direction='plant_to_mine' THEN 'Nhà máy → Mỏ' ELSE 'Mỏ → Nhà máy' END,t.note,t.created_at
      FROM transfers t
    )
    SELECT * FROM records
    WHERE (${type}='all' OR entity_type=${type})
      AND (${q}='' OR code ILIKE ${`%${q}%`} OR COALESCE(owner_name,'') ILIKE ${`%${q}%`} OR COALESCE(note,'') ILIKE ${`%${q}%`})
    ORDER BY CASE WHEN status IN ('feedback','pending','phc_pending','approved','executed_pending_review') THEN 0 ELSE 1 END,
      event_date DESC,created_at DESC
    LIMIT ${limit}
  `;
}

export async function getAdminOperationalRecord(type: AdminOperationalType, id: string) {
  if (!id) return null;
  if (type === "supplier_delivery") {
    const [header] = await sql`
      SELECT d.id,d.delivery_code,d.delivery_date,d.status,d.note,d.trip_id,o.name AS supplier_name,
        t.trip_code,t.trip_date,t.visits_plant,t.visits_mine,t.trip_kind,t.transport_amount::float8 AS transport_amount
      FROM supplier_deliveries d JOIN organizations o ON o.id=d.supplier_org_id
      LEFT JOIN transport_trips t ON t.id=d.trip_id
      WHERE d.id=${id}::uuid LIMIT 1
    `;
    if (!header) return null;
    const items = await sql`
      SELECT di.id,di.product_id,di.destination_location_id,di.declared_qty::float8 AS declared_qty,
        COALESCE(di.confirmed_qty,0)::float8 AS confirmed_qty,di.status,di.feedback,di.unit_price::float8 AS unit_price,
        di.line_amount::float8 AS line_amount,p.code AS product_code,p.name AS product_name,l.code AS location_code,l.name AS location_name
      FROM supplier_delivery_items di JOIN products p ON p.id=di.product_id JOIN locations l ON l.id=di.destination_location_id
      WHERE di.delivery_id=${id}::uuid ORDER BY l.code,p.display_order,p.name
    `;
    return { type,header,items };
  }
  if (type === "supplier_return") {
    const [header] = await sql`
      SELECT r.id,r.return_code,r.return_date,r.status,r.note,r.source_location_id,r.warehouse_review_status,r.warehouse_review_note,
        l.code AS location_code,l.name AS location_name,o.name AS supplier_name,t.trip_code
      FROM supplier_returns r JOIN locations l ON l.id=r.source_location_id JOIN organizations o ON o.id=r.supplier_org_id
      LEFT JOIN transport_trips t ON t.id=r.trip_id WHERE r.id=${id}::uuid LIMIT 1
    `;
    if (!header) return null;
    const items = await sql`
      SELECT ri.id,ri.product_id,ri.declared_qty::float8 AS declared_qty,COALESCE(ri.confirmed_qty,ri.declared_qty)::float8 AS confirmed_qty,
        ri.status,ri.feedback,p.code AS product_code,p.name AS product_name
      FROM supplier_return_items ri JOIN products p ON p.id=ri.product_id
      WHERE ri.supplier_return_id=${id}::uuid ORDER BY p.display_order,p.name
    `;
    return { type,header,items };
  }
  if (type === "internal_request") {
    const [header] = await sql`
      SELECT ir.id,ir.request_code,ir.request_type,ir.group_id,ir.requested_at,ir.status,ir.note,ir.feedback,g.name AS group_name,u.full_name AS requested_by_name
      FROM internal_requests ir JOIN work_groups g ON g.id=ir.group_id JOIN users u ON u.id=ir.requested_by
      WHERE ir.id=${id}::uuid LIMIT 1
    `;
    if (!header) return null;
    const items = await sql`
      SELECT iri.id,iri.product_id,iri.requested_qty::float8 AS requested_qty,COALESCE(iri.actual_qty,0)::float8 AS actual_qty,
        iri.return_bucket,iri.line_status,p.code AS product_code,p.name AS product_name
      FROM internal_request_items iri JOIN products p ON p.id=iri.product_id
      WHERE iri.internal_request_id=${id}::uuid ORDER BY iri.created_at,iri.id
    `;
    return { type,header,items };
  }
  const [header] = await sql`
    SELECT t.id,t.transfer_code,t.direction,t.transfer_date,t.status,t.note,t.feedback,u.full_name AS created_by_name
    FROM transfers t JOIN users u ON u.id=t.created_by WHERE t.id=${id}::uuid LIMIT 1
  `;
  if (!header) return null;
  const items = await sql`
    SELECT ti.id,ti.product_id,ti.quantity::float8 AS quantity,COALESCE(ti.received_qty,ti.quantity)::float8 AS received_qty,
      ti.source_bucket,p.code AS product_code,p.name AS product_name
    FROM transfer_items ti JOIN products p ON p.id=ti.product_id
    WHERE ti.transfer_id=${id}::uuid ORDER BY p.display_order,p.name
  `;
  return { type,header,items };
}

export async function getAdminControlSummary() {
  const [state] = await sql`SELECT mode,stocktake_date,go_live_date,updated_at FROM system_operation_state WHERE id=1 LIMIT 1`;
  const [pending] = await sql`
    SELECT
      (SELECT count(*)::int FROM supplier_deliveries WHERE status NOT IN ('completed','cancelled')) AS deliveries,
      (SELECT count(*)::int FROM supplier_returns WHERE status<>'cancelled' AND (status<>'completed' OR warehouse_review_status<>'approved')) AS returns,
      (SELECT count(*)::int FROM internal_requests WHERE status IN ('pending','approved','executed_pending_review','feedback')) AS internal,
      (SELECT count(*)::int FROM transfers WHERE status IN ('pending','feedback','received_pending_review')) AS transfers
  `;
  const [corrections] = await sql`SELECT count(*)::int AS total FROM audit_logs WHERE action='admin_correct'`;
  const [notices] = await sql`SELECT count(*) FILTER (WHERE status='failed')::int AS failed,count(*) FILTER (WHERE status='pending')::int AS pending FROM notification_outbox`;
  return {
    state: state || { mode: "historical_import", stocktake_date: null, go_live_date: null },
    pending: pending || { deliveries:0,returns:0,internal:0,transfers:0 },
    corrections: Number(corrections?.total || 0),
    notifications: notices || { failed:0,pending:0 },
  };
}
