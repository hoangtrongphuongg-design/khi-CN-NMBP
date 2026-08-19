import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { audit } from "@/lib/stock";
import { closePreviousPriceRule, type PriceType } from "@/lib/pricing";
import type { Profile, AppRole } from "@/types/app";
import { checkLowStock } from "@/lib/notifications/low-stock";
import { toDateKey } from "@/lib/utils";

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
