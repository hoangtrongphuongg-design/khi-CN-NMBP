import { sql } from "@/lib/db";

const TZ = "Asia/Ho_Chi_Minh";

function parts(date: Date) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return {
    weekday: map.weekday,
    date: `${map.year}-${map.month}-${map.day}`,
    minutes: Number(map.hour) * 60 + Number(map.minute),
  };
}

export async function isOfficeHours(date = new Date()) {
  const p = parts(date);
  const rows = await sql<{ exception_type: "holiday" | "workday" }[]>`
    SELECT exception_type FROM calendar_exceptions WHERE exception_date=${p.date}::date LIMIT 1
  `;
  if (rows[0]?.exception_type === "holiday") return false;
  const weekdayDefault = !["Sat", "Sun"].includes(p.weekday);
  const isWorkday = rows[0]?.exception_type === "workday" ? true : weekdayDefault;
  if (!isWorkday) return false;
  return p.minutes >= 7 * 60 + 30 && p.minutes <= 16 * 60 + 30;
}
