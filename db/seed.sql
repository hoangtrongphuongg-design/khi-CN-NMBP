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
SELECT o.id,'121/CCKCN-2026','Cung cấp các loại khí công nghiệp năm 2026','2026-03-02','2026-03-02','2027-03-01'
FROM organizations o WHERE o.code='ANHTAN'
AND NOT EXISTS (SELECT 1 FROM contracts WHERE contract_no='121/CCKCN-2026');

WITH c AS (SELECT id FROM contracts WHERE contract_no='121/CCKCN-2026' ORDER BY created_at DESC LIMIT 1)
INSERT INTO price_rules(contract_id,price_type,product_id,unit,unit_price,effective_from,effective_to,note,rule_kind)
SELECT c.id,'product',p.id,p.unit,v.price,'2026-03-02','2027-03-01','Đơn giá HĐ 121/CCKCN-2026','base'
FROM c
JOIN (VALUES
  ('O2',80000::numeric),('CO2',300000),('N2',154000),('LOX-XL45',2750000),('LIN-XL45',2850000),
  ('AR',350000),('ARCO2',450000),('DRY-CO2',48000),('LIQ-CO2',17000),('LPG45',1650000),('LPG12',440000)
) v(code,price) ON true
JOIN products p ON p.code=v.code
WHERE NOT EXISTS (
  SELECT 1 FROM price_rules pr WHERE pr.contract_id=c.id AND pr.price_type='product' AND pr.product_id=p.id AND pr.effective_from='2026-03-02'
);

WITH c AS (SELECT id FROM contracts WHERE contract_no='121/CCKCN-2026' ORDER BY created_at DESC LIMIT 1)
INSERT INTO price_rules(contract_id,price_type,unit,unit_price,effective_from,effective_to,note,rule_kind)
SELECT c.id,v.price_type,v.unit,v.price,'2026-03-02','2027-03-01','Đơn giá HĐ 121/CCKCN-2026','base'
FROM c
JOIN (VALUES
 ('trip_plant','chuyến',1600000::numeric),
 ('trip_mine','chuyến',1900000::numeric),
 ('trip_co2_liquid','chuyến',7000000::numeric),
 ('cylinder_rental_day','vỏ/ngày',2000::numeric),
 ('xl45_rental_day','bồn/ngày',150000::numeric)
) v(price_type,unit,price) ON true
WHERE NOT EXISTS (
 SELECT 1 FROM price_rules pr WHERE pr.contract_id=c.id AND pr.price_type=v.price_type AND pr.effective_from='2026-03-02'
);

COMMIT;
