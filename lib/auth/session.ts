import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getEnv } from "@/lib/env";
import type { Profile } from "@/types/app";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "khicn_session";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, sessionVersion: number) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const ttlDays = Number(process.env.SESSION_TTL_DAYS || "7");
  const expires = new Date(Date.now() + ttlDays * 86400000);
  await sql`
    INSERT INTO user_sessions(user_id,token_hash,session_version,expires_at)
    VALUES (${userId},${tokenHash},${sessionVersion},${expires})
  `;
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroyCurrentSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await sql`DELETE FROM user_sessions WHERE token_hash=${hashToken(token)}`;
  store.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const rows = await sql<Profile[]>`
    SELECT
      u.id,u.username,u.full_name,u.role,u.group_id,COALESCE(u.location_id,g.location_id) AS location_id,u.organization_id,u.active,u.must_change_password,
      g.name AS group_name,COALESCE(l.code,gl.code) AS location_code,o.name AS organization_name
    FROM user_sessions s
    JOIN users u ON u.id=s.user_id
    LEFT JOIN work_groups g ON g.id=u.group_id
    LEFT JOIN locations l ON l.id=u.location_id
    LEFT JOIN locations gl ON gl.id=g.location_id
    LEFT JOIN organizations o ON o.id=u.organization_id
    WHERE s.token_hash=${hashToken(token)}
      AND s.expires_at>now()
      AND s.session_version=u.session_version
      AND u.active=true
    LIMIT 1
  `;
  if (!rows[0]) return null;
  await sql`UPDATE user_sessions SET last_seen_at=now() WHERE token_hash=${hashToken(token)}`;
  return rows[0];
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile as Profile;
}
