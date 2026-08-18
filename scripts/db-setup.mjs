import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL trong .env.local");
const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
try {
  const schema = await fs.readFile(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  const seed = await fs.readFile(path.join(process.cwd(), "db", "seed.sql"), "utf8");
  await sql.unsafe(schema);
  await sql.unsafe(seed);
  console.log("Database setup hoàn tất.");
} finally {
  await sql.end();
}
