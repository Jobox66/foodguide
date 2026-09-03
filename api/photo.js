/**
 * GET /api/photo?id=<id file trên Drive>[&w=600|1200]
 *
 * Trả về ảnh quán mà bạn đã tải lên, lấy từ Google Drive.
 *
 * VÌ SAO KHÔNG TRỎ THẲNG <img> VÀO DRIVE:
 *   Link ảnh của Drive (drive.google.com/thumbnail?id=…) bị chặn tốc độ khi một
 *   trang tải hơn khoảng mười ảnh cùng lúc — đúng tình huống của trang này, nơi
 *   lưới thẻ quán có thể tới sáu chục ảnh. Đi qua endpoint này thì phản hồi được
 *   CDN của Vercel giữ ở edge một năm, nên Drive chỉ bị gọi MỘT lần cho mỗi ảnh
 *   ở mỗi khu vực; mọi lượt xem sau đó không chạm tới Google nữa.
 *
 *   Kèm theo hai cái lợi: link ảnh nằm trên domain của bạn (đổi chỗ chứa sau này
 *   không phải sửa dữ liệu đã lưu), và trang không lộ ra cấu trúc Drive.
 *
 * Endpoint này KHÔNG cần bí mật nào: file ảnh được Apps Script đặt quyền
 * "ai có link cũng xem được" ngay khi tạo, còn id thì không đoán được.
 * Việc tải ảnh LÊN đi qua /api/sheet (có token), không qua đây.
 *
 * Không có biến môi trường nào.
 */

"use strict";

// Id của Drive luôn là chữ, số, gạch ngang, gạch dưới. Chốt chặt để id không
// thể chèn thêm đường dẫn hay đổi host trong URL dựng bên dưới.
const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{10,120}$/;

// Chỉ hai bề ngang: thẻ quán và ảnh lớn trong modal chi tiết. Giới hạn danh
// sách để mỗi ảnh chỉ sinh ra hai mục cache, thay vì vô số biến thể.
const ALLOWED_WIDTHS = new Set([600, 1200]);
const DEFAULT_WIDTH = 600;

const CACHE_HEADER = "public, max-age=31536000, s-maxage=31536000, immutable";
const MAX_BYTES = 12 * 1024 * 1024;

/** Hai đường lấy ảnh từ Drive, thử lần lượt */
function buildSources(fileId, width) {
  return [
    `https://lh3.googleusercontent.com/d/${fileId}=w${width}`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`
  ];
}

async function fetchImage(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FoodguideHanoi/1.0)" },
    signal: AbortSignal.timeout(12000)
  });

  if (!res.ok) throw new Error(`Drive trả về ${res.status}`);

  // Ảnh bị xoá hoặc mất quyền xem thì Drive trả HTML chứ không báo lỗi HTTP
  const type = (res.headers.get("content-type") || "").toLowerCase();
  if (!type.startsWith("image/")) {
    res.body?.cancel?.();
    throw new Error("Drive không trả về ảnh (có thể file đã bị xoá hoặc mất quyền xem)");
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_BYTES) throw new Error("Ảnh quá lớn");

  return { buffer, type };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Chỉ hỗ trợ phương thức GET." });
  }

  const fileId = String((req.query && req.query.id) || "").trim();
  if (!DRIVE_ID_PATTERN.test(fileId)) {
    return res.status(400).json({ ok: false, error: "Thiếu hoặc sai tham số id." });
  }

  const requested = parseInt(String((req.query && req.query.w) || ""), 10);
  const width = ALLOWED_WIDTHS.has(requested) ? requested : DEFAULT_WIDTH;

  let lastError = null;
  for (const source of buildSources(fileId, width)) {
    try {
      const { buffer, type } = await fetchImage(source);

      res.setHeader("Content-Type", type);
      res.setHeader("Cache-Control", CACHE_HEADER);
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.status(200).end(buffer);
    } catch (e) {
      lastError = e;
    }
  }

  console.error("[/api/photo]", fileId, lastError && lastError.message);
  // Cache ngắn cho lỗi: ảnh vừa xoá không bị kẹt ở edge, mà lỗi lặp lại cũng
  // không dội hết về Drive
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.status(404).json({
    ok: false,
    error: "Không lấy được ảnh: " + (lastError ? lastError.message : "không rõ nguyên nhân")
  });
};
