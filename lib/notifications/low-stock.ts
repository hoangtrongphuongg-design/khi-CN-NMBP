import { sql } from "@/lib/db";
import { flushEmailOutbox } from "@/lib/notifications/email";

/**
 * Kiểm tra tồn chai ĐẦY tại Kho Hậu cần.
 * Mỗi chu kỳ tồn thấp chỉ tạo đúng 1 email:
 *   trên ngưỡng -> chạm/thấp hơn ngưỡng = tạo email
 *   vẫn thấp = không tạo thêm
 *   tăng lại trên ngưỡng = reset chu kỳ
 * Dòng low_stock_states được khóa trong transaction để tránh gửi trùng khi nhiều giao dịch xảy ra đồng thời.
 */
export async function checkLowStock(productId: string) {
  let triggered = false;

  await sql.begin(async (tx) => {
    const rows = await tx`
      SELECT p.name,p.unit,t.threshold_qty,t.recipient_email,t.enabled,
        COALESCE(sb.qty,0)::float8 AS full_qty,
        COALESCE(su.qty,0)::float8 AS unclassified_qty
      FROM products p
      JOIN low_stock_thresholds t ON t.product_id=p.id
      JOIN stock_points sp ON sp.code='WH-PHC' AND sp.active=true
      LEFT JOIN stock_balances sb ON sb.stock_point_id=sp.id AND sb.product_id=p.id AND sb.bucket='full'
      LEFT JOIN stock_balances su ON su.stock_point_id=sp.id AND su.product_id=p.id AND su.bucket='unclassified'
      WHERE p.id=${productId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row || !row.enabled) return;

    const qty = Number(row.full_qty || 0);
    const unclassifiedQty = Number(row.unclassified_qty || 0);
    const threshold = Number(row.threshold_qty || 0);

    // Khi còn số dư đầu kỳ chưa phân loại đầy/rỗng, chưa đủ cơ sở để phát cảnh báo "tồn đầy thấp".
    // Chỉ bắt đầu chu kỳ cảnh báo sau khi phần đầu kỳ của sản phẩm đó đã được xử lý hết.
    if (unclassifiedQty > 0) {
      await tx`
        INSERT INTO low_stock_states(product_id,is_low,last_qty)
        VALUES (${productId}::uuid,false,${qty})
        ON CONFLICT(product_id)
        DO UPDATE SET is_low=false,last_qty=EXCLUDED.last_qty
      `;
      return;
    }
    const isLow = qty <= threshold;

    // Bảo đảm có state rồi khóa state đó trong cùng transaction.
    await tx`
      INSERT INTO low_stock_states(product_id,is_low,last_qty)
      VALUES (${productId}::uuid,false,${qty})
      ON CONFLICT(product_id) DO NOTHING
    `;
    const [state] = await tx`
      SELECT is_low FROM low_stock_states WHERE product_id=${productId}::uuid FOR UPDATE
    `;
    const wasLow = Boolean(state?.is_low);

    if (isLow && !wasLow) {
      await tx`
        UPDATE low_stock_states
        SET is_low=true,last_triggered_at=now(),last_qty=${qty}
        WHERE product_id=${productId}::uuid
      `;
      await tx`
        INSERT INTO notification_outbox(recipient,subject,body_text)
        VALUES (
          ${row.recipient_email},
          ${`[Cảnh báo tồn khí] ${row.name} còn ${qty} ${row.unit}`},
          ${`Loại khí: ${row.name}\nTồn chai đầy hiện tại: ${qty} ${row.unit}\nNgưỡng cảnh báo: ${threshold} ${row.unit}\nThời điểm: ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}\n\nHệ thống chỉ gửi 1 email cho mỗi chu kỳ tồn thấp.`}
        )
      `;
      triggered = true;
    } else if (!isLow && wasLow) {
      await tx`
        UPDATE low_stock_states
        SET is_low=false,last_recovered_at=now(),last_qty=${qty}
        WHERE product_id=${productId}::uuid
      `;
    } else {
      await tx`UPDATE low_stock_states SET last_qty=${qty} WHERE product_id=${productId}::uuid`;
    }
  });

  // Gửi ngoài transaction. Nếu SMTP chưa cấu hình, mail vẫn nằm trong outbox.
  if (triggered) await flushEmailOutbox(5);
  return { triggered };
}
