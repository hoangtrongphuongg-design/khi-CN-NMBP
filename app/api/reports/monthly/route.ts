import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth/session";
import { sql } from "@/lib/db";
import { getCylinderRentalDaily, summarizeCylinderRental } from "@/lib/services/costs";

function styleSheet(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true };
  row.alignment = { vertical: "middle" };
  row.height = 24;
  row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF004A8F" } }; cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, ws.columnCount) } };
}

function excelColumns(defs: Array<[string, string, number]>) {
  return defs.map(([header, key, width]) => ({ header, key, width }));
}

export async function GET(request: Request) {
  const profile = await requireProfile();
  if (["foreman","supervisor","worker"].includes(profile.role)) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") || "") ? String(url.searchParams.get("month")) : new Date().toISOString().slice(0,7);
  const start = `${month}-01`;
  const end = new Date(`${start}T00:00:00Z`); end.setUTCMonth(end.getUTCMonth()+1);
  const endDate = end.toISOString().slice(0,10);
  const locationId = url.searchParams.get("location") || null;
  const productId = url.searchParams.get("product") || null;
  const groupId = url.searchParams.get("group") || null;
  const statusFilter = url.searchParams.get("status") || null;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Quản lý khí NMBP";
  const wsSummary = wb.addWorksheet("Tổng hợp chi phí");

  const supplierClause = profile.role === "supplier" && profile.organization_id ? profile.organization_id : null;
  const deliveries = supplierClause ? await sql`
    SELECT d.delivery_date,d.delivery_code,o.name AS supplier,t.trip_code,l.name AS destination,p.name AS product,p.unit,
      di.declared_qty::float8,di.confirmed_qty::float8,di.unit_price::float8,di.line_amount::float8,di.status
    FROM supplier_delivery_items di JOIN supplier_deliveries d ON d.id=di.delivery_id JOIN organizations o ON o.id=d.supplier_org_id
    LEFT JOIN transport_trips t ON t.id=d.trip_id JOIN locations l ON l.id=di.destination_location_id JOIN products p ON p.id=di.product_id
    WHERE d.delivery_date>=${start}::date AND d.delivery_date<${endDate}::date AND d.supplier_org_id=${supplierClause}::uuid
      AND (${locationId}::uuid IS NULL OR di.destination_location_id=${locationId}::uuid)
      AND (${productId}::uuid IS NULL OR di.product_id=${productId}::uuid)
      AND (${statusFilter}::text IS NULL OR d.status=${statusFilter})
    ORDER BY d.delivery_date,d.delivery_code
  ` : await sql`
    SELECT d.delivery_date,d.delivery_code,o.name AS supplier,t.trip_code,l.name AS destination,p.name AS product,p.unit,
      di.declared_qty::float8,di.confirmed_qty::float8,di.unit_price::float8,di.line_amount::float8,di.status
    FROM supplier_delivery_items di JOIN supplier_deliveries d ON d.id=di.delivery_id JOIN organizations o ON o.id=d.supplier_org_id
    LEFT JOIN transport_trips t ON t.id=d.trip_id JOIN locations l ON l.id=di.destination_location_id JOIN products p ON p.id=di.product_id
    WHERE d.delivery_date>=${start}::date AND d.delivery_date<${endDate}::date
      AND (${locationId}::uuid IS NULL OR di.destination_location_id=${locationId}::uuid)
      AND (${productId}::uuid IS NULL OR di.product_id=${productId}::uuid)
      AND (${statusFilter}::text IS NULL OR d.status=${statusFilter})
    ORDER BY d.delivery_date,d.delivery_code
  `;
  const wsD = wb.addWorksheet("Giao NCC");
  wsD.columns = excelColumns([
    ["Ngày","delivery_date",13],["Phiếu","delivery_code",20],["NCC","supplier",26],["Mã chuyến","trip_code",22],["Điểm giao","destination",24],["Hàng hóa","product",24],["ĐVT","unit",10],["NCC khai","declared_qty",12],["Thực nhận","confirmed_qty",12],["Đơn giá","unit_price",15],["Thành tiền","line_amount",16],["Trạng thái","status",16],
  ]);
  deliveries.forEach((r:any)=>wsD.addRow(r)); styleSheet(wsD);
  wsD.getColumn("unit_price").numFmt = "#,##0"; wsD.getColumn("line_amount").numFmt = "#,##0";

  const returns = supplierClause ? await sql`
    SELECT r.return_date,r.return_code,l.name AS source,t.trip_code,p.name AS product,p.unit,ri.declared_qty::float8,ri.confirmed_qty::float8,ri.status
    FROM supplier_return_items ri JOIN supplier_returns r ON r.id=ri.supplier_return_id JOIN locations l ON l.id=r.source_location_id
    LEFT JOIN transport_trips t ON t.id=r.trip_id JOIN products p ON p.id=ri.product_id
    WHERE r.return_date>=${start}::date AND r.return_date<${endDate}::date AND r.supplier_org_id=${supplierClause}::uuid
      AND (${locationId}::uuid IS NULL OR r.source_location_id=${locationId}::uuid)
      AND (${productId}::uuid IS NULL OR ri.product_id=${productId}::uuid)
      AND (${statusFilter}::text IS NULL OR r.status=${statusFilter})
    ORDER BY r.return_date,r.return_code
  ` : await sql`
    SELECT r.return_date,r.return_code,l.name AS source,t.trip_code,p.name AS product,p.unit,ri.declared_qty::float8,ri.confirmed_qty::float8,ri.status
    FROM supplier_return_items ri JOIN supplier_returns r ON r.id=ri.supplier_return_id JOIN locations l ON l.id=r.source_location_id
    LEFT JOIN transport_trips t ON t.id=r.trip_id JOIN products p ON p.id=ri.product_id
    WHERE r.return_date>=${start}::date AND r.return_date<${endDate}::date
      AND (${locationId}::uuid IS NULL OR r.source_location_id=${locationId}::uuid)
      AND (${productId}::uuid IS NULL OR ri.product_id=${productId}::uuid)
      AND (${statusFilter}::text IS NULL OR r.status=${statusFilter})
    ORDER BY r.return_date,r.return_code
  `;
  const wsR = wb.addWorksheet("Trả vỏ NCC");
  wsR.columns = excelColumns([["Ngày","return_date",13],["Phiếu","return_code",20],["Nơi trả","source",24],["Mã chuyến","trip_code",22],["Loại vỏ","product",24],["ĐVT","unit",10],["Khai trả","declared_qty",12],["NCC nhận","confirmed_qty",12],["Trạng thái","status",16]]);
  returns.forEach((r:any)=>wsR.addRow(r)); styleSheet(wsR);

  const trips = supplierClause ? await sql`
    SELECT trip_date,trip_code,trip_kind,visits_mine,transport_unit_price::float8,transport_amount::float8,status
    FROM transport_trips t WHERE trip_date>=${start}::date AND trip_date<${endDate}::date AND supplier_org_id=${supplierClause}::uuid
      AND (${locationId}::uuid IS NULL OR EXISTS (SELECT 1 FROM supplier_deliveries d JOIN supplier_delivery_items di ON di.delivery_id=d.id WHERE d.trip_id=t.id AND di.destination_location_id=${locationId}::uuid) OR EXISTS (SELECT 1 FROM supplier_returns r WHERE r.trip_id=t.id AND r.source_location_id=${locationId}::uuid))
      AND (${productId}::uuid IS NULL OR EXISTS (SELECT 1 FROM supplier_deliveries d JOIN supplier_delivery_items di ON di.delivery_id=d.id WHERE d.trip_id=t.id AND di.product_id=${productId}::uuid) OR EXISTS (SELECT 1 FROM supplier_returns r JOIN supplier_return_items ri ON ri.supplier_return_id=r.id WHERE r.trip_id=t.id AND ri.product_id=${productId}::uuid))
    ORDER BY trip_date,trip_code
  ` : await sql`
    SELECT trip_date,trip_code,trip_kind,visits_mine,transport_unit_price::float8,transport_amount::float8,status
    FROM transport_trips t WHERE trip_date>=${start}::date AND trip_date<${endDate}::date
      AND (${locationId}::uuid IS NULL OR EXISTS (SELECT 1 FROM supplier_deliveries d JOIN supplier_delivery_items di ON di.delivery_id=d.id WHERE d.trip_id=t.id AND di.destination_location_id=${locationId}::uuid) OR EXISTS (SELECT 1 FROM supplier_returns r WHERE r.trip_id=t.id AND r.source_location_id=${locationId}::uuid))
      AND (${productId}::uuid IS NULL OR EXISTS (SELECT 1 FROM supplier_deliveries d JOIN supplier_delivery_items di ON di.delivery_id=d.id WHERE d.trip_id=t.id AND di.product_id=${productId}::uuid) OR EXISTS (SELECT 1 FROM supplier_returns r JOIN supplier_return_items ri ON ri.supplier_return_id=r.id WHERE r.trip_id=t.id AND ri.product_id=${productId}::uuid))
    ORDER BY trip_date,trip_code
  `;
  const wsT = wb.addWorksheet("Chuyến & cước");
  wsT.columns = excelColumns([["Ngày","trip_date",13],["Mã chuyến","trip_code",22],["Loại chuyến","trip_kind",16],["Có vào Mỏ","visits_mine",12],["Đơn giá cước","transport_unit_price",16],["Thành tiền","transport_amount",16],["Trạng thái","status",14]]);
  trips.forEach((r:any)=>wsT.addRow(r)); styleSheet(wsT); wsT.getColumn("transport_unit_price").numFmt="#,##0"; wsT.getColumn("transport_amount").numFmt="#,##0";

  const xl45 = await sql`
    SELECT a.return_date,p.name AS product,l.name AS location,x.delivered_date,a.quantity::float8,a.charge_days,a.rental_amount::float8
    FROM xl45_return_allocations a
    JOIN xl45_lots x ON x.id=a.xl45_lot_id
    JOIN supplier_delivery_items sdi ON sdi.id=x.delivery_item_id
    JOIN supplier_deliveries sd ON sd.id=sdi.delivery_id
    JOIN products p ON p.id=x.product_id JOIN locations l ON l.id=x.location_id
    WHERE a.return_date>=${start}::date AND a.return_date<${endDate}::date
      AND (${supplierClause}::uuid IS NULL OR sd.supplier_org_id=${supplierClause}::uuid)
      AND (${locationId}::uuid IS NULL OR x.location_id=${locationId}::uuid)
      AND (${productId}::uuid IS NULL OR x.product_id=${productId}::uuid)
    ORDER BY a.return_date,x.delivered_date
  `;

  // Thuê vỏ tính theo từng loại khí, từng ngày (vỏ-ngày).
  // Không lọc theo địa điểm/nhóm vì luân chuyển nội bộ không làm đổi tổng vỏ thuê NCC.
  const cylinderRental = await getCylinderRentalDaily({ startDate: start, endDateExclusive: endDate, productId });
  const cylinderRentalSummary = summarizeCylinderRental(cylinderRental);

  const goodsCost = deliveries.reduce((sum:number,r:any)=>sum+Number(r.line_amount || 0),0);
  const transportCost = trips.filter((r:any)=>r.status === "completed").reduce((sum:number,r:any)=>sum+Number(r.transport_amount || 0),0);
  const xl45Cost = xl45.reduce((sum:number,r:any)=>sum+Number(r.rental_amount || 0),0);
  const cylinderRentalCost = cylinderRental.reduce((sum:number,r:any)=>sum+Number(r.rental_amount || 0),0);
  wsSummary.columns = [{header:"Hạng mục",key:"item",width:34},{header:"Giá trị (VNĐ)",key:"amount",width:20}];
  wsSummary.addRows([
    {item:"Hàng hóa đã xác nhận",amount:goodsCost},
    {item:"Cước vận chuyển",amount:transportCost},
    {item:"Thuê vỏ chai (tổng vỏ-ngày theo từng loại)",amount:cylinderRentalCost},
    {item:"Phí lưu/thuê bồn XL-45 đã phát sinh",amount:xl45Cost},
    {item:"TỔNG TRƯỚC VAT",amount:goodsCost+transportCost+cylinderRentalCost+xl45Cost},
  ]);
  styleSheet(wsSummary); wsSummary.getColumn("amount").numFmt="#,##0"; wsSummary.getRow(6).font={bold:true};

  const wsRentSummary = wb.addWorksheet("Thuê vỏ - Tổng hợp");
  wsRentSummary.columns = excelColumns([
    ["Loại khí","product_name",24],
    ["Mã","product_code",12],
    ["Số vỏ ngày đầu tháng","opening_qty",20],
    ["Số vỏ ngày cuối tháng","closing_qty",20],
    ["Tổng vỏ-ngày","bottle_days",16],
    ["Đơn giá đầu kỳ","unit_price_from",18],
    ["Đơn giá cuối kỳ","unit_price_to",18],
    ["Thành tiền","rental_amount",18],
    ["Ngày thiếu đơn giá","missing_price_days",18],
  ]);
  cylinderRentalSummary.forEach((r)=>wsRentSummary.addRow(r));
  styleSheet(wsRentSummary);
  wsRentSummary.getColumn("unit_price_from").numFmt="#,##0";
  wsRentSummary.getColumn("unit_price_to").numFmt="#,##0";
  wsRentSummary.getColumn("rental_amount").numFmt="#,##0";

  const wsRentDaily = wb.addWorksheet("Thuê vỏ - Theo ngày");
  wsRentDaily.columns = excelColumns([
    ["Ngày","day",13],
    ["Loại khí","product_name",24],
    ["Mã","product_code",12],
    ["Số vỏ cuối ngày","held_qty",18],
    ["Đơn giá/vỏ/ngày","unit_price",18],
    ["Thành tiền ngày","rental_amount",18],
  ]);
  cylinderRental.forEach((r)=>wsRentDaily.addRow(r));
  styleSheet(wsRentDaily);
  wsRentDaily.getColumn("unit_price").numFmt="#,##0";
  wsRentDaily.getColumn("rental_amount").numFmt="#,##0";

  if (profile.role !== "supplier") {
    const inv = await sql`
      SELECT v.* FROM inventory_status_v v
      JOIN stock_points sp ON sp.code=v.point_code
      JOIN products pp ON pp.code=v.product_code
      WHERE (${locationId}::uuid IS NULL OR sp.location_id=${locationId}::uuid)
        AND (${productId}::uuid IS NULL OR pp.id=${productId}::uuid)
        AND (${groupId}::uuid IS NULL OR sp.group_id=${groupId}::uuid)
      ORDER BY v.point_kind,v.point_name,v.product_name
    `;
    const wsI = wb.addWorksheet("Tồn hiện tại");
    wsI.columns = excelColumns([["Vị trí/Nhóm","point_name",26],["Loại","product_name",24],["ĐVT","unit",10],["Đầy","full_qty",12],["Rỗng","empty_qty",12],["Tổng","total_qty",12],["Ngưỡng","low_threshold",12]]);
    inv.forEach((r:any)=>wsI.addRow(r)); styleSheet(wsI);

    const internal = await sql`
      SELECT ir.requested_at::date AS date,ir.request_code,ir.request_type,g.name AS group_name,p.name AS product,p.unit,ir.requested_qty::float8,ir.actual_qty::float8,ir.status,ir.note
      FROM internal_requests ir JOIN work_groups g ON g.id=ir.group_id JOIN products p ON p.id=ir.product_id
      WHERE ir.requested_at>=${start}::date AND ir.requested_at<${endDate}::date
        AND (${productId}::uuid IS NULL OR ir.product_id=${productId}::uuid)
        AND (${groupId}::uuid IS NULL OR ir.group_id=${groupId}::uuid)
        AND (${statusFilter}::text IS NULL OR ir.status=${statusFilter})
      ORDER BY ir.requested_at
    `;
    const wsN = wb.addWorksheet("Nội bộ");
    wsN.columns = excelColumns([["Ngày","date",13],["Phiếu","request_code",20],["Loại phiếu","request_type",14],["Nhóm","group_name",22],["Khí","product",22],["ĐVT","unit",9],["Yêu cầu","requested_qty",12],["Thực tế","actual_qty",12],["Trạng thái","status",18],["Ghi chú","note",28]]);
    internal.forEach((r:any)=>wsN.addRow(r)); styleSheet(wsN);

    const transfers = await sql`
      SELECT t.transfer_date,t.transfer_code,t.direction,p.name AS product,p.unit,ti.quantity::float8,ti.received_qty::float8,t.status,t.note
      FROM transfers t JOIN transfer_items ti ON ti.transfer_id=t.id JOIN products p ON p.id=ti.product_id
      WHERE t.transfer_date>=${start}::date AND t.transfer_date<${endDate}::date
        AND (${productId}::uuid IS NULL OR ti.product_id=${productId}::uuid)
        AND (${statusFilter}::text IS NULL OR t.status=${statusFilter})
      ORDER BY t.transfer_date
    `;
    const wsX = wb.addWorksheet("Điều chuyển");
    wsX.columns = excelColumns([["Ngày","transfer_date",13],["Phiếu","transfer_code",20],["Chiều","direction",20],["Khí","product",22],["ĐVT","unit",9],["Xuất","quantity",12],["Nhận","received_qty",12],["Trạng thái","status",18],["Ghi chú","note",28]]);
    transfers.forEach((r:any)=>wsX.addRow(r)); styleSheet(wsX);

    const ws45 = wb.addWorksheet("XL45 - phí lưu bồn");
    ws45.columns = excelColumns([["Ngày trả","return_date",13],["Sản phẩm","product",24],["Địa điểm","location",24],["Ngày giao","delivered_date",13],["SL bồn","quantity",10],["Ngày tính phí","charge_days",14],["Phí","rental_amount",16]]);
    xl45.forEach((r:any)=>ws45.addRow(r)); styleSheet(ws45); ws45.getColumn("rental_amount").numFmt="# ##0";
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Khi_NMBP_${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
