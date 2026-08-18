import bcrypt from "bcryptjs";
import postgres from "postgres";

const [usernameArg, passwordArg, ...nameParts] = process.argv.slice(2);
if (!usernameArg || !passwordArg || nameParts.length === 0) {
  console.error('Cách dùng: npm run admin:create -- <username> <password> "Họ tên Admin"');
  process.exit(1);
}
const username = usernameArg.trim().toUpperCase();
const fullName = nameParts.join(" ").trim();
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL trong .env.local");
const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
try {
  const passwordHash = await bcrypt.hash(passwordArg, 12);
  const [plant] = await sql`SELECT id FROM locations WHERE code='PLANT' LIMIT 1`;
  if (!plant) throw new Error("Chưa chạy npm run db:setup");
  await sql`
    INSERT INTO users(username,full_name,password_hash,role,location_id,active,must_change_password)
    VALUES (${username},${fullName},${passwordHash},'admin',${plant.id},true,false)
    ON CONFLICT (username) DO UPDATE SET full_name=EXCLUDED.full_name,password_hash=EXCLUDED.password_hash,role='admin',active=true,must_change_password=false,session_version=users.session_version+1,updated_at=now()
  `;
  console.log(`Đã tạo/cập nhật Admin: ${username}`);
} finally {
  await sql.end();
}
