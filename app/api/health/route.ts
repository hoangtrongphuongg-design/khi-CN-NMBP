import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await sql`SELECT 1 AS ok`;
    return NextResponse.json({ ok: true, app: "khicn-nmbp", database: "connected", version: "0.1.40" }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, app: "khicn-nmbp", database: "unavailable", version: "0.1.40" }, { status: 503 });
  }
}
