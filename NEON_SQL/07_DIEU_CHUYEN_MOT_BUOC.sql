-- ============================================================
-- V1.0.11 - CHUYỂN ĐỔI PHIẾU ĐIỀU CHUYỂN CŨ SANG CƠ CHẾ 1 BƯỚC
-- Chỉ cần chạy 1 lần nếu trước đây có phiếu "Đang vận chuyển".
-- ============================================================

BEGIN;

DO $$
DECLARE
  r record;
  v_transit uuid;
  v_wh uuid;
  v_mine uuid;
  v_before numeric;
  v_after numeric;
BEGIN
  SELECT id INTO v_transit FROM stock_points WHERE code='TRANSIT' LIMIT 1;
  SELECT id INTO v_wh FROM stock_points WHERE code='WH-PHC' LIMIT 1;
  SELECT sp.id INTO v_mine
  FROM stock_points sp
  JOIN work_groups g ON g.id=sp.group_id
  WHERE g.code='COI'
  LIMIT 1;

  IF v_wh IS NULL OR v_mine IS NULL THEN
    RAISE EXCEPTION 'Thiếu điểm tồn WH-PHC hoặc Nhóm Cối/Mỏ';
  END IF;

  IF v_transit IS NOT NULL THEN
    FOR r IN
      SELECT
        t.id AS transfer_id,
        t.direction,
        t.created_by,
        ti.id AS item_id,
        ti.product_id,
        ti.quantity
      FROM transfers t
      JOIN transfer_items ti ON ti.transfer_id=t.id
      WHERE t.status='in_transit'
      ORDER BY t.created_at
    LOOP
      SELECT COALESCE(qty,0) INTO v_before
      FROM stock_balances
      WHERE stock_point_id=v_transit
        AND product_id=r.product_id
        AND bucket='transit'
      FOR UPDATE;

      IF COALESCE(v_before,0) < r.quantity THEN
        RAISE EXCEPTION 'Tồn TRANSIT không đủ cho phiếu %', r.transfer_id;
      END IF;

      v_after := v_before - r.quantity;

      UPDATE stock_balances
      SET qty=v_after, updated_at=now()
      WHERE stock_point_id=v_transit
        AND product_id=r.product_id
        AND bucket='transit';

      INSERT INTO stock_ledger(
        stock_point_id,product_id,bucket,delta,balance_after,
        reference_type,reference_id,note,occurred_at,created_by
      ) VALUES (
        v_transit,r.product_id,'transit',-r.quantity,v_after,
        'transfer_legacy_close',r.transfer_id,
        'Chuyển đổi V1.0.11 - bỏ tồn Đang vận chuyển',now(),r.created_by
      );

      IF r.direction='plant_to_mine' THEN
        SELECT COALESCE(qty,0) INTO v_before
        FROM stock_balances
        WHERE stock_point_id=v_mine
          AND product_id=r.product_id
          AND bucket='managed'
        FOR UPDATE;

        v_after := COALESCE(v_before,0) + r.quantity;

        INSERT INTO stock_balances(stock_point_id,product_id,bucket,qty,updated_at)
        VALUES (v_mine,r.product_id,'managed',v_after,now())
        ON CONFLICT (stock_point_id,product_id,bucket)
        DO UPDATE SET qty=EXCLUDED.qty,updated_at=now();

        INSERT INTO stock_ledger(
          stock_point_id,product_id,bucket,delta,balance_after,
          reference_type,reference_id,note,occurred_at,created_by
        ) VALUES (
          v_mine,r.product_id,'managed',r.quantity,v_after,
          'transfer_legacy_close',r.transfer_id,
          'Chuyển đổi V1.0.11 - tự cộng Mỏ',now(),r.created_by
        );
      ELSE
        SELECT COALESCE(qty,0) INTO v_before
        FROM stock_balances
        WHERE stock_point_id=v_wh
          AND product_id=r.product_id
          AND bucket='empty'
        FOR UPDATE;

        v_after := COALESCE(v_before,0) + r.quantity;

        INSERT INTO stock_balances(stock_point_id,product_id,bucket,qty,updated_at)
        VALUES (v_wh,r.product_id,'empty',v_after,now())
        ON CONFLICT (stock_point_id,product_id,bucket)
        DO UPDATE SET qty=EXCLUDED.qty,updated_at=now();

        INSERT INTO stock_ledger(
          stock_point_id,product_id,bucket,delta,balance_after,
          reference_type,reference_id,note,occurred_at,created_by
        ) VALUES (
          v_wh,r.product_id,'empty',r.quantity,v_after,
          'transfer_legacy_close',r.transfer_id,
          'Chuyển đổi V1.0.11 - tự cộng vỏ rỗng Kho',now(),r.created_by
        );
      END IF;

      UPDATE transfer_items
      SET received_qty=quantity
      WHERE id=r.item_id;

      UPDATE transfers
      SET status='completed',
          received_at=COALESCE(received_at,now()),
          feedback=NULL
      WHERE id=r.transfer_id;
    END LOOP;

    UPDATE stock_points sp
    SET active=false
    WHERE sp.id=v_transit
      AND NOT EXISTS (
        SELECT 1
        FROM stock_balances sb
        WHERE sb.stock_point_id=sp.id
          AND sb.qty<>0
      );
  END IF;

  UPDATE transfers
  SET status='completed',
      feedback=NULL
  WHERE status='received_pending_review';
END $$;

COMMIT;

SELECT status, count(*) AS so_phieu
FROM transfers
GROUP BY status
ORDER BY status;

SELECT p.code,p.name,sb.qty
FROM stock_balances sb
JOIN stock_points sp ON sp.id=sb.stock_point_id
JOIN products p ON p.id=sb.product_id
WHERE sp.code='TRANSIT'
  AND sb.qty<>0
ORDER BY p.display_order;
