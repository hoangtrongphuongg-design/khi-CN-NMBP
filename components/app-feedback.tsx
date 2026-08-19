"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

type ConfirmState = {
  form: HTMLFormElement;
  submitter: HTMLElement | null;
  label: string;
  danger: boolean;
} | null;

type ToastState = { tone: "success" | "danger"; message: string } | null;

function cleanLabel(text: string) {
  return text.replace(/\s+/g, " ").trim() || "thực hiện thao tác";
}

function confirmationCopy(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("xóa")) return `Bạn có chắc muốn ${normalized}? Dữ liệu đã xóa có thể không khôi phục được.`;
  if (normalized.includes("hoàn tất")) return `Xác nhận ${normalized}? Sau khi hoàn tất, số liệu nghiệp vụ sẽ được ghi nhận.`;
  if (normalized.includes("gửi")) return `Xác nhận ${normalized}? Hệ thống sẽ gửi phiếu với các số liệu đang nhập.`;
  if (normalized.includes("duyệt")) return `Xác nhận ${normalized}?`;
  if (normalized.includes("lưu") || normalized.includes("ghi")) return `Xác nhận lưu các thay đổi hiện tại?`;
  return `Bạn có chắc muốn ${normalized}?`;
}

export function AppFeedback() {
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const bypassRef = useRef<WeakSet<HTMLFormElement>>(new WeakSet());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ok = params.get("ok");
    const error = params.get("error");
    if (ok) setToast({ tone: "success", message: "Thao tác đã được lưu thành công." });
    else if (error) setToast({ tone: "danger", message: error });

    if (ok || error) {
      params.delete("ok");
      params.delete("error");
      const query = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form) return;
      if ((form.method || "get").toLowerCase() === "get") return;
      if (form.dataset.noConfirm === "true") return;
      if (bypassRef.current.has(form)) {
        bypassRef.current.delete(form);
        return;
      }

      const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
      const label = cleanLabel(submitter?.textContent || form.dataset.confirmLabel || "Xác nhận");
      const danger = /xóa|hủy|khóa/i.test(label);
      event.preventDefault();
      setConfirm({ form, submitter, label, danger });
    };

    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  function proceed() {
    if (!confirm) return;
    const { form, submitter } = confirm;
    bypassRef.current.add(form);
    setConfirm(null);
    if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) form.requestSubmit(submitter);
    else form.requestSubmit();
  }

  return (
    <>
      {confirm ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/35 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${confirm.danger ? "bg-red-50 text-[var(--danger)]" : "bg-blue-50 text-[var(--brand)]"}`}>
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="confirm-title" className="m-0 text-base font-extrabold text-[var(--brand-deep)]">Xác nhận thao tác</h2>
                <p className="mb-0 mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{confirmationCopy(confirm.label)}</p>
              </div>
              <button type="button" onClick={() => setConfirm(null)} className="rounded-lg p-1.5 text-[var(--neutral)] hover:bg-[var(--muted)]" aria-label="Đóng"><X size={18} /></button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-4 font-bold hover:bg-[var(--muted)]">Hủy</button>
              <button type="button" onClick={proceed} className={`min-h-11 rounded-xl px-4 font-bold text-white ${confirm.danger ? "bg-[var(--danger)]" : "bg-[var(--brand)] hover:bg-[var(--brand-hover)]"}`}>Xác nhận</button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed inset-x-4 top-4 z-[110] mx-auto flex max-w-md items-center gap-3 rounded-xl border bg-white p-3 shadow-lg md:left-auto md:right-5 md:top-5 md:mx-0" role="status">
          <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${toast.tone === "success" ? "bg-green-50 text-[var(--success)]" : "bg-red-50 text-[var(--danger)]"}`}>
            {toast.tone === "success" ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-extrabold uppercase tracking-wide text-[var(--muted-foreground)]">{toast.tone === "success" ? "Thành công" : "Không thành công"}</div>
            <div className="mt-0.5 text-sm font-semibold text-[var(--ink)]">{toast.message}</div>
          </div>
          <button type="button" onClick={() => setToast(null)} className="rounded-lg p-1.5 hover:bg-[var(--muted)]" aria-label="Đóng"><X size={16} /></button>
        </div>
      ) : null}
    </>
  );
}
