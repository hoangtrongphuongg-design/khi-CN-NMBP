import { Badge } from "@/components/ui/badge";

const map: Record<string, { label: string; tone: "info"|"warning"|"danger"|"success"|"neutral" }> = {
  pending: { label: "Chờ xử lý", tone: "warning" },
  xsc_confirmed: { label: "XSC đã xác nhận", tone: "info" },
  phc_pending: { label: "Chờ PHC xác nhận", tone: "warning" },
  approved: { label: "Đã duyệt", tone: "info" },
  in_transit: { label: "Đang vận chuyển", tone: "info" },
  executed_pending_review: { label: "Đã thực hiện · Chờ hậu kiểm", tone: "info" },
  received_pending_review: { label: "Đã nhận · Chờ hậu kiểm", tone: "info" },
  feedback: { label: "Có phản hồi", tone: "danger" },
  confirmed: { label: "Đã xác nhận", tone: "success" },
  completed: { label: "Hoàn tất", tone: "success" },
  rejected: { label: "Từ chối", tone: "danger" },
  cancelled: { label: "Đã hủy", tone: "neutral" },
  open: { label: "Đang mở", tone: "info" },
};

export function StatusBadge({ status }: { status: string }) {
  const item = map[status] || { label: status, tone: "neutral" as const };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}
