-- V1.0.40 - QUẢN LÝ ĐƠN GIÁ THEO THÁNG / KHOẢNG NGÀY
-- Yêu cầu: Database đang chạy đã cập nhật đến các SQL lịch sử hiện tại (SQL 19).
-- Mục tiêu:
--   1) Giá gốc HĐ là nền mặc định.
--   2) Giá điều chỉnh chỉ có hiệu lực Từ ngày -> Đến ngày, bắt buộc trong cùng một tháng.
--   3) Ngoài khoảng điều chỉnh tự quay về giá HĐ.
--   4) Khóa bảng giá theo tháng; mở khóa bắt buộc qua ứng dụng + Audit.
--   5) Không cho hợp đồng của cùng NCC chồng thời gian hiệu lực.
-- Script không xóa giao dịch, không xóa snapshot giá cũ.

BEGIN;

-- 1. Phân loại rule: base / adjustment / legacy.
ALTER TABLE price_rules ADD COLUMN IF NOT EXISTS rule_kind text;

UPDATE price_rules SET rule_kind='legacy' WHERE rule_kind IS NULL;

-- Rule trùng ngày bắt đầu HĐ và kéo đến hết HĐ (hoặc đang để NULL) được nhận diện là giá gốc.
UPDATE price_rules pr
SET rule_kind='base'
FROM contracts c
WHERE pr.contract_id=c.id
  AND pr.effective_from=c.valid_from
  AND (pr.effective_to IS NULL OR c.valid_to IS NULL OR pr.effective_to=c.valid_to);

-- Chuẩn hóa ngày kết thúc giá gốc theo ngày hết hiệu lực HĐ nếu trước đây đang NULL.
UPDATE price_rules pr
SET effective_to=c.valid_to
FROM contracts c
WHERE pr.contract_id=c.id
  AND pr.rule_kind='base'
  AND pr.effective_to IS NULL
  AND c.valid_to IS NOT NULL;

ALTER TABLE price_rules ALTER COLUMN rule_kind SET DEFAULT 'legacy';
ALTER TABLE price_rules ALTER COLUMN rule_kind SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='price_rules_rule_kind_chk') THEN
    ALTER TABLE price_rules ADD CONSTRAINT price_rules_rule_kind_chk CHECK (rule_kind IN ('base','adjustment','legacy'));
  END IF;
END $$;

-- Chỉ số unique cũ không biết contract/rule_kind, không phù hợp khi base và adjustment có thể cùng ngày.
DROP INDEX IF EXISTS price_rules_product_effective_uq;
DROP INDEX IF EXISTS price_rules_nonproduct_effective_uq;

CREATE UNIQUE INDEX IF NOT EXISTS price_rules_base_product_uq
  ON price_rules(contract_id,product_id)
  WHERE rule_kind='base' AND price_type='product' AND contract_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS price_rules_base_service_uq
  ON price_rules(contract_id,price_type)
  WHERE rule_kind='base' AND price_type<>'product' AND contract_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS price_rules_adjustment_product_from_uq
  ON price_rules(contract_id,product_id,effective_from)
  WHERE rule_kind='adjustment' AND price_type='product' AND contract_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS price_rules_adjustment_service_from_uq
  ON price_rules(contract_id,price_type,effective_from)
  WHERE rule_kind='adjustment' AND price_type<>'product' AND contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS price_rules_contract_kind_lookup_idx
  ON price_rules(contract_id,rule_kind,price_type,product_id,effective_from,effective_to);

-- 2. Trạng thái khóa bảng giá theo tháng.
CREATE TABLE IF NOT EXISTS price_month_locks (
  contract_id uuid NOT NULL REFERENCES contracts(id),
  month_start date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked')),
  locked_at timestamptz,
  locked_by uuid REFERENCES users(id),
  unlocked_at timestamptz,
  unlocked_by uuid REFERENCES users(id),
  unlock_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(contract_id,month_start),
  CHECK (month_start=date_trunc('month',month_start)::date)
);

-- 3. Không cho 2 hợp đồng của cùng NCC chồng thời gian hiệu lực.
CREATE OR REPLACE FUNCTION validate_contract_date_overlap()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE conflict_no text;
BEGIN
  IF NEW.active THEN
    SELECT c.contract_no INTO conflict_no
    FROM contracts c
    WHERE c.supplier_org_id=NEW.supplier_org_id
      AND c.active=true
      AND c.id<>NEW.id
      AND daterange(c.valid_from,COALESCE(c.valid_to,DATE '9999-12-31'),'[]')
          && daterange(NEW.valid_from,COALESCE(NEW.valid_to,DATE '9999-12-31'),'[]')
    LIMIT 1;
    IF conflict_no IS NOT NULL THEN
      RAISE EXCEPTION 'Thời hạn hợp đồng bị chồng với hợp đồng % của cùng NCC',conflict_no;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_no_date_overlap ON contracts;
CREATE TRIGGER contracts_no_date_overlap
BEFORE INSERT OR UPDATE OF supplier_org_id,valid_from,valid_to,active ON contracts
FOR EACH ROW EXECUTE FUNCTION validate_contract_date_overlap();

-- 4. Kiểm tra khoảng giá điều chỉnh: trong HĐ, cùng tháng, không chồng nhau cho cùng hạng mục.
CREATE OR REPLACE FUNCTION validate_price_adjustment_range()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c_from date; c_to date; overlap_id uuid;
BEGIN
  IF NEW.rule_kind<>'adjustment' THEN RETURN NEW; END IF;
  IF NEW.contract_id IS NULL THEN RAISE EXCEPTION 'Giá điều chỉnh phải gắn hợp đồng'; END IF;
  IF NEW.effective_to IS NULL THEN RAISE EXCEPTION 'Giá điều chỉnh phải có Đến ngày'; END IF;
  IF date_trunc('month',NEW.effective_from)<>date_trunc('month',NEW.effective_to) THEN
    RAISE EXCEPTION 'Một giá điều chỉnh chỉ được nằm trong cùng một tháng';
  END IF;
  SELECT valid_from,COALESCE(valid_to,DATE '9999-12-31') INTO c_from,c_to FROM contracts WHERE id=NEW.contract_id;
  IF c_from IS NULL THEN RAISE EXCEPTION 'Hợp đồng không tồn tại'; END IF;
  IF NEW.effective_from<c_from OR NEW.effective_to>c_to THEN
    RAISE EXCEPTION 'Khoảng giá điều chỉnh nằm ngoài thời hạn hợp đồng';
  END IF;

  SELECT id INTO overlap_id
  FROM price_rules x
  WHERE x.rule_kind='adjustment'
    AND x.contract_id=NEW.contract_id
    AND x.price_type=NEW.price_type
    AND x.product_id IS NOT DISTINCT FROM NEW.product_id
    AND x.id<>NEW.id
    AND daterange(x.effective_from,x.effective_to,'[]') && daterange(NEW.effective_from,NEW.effective_to,'[]')
  LIMIT 1;
  IF overlap_id IS NOT NULL THEN
    RAISE EXCEPTION 'Khoảng giá điều chỉnh bị chồng với một khoảng đã có';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS price_rules_validate_adjustment ON price_rules;
CREATE TRIGGER price_rules_validate_adjustment
BEFORE INSERT OR UPDATE OF contract_id,price_type,product_id,effective_from,effective_to,rule_kind ON price_rules
FOR EACH ROW EXECUTE FUNCTION validate_price_adjustment_range();

-- 5. Khóa ở DB: tháng LOCKED không được thay rule base/adjustment nếu chưa mở khóa.
CREATE OR REPLACE FUNCTION prevent_locked_price_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r_contract uuid; r_from date; r_to date; r_kind text; locked_month date;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    r_contract:=OLD.contract_id; r_from:=OLD.effective_from; r_to:=COALESCE(OLD.effective_to,DATE '9999-12-31'); r_kind:=OLD.rule_kind;
    IF r_contract IS NOT NULL AND r_kind IN ('base','adjustment') THEN
      SELECT month_start INTO locked_month FROM price_month_locks
      WHERE contract_id=r_contract AND status='locked'
        AND month_start BETWEEN date_trunc('month',r_from)::date AND date_trunc('month',r_to)::date
      LIMIT 1;
      IF locked_month IS NOT NULL THEN RAISE EXCEPTION 'Bảng giá tháng % đã khóa',to_char(locked_month,'MM/YYYY'); END IF;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') THEN
    r_contract:=NEW.contract_id; r_from:=NEW.effective_from; r_to:=COALESCE(NEW.effective_to,DATE '9999-12-31'); r_kind:=NEW.rule_kind;
    IF r_contract IS NOT NULL AND r_kind IN ('base','adjustment') THEN
      SELECT month_start INTO locked_month FROM price_month_locks
      WHERE contract_id=r_contract AND status='locked'
        AND month_start BETWEEN date_trunc('month',r_from)::date AND date_trunc('month',r_to)::date
      LIMIT 1;
      IF locked_month IS NOT NULL THEN RAISE EXCEPTION 'Bảng giá tháng % đã khóa',to_char(locked_month,'MM/YYYY'); END IF;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS price_rules_locked_guard ON price_rules;
CREATE TRIGGER price_rules_locked_guard
BEFORE INSERT OR UPDATE OR DELETE ON price_rules
FOR EACH ROW EXECUTE FUNCTION prevent_locked_price_mutation();

COMMIT;

-- KIỂM TRA SAU KHI CHẠY
SELECT rule_kind,count(*) FROM price_rules GROUP BY rule_kind ORDER BY rule_kind;
SELECT c.contract_no,c.valid_from,c.valid_to,o.name AS supplier
FROM contracts c JOIN organizations o ON o.id=c.supplier_org_id
ORDER BY c.valid_from;
SELECT * FROM price_month_locks ORDER BY month_start DESC;
