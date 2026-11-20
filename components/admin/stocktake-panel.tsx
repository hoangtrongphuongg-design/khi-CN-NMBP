import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { formatNumber, toDateInput, toDateKey } from "@/lib/utils";

const BUCKET_LABELS: Record<string,string> = {
  full: "Đầy",
  empty: "Rỗng",
  available: "Số bồn / khả dụng",
  managed: "Tổng chai",
  unclassified: "Đầu kỳ chưa phân loại",
};

function dateTime(value: unknown) {
  if (!value) return "—";
  return new Date(String(value)).toLocaleString("vi-VN",{ timeZone:"Asia/Ho_Chi_Minh" });
}

function dateLabel(value: unknown) {
  const [y,m,d] = toDateKey(value).split("-");
  return `${d}/${m}/${y}`;
}

function diffLabel(value: number) {
  if (Math.abs(value) < 0.000001) return "0";
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

export function StocktakePanel({ data }: { data: any }) {
  if (data.missingSchema) {
    return <Card><CardTitle>Kiểm kê từng khu</CardTitle><div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-[#92400E]">Chức năng chưa sẵn sàng: cần chạy file NEON_SQL/23_KIEM_KE_TUNG_KHU.sql trên Neon một lần.</div></Card>;
  }
  const round = data.openRound as any | null;
  const points = data.points as any[];
  const zoneByPoint = new Map((data.zones as any[]).map((z:any)=>[String(z.stock_point_id),z]));
  const confirmedCount = (data.zones as any[]).filter((z:any)=>z.status === "confirmed").length;
  const countingZones = (data.zones as any[]).filter((z:any)=>z.status === "counting");
  const reconciliation = data.reconciliation as any[];
  const hasDifference = reconciliation.some((r:any)=>Math.abs(Number(r.difference || 0)) > 0.000001);
  // Dòng tổng chỉ cộng vỏ chai khí CN; XL-45/LPG khác đơn vị nên không cộng chung.
  const cylinderRows = reconciliation.filter((r:any)=>r.cylinder_rental_eligible);
  const sumOf = (field: string) => cylinderRows.reduce((s:number,r:any)=>s+Number(r[field] || 0),0);
  const isLive = data.state?.mode === "live";

  return <div className="grid gap-4">
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Kiểm kê từng khu</CardTitle>
          <p className="mt-1 max-w-3xl text-sm text-[var(--muted-foreground)]">Đếm lần lượt Mỏ, Kho Hậu cần và từng nhóm vào các ngày khác nhau. Khi Bắt đầu một khu, web chụp lại số máy; số đếm được điều chỉnh so với số chụp đó nên các phiếu phát sinh trong lúc đếm vẫn giữ nguyên. Có thể mở đợt mới nhiều lần khi cần kiểm kê lại.</p>
        </div>
        {round ? <Badge tone="info">Đợt {round.round_code} · {confirmedCount}/{points.length} khu đã chốt</Badge> : <Badge tone="neutral">Chưa có đợt đang mở</Badge>}
      </div>

      {!round ? <form action="/api/admin/stocktake" method="post" className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto] md:items-end">
        <input type="hidden" name="action" value="open_round"/>
        <FormField label="Ngày bắt đầu đợt"><Input name="start_date" type="date" defaultValue={toDateInput()} max={toDateInput()} required/></FormField>
        <FormField label="Ghi chú"><Input name="note" placeholder="Ví dụ: Kiểm kê định kỳ quý IV"/></FormField>
        <Button type="submit">Mở đợt kiểm kê</Button>
        {!isLive ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-[#92400E] md:col-span-3">Hệ thống đang ở chế độ Hồi nhập lịch sử. Mở đợt này sẽ chuyển sang Vận hành chính thức từ ngày bắt đầu đợt: từ đó Phiếu giao/trả NCC cập nhật tồn thật. Cần hoàn tất mọi Phiếu giao/trả NCC trước ngày bắt đầu.</div> : null}
      </form> : <div className="mt-3 text-sm text-[var(--muted-foreground)]">Bắt đầu từ {dateLabel(round.start_date)} · người mở: {round.created_by_name || "Admin"}{round.note ? ` · ${round.note}` : ""}</div>}
    </Card>

    <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] p-4 md:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle>Đối chiếu số vỏ: vận hành trên web ↔ NCC cho thuê (tính đến hôm nay)</CardTitle><p className="mt-1 max-w-4xl text-xs text-[var(--muted-foreground)]">Tổng vận hành = Kho Hậu cần (đầy + rỗng + bồn/khác) + các nhóm + Mỏ. NCC cho thuê = số dư đầu kỳ + NCC giao − trả NCC. Chênh lệch dương: trên web nhiều hơn NCC; âm: thiếu chai hoặc còn nhóm chưa kiểm kê.</p></div><Badge tone={hasDifference ? "warning" : "success"}>{hasDifference ? "Còn chênh lệch" : "Khớp số vỏ"}</Badge></div></div>
      <div className="overflow-x-auto"><table className="mobile-card-table w-full text-sm">
        <thead className="bg-[var(--muted)]"><tr><th className="p-3 text-left">Loại</th><th className="p-3 text-right">Kho đầy</th><th className="p-3 text-right">Kho rỗng</th><th className="p-3 text-right">Kho khác</th><th className="p-3 text-right">Các nhóm</th><th className="p-3 text-right">Mỏ</th><th className="p-3 text-right">Tổng vận hành</th><th className="p-3 text-right">NCC cho thuê</th><th className="p-3 text-right">Chênh lệch</th></tr></thead>
        <tbody>{reconciliation.map((row:any)=><tr key={row.product_id} className={`border-t border-[var(--border)] ${Math.abs(Number(row.difference || 0)) > 0.000001 ? "bg-amber-50" : ""}`}>
          <td data-label="Loại" className="p-3"><strong>{row.product_name}</strong><div className="text-xs text-[var(--muted-foreground)]">{row.unit}</div></td>
          <td data-label="Kho đầy" className="p-3 text-right font-mono-data">{formatNumber(row.warehouse_full)}</td>
          <td data-label="Kho rỗng" className="p-3 text-right font-mono-data">{formatNumber(row.warehouse_empty)}</td>
          <td data-label="Kho khác" className="p-3 text-right font-mono-data">{formatNumber(row.warehouse_other)}</td>
          <td data-label="Các nhóm" className="p-3 text-right font-mono-data">{formatNumber(row.groups_qty)}</td>
          <td data-label="Mỏ" className="p-3 text-right font-mono-data">{formatNumber(row.mine_qty)}</td>
          <td data-label="Tổng vận hành" className="p-3 text-right font-mono-data font-bold">{formatNumber(row.system_qty)}</td>
          <td data-label="NCC cho thuê" className="p-3 text-right font-mono-data font-bold">{formatNumber(row.supplier_qty)}</td>
          <td data-label="Chênh lệch" className="p-3 text-right font-mono-data font-extrabold">{diffLabel(Number(row.difference || 0))}</td>
        </tr>)}</tbody>
        {cylinderRows.length ? <tfoot><tr className="border-t-2 border-[var(--brand)] bg-[var(--paper)] font-extrabold">
          <td className="p-3">Tổng vỏ chai khí công nghiệp<div className="text-xs font-normal text-[var(--muted-foreground)]">Không gồm XL-45, LPG</div></td>
          <td data-label="Kho đầy" className="p-3 text-right font-mono-data">{formatNumber(sumOf("warehouse_full"))}</td>
          <td data-label="Kho rỗng" className="p-3 text-right font-mono-data">{formatNumber(sumOf("warehouse_empty"))}</td>
          <td data-label="Kho khác" className="p-3 text-right font-mono-data">{formatNumber(sumOf("warehouse_other"))}</td>
          <td data-label="Các nhóm" className="p-3 text-right font-mono-data">{formatNumber(sumOf("groups_qty"))}</td>
          <td data-label="Mỏ" className="p-3 text-right font-mono-data">{formatNumber(sumOf("mine_qty"))}</td>
          <td data-label="Tổng vận hành" className="p-3 text-right font-mono-data">{formatNumber(sumOf("system_qty"))}</td>
          <td data-label="NCC cho thuê" className="p-3 text-right font-mono-data">{formatNumber(sumOf("supplier_qty"))}</td>
          <td data-label="Chênh lệch" className="p-3 text-right font-mono-data">{diffLabel(sumOf("difference"))}</td>
        </tr></tfoot> : null}
      </table></div>
    </Card>

    {round ? <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] p-4 md:p-5"><CardTitle>1. Các khu trong đợt</CardTitle><p className="mt-1 text-xs text-[var(--muted-foreground)]">Trước khi Bắt đầu, khu phải xử lý hết phiếu dở dang (Đổi/Mượn/Trả chưa xử lý, Phiếu giao NCC chưa hoàn tất, điều chuyển chưa xong). Khu không cần đếm lại thì bỏ qua.</p></div>
      <div className="overflow-x-auto"><table className="mobile-card-table w-full text-sm">
        <thead className="bg-[var(--muted)]"><tr><th className="p-3 text-left">Khu</th><th className="p-3 text-left">Trạng thái</th><th className="p-3 text-left">Bắt đầu</th><th className="p-3 text-left">Chốt</th><th className="p-3 text-right">Đếm − máy</th><th className="p-3 text-left">Thao tác</th></tr></thead>
        <tbody>{points.map((point:any)=>{
          const zone = zoneByPoint.get(String(point.id)) as any;
          return <tr key={point.id} className="border-t border-[var(--border)]">
            <td data-label="Khu" className="p-3"><strong>{point.name}</strong>{point.group_code === "COI" ? <div className="text-xs text-[var(--muted-foreground)]">Mỏ Tà Thiết</div> : null}</td>
            <td data-label="Trạng thái" className="p-3">{!zone ? <Badge tone="neutral">Chưa kiểm kê</Badge> : zone.status === "counting" ? <Badge tone="warning">Đang đếm</Badge> : <Badge tone="success">Đã chốt</Badge>}</td>
            <td data-label="Bắt đầu" className="p-3 text-xs">{zone ? <>{dateTime(zone.started_at)}<div className="text-[var(--muted-foreground)]">{zone.started_by_name || ""}</div></> : "—"}</td>
            <td data-label="Chốt" className="p-3 text-xs">{zone?.confirmed_at ? <>{dateTime(zone.confirmed_at)}<div className="text-[var(--muted-foreground)]">{zone.confirmed_by_name || ""}</div></> : "—"}</td>
            <td data-label="Đếm − máy" className="p-3 text-right font-mono-data font-bold">{zone?.status === "confirmed" ? diffLabel(Number(zone.difference || 0)) : "—"}</td>
            <td data-label="Thao tác" className="p-3">{!zone ? <form action="/api/admin/stocktake" method="post"><input type="hidden" name="action" value="start_zone"/><input type="hidden" name="stock_point_id" value={point.id}/><Button type="submit" variant="secondary">Bắt đầu kiểm kê</Button></form> : zone.status === "counting" ? <a href={`#zone-${zone.id}`} className="font-bold text-[var(--brand)]">Nhập số đếm ↓</a> : <span className="text-xs text-[var(--muted-foreground)]">Muốn đếm lại: mở đợt mới</span>}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </Card> : null}

    {countingZones.map((zone:any)=>{
      const point = points.find((p:any)=>String(p.id) === String(zone.stock_point_id));
      const items = (data.countingItems as any[]).filter((i:any)=>String(i.zone_count_id) === String(zone.id));
      return <Card key={zone.id} id={`zone-${zone.id}`} className="overflow-hidden p-0">
        <div className="border-b border-[var(--border)] p-4 md:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>2. Nhập số đếm · {point?.name}</CardTitle><Badge tone="warning">Bắt đầu {dateTime(zone.started_at)}</Badge></div><p className="mt-1 text-xs text-[var(--muted-foreground)]">Nhập số chai/bồn thực tế đếm được. "Số máy lúc bắt đầu" là số web đang ghi nhận khi bấm Bắt đầu.</p></div>
        <form action="/api/admin/stocktake" method="post" className="grid gap-4">
          <input type="hidden" name="action" value="confirm_zone"/><input type="hidden" name="zone_id" value={zone.id}/>
          <div className="overflow-x-auto"><table className="mobile-card-table w-full text-sm">
            <thead className="bg-[var(--muted)]"><tr><th className="p-3 text-left">Loại</th><th className="p-3 text-left">Phân loại</th><th className="p-3 text-right">Số máy lúc bắt đầu</th><th className="p-3 text-right">Số đếm thực tế</th></tr></thead>
            <tbody>{items.map((item:any)=><tr key={`${item.product_id}-${item.bucket}`} className="border-t border-[var(--border)]">
              <td data-label="Loại" className="p-3"><strong>{item.product_name}</strong><div className="text-xs text-[var(--muted-foreground)]">{item.unit}</div></td>
              <td data-label="Phân loại" className="p-3">{BUCKET_LABELS[item.bucket] || item.bucket}</td>
              <td data-label="Số máy lúc bắt đầu" className="p-3 text-right font-mono-data">{formatNumber(Number(item.system_qty_at_start || 0))}</td>
              <td data-label="Số đếm thực tế" className="p-3 md:w-44">{item.bucket === "unclassified" ? <span className="text-xs text-[var(--muted-foreground)]">Tự đưa về 0 khi chốt Kho</span> : <Input aria-label={`${item.product_name} ${BUCKET_LABELS[item.bucket] || item.bucket}`} name={`count__${item.product_id}__${item.bucket}`} type="number" min="0" step="1" placeholder="Nhập SL" required/>}</td>
            </tr>)}</tbody>
          </table></div>
          <div className="grid gap-3 px-4 pb-4 md:px-5">
            <FormField label="Ghi chú"><Input name="note" placeholder="Ví dụ: Người đếm, người chứng kiến"/></FormField>
            <label className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-[#B91C1C]"><input className="mt-1" type="checkbox" name="confirm" value="yes" required/><span>Tôi xác nhận số đếm là số thực tế của {point?.name}. Tồn của khu sẽ được điều chỉnh theo số đếm và lưu Audit.</span></label>
            <div className="flex flex-wrap gap-2"><Button type="submit" variant="danger">Xác nhận chốt {point?.name}</Button></div>
          </div>
        </form>
        <form action="/api/admin/stocktake" method="post" className="border-t border-[var(--border)] px-4 py-3 md:px-5"><input type="hidden" name="action" value="cancel_zone"/><input type="hidden" name="zone_id" value={zone.id}/><Button type="submit" variant="ghost">Hủy kiểm kê khu này</Button></form>
      </Card>;
    })}

    {round ? <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] p-4 md:p-5"><CardTitle>3. Đóng đợt kiểm kê</CardTitle><p className="mt-1 text-xs text-[var(--muted-foreground)]">Xem bảng "Đối chiếu số vỏ" phía trên trước khi đóng đợt.</p></div>
      <form action="/api/admin/stocktake" method="post" className="grid gap-3 p-4 md:p-5">
        <input type="hidden" name="action" value="close_round"/><input type="hidden" name="round_id" value={round.id}/>
        <FormField label="Lý do chênh lệch" hint={hasDifference ? "Bắt buộc khi còn chênh lệch với số vỏ NCC" : "Không bắt buộc khi đã khớp"}><Input name="discrepancy_reason" placeholder="Ví dụ: còn 2 chai O₂ đang xác minh với NCC" required={hasDifference}/></FormField>
        <label className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3 text-sm font-semibold"><input className="mt-1" type="checkbox" name="confirm" value="yes" required/><span>Đóng đợt {round.round_code} với {confirmedCount} khu đã chốt. Khu chưa kiểm kê giữ nguyên số đang có.</span></label>
        <div><Button type="submit">Đóng đợt kiểm kê</Button></div>
      </form>
    </Card> : null}

    {(data.history as any[]).length ? <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] p-4 md:p-5"><CardTitle>Lịch sử các đợt kiểm kê</CardTitle><p className="mt-1 text-xs text-[var(--muted-foreground)]">Chi tiết số máy, số đếm và điều chỉnh của từng khu được lưu trong Audit.</p></div>
      <div className="overflow-x-auto"><table className="mobile-card-table w-full text-sm">
        <thead className="bg-[var(--muted)]"><tr><th className="p-3 text-left">Đợt</th><th className="p-3 text-left">Bắt đầu</th><th className="p-3 text-left">Đóng</th><th className="p-3 text-right">Khu đã chốt</th><th className="p-3 text-left">Lý do chênh lệch</th></tr></thead>
        <tbody>{(data.history as any[]).map((r:any)=><tr key={r.id} className="border-t border-[var(--border)]">
          <td data-label="Đợt" className="p-3 font-mono-data font-bold">{r.round_code}{r.note ? <div className="font-sans text-xs font-normal text-[var(--muted-foreground)]">{r.note}</div> : null}</td>
          <td data-label="Bắt đầu" className="p-3">{dateLabel(r.start_date)}</td>
          <td data-label="Đóng" className="p-3 text-xs">{dateTime(r.closed_at)}<div className="text-[var(--muted-foreground)]">{r.closed_by_name || ""}</div></td>
          <td data-label="Khu đã chốt" className="p-3 text-right font-mono-data">{r.confirmed_zones}</td>
          <td data-label="Lý do chênh lệch" className="p-3">{r.discrepancy_reason || "Khớp số vỏ"}</td>
        </tr>)}</tbody>
      </table></div>
    </Card> : null}
  </div>;
}
