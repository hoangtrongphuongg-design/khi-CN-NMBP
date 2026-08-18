-- Bổ sung 2 nhóm còn thiếu tại Nhà máy. Có thể chạy nhiều lần.
DO $$
DECLARE
  plant_id uuid;
  g_id uuid;
BEGIN
  SELECT id INTO plant_id FROM locations WHERE code='PLANT' LIMIT 1;
  IF plant_id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy địa điểm PLANT'; END IF;

  INSERT INTO work_groups(code,name,location_id,active) VALUES ('WORKSHOP','Nhóm Workshop',plant_id,true)
  ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,location_id=EXCLUDED.location_id,active=true
  RETURNING id INTO g_id;
  INSERT INTO stock_points(code,name,kind,location_id,group_id,active) VALUES ('GRP-WORKSHOP','Nhóm Workshop','group',plant_id,g_id,true)
  ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,location_id=EXCLUDED.location_id,group_id=EXCLUDED.group_id,active=true;

  INSERT INTO work_groups(code,name,location_id,active) VALUES ('PHC','Phòng Hậu cần',plant_id,true)
  ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,location_id=EXCLUDED.location_id,active=true
  RETURNING id INTO g_id;
  INSERT INTO stock_points(code,name,kind,location_id,group_id,active) VALUES ('GRP-PHC','Phòng Hậu cần','group',plant_id,g_id,true)
  ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,location_id=EXCLUDED.location_id,group_id=EXCLUDED.group_id,active=true;
END $$;

SELECT code,name FROM work_groups WHERE code IN ('WORKSHOP','PHC') ORDER BY code;
