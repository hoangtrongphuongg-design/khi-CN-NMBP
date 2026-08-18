import nodemailer from "nodemailer";
import { sql } from "@/lib/db";
import { getOptionalEnv } from "@/lib/env";

function transporter() {
  const host = getOptionalEnv("SMTP_HOST");
  const user = getOptionalEnv("SMTP_USER");
  const pass = getOptionalEnv("SMTP_PASS");
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });
}

export async function flushEmailOutbox(limit = 10) {
  const mailer = transporter();
  if (!mailer) return { sent: 0, skipped: true };
  const items = await sql`
    SELECT id,recipient,subject,body_text FROM notification_outbox
    WHERE status IN ('pending','failed') AND attempt_count<5 ORDER BY created_at LIMIT ${limit}
  `;
  let sent = 0;
  for (const item of items) {
    try {
      await mailer.sendMail({
        from: process.env.SMTP_FROM || "Quản lý khí NMBP <no-reply@example.com>",
        to: item.recipient,
        subject: item.subject,
        text: item.body_text,
      });
      await sql`UPDATE notification_outbox SET status='sent',attempt_count=attempt_count+1,sent_at=now(),last_error=NULL WHERE id=${item.id}`;
      sent += 1;
    } catch (error) {
      await sql`UPDATE notification_outbox SET status='failed',attempt_count=attempt_count+1,last_error=${String(error).slice(0,1000)} WHERE id=${item.id}`;
    }
  }
  return { sent, skipped: false };
}
