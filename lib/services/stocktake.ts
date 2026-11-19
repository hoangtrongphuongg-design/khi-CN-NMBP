import { sql } from "@/lib/db";
import { applyStockDelta, audit, getSystemOperationState } from "@/lib/stock";
import type { Profile } from "@/types/app";
import { checkLowStock } from "@/lib/notifications/low-stock";
import { toDateInput } from "@/lib/utils";
import { expectedCutoverKeys, supplierContainerSnapshotAt } from "@/lib/services/admin";

/**
 * V1.0.49 - Kiểm kê từng khu, lặp lại nhiều đợt.
 * - Mỗi lúc chỉ 1 đợt mở. Trong đợt, từng khu (Kho Hậu cần / Mỏ-Nhóm Cối / từng nhóm) được đếm vào ngày khác nhau.
 * - Bắt đầu khu: chụp số máy (system_qty_at_start). Xác nhận: điều chỉnh = số đếm - số chụp,
 *   nên phiếu phát sinh trong lúc đếm vẫn được giữ nguyên.
 * - Đợt đầu tiên khi hệ thống còn Hồi nhập lịch sử sẽ chuyển sang Vận hành chính thức.
 */

export type ZoneCountInput = { productId: string; bucket: string; qty: number };

function assertAdmin(profile: Profile) {
  if (profile.role !== "admin") throw new Error("Chỉ Admin được thực hiện kiểm kê");
}

const COUNTED_BUCKETS = ["full", "empty", "available", "managed"];

async function pendingDocumentsForPoint(tx: any, point: any) {
  const issues: string[] = [];
  const codes = (rows: any[], field: string) => rows.map((r: any) => String(r[field])).slice(0, 10).join(", ") + (rows.length > 10 ? "…" : "");

  if (point.kind === "group") {
    const internal = await tx`
      SELECT request_code FROM internal_requests
      WHERE group_id=${point.group_id}::uuid AND status IN ('pending','approved')
      ORDER BY requested_at
    `;
    if (internal.length) issues.push(`${internal.length} phiếu Đổi/Mượn/Trả chưa xử lý (${codes(internal as any[], "request_code")})`);
  }

  if (point.kind === "warehouse") {
    const internal = await tx`
      SELECT request_code FROM internal_requests WHERE status IN ('pending','approved') ORDER BY requested_at
    `;
    if (internal.length) issues.push(`${internal.length} phiếu Đổi/Mượn/Trả chưa xử lý (${codes(internal as any[], "request_code")})`);
  }

  const isMine = point.kind === "group" && point.group_code === "COI";
  if (point.kind === "warehouse" || isMine) {
    const locationCode = isMine ? "MINE" : "PLANT";
    const deliveries = await tx`
      SELECT DISTINCT d.delivery_code,d.delivery_date
      FROM supplier_deliveries d
      JOIN supplier_delivery_items di ON di.delivery_id=d.id
      JOIN locations l ON l.id=di.destination_location_id
      WHERE l.code=${locationCode} AND d.status NOT IN ('completed','cancelled')
      ORDER BY d.delivery_date
    `;
    if (deliveries.length) issues.push(`${deliveries.length} Phiếu giao NCC chưa hoàn tất (${codes(deliveries as any[], "delivery_code")})`);
    const transfers = await tx`
      SELECT transfer_code FROM transfers WHERE status IN ('pending','in_transit') ORDER BY transfer_date
    `;
    if (transfers.length) issues.push(`${transfers.length} phiếu điều chuyển chưa xong (${codes(transfers as any[], "transfer_code")})`);
  }
  return issues;
}

async function reconciliationNow(tx: any = sql) {
  const supplierRows = await supplierContainerSnapshotAt(toDateInput(), null, tx);
  const systemRows = await tx`
    SELECT sb.product_id,COALESCE(SUM(sb.qty),0)::float8 AS qty
    FROM stock_balances sb
    JOIN stock_points sp ON sp.id=sb.stock_point_id
    WHERE sp.active AND sp.kind IN ('warehouse','group')
      AND sb.bucket IN ('full','empty','available','managed','unclassified')
    GROUP BY sb.product_id
  `;
  const systemByProduct = new Map((systemRows as any[]).map((r: any) => [String(r.product_id), Number(r.qty || 0)]));
  return (supplierRows as any[]).map((r: any) => {
    const supplierQty = Number(r.supplier_qty || 0);
    const systemQty = systemByProduct.get(String(r.product_id)) ?? 0;
    return {
      product_id: String(r.product_id),
      product_name: String(r.product_name),
      unit: String(r.unit),
      supplier_qty: supplierQty,
      system_qty: systemQty,
      difference: systemQty - supplierQty,
    };
  });
}

export async function getStocktakeRoundData() {
  const state = await getSystemOperationState();
  // Chưa chạy SQL 23 trên Neon -> hiện hướng dẫn thay vì làm lỗi cả tab Kiểm kê.
  const [schema] = await sql`SELECT to_regclass('public.stocktake_zone_items') IS NOT NULL AS ready`;
  if (!schema?.ready) return { state, missingSchema: true as const };
  const [openRound] = await sql`
    SELECT r.id,r.round_code,r.start_date,r.note,r.created_at,r.switched_to_live,u.full_name AS created_by_name
    FROM stocktake_rounds r LEFT JOIN users u ON u.id=r.created_by
    WHERE r.status='open' LIMIT 1
  `;
  const points = await sql`
    SELECT sp.id,sp.code,sp.name,sp.kind,g.code AS group_code
    FROM stock_points sp LEFT JOIN work_groups g ON g.id=sp.group_id
    WHERE sp.active AND sp.kind IN ('warehouse','group')
    ORDER BY CASE WHEN g.code='COI' THEN 0 WHEN sp.kind='warehouse' THEN 1 ELSE 2 END,sp.name
  `;
  const zones = openRound ? await sql`
    SELECT z.id,z.stock_point_id,z.status,z.note,z.started_at,z.confirmed_at,
      us.full_name AS started_by_name,uc.full_name AS confirmed_by_name,
      COALESCE(SUM(CASE WHEN i.bucket<>'unclassified' AND i.counted_qty IS NOT NULL THEN i.counted_qty-i.system_qty_at_start ELSE 0 END),0)::float8 AS difference
    FROM stocktake_zone_counts z
    LEFT JOIN users us ON us.id=z.started_by
    LEFT JOIN users uc ON uc.id=z.confirmed_by
    LEFT JOIN stocktake_zone_items i ON i.zone_count_id=z.id
    WHERE z.round_id=${openRound.id}::uuid AND z.status<>'cancelled'
    GROUP BY z.id,us.full_name,uc.full_name
  ` : [];
  const countingIds = (zones as any[]).filter((z: any) => z.status === "counting").map((z: any) => String(z.id));
  const countingItems = countingIds.length ? await sql`
    SELECT i.zone_count_id,i.product_id,i.bucket,i.system_qty_at_start::float8 AS system_qty_at_start,
      i.counted_qty::float8 AS counted_qty,p.name AS product_name,p.unit,p.display_order
    FROM stocktake_zone_items i JOIN products p ON p.id=i.product_id
    WHERE i.zone_count_id IN ${sql(countingIds)}
    ORDER BY p.display_order,p.name,i.bucket
  ` : [];
  const history = await sql`
    SELECT r.id,r.round_code,r.start_date,r.status,r.note,r.discrepancy_reason,r.closed_at,u.full_name AS closed_by_name,
      (SELECT count(*)::int FROM stocktake_zone_counts z WHERE z.round_id=r.id AND z.status='confirmed') AS confirmed_zones
    FROM stocktake_rounds r LEFT JOIN users u ON u.id=r.closed_by
    WHERE r.status='closed'
    ORDER BY r.closed_at DESC LIMIT 10
  `;
  const reconciliation = openRound ? await reconciliationNow() : [];
  return { state, openRound: openRound ?? null, points, zones, countingItems, history, reconciliation };
}

export async function openStocktakeRound(profile: Profile, input: { startDate: string; note?: string | null }) {
  assertAdmin(profile);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) throw new Error("Ngày bắt đầu đợt kiểm kê không hợp lệ");
  if (input.startDate > toDateInput()) throw new Error("Ngày bắt đầu đợt kiểm kê không được ở tương lai");
  return sql.begin(async (tx) => {
    const [existing] = await tx`SELECT id FROM stocktake_rounds WHERE status='open' LIMIT 1 FOR UPDATE`;
    if (existing) throw new Error("Đang có đợt kiểm kê mở; hãy đóng đợt đó trước khi mở đợt mới");
    const [state] = await tx`SELECT mode FROM system_operation_state WHERE id=1 FOR UPDATE`;
    if (!state) throw new Error("Chưa chạy SQL 15");
    const switchToLive = state.mode !== "live";

    if (switchToLive) {
      const [pending] = await tx`
        SELECT
          (SELECT count(*) FROM supplier_deliveries WHERE delivery_date<${input.startDate}::date AND status NOT IN ('completed','cancelled'))::int AS delivery_pending,
          (SELECT count(*) FROM supplier_returns WHERE return_date<${input.startDate}::date AND status<>'cancelled' AND (status<>'completed' OR warehouse_review_status<>'approved'))::int AS return_pending
      `;
      if (Number(pending?.delivery_pending || 0) > 0 || Number(pending?.return_pending || 0) > 0) {
        throw new Error(`Còn ${Number(pending?.delivery_pending || 0)} Phiếu giao và ${Number(pending?.return_pending || 0)} Phiếu trả trước ngày bắt đầu chưa hoàn tất/duyệt; cần xử lý hết trước khi chuyển sang vận hành chính thức`);
      }
    }

    const roundCode = `KK-${input.startDate.replaceAll("-", "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const [round] = await tx`
      INSERT INTO stocktake_rounds(round_code,start_date,note,switched_to_live,created_by)
      VALUES (${roundCode},${input.startDate}::date,${input.note || null},${switchToLive},${profile.id}::uuid)
      RETURNING id
    `;
    if (switchToLive) {
      await tx`
        UPDATE system_operation_state SET mode='live',stocktake_date=${input.startDate}::date,go_live_date=${input.startDate}::date,
          updated_at=now(),updated_by=${profile.id}::uuid
        WHERE id=1
      `;
    }
    await audit({ tx, actorUserId: profile.id, action: "open_round", entityType: "stocktake_round", entityId: round.id,
      after: { roundCode, startDate: input.startDate, note: input.note || null, switchedToLive: switchToLive },
      note: switchToLive ? "Mở đợt kiểm kê từng khu và chuyển hệ thống sang Vận hành chính thức." : "Mở đợt kiểm kê từng khu." });
    return { id: String(round.id), roundCode, switchedToLive: switchToLive };
  });
}

export async function startZoneCount(profile: Profile, stockPointId: string) {
  assertAdmin(profile);
  return sql.begin(async (tx) => {
    const [round] = await tx`SELECT id FROM stocktake_rounds WHERE status='open' LIMIT 1 FOR UPDATE`;
    if (!round) throw new Error("Chưa có đợt kiểm kê nào đang mở");
    const [point] = await tx`
      SELECT sp.id,sp.name,sp.kind,sp.group_id,g.code AS group_code
      FROM stock_points sp LEFT JOIN work_groups g ON g.id=sp.group_id
      WHERE sp.id=${stockPointId}::uuid AND sp.active AND sp.kind IN ('warehouse','group')
    `;
    if (!point) throw new Error("Khu kiểm kê không hợp lệ");
    const [active] = await tx`
      SELECT status FROM stocktake_zone_counts
      WHERE round_id=${round.id}::uuid AND stock_point_id=${stockPointId}::uuid AND status<>'cancelled' LIMIT 1
    `;
    if (active) throw new Error(active.status === "confirmed" ? `${point.name} đã chốt trong đợt này` : `${point.name} đang được kiểm kê`);

    const issues = await pendingDocumentsForPoint(tx, point);
    if (issues.length) throw new Error(`${point.name} còn phiếu dở dang, cần xử lý trước khi kiểm kê: ${issues.join("; ")}`);

    const [zone] = await tx`
      INSERT INTO stocktake_zone_counts(round_id,stock_point_id,started_by)
      VALUES (${round.id}::uuid,${stockPointId}::uuid,${profile.id}::uuid)
      RETURNING id
    `;
    const keys = (await expectedCutoverKeys(tx) as any[]).filter((k: any) => String(k.stock_point_id) === String(stockPointId));
    const balances = await tx`
      SELECT product_id,bucket,qty::float8 AS qty FROM stock_balances WHERE stock_point_id=${stockPointId}::uuid
    `;
    const balanceMap = new Map((balances as any[]).map((b: any) => [`${b.product_id}:${b.bucket}`, Number(b.qty || 0)]));
    for (const key of keys) {
      await tx`
        INSERT INTO stocktake_zone_items(zone_count_id,product_id,bucket,system_qty_at_start)
        VALUES (${zone.id}::uuid,${key.product_id}::uuid,${key.bucket},${balanceMap.get(`${key.product_id}:${key.bucket}`) ?? 0})
      `;
    }
    if (point.kind === "warehouse") {
      // Số "đầu kỳ chưa phân loại" sẽ về 0 khi chốt Kho.
      for (const b of (balances as any[]).filter((x: any) => x.bucket === "unclassified" && Math.abs(Number(x.qty || 0)) > 0.000001)) {
        await tx`
          INSERT INTO stocktake_zone_items(zone_count_id,product_id,bucket,system_qty_at_start,counted_qty)
          VALUES (${zone.id}::uuid,${b.product_id}::uuid,'unclassified',${Number(b.qty)},0)
        `;
      }
    }
    await audit({ tx, actorUserId: profile.id, action: "start_zone", entityType: "stocktake_zone", entityId: zone.id,
      after: { roundId: round.id, stockPointId, pointName: point.name, snapshot: (balances as any[]) },
      note: `Bắt đầu kiểm kê ${point.name}; chụp số máy tại thời điểm bắt đầu.` });
    return String(zone.id);
  });
}

export async function confirmZoneCount(profile: Profile, zoneId: string, counts: ZoneCountInput[], note?: string | null) {
  assertAdmin(profile);
  const lowStockProducts = new Set<string>();
  const pointName = await sql.begin(async (tx) => {
    const [zone] = await tx`
      SELECT z.id,z.status,z.stock_point_id,sp.name AS point_name,r.status AS round_status
      FROM stocktake_zone_counts z
      JOIN stocktake_rounds r ON r.id=z.round_id
      JOIN stock_points sp ON sp.id=z.stock_point_id
      WHERE z.id=${zoneId}::uuid FOR UPDATE OF z
    `;
    if (!zone) throw new Error("Không tìm thấy khu kiểm kê");
    if (zone.round_status !== "open") throw new Error("Đợt kiểm kê đã đóng");
    if (zone.status !== "counting") throw new Error(`${zone.point_name} không còn ở trạng thái đang kiểm kê`);

    const items = await tx`
      SELECT product_id,bucket,system_qty_at_start::float8 AS system_qty_at_start
      FROM stocktake_zone_items WHERE zone_count_id=${zoneId}::uuid FOR UPDATE
    `;
    const countMap = new Map(counts.map((c) => [`${c.productId}:${c.bucket}`, c.qty]));
    const result: any[] = [];
    for (const item of items as any[]) {
      const key = `${item.product_id}:${item.bucket}`;
      const [current] = await tx`
        SELECT qty::float8 AS qty FROM stock_balances
        WHERE stock_point_id=${zone.stock_point_id}::uuid AND product_id=${item.product_id}::uuid AND bucket=${item.bucket}
        FOR UPDATE
      `;
      const currentQty = Number(current?.qty ?? 0);
      let counted: number;
      let delta: number;
      if (item.bucket === "unclassified") {
        counted = 0;
        delta = -currentQty;
      } else {
        if (!COUNTED_BUCKETS.includes(item.bucket)) continue;
        const qty = countMap.get(key);
        if (qty === undefined || !Number.isFinite(qty) || qty < 0) throw new Error("Vui lòng nhập đủ số đếm (≥ 0) cho mọi loại khí của khu");
        counted = qty;
        delta = counted - Number(item.system_qty_at_start);
        if (currentQty + delta < -0.000001) {
          throw new Error("Số đếm làm tồn bị âm vì có phiếu xuất phát sinh trong lúc đếm. Hãy Hủy khu này rồi Bắt đầu kiểm kê lại.");
        }
      }
      await tx`
        UPDATE stocktake_zone_items SET counted_qty=${counted}
        WHERE zone_count_id=${zoneId}::uuid AND product_id=${item.product_id}::uuid AND bucket=${item.bucket}
      `;
      if (Math.abs(delta) > 0.000001) {
        await applyStockDelta({ tx, stockPointId: zone.stock_point_id, productId: item.product_id, bucket: item.bucket,
          delta, referenceType: "zone_stocktake", referenceId: zoneId, actorUserId: profile.id,
          note: item.bucket === "unclassified" ? `Kiểm kê ${zone.point_name}: xóa số đầu kỳ chưa phân loại` : `Kiểm kê ${zone.point_name}` });
      }
      if (item.bucket === "full") lowStockProducts.add(String(item.product_id));
      result.push({ productId: item.product_id, bucket: item.bucket, systemAtStart: Number(item.system_qty_at_start), currentBefore: currentQty, counted, delta });
    }
    await tx`
      UPDATE stocktake_zone_counts SET status='confirmed',note=${note || null},confirmed_at=now(),confirmed_by=${profile.id}::uuid
      WHERE id=${zoneId}::uuid
    `;
    await audit({ tx, actorUserId: profile.id, action: "confirm_zone", entityType: "stocktake_zone", entityId: zoneId,
      before: result.map((r) => ({ productId: r.productId, bucket: r.bucket, qty: r.currentBefore })),
      after: { items: result, note: note || null },
      note: `Chốt kiểm kê ${zone.point_name}; điều chỉnh = số đếm - số máy lúc bắt đầu.` });
    return String(zone.point_name);
  });
  for (const productId of lowStockProducts) await checkLowStock(productId);
  return pointName;
}

export async function cancelZoneCount(profile: Profile, zoneId: string) {
  assertAdmin(profile);
  await sql.begin(async (tx) => {
    const [zone] = await tx`
      SELECT z.id,z.status,sp.name AS point_name FROM stocktake_zone_counts z JOIN stock_points sp ON sp.id=z.stock_point_id
      WHERE z.id=${zoneId}::uuid FOR UPDATE OF z
    `;
    if (!zone || zone.status !== "counting") throw new Error("Chỉ hủy được khu đang kiểm kê");
    await tx`UPDATE stocktake_zone_counts SET status='cancelled' WHERE id=${zoneId}::uuid`;
    await audit({ tx, actorUserId: profile.id, action: "cancel_zone", entityType: "stocktake_zone", entityId: zoneId,
      note: `Hủy kiểm kê ${zone.point_name}; không thay đổi tồn.` });
  });
}

export async function closeStocktakeRound(profile: Profile, roundId: string, discrepancyReason?: string | null) {
  assertAdmin(profile);
  await sql.begin(async (tx) => {
    const [round] = await tx`SELECT id,round_code,status FROM stocktake_rounds WHERE id=${roundId}::uuid FOR UPDATE`;
    if (!round || round.status !== "open") throw new Error("Không tìm thấy đợt kiểm kê đang mở");
    const [counting] = await tx`
      SELECT count(*)::int AS qty FROM stocktake_zone_counts WHERE round_id=${roundId}::uuid AND status='counting'
    `;
    if (Number(counting?.qty || 0) > 0) throw new Error("Còn khu đang kiểm kê dở; hãy Xác nhận hoặc Hủy trước khi đóng đợt");
    const [confirmed] = await tx`
      SELECT count(*)::int AS qty FROM stocktake_zone_counts WHERE round_id=${roundId}::uuid AND status='confirmed'
    `;
    if (Number(confirmed?.qty || 0) === 0) throw new Error("Đợt này chưa chốt khu nào");
    const reconciliation = await reconciliationNow(tx);
    const hasDifference = reconciliation.some((r) => Math.abs(r.difference) > 0.000001);
    const reason = String(discrepancyReason || "").trim();
    if (hasDifference && !reason) throw new Error("Tổng Kho + nhóm + Mỏ còn chênh lệch với số vỏ theo NCC; vui lòng nhập lý do trước khi đóng đợt");
    await tx`
      UPDATE stocktake_rounds SET status='closed',discrepancy_reason=${reason || null},closed_at=now(),closed_by=${profile.id}::uuid
      WHERE id=${roundId}::uuid
    `;
    await audit({ tx, actorUserId: profile.id, action: "close_round", entityType: "stocktake_round", entityId: roundId,
      after: { roundCode: round.round_code, confirmedZones: Number(confirmed?.qty || 0), reconciliation, discrepancyReason: reason || null },
      note: `Đóng đợt kiểm kê ${round.round_code}.` });
  });
}
