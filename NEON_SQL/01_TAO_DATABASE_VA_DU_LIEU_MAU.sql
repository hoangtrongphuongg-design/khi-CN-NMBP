-- ============================================================
-- QUẢN LÝ KHÍ NMBP - NEON SETUP
-- Chạy trực tiếp trong Neon > SQL Editor
-- File này tạo cấu trúc database và dữ liệu danh mục ban đầu.
-- Có thể chạy trên database mới/trống.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('internal','supplier')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('plant','mine')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  location_id uuid NOT NULL REFERENCES locations(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  full_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN (
    'admin','workshop','warehouse_manager','storekeeper','mine_xsc',
    'foreman','supervisor','worker','management_board','supplier'
  )),
  group_id uuid REFERENCES work_groups(id),
  location_id uuid REFERENCES locations(id),
  organization_id uuid REFERENCES organizations(id),
  email text,
  active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  session_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_group_idx ON users(group_id);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
CREATE UNIQUE INDEX IF NOT EXISTS users_one_foreman_per_group_idx ON users(group_id) WHERE role='foreman' AND active=true;
CREATE UNIQUE INDEX IF NOT EXISTS users_one_supervisor_per_group_idx ON users(group_id) WHERE role='supervisor' AND active=true;

CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  session_version integer NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expiry_idx ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  specification text,
  unit text NOT NULL,
  returnable_container boolean NOT NULL DEFAULT false,
  warehouse_split_full_empty boolean NOT NULL DEFAULT false,
  internal_group_tracking boolean NOT NULL DEFAULT false,
  cylinder_rental_eligible boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS supplier_container_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  opening_date date NOT NULL,
  qty numeric(14,3) NOT NULL CHECK (qty >= 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id,opening_date)
);

CREATE TABLE IF NOT EXISTS group_norms (
  group_id uuid NOT NULL REFERENCES work_groups(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  norm_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK (norm_qty >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id),
  PRIMARY KEY (group_id, product_id)
);

CREATE TABLE IF NOT EXISTS stock_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('warehouse','group','transit')),
  location_id uuid REFERENCES locations(id),
  group_id uuid UNIQUE REFERENCES work_groups(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_balances (
  stock_point_id uuid NOT NULL REFERENCES stock_points(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  bucket text NOT NULL CHECK (bucket IN ('full','empty','unclassified','managed','available','transit')),
  qty numeric(14,3) NOT NULL DEFAULT 0 CHECK (qty >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stock_point_id, product_id, bucket)
);

CREATE TABLE IF NOT EXISTS stock_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_point_id uuid NOT NULL REFERENCES stock_points(id),
  product_id uuid NOT NULL REFERENCES products(id),
  bucket text NOT NULL CHECK (bucket IN ('full','empty','unclassified','managed','available','transit')),
  delta numeric(14,3) NOT NULL,
  balance_after numeric(14,3) NOT NULL,
  reference_type text NOT NULL,
  reference_id uuid,
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS stock_ledger_ref_idx ON stock_ledger(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS stock_ledger_point_product_idx ON stock_ledger(stock_point_id, product_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_org_id uuid REFERENCES organizations(id),
  contract_no text NOT NULL,
  contract_name text,
  signed_date date,
  valid_from date NOT NULL,
  valid_to date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS contracts_supplier_no_uq ON contracts(supplier_org_id,contract_no);

CREATE TABLE IF NOT EXISTS price_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES contracts(id),
  price_type text NOT NULL CHECK (price_type IN (
    'product','trip_plant','trip_mine','trip_co2_liquid','cylinder_rental_day','xl45_rental_day'
  )),
  product_id uuid REFERENCES products(id),
  unit text NOT NULL,
  unit_price numeric(16,2) NOT NULL CHECK (unit_price >= 0),
  effective_from date NOT NULL,
  effective_to date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),
  CHECK ((price_type = 'product' AND product_id IS NOT NULL) OR (price_type <> 'product')),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS price_rules_lookup_idx ON price_rules(price_type, product_id, effective_from DESC);
CREATE UNIQUE INDEX IF NOT EXISTS price_rules_product_effective_uq ON price_rules(product_id,effective_from) WHERE price_type='product';
CREATE UNIQUE INDEX IF NOT EXISTS price_rules_nonproduct_effective_uq ON price_rules(price_type,effective_from) WHERE price_type<>'product';

CREATE TABLE IF NOT EXISTS transport_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_code text NOT NULL UNIQUE,
  trip_date date NOT NULL,
  supplier_org_id uuid REFERENCES organizations(id),
  visits_plant boolean NOT NULL DEFAULT true,
  visits_mine boolean NOT NULL DEFAULT false,
  co2_liquid_special boolean NOT NULL DEFAULT false,
  trip_kind text NOT NULL CHECK (trip_kind IN ('plant','mine','co2_liquid')),
  price_rule_id uuid REFERENCES price_rules(id),
  transport_unit_price numeric(16,2) NOT NULL DEFAULT 0,
  transport_amount numeric(16,2) NOT NULL DEFAULT 0,
  note text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS transport_trips_date_idx ON transport_trips(trip_date DESC);

CREATE TABLE IF NOT EXISTS supplier_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_code text NOT NULL UNIQUE,
  trip_id uuid REFERENCES transport_trips(id),
  supplier_org_id uuid NOT NULL REFERENCES organizations(id),
  delivery_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','feedback','phc_pending','completed','cancelled')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id),
  phc_confirmed_by uuid REFERENCES users(id),
  phc_confirmed_at timestamptz
);

CREATE TABLE IF NOT EXISTS supplier_delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES supplier_deliveries(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  destination_location_id uuid NOT NULL REFERENCES locations(id),
  declared_qty numeric(14,3) NOT NULL CHECK (declared_qty > 0),
  confirmed_qty numeric(14,3),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','xsc_confirmed','confirmed','feedback')),
  feedback text,
  price_rule_id uuid REFERENCES price_rules(id),
  unit_price numeric(16,2),
  line_amount numeric(16,2),
  confirmed_by uuid REFERENCES users(id),
  confirmed_at timestamptz,
  UNIQUE(delivery_id, product_id, destination_location_id)
);

CREATE TABLE IF NOT EXISTS xl45_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_item_id uuid NOT NULL UNIQUE REFERENCES supplier_delivery_items(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  location_id uuid NOT NULL REFERENCES locations(id),
  delivered_date date NOT NULL,
  qty_received numeric(14,3) NOT NULL CHECK (qty_received > 0),
  qty_outstanding numeric(14,3) NOT NULL CHECK (qty_outstanding >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS xl45_lots_open_idx ON xl45_lots(product_id,location_id,delivered_date) WHERE qty_outstanding>0;

CREATE TABLE IF NOT EXISTS supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_code text NOT NULL UNIQUE,
  trip_id uuid REFERENCES transport_trips(id),
  supplier_org_id uuid NOT NULL REFERENCES organizations(id),
  return_date date NOT NULL,
  source_location_id uuid NOT NULL REFERENCES locations(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','feedback','completed','cancelled')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id),
  supplier_confirmed_by uuid REFERENCES users(id),
  supplier_confirmed_at timestamptz
);

CREATE TABLE IF NOT EXISTS supplier_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_return_id uuid NOT NULL REFERENCES supplier_returns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  declared_qty numeric(14,3) NOT NULL CHECK (declared_qty > 0),
  confirmed_qty numeric(14,3),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','feedback')),
  feedback text,
  UNIQUE(supplier_return_id, product_id)
);

CREATE TABLE IF NOT EXISTS internal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_code text NOT NULL UNIQUE,
  request_type text NOT NULL CHECK (request_type IN ('exchange','borrow','return')),
  group_id uuid NOT NULL REFERENCES work_groups(id),
  product_id uuid NOT NULL REFERENCES products(id),
  requested_qty numeric(14,3) NOT NULL CHECK (requested_qty > 0),
  actual_qty numeric(14,3),
  return_bucket text CHECK (return_bucket IN ('full','empty')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid NOT NULL REFERENCES users(id),
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','approved','executed_pending_review','feedback','completed','rejected','cancelled'
  )),
  approval_mode text CHECK (approval_mode IN ('office_hours','after_hours','not_required')),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  executed_by uuid REFERENCES users(id),
  executed_at timestamptz,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS internal_requests_status_idx ON internal_requests(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS internal_requests_group_idx ON internal_requests(group_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS internal_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_request_id uuid NOT NULL REFERENCES internal_requests(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  requested_qty numeric(14,3) NOT NULL CHECK (requested_qty > 0),
  actual_qty numeric(14,3) CHECK (actual_qty >= 0),
  return_bucket text CHECK (return_bucket IN ('full','empty')),
  line_status text NOT NULL DEFAULT 'pending' CHECK (line_status IN ('pending','executed')),
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(internal_request_id, product_id)
);
CREATE INDEX IF NOT EXISTS internal_request_items_request_idx ON internal_request_items(internal_request_id, created_at);

CREATE TABLE IF NOT EXISTS transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_code text NOT NULL UNIQUE,
  direction text NOT NULL CHECK (direction IN ('plant_to_mine','mine_to_plant')),
  transfer_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_transit','received_pending_review','feedback','completed','cancelled')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id),
  dispatched_by uuid REFERENCES users(id),
  dispatched_at timestamptz,
  received_by uuid REFERENCES users(id),
  received_at timestamptz,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  feedback text
);

CREATE TABLE IF NOT EXISTS transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  source_bucket text NOT NULL CHECK (source_bucket IN ('full','empty','managed')),
  received_qty numeric(14,3),
  UNIQUE(transfer_id, product_id, source_bucket)
);

CREATE TABLE IF NOT EXISTS xl45_return_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_return_item_id uuid NOT NULL REFERENCES supplier_return_items(id) ON DELETE CASCADE,
  xl45_lot_id uuid NOT NULL REFERENCES xl45_lots(id),
  return_date date NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity>0),
  charge_days integer NOT NULL DEFAULT 0 CHECK (charge_days>=0),
  rental_amount numeric(16,2) NOT NULL DEFAULT 0 CHECK (rental_amount>=0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_exceptions (
  exception_date date PRIMARY KEY,
  exception_type text NOT NULL CHECK (exception_type IN ('holiday','workday')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS low_stock_thresholds (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  threshold_qty numeric(14,3) NOT NULL CHECK (threshold_qty >= 0),
  recipient_email text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS low_stock_states (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  is_low boolean NOT NULL DEFAULT false,
  last_triggered_at timestamptz,
  last_recovered_at timestamptz,
  last_qty numeric(14,3)
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'email',
  recipient text NOT NULL,
  subject text NOT NULL,
  body_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx ON notification_outbox(status, created_at);

-- Mốc kiểm kê chuyển đổi từ hồi nhập lịch sử sang vận hành chính thức.
CREATE TABLE IF NOT EXISTS inventory_cutovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stocktake_date date NOT NULL,
  go_live_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  note text,
  discrepancy_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  finalized_by uuid REFERENCES users(id),
  CHECK (go_live_date > stocktake_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_cutovers_one_draft_uq ON inventory_cutovers(status) WHERE status='draft';
CREATE UNIQUE INDEX IF NOT EXISTS inventory_cutovers_one_finalized_uq ON inventory_cutovers(status) WHERE status='finalized';

CREATE TABLE IF NOT EXISTS inventory_cutover_items (
  cutover_id uuid NOT NULL REFERENCES inventory_cutovers(id) ON DELETE CASCADE,
  stock_point_id uuid NOT NULL REFERENCES stock_points(id),
  product_id uuid NOT NULL REFERENCES products(id),
  bucket text NOT NULL CHECK (bucket IN ('full','empty','available','managed')),
  counted_qty numeric(14,3) NOT NULL CHECK (counted_qty >= 0),
  PRIMARY KEY (cutover_id,stock_point_id,product_id,bucket)
);
CREATE INDEX IF NOT EXISTS inventory_cutover_items_product_idx ON inventory_cutover_items(cutover_id,product_id);

CREATE TABLE IF NOT EXISTS system_operation_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),
  mode text NOT NULL DEFAULT 'historical_import' CHECK (mode IN ('historical_import','live')),
  active_cutover_id uuid REFERENCES inventory_cutovers(id),
  stocktake_date date,
  go_live_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);
INSERT INTO system_operation_state(id,mode) VALUES (1,'historical_import') ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS adjustment_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_code text NOT NULL UNIQUE,
  original_reference_type text NOT NULL,
  original_reference_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs(actor_user_id, created_at DESC);

CREATE OR REPLACE VIEW inventory_status_v AS
SELECT
  sp.code AS point_code,
  sp.name AS point_name,
  sp.kind AS point_kind,
  p.code AS product_code,
  p.name AS product_name,
  p.unit,
  COALESCE(MAX(CASE WHEN sb.bucket = 'full' THEN sb.qty END), 0)::numeric AS full_qty,
  COALESCE(MAX(CASE WHEN sb.bucket = 'empty' THEN sb.qty END), 0)::numeric AS empty_qty,
  COALESCE(MAX(CASE WHEN sb.bucket = 'unclassified' THEN sb.qty END), 0)::numeric AS unclassified_qty,
  CASE
    WHEN sp.kind = 'warehouse' AND p.warehouse_split_full_empty THEN
      (COALESCE(MAX(CASE WHEN sb.bucket = 'full' THEN sb.qty END), 0)
       + COALESCE(MAX(CASE WHEN sb.bucket = 'empty' THEN sb.qty END), 0)
       + COALESCE(MAX(CASE WHEN sb.bucket = 'unclassified' THEN sb.qty END), 0))::numeric
    WHEN sp.kind = 'group' THEN COALESCE(MAX(CASE WHEN sb.bucket = 'managed' THEN sb.qty END), 0)::numeric
    WHEN sp.kind = 'transit' THEN COALESCE(MAX(CASE WHEN sb.bucket = 'transit' THEN sb.qty END), 0)::numeric
    ELSE COALESCE(MAX(CASE WHEN sb.bucket = 'available' THEN sb.qty END), 0)::numeric
  END AS total_qty,
  lst.threshold_qty AS low_threshold
FROM stock_points sp
CROSS JOIN products p
LEFT JOIN stock_balances sb ON sb.stock_point_id = sp.id AND sb.product_id = p.id
LEFT JOIN low_stock_thresholds lst ON lst.product_id = p.id AND sp.kind = 'warehouse' AND lst.enabled
WHERE sp.active AND p.active AND (
  (sp.kind IN ('warehouse','transit') AND p.returnable_container)
  OR (sp.kind='group' AND p.internal_group_tracking)
  OR (sp.kind='group' AND sp.code='GRP-COI' AND p.returnable_container)
)
GROUP BY sp.code, sp.name, sp.kind, p.code, p.name, p.unit, p.warehouse_split_full_empty, lst.threshold_qty;

COMMIT;


-- ==================== DỮ LIỆU MẪU ====================

BEGIN;

INSERT INTO organizations(code,name,kind) VALUES
  ('NMBP','Nhà máy Xi măng Bình Phước','internal'),
  ('ANHTAN','Công ty TNHH Anh Tân','supplier')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, active = true;

INSERT INTO locations(code,name,kind) VALUES
  ('PLANT','Nhà máy Xi măng Bình Phước','plant'),
  ('MINE','Mỏ đá Tà Thiết','mine')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, active = true;

INSERT INTO work_groups(code,name,location_id)
SELECT v.code, v.name, l.id
FROM (VALUES
  ('COI','Nhóm Cối','MINE'),
  ('CBL','Nhóm CBL','PLANT'),
  ('NBS-NT','Nhóm NBS-NT','PLANT'),
  ('LO','Nhóm Lò','PLANT'),
  ('NXM','Nhóm NXM','PLANT'),
  ('NHA-THAU','Nhà thầu','PLANT')
) AS v(code,name,location_code)
JOIN locations l ON l.code = v.location_code
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, location_id = EXCLUDED.location_id, active = true;

INSERT INTO products(code,name,category,specification,unit,returnable_container,warehouse_split_full_empty,internal_group_tracking,cylinder_rental_eligible,display_order) VALUES
  ('O2','Oxy – O₂','Khí công nghiệp','6 m³/chai','chai',true,true,true,true,10),
  ('CO2','CO₂','Khí công nghiệp','20–25 kg/chai','chai',true,true,true,true,20),
  ('N2','Nitơ – N₂','Khí công nghiệp','6 m³/chai','chai',true,true,true,true,30),
  ('AR','Argon – Ar','Khí công nghiệp','Chai 40 lít, 120–150 bar','chai',true,true,true,true,40),
  ('ARCO2','Khí trộn Ar/CO₂','Khí công nghiệp','Khí hàn hỗn hợp','chai',true,true,true,true,50),
  ('LOX-XL45','Oxy lỏng – LOX','Khí lỏng','Bồn XL-45, 170 kg','bồn',true,false,false,false,60),
  ('LIN-XL45','Nitơ lỏng – LIN','Khí lỏng','Bồn XL-45, 125 kg','bồn',true,false,false,false,70),
  ('DRY-CO2','Đá khô CO₂','CO₂ rắn','Theo khối lượng','kg',false,false,false,false,80),
  ('LIQ-CO2','CO₂ lỏng','CO₂ lỏng','Theo khối lượng','kg',false,false,false,false,90),
  ('LPG45','Gas LPG 45 kg','LPG','45 kg/chai','chai',true,true,true,false,100),
  ('LPG12','Gas LPG 12 kg','LPG','12 kg/chai','chai',true,true,true,false,110)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  specification = EXCLUDED.specification,
  unit = EXCLUDED.unit,
  returnable_container = EXCLUDED.returnable_container,
  warehouse_split_full_empty = EXCLUDED.warehouse_split_full_empty,
  internal_group_tracking = EXCLUDED.internal_group_tracking,
  cylinder_rental_eligible = EXCLUDED.cylinder_rental_eligible,
  display_order = EXCLUDED.display_order,
  active = true;

INSERT INTO stock_points(code,name,kind,location_id)
SELECT 'WH-PHC','Kho Hậu cần','warehouse',id FROM locations WHERE code='PLANT'
ON CONFLICT (code) DO NOTHING;

INSERT INTO stock_points(code,name,kind,active)
VALUES ('SYS-HISTORY-NCC','Lịch sử NCC - không phải tồn vật lý','transit',false)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,kind='transit',active=false;


INSERT INTO stock_points(code,name,kind,location_id,group_id)
SELECT 'GRP-'||g.code, g.name, 'group', g.location_id, g.id
FROM work_groups g
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, location_id = EXCLUDED.location_id, group_id = EXCLUDED.group_id, active = true;

-- Hợp đồng nguyên tắc Anh Tân 2026
INSERT INTO contracts(supplier_org_id,contract_no,contract_name,signed_date,valid_from,valid_to)
SELECT o.id,'121/CCKCN-2026','Cung cấp các loại khí công nghiệp năm 2026','2026-01-01','2026-01-01','2026-12-31'
FROM organizations o WHERE o.code='ANHTAN'
AND NOT EXISTS (SELECT 1 FROM contracts WHERE contract_no='121/CCKCN-2026');

WITH c AS (SELECT id FROM contracts WHERE contract_no='121/CCKCN-2026' ORDER BY created_at DESC LIMIT 1)
INSERT INTO price_rules(contract_id,price_type,product_id,unit,unit_price,effective_from,effective_to,note)
SELECT c.id,'product',p.id,p.unit,v.price,'2026-01-01','2026-12-31','Đơn giá HĐ 121/CCKCN-2026'
FROM c
JOIN (VALUES
  ('O2',80000::numeric),('CO2',300000),('N2',154000),('LOX-XL45',2750000),('LIN-XL45',2850000),
  ('AR',350000),('ARCO2',450000),('DRY-CO2',48000),('LIQ-CO2',17000),('LPG45',1650000),('LPG12',440000)
) v(code,price) ON true
JOIN products p ON p.code=v.code
WHERE NOT EXISTS (
  SELECT 1 FROM price_rules pr WHERE pr.contract_id=c.id AND pr.price_type='product' AND pr.product_id=p.id AND pr.effective_from='2026-01-01'
);

WITH c AS (SELECT id FROM contracts WHERE contract_no='121/CCKCN-2026' ORDER BY created_at DESC LIMIT 1)
INSERT INTO price_rules(contract_id,price_type,unit,unit_price,effective_from,effective_to,note)
SELECT c.id,v.price_type,v.unit,v.price,'2026-01-01','2026-12-31','Đơn giá HĐ 121/CCKCN-2026'
FROM c
JOIN (VALUES
 ('trip_plant','chuyến',1600000::numeric),
 ('trip_mine','chuyến',1900000::numeric),
 ('trip_co2_liquid','chuyến',7000000::numeric),
 ('cylinder_rental_day','vỏ/ngày',2000::numeric),
 ('xl45_rental_day','bồn/ngày',150000::numeric)
) v(price_type,unit,price) ON true
WHERE NOT EXISTS (
 SELECT 1 FROM price_rules pr WHERE pr.contract_id=c.id AND pr.price_type=v.price_type AND pr.effective_from='2026-01-01'
);


-- Số dư đầu kỳ 01/01/2026 kế thừa nợ vỏ cuối năm 2025.
-- 107 chai khí công nghiệp tính thuê; LPG chỉ quản lý tồn, không tính thuê vỏ.
INSERT INTO supplier_container_opening_balances(product_id,opening_date,qty,note)
SELECT p.id,DATE '2026-01-01',v.qty,'Số dư nợ vỏ đầu kỳ 2026'
FROM (VALUES
  ('O2',71::numeric),('ARCO2',16::numeric),('N2',8::numeric),('CO2',10::numeric),('AR',2::numeric),
  ('LPG12',15::numeric),('LPG45',8::numeric)
) v(code,qty)
JOIN products p ON p.code=v.code
ON CONFLICT(product_id,opening_date) DO NOTHING;

-- Đồng thời ghi nhận là tồn vật lý Kho Hậu cần đầu kỳ chưa phân loại đầy/rỗng.
INSERT INTO stock_balances(stock_point_id,product_id,bucket,qty,updated_at)
SELECT sp.id,p.id,'unclassified',v.qty,now()
FROM stock_points sp
JOIN (VALUES
  ('O2',71::numeric),('ARCO2',16::numeric),('N2',8::numeric),('CO2',10::numeric),('AR',2::numeric),
  ('LPG12',15::numeric),('LPG45',8::numeric)
) v(code,qty) ON true
JOIN products p ON p.code=v.code
WHERE sp.code='WH-PHC'
ON CONFLICT(stock_point_id,product_id,bucket) DO NOTHING;

INSERT INTO stock_ledger(stock_point_id,product_id,bucket,delta,balance_after,reference_type,reference_id,note,occurred_at,created_by)
SELECT sp.id,p.id,'unclassified',v.qty,v.qty,'opening_balance_2026',NULL,
       'Tồn đầu kỳ Kho Hậu cần chưa phân loại đầy/rỗng',
       (DATE '2026-01-01' + TIME '00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',NULL
FROM stock_points sp
JOIN (VALUES
  ('O2',71::numeric),('ARCO2',16::numeric),('N2',8::numeric),('CO2',10::numeric),('AR',2::numeric),
  ('LPG12',15::numeric),('LPG45',8::numeric)
) v(code,qty) ON true
JOIN products p ON p.code=v.code
WHERE sp.code='WH-PHC'
  AND NOT EXISTS (
    SELECT 1 FROM stock_ledger sl
    WHERE sl.stock_point_id=sp.id AND sl.product_id=p.id AND sl.reference_type='opening_balance_2026'
  );


COMMIT;
