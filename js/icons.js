/* ===================================================================
   BỘ BIỂU TƯỢNG NÉT (Line icon set)
   -------------------------------------------------------------------
   Thay cho emoji. Emoji đổi hình theo từng hệ điều hành, mang sẵn màu
   riêng không khớp bảng màu, và không có trạng thái bật/tắt. Biểu tượng
   nét vẽ bằng `currentColor` nên tự đổi màu theo ngữ cảnh và theo chế độ
   Sáng/Tối, cùng độ dày nét trên mọi chỗ.

   Cách dùng:
     icon("search")            → chuỗi <svg> dán thẳng vào template
     icon("star", "is-filled") → thêm lớp CSS riêng

   Tất cả vẽ trên lưới 24×24, nét 1.75, bo đầu tròn.
   =================================================================== */

const ICON_PATHS = {
  /* --- Điều hướng & hành động --- */
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3.5 12.5 8.5 4.7 8.5-4.7"/><path d="m3.5 17 8.5 4.7 8.5-4.7"/>',
  /* Bánh răng thật, không phải vành tia — bản cũ trùng hệt với hình "sun" */
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.2 14.6a1.6 1.6 0 0 0 .32 1.76l.06.06a1.9 1.9 0 1 1-2.7 2.7l-.05-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.46v.17a1.9 1.9 0 1 1-3.8 0v-.09a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06a1.9 1.9 0 1 1-2.7-2.7l.06-.05a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.46-.97H3.4a1.9 1.9 0 1 1 0-3.8h.09a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.76l-.06-.06a1.9 1.9 0 1 1 2.7-2.7l.05.06a1.6 1.6 0 0 0 1.77.32h.08a1.6 1.6 0 0 0 .97-1.46V3.4a1.9 1.9 0 1 1 3.8 0v.09a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.77-.32l.05-.06a1.9 1.9 0 1 1 2.7 2.7l-.06.05a1.6 1.6 0 0 0-.32 1.77v.08a1.6 1.6 0 0 0 1.46.97h.17a1.9 1.9 0 1 1 0 3.8h-.09a1.6 1.6 0 0 0-1.46.97Z"/>',
  sheet: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.5h17M3.5 15h17M9.5 3.5v17"/>',
  cloud: '<path d="M17.5 18.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.6A3.5 3.5 0 0 0 7 18.5Z"/>',
  plug: '<path d="M9 2.5v5M15 2.5v5"/><path d="M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0Z"/><path d="M12 16v5.5"/>',
  moon: '<path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
  share: '<path d="M9.5 13.5 14.5 10.5M9.5 10.5l5 3"/><circle cx="17.5" cy="8.5" r="2.8"/><circle cx="6.5" cy="12" r="2.8"/><circle cx="17.5" cy="15.5" r="2.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  reset: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 3.4v5.2h-5.2"/>',
  external: '<path d="M14 4.5h5.5V10"/><path d="m19.5 4.5-8 8"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m15.5 7.5 3 3"/>',

  /* --- Bộ lọc & thông tin --- */
  map: '<path d="m9 4.5-5.5 2.5v13L9 17.5l6 2.5 5.5-2.5v-13L15 7Z"/><path d="M9 4.5v13M15 7v13"/>',
  pin: '<path d="M19 10.5c0 5-7 10.5-7 10.5s-7-5.5-7-10.5a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10.5" r="2.5"/>',
  building: '<path d="M4.5 21V6.5l7.5-4 7.5 4V21"/><path d="M2.5 21h19"/><path d="M9.5 21v-5h5v5"/><path d="M9 10.5h.01M15 10.5h.01"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/>',
  wallet: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h11a2 2 0 0 1 2 2"/><rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M16.5 13.5h1.5"/>',
  star: '<path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>',
  sortAz: '<path d="M4 7h9M4 12h6M4 17h3"/><path d="M16 5v14"/><path d="m13 16 3 3 3-3"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  alert: '<path d="M12 3.5 2.8 19.5h18.4Z"/><path d="M12 9.5v4.5M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.2 2"/>',
  sparkle: '<path d="m12 3.5 1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1L5 10.5l5.1-1.9Z"/><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z"/>',
  tag: '<path d="M3.5 10.5V5.2a1.7 1.7 0 0 1 1.7-1.7h5.3L20.5 13 13 20.5Z"/><path d="M8 8h.01"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-7.5-9.8A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 3.1c0 5.2-7.5 9.8-7.5 9.8Z"/>',
  laptop: '<rect x="4" y="5" width="16" height="10.5" rx="1.6"/><path d="M2 19h20"/>',
  camera: '<path d="M4.5 8h2.6l1.4-2h7l1.4 2h2.6a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-8A1.5 1.5 0 0 1 4.5 8Z"/><circle cx="12" cy="13" r="3.2"/>',
  users: '<circle cx="9.5" cy="8" r="3.2"/><path d="M3 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6M18 14.4a6.5 6.5 0 0 1 3 5.6"/>',
  volume: '<path d="M11 5.5 6.5 9.5H3v5h3.5L11 18.5Z"/><path d="M15 9.5a3.5 3.5 0 0 1 0 5M17.8 7a7 7 0 0 1 0 10"/>',

  /* --- Danh mục món --- */
  utensils: '<path d="M6 3v7a2.5 2.5 0 0 0 5 0V3"/><path d="M8.5 10v11"/><path d="M17 3c-1.7 1.4-2.5 3.4-2.5 5.5s.8 3.2 2.5 3.5V3Z"/><path d="M17 12v9"/>',
  coffee: '<path d="M4.5 8h12v5.5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5Z"/><path d="M16.5 9.5h1.8a2.6 2.6 0 0 1 0 5.2h-1.8"/><path d="M7.5 2.5v2.8M11 2.5v2.8"/>',
  /* Mấy hình dưới đây vẽ lại cho đọc được ở cỡ 17px trong chip danh mục: bản
     đầu nhiều nét nhỏ quá, co lại thì bát phở, bát cơm và vỉ nướng trông
     giống hệt cái cốc. Nguyên tắc: một bóng dáng lớn dễ nhận + tối đa ba nét
     phụ, không nét nào ngắn hơn ~4 đơn vị. */
  noodles: '<path d="M2.8 11.5h18.4a9.2 9.2 0 0 1-18.4 0Z"/><path d="M7.5 11.5q0-4 2.2-5.6M12 11.5q0-5.4 2.4-7.3M16.5 11.5q0-3.4 2-4.8"/>',
  rice: '<path d="M2.8 12.8h18.4a9.2 9.2 0 0 1-18.4 0Z"/><path d="M7 9.6h.01M12 7.6h.01M17 9.6h.01M9.6 6.6h.01M14.4 6.6h.01"/>',
  baguette: '<path d="M3.6 18.4 16.4 5.6a4 4 0 0 1 5.6 5.6L9.2 24"/><path d="m8.4 11.2 2.6 2.6M12 7.6l2.6 2.6"/>',
  grill: '<path d="M12 2.8c3.4 3.2 1.4 5.6 0 7.2-1.5 1.8-2.2 3.4-.6 5.2"/><path d="M7 7.6c2.2 2.2 1 4.2-.4 5.6"/><path d="M17 7.6c2.2 2.2 1 4.2-.4 5.6"/><path d="M3 17.6h18a9 9 0 0 1-18 0Z"/>',
  icecream: '<path d="M7.6 11.6h8.8L12 22Z"/><path d="M7.2 11.6a4.8 4.8 0 1 1 9.6 0Z"/><path d="M6.4 15.2h11.2"/>',
  fish: '<path d="M2.6 12c3.8-5.4 7.4-7 10.6-7s6.6 2.6 8.2 7c-1.6 4.4-5 7-8.2 7s-6.8-1.6-10.6-7Z"/><path d="M17.4 10.4h.01"/><path d="M7 6.6 4.6 2.6M7 17.4l-2.4 4"/>',
  beer: '<path d="M5.5 6.5h10v13a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5Z"/><path d="M15.5 9h2.3a1.7 1.7 0 0 1 1.7 1.7v4.1a1.7 1.7 0 0 1-1.7 1.7h-2.3"/><path d="M5.5 10.5h10"/><path d="M8.5 3.5v3M12.5 3.5v3"/>',

  /* --- Khác --- */
  wand: '<path d="m3.4 20.6 11-11"/><path d="m12.6 7.8 3.6 3.6"/><path d="M18.4 2.6v3.4M18.4 11.8v3.4M13.8 9.2h3.4M22.6 9.2h-3.4"/>',
  bulb: '<path d="M9.5 18h5"/><path d="M10 21h4"/><path d="M12 3a5.5 5.5 0 0 0-3.2 10c.5.4.8 1 .8 1.6h4.8c0-.6.3-1.2.8-1.6A5.5 5.5 0 0 0 12 3Z"/>',
  inbox: '<path d="M3.5 13.5h4l1.5 3h6l1.5-3h4"/><path d="M5.6 5.2 3.5 13.5v4a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-4l-2.1-8.3a1.5 1.5 0 0 0-1.5-1.2H7.1a1.5 1.5 0 0 0-1.5 1.2Z"/>',
  note: '<path d="M14 3.5H6.5A1.5 1.5 0 0 0 5 5v14a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5Z"/><path d="M14 3.5V8.5h5"/><path d="M8.5 13h7M8.5 16.5h4.5"/>',
  route: '<circle cx="6" cy="18.5" r="2.5"/><circle cx="18" cy="5.5" r="2.5"/><path d="M15.5 5.5H10a3.5 3.5 0 0 0 0 7h4a3.5 3.5 0 0 1 0 7H8.5"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="8.8" cy="9.8" r="1.8"/><path d="m4 17 4.8-4.5a1.8 1.8 0 0 1 2.5 0L17 18"/>',
  upload: '<path d="M12 16V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M3.5 15v3.5A1.5 1.5 0 0 0 5 20h14a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01"/>'
};

/** Biểu tượng của từng danh mục món, khớp theo id trong data.js */
const CATEGORY_ICONS = {
  all: "utensils",
  "cafe-chill": "coffee",
  "mon-soi": "noodles",
  "com-xoi": "rice",
  "banh-mi-cuon": "baguette",
  "lau-nuong": "grill",
  "an-vat": "icecream",
  "do-a-au": "fish",
  "quan-nhau": "beer"
};

/** Biểu tượng cho các mạng xã hội */
const SOCIAL_ICONS = {
  facebook: "users",
  instagram: "camera",
  tiktok: "volume",
  threads: "share",
  youtube: "volume",
  website: "external"
};

/**
 * Trả về chuỗi SVG của một biểu tượng.
 *
 * Luôn trả về chuỗi rỗng khi không có tên tương ứng — để một biểu tượng
 * thiếu chỉ làm mất đúng hình đó, chứ không làm vỡ cả thẻ quán.
 */
function icon(name, extraClass = "") {
  const path = ICON_PATHS[name];
  if (!path) return "";
  const cls = extraClass ? `icon ${extraClass}` : "icon";
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    focusable="false">${path}</svg>`;
}

/** Biểu tượng ngôi sao tô đặc — dùng cho điểm đánh giá */
function starIcon(extraClass = "") {
  return `<svg class="icon ${extraClass}" viewBox="0 0 24 24" fill="currentColor" stroke="none"
    aria-hidden="true" focusable="false">${ICON_PATHS.star}</svg>`;
}

/** Tên biểu tượng của một danh mục; danh mục tự thêm dùng hình chung */
function categoryIconName(categoryId) {
  return CATEGORY_ICONS[categoryId] || "utensils";
}

function categoryIcon(categoryId, extraClass = "") {
  return icon(categoryIconName(categoryId), extraClass);
}

function socialIcon(key, extraClass = "") {
  return icon(SOCIAL_ICONS[String(key || "").toLowerCase()] || "external", extraClass);
}
