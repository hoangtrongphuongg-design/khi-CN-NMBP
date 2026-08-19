import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
}

export function formatCurrency(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
}

export function toDateInput(value: Date | string = new Date()) {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}


/** Normalize PostgreSQL DATE / JS Date / ISO-ish values to YYYY-MM-DD in VN timezone. */
export function toDateKey(value: unknown) {
  if (value instanceof Date) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(value);
  }
  const raw = String(value ?? "").trim();
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(parsed);
  }
  throw new Error(`Ngày nghiệp vụ không hợp lệ: ${raw || "(trống)"}`);
}
