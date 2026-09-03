#!/usr/bin/env node
/**
 * Kiểm tra một khoá Google Places API xem lấy được những trường nào.
 *
 * Dùng để trả lời câu hỏi: khoá này có lấy được SỐ SAO không?
 * Quan trọng với Maps Demo Key (loại không cần thẻ), vì Google không ghi rõ
 * demo key có mở tới SKU Enterprise — nơi chứa rating và userRatingCount — hay không.
 *
 * Cách chạy:
 *   node tools/check-key.js AIza...          (truyền khoá trực tiếp)
 *   node tools/check-key.js                  (tự đọc GOOGLE_MAPS_API_KEY trong .env)
 *
 * Script chỉ gọi tối đa 3 request nên gần như không tốn hạn mức.
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ─── Lấy khoá: từ tham số dòng lệnh, biến môi trường, hoặc file .env ─────────
function resolveApiKey() {
  const fromArgv = process.argv[2];
  if (fromArgv && fromArgv.trim()) return fromArgv.trim();

  if (process.env.GOOGLE_MAPS_API_KEY) return process.env.GOOGLE_MAPS_API_KEY.trim();

  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    const line = fs
      .readFileSync(envPath, "utf8")
      .split("\n")
      .find(l => l.trim().startsWith("GOOGLE_MAPS_API_KEY="));
    if (line) return line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

// Quán dùng để thử — chính link người dùng đang muốn quét
const PROBE = {
  query: "HT Coffee Phạm Huy Thông Hà Nội",
  lat: 21.0287068,
  lng: 105.8109784
};

// Hai bộ trường, tương ứng hai mức giá khác nhau của Google
const FIELDS_ENTERPRISE = [
  "places.id", "places.displayName", "places.formattedAddress", "places.location",
  "places.rating", "places.userRatingCount", "places.priceLevel",
  "places.regularOpeningHours.weekdayDescriptions", "places.types",
  "places.photos", "places.googleMapsUri"
];

const FIELDS_PRO = [
  "places.id", "places.displayName", "places.formattedAddress", "places.location",
  "places.types", "places.photos", "places.googleMapsUri"
];

async function searchText(apiKey, fields) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fields.join(",")
    },
    body: JSON.stringify({
      textQuery: PROBE.query,
      languageCode: "vi",
      regionCode: "VN",
      maxResultCount: 1,
      locationBias: {
        circle: { center: { latitude: PROBE.lat, longitude: PROBE.lng }, radius: 300 }
      }
    })
  });

  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

async function checkPhoto(apiKey, photoName) {
  const url =
    `https://places.googleapis.com/v1/${photoName}/media` +
    `?maxHeightPx=400&maxWidthPx=400&skipHttpRedirect=true&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, uri: json.photoUri || "", error: json?.error?.message };
}

function line(char = "─") {
  console.log(char.repeat(64));
}

(async () => {
  const apiKey = resolveApiKey();

  line("═");
  console.log("  KIỂM TRA KHOÁ GOOGLE PLACES API");
  line("═");

  if (!apiKey) {
    console.log("\n✗ Không tìm thấy khoá.\n");
    console.log("  Truyền trực tiếp:  node tools/check-key.js AIza...");
    console.log("  Hoặc tạo file .env với dòng:  GOOGLE_MAPS_API_KEY=AIza...\n");
    process.exit(1);
  }

  console.log(`\nKhoá     : ${apiKey.slice(0, 6)}…${apiKey.slice(-4)}  (${apiKey.length} ký tự)`);
  console.log(`Quán thử : ${PROBE.query}\n`);

  // ─── Phép thử 1: bộ trường đầy đủ (SKU Enterprise) ────────────────────────
  console.log("▶ Thử bộ trường ĐẦY ĐỦ — gồm rating, userRatingCount, giờ mở cửa");
  console.log("  (rơi vào SKU Text Search Enterprise)\n");

  let result;
  try {
    result = await searchText(apiKey, FIELDS_ENTERPRISE);
  } catch (e) {
    console.log(`  ✗ Không gọi được: ${e.message}\n`);
    process.exit(1);
  }

  if (!result.ok) {
    const msg = result.json?.error?.message || `HTTP ${result.status}`;
    console.log(`  ✗ Bị từ chối: ${msg}\n`);

    // ─── Phép thử 2: rút gọn về SKU Pro để xem khoá còn dùng được không ─────
    console.log("▶ Thử lại với bộ trường RÚT GỌN — bỏ rating và giờ mở cửa");
    console.log("  (tụt xuống SKU Text Search Pro)\n");

    const fallback = await searchText(apiKey, FIELDS_PRO);
    if (fallback.ok && fallback.json.places?.[0]) {
      const p = fallback.json.places[0];
      console.log(`  ✓ Chạy được. Lấy được: ${p.displayName?.text} — ${p.formattedAddress}\n`);
      line();
      console.log("\nKẾT LUẬN\n");
      console.log("  Khoá này lấy được tên và địa chỉ, nhưng KHÔNG lấy được số sao.");
      console.log("  Nguyên nhân: rating / userRatingCount thuộc SKU Enterprise, mức khoá này");
      console.log("  chưa được mở.\n");
      console.log("  → Trang vẫn dùng được: tên, địa chỉ, quận, ảnh đều tự điền.");
      console.log("    Riêng số sao và lượt đánh giá bạn nhập tay.");
      console.log("  → Muốn tự động cả số sao thì cần thêm thẻ vào Billing.\n");
    } else {
      const m = fallback.json?.error?.message || `HTTP ${fallback.status}`;
      console.log(`  ✗ Cũng bị từ chối: ${m}\n`);
      line();
      console.log("\nKẾT LUẬN\n");
      console.log("  Khoá chưa dùng được. Kiểm tra lại:");
      console.log("    · Đã bật Places API (New) — không phải bản Legacy — trong project chưa?");
      console.log("    · Application restrictions có đang chặn không? Với khoá dùng ở máy chủ,");
      console.log("      mục này phải để None.");
      console.log("    · Project đã liên kết tài khoản thanh toán chưa?\n");
    }
    process.exit(0);
  }

  const place = result.json.places?.[0];
  if (!place) {
    console.log("  ⚠ Khoá hợp lệ nhưng không tìm thấy quán thử nghiệm.\n");
    process.exit(0);
  }

  // ─── Báo cáo từng trường ──────────────────────────────────────────────────
  const has = v => v !== undefined && v !== null && v !== "";
  const rows = [
    ["Tên quán",        place.displayName?.text,                              true],
    ["Địa chỉ",         place.formattedAddress,                               true],
    ["Toạ độ",          place.location && `${place.location.latitude}, ${place.location.longitude}`, true],
    ["Số sao",          place.rating,                                         true],
    ["Lượt đánh giá",   place.userRatingCount,                                true],
    ["Mức giá",         place.priceLevel,                                     false],
    ["Giờ mở cửa",      place.regularOpeningHours?.weekdayDescriptions?.[0],  false],
    ["Loại địa điểm",   place.types?.slice(0, 3).join(", "),                  false],
    ["Có ảnh",          place.photos?.length ? `${place.photos.length} ảnh` : "", false]
  ];

  console.log("  ✓ Gọi thành công\n");
  for (const [label, value, critical] of rows) {
    const mark = has(value) ? "✓" : (critical ? "✗" : "·");
    const shown = has(value) ? String(value) : (critical ? "KHÔNG CÓ" : "không có");
    console.log(`  ${mark} ${label.padEnd(16)} ${shown}`);
  }

  // ─── Phép thử 3: ảnh ──────────────────────────────────────────────────────
  if (place.photos?.length) {
    console.log("\n▶ Thử tải link ảnh (SKU Places Photo)\n");
    const photo = await checkPhoto(apiKey, place.photos[0].name);
    if (photo.ok && photo.uri) {
      console.log(`  ✓ Lấy được link ảnh sạch, không kèm khoá:`);
      console.log(`    ${photo.uri.slice(0, 72)}…`);
      console.log(`  ${photo.uri.includes(apiKey) ? "✗ CẢNH BÁO: link có chứa khoá!" : "✓ Link không chứa khoá"}`);
    } else {
      console.log(`  ✗ Không lấy được ảnh: ${photo.error || photo.status}`);
    }
  }

  // ─── Kết luận ─────────────────────────────────────────────────────────────
  const hasRating = has(place.rating) && has(place.userRatingCount);
  console.log();
  line();
  console.log("\nKẾT LUẬN\n");
  if (hasRating) {
    console.log("  ✓ Khoá này dùng được ĐẦY ĐỦ cho Food Guide.");
    console.log("    Lấy được cả số sao và lượt đánh giá thật từ Google.\n");
    console.log("  Việc cần làm tiếp:");
    console.log("    1. Đặt khoá vào Vercel: Settings → Environment Variables");
    console.log("       (nhớ bật công tắc Sensitive), tên biến GOOGLE_MAPS_API_KEY");
    console.log("    2. Redeploy");
    console.log("    3. Đặt hạn mức cứng: Maps Platform → Quotas → Requests per day\n");
  } else {
    console.log("  ⚠ Khoá gọi được nhưng KHÔNG trả về số sao.");
    console.log("    Trang vẫn tự điền tên, địa chỉ, quận, ảnh — riêng số sao nhập tay.\n");
  }
})();
