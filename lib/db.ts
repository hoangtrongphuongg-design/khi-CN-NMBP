import postgres from "postgres";
import { getEnv } from "@/lib/env";

const globalDb = globalThis as unknown as { __khicnSql?: ReturnType<typeof postgres> };

export const sql =
  globalDb.__khicnSql ??
  postgres(getEnv("DATABASE_URL"), {
    max: Number(process.env.DB_POOL_MAX || "3"),
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
    ssl: "require",
  });

if (process.env.NODE_ENV !== "production") globalDb.__khicnSql = sql;
