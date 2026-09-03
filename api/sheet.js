/**
 * /api/sheet — cầu nối giữa trang web và Google Sheet cá nhân.
 *
 *   GET  /api/sheet?health=1        → máy chủ sống chưa, đã cấu hình Sheet chưa
 *   POST /api/sheet  { action: … }  → chuyển tiếp thao tác xuống Google Sheet
 *
 *        action = "pull"    đọc toàn bộ quán trong Sheet
 *        action = "push"    { places: [...] }  thêm mới hoặc cập nhật theo ID
 *        action = "delete"  { ids: [...] }     xoá dòng theo ID
 *
 * VÌ SAO ĐI VÒNG QUA ĐÂY THAY VÌ GỌI THẲNG GOOGLE:
 *   Trang web nói chuyện với Sheet qua một Apps Script Web App do chính chủ
 *   Sheet deploy. Địa chỉ /exec của Web App đó chính là thứ mở được Sheet —
 *   ai có nó cũng ghi được. Nếu để trong js/app.js thì bất kỳ ai xem mã nguồn
 *   trang cũng đọc được. Đặt ở đây thì nó nằm trong biến môi trường trên
 *   Vercel, trình duyệt chỉ thấy đường dẫn "/api/sheet" của chính domain mình.
 *
 *   Không dùng Google Sheets API vì hướng đó cần khoá OAuth hoặc file khoá
 *   service account — nhiều thứ bí mật hơn để giữ, mà kết quả không hơn.
 *   Sheets API cũng KHÔNG thuộc Maps Core Services nên không vướng ràng buộc
 *   lãnh thổ như Places API (xem ghi chú đầu api/place.js) — vấn đề duy nhất
 *   chỉ là công sức cấu hình.
 *
 * Biến môi trường (đặt trong Vercel → Settings → Environment Variables):
 *   SHEETS_WEBHOOK_URL  bắt buộc — địa chỉ /exec của Apps Script Web App
 *   SHEETS_TOKEN        bắt buộc — chuỗi bí mật, phải trùng SHEET_TOKEN
 *                       trong file tools/sheet-appscript.gs
 *   ALLOWED_ORIGINS     tuỳ chọn — như /api/place
 */

"use strict";

// 4 MB: đủ cho vài nghìn quán, và cho một tấm ảnh đã thu nhỏ ở dạng base64
// (trình duyệt tự ép xuống dưới ~900 KB trước khi gửi — xem shrinkImageFile).
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_ITEMS = 1000;              // chặn một lần đẩy quá lớn làm Apps Script hết giờ
const ALLOWED_ACTIONS = new Set(["pull", "push", "delete", "health", "photo", "deletePhoto"]);

// Apps Script Web App chỉ sống ở hai domain này. Kiểm tra để một biến môi
// trường bị đặt sai (hoặc bị sửa) không biến endpoint thành proxy tuỳ ý.
const ALLOWED_WEBHOOK_HOSTS = new Set(["script.google.com", "script.googleusercontent.com"]);

// ─── Giới hạn tần suất (best-effort, xem ghi chú trong api/place.js) ─────────
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60000;
const rateBuckets = new Map();

function isRateLimited(clientIp) {
  const now = Date.now();
  const bucket = rateBuckets.get(clientIp);

  if (!bucket || now - bucket.startedAt > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(clientIp, { startedAt: now, count: 1 });
    return false;
  }

  bucket.count++;
  if (rateBuckets.size > 5000) rateBuckets.clear();
  return bucket.count > RATE_LIMIT_MAX;
}

// ─── Đọc body ────────────────────────────────────────────────────────────────
// Vercel tự parse JSON cho req.body, nhưng khi chạy dưới một server Node thuần
// (bộ test cục bộ) thì không, nên phải tự đọc stream.
async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);

  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Dữ liệu gửi lên quá lớn.");
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function resolveCorsOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return null;

  const allowList = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (allowList.length === 0) return null;
  if (allowList.includes("*")) return "*";
  return allowList.includes(origin) ? origin : false;
}

/** Địa chỉ Web App đã cấu hình, hoặc null nếu chưa/sai */
function getWebhookUrl() {
  const raw = (process.env.SHEETS_WEBHOOK_URL || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (!ALLOWED_WEBHOOK_HOSTS.has(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// Ghi một tấm ảnh vào Drive lâu hơn hẳn ghi vài dòng Sheet: còn phải giải mã
// base64 và tải file lên. Cho nó ngân sách riêng, và luôn để nhỏ hơn maxDuration
// của function trong vercel.json — nếu không, Vercel cắt trước và người dùng
// nhận lỗi 504 trống thay vì thông báo có nghĩa.
const APPS_SCRIPT_TIMEOUT_MS = 25000;
const APPS_SCRIPT_PHOTO_TIMEOUT_MS = 50000;

/**
 * Gửi một thao tác xuống Apps Script và trả lại nguyên văn kết quả.
 *
 * Apps Script trả 302 sang script.googleusercontent.com — nơi giữ kết quả thật
 * của lần chạy doPost. Để fetch tự đi theo (redirect: "follow"): đường này đã
 * chạy ổn định cho đồng bộ Sheet, và res.url vẫn cho biết đã đáp xuống đâu.
 *
 * Đã thử tự đi theo redirect bằng tay để quan sát kỹ hơn, nhưng cú GET tự dựng
 * lại hay bị googleusercontent trả 404 — địa chỉ đó gắn với phiên của chính lần
 * chuyển hướng ấy. Việc phát hiện POST bị đổi thành GET không cần tới đó: dấu
 * 'via' trong phản hồi đã đủ, và chắc chắn hơn.
 */
async function callAppsScript(webhookUrl, payload, timeoutMs) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs || APPS_SCRIPT_TIMEOUT_MS)
  });

  const finalUrl = res.url || webhookUrl;
  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // Apps Script trả HTML khi deploy sai quyền hoặc script lỗi cú pháp
    if (/accounts\.google\.com|Sign in|đăng nhập/i.test(text)) {
      throw new Error('Web App đang đòi đăng nhập — deploy lại với "Who has access: Anyone".');
    }

    let host = "";
    try {
      host = new URL(finalUrl).hostname;
    } catch {
      host = "không rõ";
    }

    if (res.status === 404 && host.indexOf("googleusercontent") !== -1) {
      throw new Error(
        "Google trả 404 ở bước lấy kết quả (địa chỉ tạm của Apps Script đã hết hiệu lực). " +
        "Đây là lỗi chập chờn phía Google, thử lại là thường được."
      );
    }

    throw new Error("Apps Script trả về nội dung không phải JSON (HTTP " + res.status +
      " từ " + host + ").");
  }

  json.__finalUrl = finalUrl;
  return json;
}

/**
 * Kết quả có đúng là của việc mình vừa nhờ không.
 * Không kiểm thì một phản hồi lạc — doGet, hay kết quả của action khác — vẫn
 * lọt qua vì nó cũng có ok:true, và người dùng nhận một lỗi mơ hồ ở tận giao diện.
 */
function describeMismatch(action, result) {
  if (result.via === "doGet" || result.service === "foodguide-sheet") {
    return 'Yêu cầu POST bị Google chuyển thành GET nên chạy nhầm doGet(). ' +
      'Thường là do URL trong SHEETS_WEBHOOK_URL không phải bản /exec mới nhất — ' +
      'vào Apps Script → Triển khai → Quản lý triển khai, copy lại đường dẫn /exec ' +
      'rồi cập nhật biến môi trường trên Vercel và Redeploy.';
  }

  if (result.via === "doPost" && result.action && result.action !== action) {
    return 'Apps Script trả về kết quả của action "' + result.action +
      '" trong khi mình gửi "' + action + '".';
  }

  if (action === "photo" && !result.fileId) {
    return "Apps Script báo thành công nhưng không kèm id ảnh. Nó trả về: " +
      Object.keys(result).filter(k => k !== "__finalUrl").join(", ") + ".";
  }

  if (action === "pull" && !Array.isArray(result.places)) {
    return "Apps Script báo thành công nhưng không kèm danh sách quán.";
  }

  return "";
}

module.exports = async function handler(req, res) {
  const corsOrigin = resolveCorsOrigin(req);

  if (corsOrigin === false) {
    return res.status(403).json({ ok: false, error: "Origin không được phép gọi endpoint này." });
  }
  if (corsOrigin) {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  const webhookUrl = getWebhookUrl();
  const token = (process.env.SHEETS_TOKEN || "").trim();
  const configured = Boolean(webhookUrl && token);

  // Kiểm tra sức khoẻ — không đụng tới Sheet, chỉ cho biết đã cấu hình chưa
  if (req.method === "GET") {
    if (req.query && req.query.health !== undefined) {
      return res.status(200).json({
        ok: true,
        service: "sheet-sync",
        configured,
        reason: configured
          ? ""
          : !webhookUrl
            ? "Chưa đặt SHEETS_WEBHOOK_URL (hoặc địa chỉ không phải Apps Script Web App)."
            : "Chưa đặt SHEETS_TOKEN."
      });
    }
    return res.status(400).json({ ok: false, error: "Dùng POST để đồng bộ, hoặc GET ?health=1." });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Chỉ hỗ trợ GET và POST." });
  }

  const clientIp =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  if (isRateLimited(clientIp)) {
    return res.status(429).json({ ok: false, error: "Bạn đồng bộ quá nhanh, thử lại sau một phút." });
  }

  if (!configured) {
    return res.status(503).json({
      ok: false,
      error: "Máy chủ chưa được nối với Google Sheet. Xem hướng dẫn trong mục Nguồn dữ liệu.",
      configured: false
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return res.status(400).json({ ok: false, error: "Body không hợp lệ: " + e.message });
  }

  const action = String(body.action || "").trim();
  if (!ALLOWED_ACTIONS.has(action)) {
    return res.status(400).json({ ok: false, error: 'action không hợp lệ: "' + action + '".' });
  }

  const places = Array.isArray(body.places) ? body.places : [];
  const ids = Array.isArray(body.ids) ? body.ids : [];

  if (places.length > MAX_ITEMS || ids.length > MAX_ITEMS) {
    return res.status(413).json({
      ok: false,
      error: "Mỗi lần chỉ đồng bộ tối đa " + MAX_ITEMS + " quán."
    });
  }
  if (action === "push" && places.length === 0) {
    return res.status(400).json({ ok: false, error: "push nhưng không có quán nào." });
  }
  if (action === "delete" && ids.length === 0) {
    return res.status(400).json({ ok: false, error: "delete nhưng không có id nào." });
  }

  // Ảnh: chỉ chuyển tiếp đúng data URL của ảnh, không phải chuỗi tuỳ ý
  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
  if (action === "photo" && !/^data:image\/[a-z+]+;base64,/.test(dataUrl)) {
    return res.status(400).json({ ok: false, error: "photo nhưng dataUrl không phải ảnh base64." });
  }
  const fileId = String(body.fileId || "").trim();
  if (action === "deletePhoto" && !fileId) {
    return res.status(400).json({ ok: false, error: "deletePhoto nhưng thiếu fileId." });
  }

  try {
    // token được ghép ở đây — client không bao giờ nhìn thấy nó
    const payload = { token, action };
    if (action === "push") payload.places = places;
    if (action === "delete") payload.ids = ids;
    if (action === "photo") {
      payload.dataUrl = dataUrl;
      payload.placeId = String(body.placeId || "").slice(0, 100);
    }
    if (action === "deletePhoto") payload.fileId = fileId;

    const result = await callAppsScript(
      webhookUrl,
      payload,
      action === "photo" ? APPS_SCRIPT_PHOTO_TIMEOUT_MS : APPS_SCRIPT_TIMEOUT_MS
    );

    if (!result || result.ok !== true) {
      return res.status(502).json({
        ok: false,
        error: (result && result.error) || "Google Sheet từ chối thao tác."
      });
    }

    const mismatch = describeMismatch(action, result);
    if (mismatch) {
      console.error("[/api/sheet] phản hồi lạc:", action, result.__finalUrl, Object.keys(result));
      return res.status(502).json({ ok: false, error: mismatch });
    }

    delete result.__finalUrl; // chỉ dùng để chẩn đoán, không gửi ra trình duyệt
    return res.status(200).json(result);
  } catch (e) {
    console.error("[/api/sheet]", e);
    const timedOut = e.name === "TimeoutError" || /timeout/i.test(e.message || "");

    // Hết giờ ở phía mình KHÔNG có nghĩa là Apps Script đã dừng — nó vẫn chạy
    // tiếp và có thể đã ghi xong file. Nói rõ để người dùng kiểm tra Drive
    // trước khi bấm lại, tránh tạo ra hai bản của cùng một tấm ảnh.
    const timeoutMessage = action === "photo"
      ? "Apps Script chạy quá " + Math.round(APPS_SCRIPT_PHOTO_TIMEOUT_MS / 1000) +
        " giây nên máy chủ đã ngắt chờ. Ảnh có thể VẪN đã được lưu — mở thư mục " +
        '"Foodguide - Ảnh quán" trong Drive kiểm tra trước khi thử lại.'
      : "Google Sheet phản hồi quá chậm, thử lại sau.";

    return res.status(timedOut ? 504 : 502).json({
      ok: false,
      error: timedOut ? timeoutMessage : "Lỗi khi gọi Google Sheet: " + e.message
    });
  }
};
