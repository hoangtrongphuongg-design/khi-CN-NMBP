import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { applyStockDelta, audit, getStockPointByCode } from "@/lib/stock";
import { closePreviousPriceRule, resolvePriceRule, type PriceType } from "@/lib/pricing";
import type { Profile, AppRole } from "@/types/app";
import { checkLowStock } from "@/lib/notifications/low-stock";
import { toDateKey } from "@/lib/utils";
import { canRequestDataCorrection } from "@/lib/auth/permissions";
import { reallocateXL45Return } from "@/lib/services/supplier-returns";

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
  const { applyStockDelta } = await import("@/lib/stock");
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
    SELECT a.id,a.action,a.entity_type,a.entity_id,a.note,a.created_at,u.full_name AS actor_name,u.username AS actor_username
    FROM audit_logs a
    LEFT JOIN users u ON u.id=a.actor_user_id
    ORDER BY a.created_at DESC
    LIMIT ${limit}
  `;
}

export type DataCorrectionTarget = "supplier_delivery" | "supplier_return";

type CorrectionExistingLine = { itemId: string; quantity: number };
type CorrectionNewLine = { productId: string; quantity: number; destinationLocationId?: string | null };

function correctionCode(prefix: string, id: string, dateKey: string) {
  return `${prefix}-${dateKey.replaceAll("-", "")}-${id.slice(0, 6).toUpperCase()}`;
}

export async function createDataCorrectionRequest(profile: Profile, input: {
  targetType: DataCorrectionTarget;
  targetId: string;
  reason: string;
  requestedChange: string;
}) {
  if (!canRequestDataCorrection(profile)) throw new Error("Chỉ Workshop hoặc Trưởng kho Hậu cần được tạo đề nghị sửa số liệu");
  const reason = input.reason.trim();
  const requestedChange = input.requestedChange.trim();
  if (!reason || !requestedChange) throw new Error("Vui lòng ghi rõ lý do và số liệu cần sửa");

  return sql.begin(async (tx) => {
    let businessDate = toDateKey(new Date());
    if (input.targetType === "supplier_delivery") {
      const [target] = await tx`SELECT id,delivery_code,delivery_date,status FROM supplier_deliveries WHERE id=${input.targetId}::uuid FOR UPDATE`;
      if (!target) throw new Error("Không tìm thấy Phiếu giao NCC");
      if (target.status !== "completed") throw new Error("Chỉ tạo đề nghị sửa cho Phiếu giao đã hoàn tất");
      businessDate = toDateKey(target.delivery_date);
    } else if (input.targetType === "supplier_return") {
      const [target] = await tx`SELECT id,return_code,return_date,status FROM supplier_returns WHERE id=${input.targetId}::uuid FOR UPDATE`;
      if (!target) throw new Error("Không tìm thấy Phiếu trả vỏ NCC");
      if (target.status === "cancelled") throw new Error("Phiếu trả vỏ đã hủy");
      businessDate = toDateKey(target.return_date);
    } else {
      throw new Error("Loại dữ liệu đề nghị sửa không hợp lệ");
    }

    const [pending] = await tx`
      SELECT request_code FROM data_correction_requests
      WHERE target_type=${input.targetType} AND target_id=${input.targetId}::uuid AND status='pending'
      LIMIT 1
    `;
    if (pending) throw new Error(`Đã có đề nghị ${pending.request_code} đang chờ Admin xử lý`);

    const [row] = await tx`
      INSERT INTO data_correction_requests(request_code,target_type,target_id,reason,requested_change,requested_by)
      VALUES (('TMP-'||gen_random_uuid()::text),${input.targetType},${input.targetId}::uuid,${reason},${requestedChange},${profile.id}::uuid)
      RETURNING id
    `;
    const code = correctionCode("YC-SUA", row.id, businessDate);
    await tx`UPDATE data_correction_requests SET request_code=${code} WHERE id=${row.id}::uuid`;
    await audit({
      tx,
      actorUserId: profile.id,
      action: "request_data_correction",
      entityType: input.targetType,
      entityId: input.targetId,
      after: { requestId: row.id, requestCode: code, reason, requestedChange },
      note: "Đề nghị sửa số liệu; dữ liệu gốc chưa bị thay đổi.",
    });
    return { id: row.id as string, code };
  });
}

export async function listDataCorrectionRequests(profile: Profile) {
  assertAdmin(profile);
  return sql<any[]>`
    SELECT
      cr.id,cr.request_code,cr.target_type,cr.target_id,cr.reason,cr.requested_change,cr.status,
      cr.requested_at,cr.handled_at,cr.admin_note,cr.adjustment_id,
      rq.full_name AS requested_by_name,hd.full_name AS handled_by_name,
      CASE WHEN cr.target_type='supplier_delivery' THEN d.delivery_code ELSE r.return_code END AS target_code,
      CASE WHEN cr.target_type='supplier_delivery' THEN d.delivery_date ELSE r.return_date END AS target_date,
      CASE WHEN cr.target_type='supplier_delivery' THEN d.status ELSE r.status END AS target_status,
      CASE WHEN cr.target_type='supplier_return' THEN r.source_location_id ELSE NULL END AS source_location_id,
      CASE WHEN cr.target_type='supplier_return' THEN rl.code ELSE NULL END AS source_location_code,
      CASE WHEN cr.target_type='supplier_return' THEN rl.name ELSE NULL END AS source_location_name,
      CASE WHEN cr.target_type='supplier_delivery' THEN td.visits_plant ELSE NULL END AS visits_plant,
      CASE WHEN cr.target_type='supplier_delivery' THEN td.visits_mine ELSE NULL END AS visits_mine,
      CASE WHEN cr.target_type='supplier_delivery' THEN (
        SELECT COALESCE(json_agg(json_build_object(
          'item_id',di.id,'product_id',di.product_id,'product_code',p.code,'product_name',p.name,'unit',p.unit,
          'destination_location_id',di.destination_location_id,'location_code',l.code,'location_name',l.name,
          'declared_qty',di.declared_qty,'quantity',COALESCE(di.confirmed_qty,0),'unit_price',di.unit_price,'line_amount',di.line_amount
        ) ORDER BY l.code,p.display_order),'[]'::json)
        FROM supplier_delivery_items di
        JOIN products p ON p.id=di.product_id
        JOIN locations l ON l.id=di.destination_location_id
        WHERE di.delivery_id=cr.target_id
      ) ELSE (
        SELECT COALESCE(json_agg(json_build_object(
          'item_id',ri.id,'product_id',ri.product_id,'product_code',p.code,'product_name',p.name,'unit',p.unit,
          'declared_qty',ri.declared_qty,'quantity',COALESCE(ri.confirmed_qty,ri.declared_qty)
        ) ORDER BY p.display_order),'[]'::json)
        FROM supplier_return_items ri
        JOIN products p ON p.id=ri.product_id
        WHERE ri.supplier_return_id=cr.target_id
      ) END AS items
    FROM data_correction_requests cr
    LEFT JOIN users rq ON rq.id=cr.requested_by
    LEFT JOIN users hd ON hd.id=cr.handled_by
    LEFT JOIN supplier_deliveries d ON cr.target_type='supplier_delivery' AND d.id=cr.target_id
    LEFT JOIN transport_trips td ON td.id=d.trip_id
    LEFT JOIN supplier_returns r ON cr.target_type='supplier_return' AND r.id=cr.target_id
    LEFT JOIN locations rl ON rl.id=r.source_location_id
    ORDER BY (cr.status='pending') DESC,cr.requested_at DESC
    LIMIT 100
  `;
}

async function warehouseOrMinePoint(tx: any, locationCode: string) {
  if (locationCode === "PLANT") return getStockPointByCode("WH-PHC", tx);
  const [mine] = await tx`
    SELECT sp.id,sp.code,sp.name,sp.kind,sp.group_id,sp.location_id
    FROM stock_points sp JOIN work_groups g ON g.id=sp.group_id
    WHERE g.code='COI' AND sp.active=true LIMIT 1
  `;
  if (!mine) throw new Error("Chưa cấu hình điểm tồn Nhóm Cối/Mỏ");
  return mine;
}

async function applyCompletedDeliveryCorrection(tx: any, profile: Profile, request: any, existingLines: CorrectionExistingLine[], newLines: CorrectionNewLine[]) {
  const [delivery] = await tx`
    SELECT d.id,d.delivery_code,d.delivery_date,d.status,d.trip_id,t.visits_plant,t.visits_mine,t.co2_liquid_special
    FROM supplier_deliveries d LEFT JOIN transport_trips t ON t.id=d.trip_id
    WHERE d.id=${request.target_id}::uuid
    FOR UPDATE OF d
  `;
  if (!delivery || delivery.status !== "completed") throw new Error("Phiếu giao không còn ở trạng thái Hoàn tất");
  const dateKey = toDateKey(delivery.delivery_date);
  const items = await tx`
    SELECT di.*,p.code AS product_code,p.name AS product_name,p.returnable_container,p.warehouse_split_full_empty,
      l.code AS location_code,l.name AS location_name
    FROM supplier_delivery_items di
    JOIN products p ON p.id=di.product_id
    JOIN locations l ON l.id=di.destination_location_id
    WHERE di.delivery_id=${delivery.id}::uuid
    FOR UPDATE OF di
  `;
  const inputById = new Map(existingLines.map((x) => [x.itemId, Number(x.quantity)]));
  const before: any[] = [];
  const after: any[] = [];
  const lowStock = new Set<string>();

  for (const item of items as any[]) {
    if (!inputById.has(String(item.id))) continue;
    const nextQty = Number(inputById.get(String(item.id)));
    if (!Number.isFinite(nextQty) || nextQty < 0) throw new Error(`${item.product_name}: số lượng sửa không hợp lệ`);
    const oldQty = Number(item.confirmed_qty ?? 0);
    const delta = nextQty - oldQty;
    if (Math.abs(delta) < 0.000001) continue;
    before.push({ itemId: item.id, product: item.product_name, location: item.location_name, quantity: oldQty });

    if (item.returnable_container) {
      const point = await warehouseOrMinePoint(tx, item.location_code);
      const bucket = item.location_code === "MINE" ? "managed" : item.warehouse_split_full_empty ? "full" : "available";
      const referenceType = item.location_code === "MINE" ? "supplier_delivery_mine" : "supplier_delivery";
      await applyStockDelta({
        tx, stockPointId: point.id, productId: item.product_id, bucket, delta,
        referenceType, referenceId: delivery.id, actorUserId: profile.id, occurredDate: dateKey,
        note: `Admin điều chỉnh ${request.request_code} · ${delivery.delivery_code}`,
      });
      if (item.location_code === "PLANT" && bucket === "full") lowStock.add(String(item.product_id));
    }

    if (["LOX-XL45", "LIN-XL45"].includes(String(item.product_code))) {
      const [lot] = await tx`SELECT id,qty_received::float8 AS qty_received,qty_outstanding::float8 AS qty_outstanding FROM xl45_lots WHERE delivery_item_id=${item.id}::uuid FOR UPDATE`;
      if (lot) {
        const alreadyReturned = Number(lot.qty_received) - Number(lot.qty_outstanding);
        if (nextQty + 0.000001 < alreadyReturned) throw new Error(`${item.product_name}: không thể giảm thấp hơn ${alreadyReturned} bồn đã trả theo lịch sử`);
        await tx`UPDATE xl45_lots SET qty_received=${nextQty},qty_outstanding=${nextQty - alreadyReturned} WHERE id=${lot.id}::uuid`;
      }
    }

    const amount = item.unit_price == null ? null : Number(item.unit_price) * nextQty;
    await tx`UPDATE supplier_delivery_items SET confirmed_qty=${nextQty},line_amount=${amount} WHERE id=${item.id}::uuid`;
    after.push({ itemId: item.id, product: item.product_name, location: item.location_name, quantity: nextQty });
  }

  for (const line of newLines.filter((x) => x.productId && Number(x.quantity) > 0)) {
    const qty = Number(line.quantity);
    const locationId = String(line.destinationLocationId || "");
    const [location] = await tx`SELECT id,code,name FROM locations WHERE id=${locationId}::uuid AND code IN ('PLANT','MINE') AND active=true`;
    if (!location) throw new Error("Địa điểm của dòng bổ sung không hợp lệ");
    if (location.code === "PLANT" && !delivery.visits_plant) throw new Error("Không thể bổ sung giao Nhà máy vì chuyến gốc không đi Nhà máy");
    if (location.code === "MINE" && !delivery.visits_mine) throw new Error("Không thể bổ sung giao Mỏ vì chuyến gốc không đi Mỏ");
    const [product] = await tx`
      SELECT id,code,name,returnable_container,warehouse_split_full_empty
      FROM products WHERE id=${line.productId}::uuid AND active=true
    `;
    if (!product) throw new Error("Loại khí bổ sung không hợp lệ");
    const [duplicate] = await tx`SELECT id FROM supplier_delivery_items WHERE delivery_id=${delivery.id}::uuid AND product_id=${product.id}::uuid AND destination_location_id=${location.id}::uuid`;
    if (duplicate) throw new Error(`${product.name} tại ${location.name} đã có trong phiếu; hãy sửa số lượng dòng hiện có`);
    if (product.code === "LIQ-CO2" && !delivery.co2_liquid_special) throw new Error("Không thể bổ sung CO₂ lỏng vào chuyến thường vì sẽ làm thay đổi loại cước. Cần xử lý nghiệp vụ riêng.");

    const price = await resolvePriceRule("product", dateKey, product.id, tx);
    const unitPrice = price ? Number(price.unit_price) : null;
    const [newItem] = await tx`
      INSERT INTO supplier_delivery_items(
        delivery_id,product_id,destination_location_id,declared_qty,confirmed_qty,status,price_rule_id,unit_price,line_amount,confirmed_by,confirmed_at
      ) VALUES (
        ${delivery.id}::uuid,${product.id}::uuid,${location.id}::uuid,${qty},${qty},'confirmed',${price?.id ?? null}::uuid,
        ${unitPrice},${unitPrice == null ? null : unitPrice * qty},${profile.id}::uuid,now()
      ) RETURNING id
    `;
    if (product.returnable_container) {
      const point = await warehouseOrMinePoint(tx, location.code);
      const bucket = location.code === "MINE" ? "managed" : product.warehouse_split_full_empty ? "full" : "available";
      await applyStockDelta({
        tx, stockPointId: point.id, productId: product.id, bucket, delta: qty,
        referenceType: location.code === "MINE" ? "supplier_delivery_mine" : "supplier_delivery",
        referenceId: delivery.id, actorUserId: profile.id, occurredDate: dateKey,
        note: `Admin bổ sung dòng còn thiếu ${request.request_code} · ${delivery.delivery_code}`,
      });
      if (location.code === "PLANT" && bucket === "full") lowStock.add(String(product.id));
    }
    if (["LOX-XL45", "LIN-XL45"].includes(String(product.code))) {
      await tx`
        INSERT INTO xl45_lots(delivery_item_id,product_id,location_id,delivered_date,qty_received,qty_outstanding)
        VALUES (${newItem.id}::uuid,${product.id}::uuid,${location.id}::uuid,${dateKey}::date,${qty},${qty})
      `;
    }
    after.push({ itemId: newItem.id, product: product.name, location: location.name, quantity: qty, added: true });
  }

  return { targetCode: delivery.delivery_code, before, after, lowStockProductIds: Array.from(lowStock) };
}

async function applySupplierReturnCorrection(tx: any, profile: Profile, request: any, existingLines: CorrectionExistingLine[], newLines: CorrectionNewLine[]) {
  const [ret] = await tx`
    SELECT r.id,r.return_code,r.return_date,r.status,r.source_location_id,l.code AS location_code,l.name AS location_name
    FROM supplier_returns r JOIN locations l ON l.id=r.source_location_id
    WHERE r.id=${request.target_id}::uuid
    FOR UPDATE OF r
  `;
  if (!ret || ret.status === "cancelled") throw new Error("Phiếu trả vỏ không còn hợp lệ để điều chỉnh");
  const dateKey = toDateKey(ret.return_date);
  const point = await warehouseOrMinePoint(tx, ret.location_code);
  const items = await tx`
    SELECT ri.*,p.code AS product_code,p.name AS product_name,p.returnable_container,p.warehouse_split_full_empty
    FROM supplier_return_items ri JOIN products p ON p.id=ri.product_id
    WHERE ri.supplier_return_id=${ret.id}::uuid
    FOR UPDATE OF ri
  `;
  const inputById = new Map(existingLines.map((x) => [x.itemId, Number(x.quantity)]));
  const before: any[] = [];
  const after: any[] = [];

  for (const item of items as any[]) {
    if (!inputById.has(String(item.id))) continue;
    const nextQty = Number(inputById.get(String(item.id)));
    if (!Number.isFinite(nextQty) || nextQty < 0) throw new Error(`${item.product_name}: số lượng sửa không hợp lệ`);
    const oldQty = Number(item.confirmed_qty ?? item.declared_qty ?? 0);
    const returnDelta = nextQty - oldQty;
    if (Math.abs(returnDelta) < 0.000001) continue;
    if (!item.returnable_container) throw new Error(`${item.product_name}: sản phẩm không có vỏ/bồn hoàn trả`);
    before.push({ itemId: item.id, product: item.product_name, location: ret.location_name, quantity: oldQty });

    const bucket = ret.location_code === "MINE" ? "managed" : item.warehouse_split_full_empty ? "empty" : "available";
    await applyStockDelta({
      tx, stockPointId: point.id, productId: item.product_id, bucket, delta: -returnDelta,
      referenceType: "supplier_return", referenceId: ret.id, actorUserId: profile.id, occurredDate: dateKey,
      note: `Admin điều chỉnh ${request.request_code} · ${ret.return_code}`,
    });
    await tx`UPDATE supplier_return_items SET confirmed_qty=${nextQty},status='confirmed',feedback=NULL WHERE id=${item.id}::uuid`;
    if (["LOX-XL45", "LIN-XL45"].includes(String(item.product_code))) {
      await reallocateXL45Return(tx, item.id, item.product_id, ret.source_location_id, dateKey, nextQty);
    }
    after.push({ itemId: item.id, product: item.product_name, location: ret.location_name, quantity: nextQty });
  }

  for (const line of newLines.filter((x) => x.productId && Number(x.quantity) > 0)) {
    const qty = Number(line.quantity);
    const [product] = await tx`
      SELECT id,code,name,returnable_container,warehouse_split_full_empty
      FROM products WHERE id=${line.productId}::uuid AND active=true AND returnable_container=true
    `;
    if (!product) throw new Error("Loại vỏ bổ sung không hợp lệ");
    const [duplicate] = await tx`SELECT id FROM supplier_return_items WHERE supplier_return_id=${ret.id}::uuid AND product_id=${product.id}::uuid`;
    if (duplicate) throw new Error(`${product.name} đã có trong Phiếu trả; hãy sửa số lượng dòng hiện có`);
    const [newItem] = await tx`
      INSERT INTO supplier_return_items(supplier_return_id,product_id,declared_qty,confirmed_qty,status)
      VALUES (${ret.id}::uuid,${product.id}::uuid,${qty},${qty},'confirmed') RETURNING id
    `;
    const bucket = ret.location_code === "MINE" ? "managed" : product.warehouse_split_full_empty ? "empty" : "available";
    await applyStockDelta({
      tx, stockPointId: point.id, productId: product.id, bucket, delta: -qty,
      referenceType: "supplier_return", referenceId: ret.id, actorUserId: profile.id, occurredDate: dateKey,
      note: `Admin bổ sung loại vỏ còn thiếu ${request.request_code} · ${ret.return_code}`,
    });
    if (["LOX-XL45", "LIN-XL45"].includes(String(product.code))) {
      await reallocateXL45Return(tx, newItem.id, product.id, ret.source_location_id, dateKey, qty);
    }
    after.push({ itemId: newItem.id, product: product.name, location: ret.location_name, quantity: qty, added: true });
  }

  await tx`UPDATE supplier_returns SET status='completed' WHERE id=${ret.id}::uuid`;
  return { targetCode: ret.return_code, before, after, lowStockProductIds: [] as string[] };
}

export async function applyDataCorrection(profile: Profile, input: {
  requestId: string;
  existingLines: CorrectionExistingLine[];
  newLines: CorrectionNewLine[];
  adminNote?: string | null;
}) {
  assertAdmin(profile);
  const note = String(input.adminNote || "").trim();
  const lowStockProductIds = new Set<string>();

  await sql.begin(async (tx) => {
    const [request] = await tx`SELECT * FROM data_correction_requests WHERE id=${input.requestId}::uuid FOR UPDATE`;
    if (!request) throw new Error("Không tìm thấy đề nghị sửa dữ liệu");
    if (request.status !== "pending") throw new Error("Đề nghị này đã được xử lý");

    const [adj] = await tx`
      INSERT INTO adjustment_notes(adjustment_code,original_reference_type,original_reference_id,reason,created_by)
      VALUES (('TMP-'||gen_random_uuid()::text),${request.target_type},${request.target_id}::uuid,${`${request.reason}${note ? ` · Admin: ${note}` : ""}`},${profile.id}::uuid)
      RETURNING id
    `;
    const adjCode = correctionCode("DC", adj.id, toDateKey(new Date()));
    await tx`UPDATE adjustment_notes SET adjustment_code=${adjCode} WHERE id=${adj.id}::uuid`;

    const result = request.target_type === "supplier_delivery"
      ? await applyCompletedDeliveryCorrection(tx, profile, request, input.existingLines, input.newLines)
      : await applySupplierReturnCorrection(tx, profile, request, input.existingLines, input.newLines);
    result.lowStockProductIds.forEach((id) => lowStockProductIds.add(id));

    await tx`
      UPDATE data_correction_requests
      SET status='completed',handled_at=now(),handled_by=${profile.id}::uuid,admin_note=${note || null},adjustment_id=${adj.id}::uuid
      WHERE id=${request.id}::uuid
    `;
    await audit({
      tx,
      actorUserId: profile.id,
      action: "apply_data_correction",
      entityType: request.target_type,
      entityId: request.target_id,
      before: { requestCode: request.request_code, lines: result.before },
      after: { adjustmentCode: adjCode, lines: result.after },
      note: `${request.request_code} → ${adjCode}${note ? ` · ${note}` : ""}`,
    });
  });

  for (const productId of lowStockProductIds) await checkLowStock(productId);
}

export async function rejectDataCorrection(profile: Profile, requestId: string, adminNote: string) {
  assertAdmin(profile);
  const note = adminNote.trim();
  if (!note) throw new Error("Vui lòng nhập lý do từ chối");
  await sql.begin(async (tx) => {
    const [request] = await tx`SELECT * FROM data_correction_requests WHERE id=${requestId}::uuid FOR UPDATE`;
    if (!request) throw new Error("Không tìm thấy đề nghị sửa dữ liệu");
    if (request.status !== "pending") throw new Error("Đề nghị này đã được xử lý");
    await tx`UPDATE data_correction_requests SET status='rejected',handled_at=now(),handled_by=${profile.id}::uuid,admin_note=${note} WHERE id=${requestId}::uuid`;
    await audit({
      tx, actorUserId: profile.id, action: "reject_data_correction", entityType: request.target_type,
      entityId: request.target_id, after: { requestCode: request.request_code, adminNote: note }, note,
    });
  });
}
