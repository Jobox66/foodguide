/**
 * GET /api/place?url=<link Google Maps>[&hint=<tên quán người dùng dán kèm>]
 *
 * Chạy trên Vercel Serverless Function (Node.js runtime, không cần cài thư viện).
 *
 * Nhiệm vụ:
 *   1. Đi theo redirect của link rút gọn (maps.app.goo.gl / share.google / goo.gl).
 *      Việc này trình duyệt KHÔNG làm được vì bị CORS chặn — đó là lý do
 *      autofill phía client không đọc nổi link rút gọn.
 *   2. Bóc tên quán + toạ độ từ URL đã giải mã.
 *   3. Gọi Google Places API bằng khoá lấy từ biến môi trường.
 *      Khoá nằm trên server, không bao giờ gửi xuống trình duyệt.
 *   4. Trả về JSON đã chuẩn hoá.
 *
 * Biến môi trường:
 *   GOOGLE_MAPS_API_KEY   (bắt buộc, để trống thì vẫn trả tên + toạ độ)
 *   ALLOWED_ORIGINS       (tuỳ chọn) danh sách origin cách nhau bởi dấu phẩy
 *                         được phép gọi. Bỏ trống = chỉ cho phép cùng origin.
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

const GOOGLE_PRICE_LEVEL_MAP = {
  PRICE_LEVEL_FREE: "low",
  PRICE_LEVEL_INEXPENSIVE: "low",
  PRICE_LEVEL_MODERATE: "mid",
  PRICE_LEVEL_EXPENSIVE: "high",
  PRICE_LEVEL_VERY_EXPENSIVE: "high"
};

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

// ─── Tiện ích bóc dữ liệu từ URL Google Maps ─────────────────────────────────

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

// ─── Google Places API ───────────────────────────────────────────────────────

async function searchGooglePlace(apiKey, { textQuery, lat, lng }) {
  const body = { textQuery, languageCode: "vi", regionCode: "VN", maxResultCount: 1 };
  if (lat !== null && lng !== null) {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 300 } };
  }

  // ⚠️ FIELD MASK QUYẾT ĐỊNH GIÁ. Google tính theo SKU CAO NHẤT có trong request.
  //    rating / userRatingCount / priceLevel / regularOpeningHours đều thuộc nhóm
  //    Enterprise, nên mỗi lệnh gọi bị tính là Text Search Enterprise:
  //      - 1.000 lượt miễn phí mỗi tháng (không phải 10.000 như nhóm Essentials)
  //      - vượt hạn mức: khoảng 35 USD / 1.000 request
  //    Bỏ bớt 4 trường trên sẽ tụt về Pro (5.000 lượt free) nhưng mất số sao —
  //    thứ chính mà tính năng này cần. Hãy đặt hạn mức cứng trong Google Cloud
  //    (Maps Platform → Quotas → Requests per day) thay vì cắt trường.
  const fieldMask = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.rating",
    "places.userRatingCount",
    "places.priceLevel",
    "places.regularOpeningHours.weekdayDescriptions",
    "places.types",
    "places.photos",
    "places.googleMapsUri"
  ].join(",");

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message || `Places API trả về ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return json.places?.[0] || null;
}

/**
 * Lấy link ảnh trực tiếp (lh3.googleusercontent.com).
 * skipHttpRedirect=true khiến Google trả JSON chứa photoUri, nhờ vậy
 * khoá API không bị nhúng vào link ảnh gửi xuống trình duyệt.
 */
// Mỗi lệnh gọi ảnh là một sự kiện Places Photo riêng (~7 USD/1.000, 1.000 lượt free/tháng)
async function getPhotoUri(apiKey, photoName) {
  const url =
    `https://places.googleapis.com/v1/${photoName}/media` +
    `?maxHeightPx=800&maxWidthPx=1200&skipHttpRedirect=true&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) return "";
  const json = await res.json().catch(() => ({}));
  return json.photoUri || "";
}

function extractTodayOpeningHours(weekdayDescriptions) {
  if (!Array.isArray(weekdayDescriptions) || weekdayDescriptions.length === 0) return "";
  // Google xếp mảng bắt đầu từ Thứ Hai, còn getDay() coi 0 là Chủ Nhật
  const index = (new Date().getDay() + 6) % 7;
  const line = weekdayDescriptions[index] || weekdayDescriptions[0];
  const range = line.match(/(\d{1,2}:\d{2})\s*[\u2013\u2014-]\s*(\d{1,2}:\d{2})/);
  return range ? `${range[1]} - ${range[2]}` : "";
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

  const apiKey = (process.env.GOOGLE_MAPS_API_KEY || "").trim();

  // Kiểm tra sức khoẻ: cho phép giao diện biết backend sống chưa & đã có khoá chưa,
  // mà không tiết lộ bất kỳ phần nào của khoá.
  if (req.query.health !== undefined) {
    return res.status(200).json({ ok: true, hasKey: Boolean(apiKey) });
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
  let found = {
    name: "",
    address: "",
    lat: null,
    lng: null,
    rating: null,
    reviewCount: null,
    priceLevel: "",
    time: "",
    image: "",
    types: [],
    mapsUrl: rawUrl
  };

  try {
    // 1. Giải mã link (server đi theo redirect được, trình duyệt thì không)
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

    // 2. Hỏi Google Places để lấy số sao, lượt đánh giá, giờ, ảnh thật
    if (apiKey && (found.name || found.lat !== null)) {
      try {
        const query = found.name || `${found.lat},${found.lng}`;
        const place = await searchGooglePlace(apiKey, {
          textQuery: query,
          lat: found.lat,
          lng: found.lng
        });

        if (place) {
          if (place.displayName?.text) found.name = place.displayName.text;
          if (place.formattedAddress) found.address = place.formattedAddress;
          if (place.location) {
            found.lat = place.location.latitude;
            found.lng = place.location.longitude;
          }
          if (typeof place.rating === "number") found.rating = place.rating;
          if (typeof place.userRatingCount === "number") found.reviewCount = place.userRatingCount;
          if (place.priceLevel && GOOGLE_PRICE_LEVEL_MAP[place.priceLevel]) {
            found.priceLevel = GOOGLE_PRICE_LEVEL_MAP[place.priceLevel];
          }
          if (place.regularOpeningHours) {
            found.time = extractTodayOpeningHours(place.regularOpeningHours.weekdayDescriptions);
          }
          if (Array.isArray(place.types)) found.types = place.types;
          if (place.googleMapsUri) found.mapsUrl = place.googleMapsUri;

          if (place.photos?.length) {
            const photoUri = await getPhotoUri(apiKey, place.photos[0].name).catch(() => "");
            if (photoUri) found.image = photoUri;
          }

          return res.status(200).json({ ok: true, source: "google", place: found, notes });
        }

        notes.push("Google Places không tìm thấy quán này");
      } catch (e) {
        notes.push("Places API: " + e.message);
      }
    } else if (!apiKey) {
      notes.push("server chưa cấu hình GOOGLE_MAPS_API_KEY");
    }

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
