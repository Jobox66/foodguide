/**
 * GET /api/place?url=<link Google Maps>[&hint=<tên quán người dùng dán kèm>]
 *
 * Chạy trên Vercel Serverless Function (Node.js runtime, không cần cài thư viện).
 *
 * NHIỆM VỤ DUY NHẤT: đi theo redirect của link rút gọn (maps.app.goo.gl /
 * share.google / goo.gl) rồi bóc tên quán + toạ độ ra khỏi URL đích.
 *
 * Vì sao phải có máy chủ cho việc này: trình duyệt không tự đi theo redirect
 * sang google.com được (CORS chặn), nên link rút gọn dán vào form luôn ra rỗng.
 * Máy chủ không bị giới hạn đó.
 *
 * VÌ SAO KHÔNG GỌI GOOGLE PLACES API:
 *   Places API (New) nằm trong danh sách "Google Maps Core Services", và điều
 *   khoản Maps Platform §3.2.1(v) cấm phân phối tại Prohibited Territory những
 *   ứng dụng dùng Core Services. Việt Nam nằm trong danh sách đó
 *   (cloud.google.com/maps-platform/terms/maps-prohibited-territories).
 *   Ràng buộc này gắn với ứng dụng và nơi phân phối, không phải loại tài khoản,
 *   nên tài khoản trả phí cũng không gỡ được. Số sao và lượt đánh giá vì vậy
 *   được nhập tay trong giao diện.
 *
 * Địa chỉ và quận do phía client tra qua Nominatim (OpenStreetMap) từ toạ độ
 * mà endpoint này trả về — miễn phí và không vướng ràng buộc lãnh thổ.
 *
 * Biến môi trường:
 *   ALLOWED_ORIGINS  (tuỳ chọn) danh sách origin cách nhau bởi dấu phẩy được
 *                    phép gọi. Bỏ trống = chỉ cho phép cùng origin.
 */

"use strict";

// ─── Chống SSRF: chỉ cho phép fetch đúng các domain của Google Maps ───────────
// Không có danh sách này thì ai cũng có thể biến endpoint thành proxy để quét
// mạng nội bộ hoặc metadata endpoint của nhà cung cấp hạ tầng.
const ALLOWED_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "share.google",
  "g.co",
  "maps.google.com",
  "www.google.com",
  "google.com",
  "maps.google.com.vn",
  "www.google.com.vn"
]);

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ─── Giới hạn tần suất (best-effort) ─────────────────────────────────────────
// Serverless instance sống ngắn nên bộ nhớ này không bền, chỉ chặn được
// trường hợp bị gọi dồn dập. Muốn chắc chắn thì phải dùng Vercel KV / Redis.
const RATE_LIMIT_MAX = 30;          // số request
const RATE_LIMIT_WINDOW_MS = 60000; // trong mỗi phút
const rateBuckets = new Map();

function isRateLimited(clientIp) {
  const now = Date.now();
  const bucket = rateBuckets.get(clientIp);

  if (!bucket || now - bucket.startedAt > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(clientIp, { startedAt: now, count: 1 });
    return false;
  }

  bucket.count++;
  if (rateBuckets.size > 5000) rateBuckets.clear(); // chặn phình bộ nhớ
  return bucket.count > RATE_LIMIT_MAX;
}

// ─── Bóc dữ liệu từ URL Google Maps ──────────────────────────────────────────

function decodeMapsSegment(segment) {
  let out = String(segment).replace(/\+/g, " ");
  for (let i = 0; i < 2 && /%[0-9A-Fa-f]{2}/.test(out); i++) {
    try {
      out = decodeURIComponent(out);
    } catch {
      break;
    }
    out = out.replace(/\+/g, " ");
  }
  return out.trim();
}

function parseMapsUrl(url) {
  const result = { name: "", address: "", lat: null, lng: null };
  if (!url) return result;

  const placeMatch = url.match(/\/maps\/place\/([^/@?#]+)/);
  if (placeMatch) {
    const decoded = decodeMapsSegment(placeMatch[1]);
    const parts = decoded.split(",");
    result.name = parts[0].trim();
    if (parts.length > 1) result.address = parts.slice(1).join(",").trim();
  }

  if (!result.name) {
    const queryMatch = url.match(/[?&](?:q|query)=([^&#]+)/);
    if (queryMatch) {
      const decoded = decodeMapsSegment(queryMatch[1]);
      if (!/^-?[\d.]+\s*,\s*-?[\d.]+$/.test(decoded)) {
        const parts = decoded.split(",");
        result.name = parts[0].trim();
        if (parts.length > 1) result.address = parts.slice(1).join(",").trim();
      }
    }
  }

  // !3d/!4d là toạ độ CỦA QUÁN; @lat,lng chỉ là tâm khung nhìn nên kém chính xác hơn
  const exact = url.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/);
  const viewport = url.match(/@(-?[\d.]+),(-?[\d.]+)/);
  const coord = exact || viewport;
  if (coord) {
    const lat = parseFloat(coord[1]);
    const lng = parseFloat(coord[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      result.lat = lat;
      result.lng = lng;
    }
  }

  return result;
}

/** Đi theo redirect để lấy URL Google Maps đầy đủ */
async function resolveMapsUrl(inputUrl) {
  const res = await fetch(inputUrl, {
    redirect: "follow",
    headers: { "User-Agent": BROWSER_UA, "Accept-Language": "vi,en;q=0.8" },
    signal: AbortSignal.timeout(10000)
  });

  const finalUrl = res.url || inputUrl;

  // URL đích thường đã đủ tên + toạ độ, khỏi cần đọc thân phản hồi
  if (/\/maps\/place\//.test(finalUrl)) {
    res.body?.cancel?.();
    return { finalUrl, html: "" };
  }

  // Dự phòng: một số link chỉ lộ đường dẫn place bên trong HTML
  const html = (await res.text()).slice(0, 400000);
  return { finalUrl, html };
}

function extractPlacePathFromHtml(html) {
  const hit = html.match(/\/maps\/place\/[^"'\\<>\s]{3,300}/);
  return hit ? "https://www.google.com" + hit[0] : "";
}

// ─── Kiểm soát truy cập ──────────────────────────────────────────────────────

function resolveCorsOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return null; // cùng origin hoặc gọi trực tiếp — không cần header CORS

  const allowList = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (allowList.length === 0) return null;
  if (allowList.includes("*")) return "*";
  return allowList.includes(origin) ? origin : false; // false = từ chối
}

// ─── Handler ─────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  const corsOrigin = resolveCorsOrigin(req);

  if (corsOrigin === false) {
    return res.status(403).json({ ok: false, error: "Origin không được phép gọi endpoint này." });
  }
  if (corsOrigin) {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Chỉ hỗ trợ phương thức GET." });
  }

  // Kiểm tra sức khoẻ: cho giao diện biết máy chủ đã chạy chưa
  if (req.query.health !== undefined) {
    return res.status(200).json({ ok: true, service: "maps-link-resolver" });
  }

  const clientIp =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  if (isRateLimited(clientIp)) {
    return res.status(429).json({ ok: false, error: "Bạn gọi quá nhanh, thử lại sau một phút." });
  }

  const rawUrl = String(req.query.url || "").trim();
  const hint = String(req.query.hint || "").trim().slice(0, 200);

  if (!rawUrl) {
    return res.status(400).json({ ok: false, error: "Thiếu tham số url." });
  }

  let parsedInput;
  try {
    parsedInput = new URL(rawUrl);
  } catch {
    return res.status(400).json({ ok: false, error: "URL không hợp lệ." });
  }

  if (parsedInput.protocol !== "https:" && parsedInput.protocol !== "http:") {
    return res.status(400).json({ ok: false, error: "Chỉ chấp nhận link http/https." });
  }
  if (!ALLOWED_HOSTS.has(parsedInput.hostname)) {
    return res.status(400).json({
      ok: false,
      error: `Chỉ chấp nhận link Google Maps. Domain "${parsedInput.hostname}" không nằm trong danh sách cho phép.`
    });
  }

  const notes = [];
  const found = { name: "", address: "", lat: null, lng: null, mapsUrl: rawUrl };

  try {
    let resolvedUrl = rawUrl;
    try {
      const { finalUrl, html } = await resolveMapsUrl(rawUrl);
      resolvedUrl = finalUrl;

      let info = parseMapsUrl(resolvedUrl);
      if (!info.name && html) {
        const fromHtml = extractPlacePathFromHtml(html);
        if (fromHtml) info = parseMapsUrl(fromHtml);
      }

      found.name = info.name;
      found.address = info.address;
      found.lat = info.lat;
      found.lng = info.lng;
      found.mapsUrl = resolvedUrl;
    } catch (e) {
      notes.push("không giải mã được link: " + e.message);
      const info = parseMapsUrl(rawUrl);
      found.name = info.name;
      found.lat = info.lat;
      found.lng = info.lng;
    }

    if (!found.name && hint) found.name = hint;

    if (!found.name && found.lat === null) {
      return res.status(200).json({
        ok: false,
        error: "Không đọc được thông tin nào từ link này.",
        notes
      });
    }

    return res.status(200).json({ ok: true, source: "url", place: found, notes });
  } catch (e) {
    console.error("[/api/place]", e);
    return res.status(500).json({ ok: false, error: "Lỗi máy chủ: " + e.message, notes });
  }
};
