# -*- coding: utf-8 -*-
"""
Chuẩn dữ liệu chung cho mọi nguồn crawl.

Đây là nơi duy nhất biết cẩm nang chờ đợi giá trị nào. Mọi script cào phải đi
qua `to_place()` trước khi đẩy lên Sheet — nếu không, dữ liệu vẫn vào được
Sheet nhưng bộ lọc trên trang sẽ bỏ sót chúng.

BA QUY TẮC KHÔNG ĐƯỢC PHÁ:

  1. KHÔNG BỊA SỐ. Không có số sao thì để None, đừng gán 4.2–5.0 cho đẹp.
     Con số hiện cạnh ngôi sao trên trang, người đọc tin đó là thật.

  2. verified LUÔN False. Nhãn "Đã xác minh" trong cẩm nang có nghĩa là
     "chủ trang đã tự đối chiếu Google Maps". Máy cào không làm được việc đó.

  3. KHÔNG LẤY ẢNH CỦA NGƯỜI KHÁC. Ảnh Michelin có bản quyền; ảnh mạng xã hội
     nằm trên CDN có chữ ký hết hạn sau vài ngày. Để trống, chụp ảnh thật sau.
"""

import re
import unicodedata

# ─────────────────────────────────────────────────────────────────────────
# Danh mục — PHẢI trùng id trong js/data.js, không phải tên hiển thị.
# Ghi tên hiển thị vào Sheet thì quán không khớp bộ lọc nào và biến mất khi
# người xem bấm lọc danh mục.
# ─────────────────────────────────────────────────────────────────────────
CATEGORY_IDS = [
    "cafe-chill",     # Cà phê & Trà
    "mon-soi",        # Món sợi (Phở, Bún, Mì)
    "com-xoi",        # Cơm & Xôi
    "banh-mi-cuon",   # Bánh mì & Đồ cuốn
    "lau-nuong",      # Lẩu & Nướng
    "an-vat",         # Ăn vặt & Tráng miệng
    "do-a-au",        # Đồ Nhật, Hàn & Á Âu
    "quan-nhau",      # Quán nhậu & Đêm
]

# Từ khoá → danh mục. Duyệt theo thứ tự, khớp đầu tiên thắng, nên từ khoá
# hẹp phải đứng trước từ khoá rộng.
CATEGORY_KEYWORDS = [
    ("cafe-chill",   ["ca phe", "cafe", "coffee", "tra sua", "tra chieu", "espresso", "matcha"]),
    # "banh mi" phải đứng TRƯỚC "mon-soi": chữ "mi" trong "bánh mì" khớp luôn
    # từ khoá "mi " của món sợi, nên xếp sau là "Bánh mì Phượng" thành món sợi.
    ("banh-mi-cuon", ["banh mi", "banh cuon", "nem cuon", "goi cuon", "banh gio"]),
    ("mon-soi",      ["pho", "bun", "mien", "mi ", "mi quang", "banh da", "hu tieu", "noodle", "ramen"]),
    ("com-xoi",      ["com ", "com tam", "xoi", "com rang", "rice"]),
    ("lau-nuong",    ["lau", "nuong", "bbq", "hotpot", "grill"]),
    ("do-a-au",      ["nhat", "han quoc", "sushi", "korean", "japanese", "pizza", "pasta", "steak", "y "]),
    ("quan-nhau",    ["nhau", "bia", "beer", "pub", "bar"]),
    ("an-vat",       ["an vat", "trang mieng", "che", "kem", "banh ngot", "dessert", "snack"]),
]

PRICE_LEVELS = ("low", "mid", "high")


def strip_accents(text):
    """Bỏ dấu tiếng Việt, giống normalizeVi() bên js/app.js"""
    text = str(text or "").lower()
    text = text.replace("đ", "d").replace("Đ", "d")
    text = unicodedata.normalize("NFD", text)
    return "".join(c for c in text if unicodedata.category(c) != "Mn")


def slugify(text, max_len=60):
    """Chuỗi an toàn để làm id: chỉ chữ thường, số và gạch ngang"""
    base = strip_accents(text)
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    return base[:max_len] or "quan"


def make_place_id(source, name, district=""):
    """
    Id ổn định theo TÊN + QUẬN, không theo thời điểm cào.

    Quan trọng: cùng một quán xuất hiện ở nhiều bài viết hay nhiều lần chạy
    phải ra cùng một id, nếu không Sheet sẽ đầy bản trùng — upsert bên Apps
    Script chỉ chống trùng theo id.
    """
    parts = [slugify(source, 12), slugify(name, 40)]
    if district:
        parts.append(slugify(district, 20))
    return "-".join(p for p in parts if p)


def guess_category(*texts):
    """
    Đoán danh mục từ tên quán và mô tả. Không chắc thì trả "" — quán vẫn hiện
    ở "Tất cả", chỉ là chưa xếp danh mục. Gán bừa thì người xem lọc ra kết quả
    sai mà không biết.
    """
    haystack = " " + strip_accents(" ".join(str(t or "") for t in texts)) + " "
    for category_id, keywords in CATEGORY_KEYWORDS:
        for keyword in keywords:
            if keyword in haystack:
                return category_id
    return ""


def normalize_price_level(value):
    """Về đúng low | mid | high, hoặc rỗng"""
    raw = str(value or "").strip()
    if raw in PRICE_LEVELS:
        return raw

    aliases = {
        "$": "low", "$$": "mid", "$$$": "high", "$$$$": "high",
        "binh dan": "low", "re": "low", "cheap": "low",
        "trung binh": "mid", "vua phai": "mid", "moderate": "mid",
        "cao cap": "high", "dat": "high", "expensive": "high",
    }
    return aliases.get(raw) or aliases.get(strip_accents(raw)) or ""


def price_level_from_vnd(low_vnd=None, high_vnd=None):
    """Suy mức giá từ khoảng giá thật (đồng). Không có số thì trả rỗng."""
    values = [v for v in (low_vnd, high_vnd) if isinstance(v, (int, float)) and v > 0]
    if not values:
        return ""
    middle = sum(values) / len(values)
    if middle < 50_000:
        return "low"
    if middle <= 150_000:
        return "mid"
    return "high"


def to_place(raw, source):
    """
    Bản ghi thô từ một script cào  →  đúng 21 khoá mà Apps Script chờ đợi.

    Trường nào không chắc thì để rỗng/None. Hàm này KHÔNG suy đoán số sao,
    không bật verified, không gán ảnh.
    """
    name = str(raw.get("name") or "").strip()
    if not name:
        return None

    district = str(raw.get("district") or "").strip()
    address = str(raw.get("address") or "").strip()

    category = raw.get("category") or ""
    if category not in CATEGORY_IDS:
        category = guess_category(name, raw.get("mustTry"), raw.get("review"), address)

    tags = raw.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in re.split(r"[,;]", tags) if t.strip()]

    return {
        "id": raw.get("id") or make_place_id(source, name, district),
        "name": name,
        "category": category,
        "district": district,
        "address": address,

        # Số sao và lượt đánh giá KHÔNG có nguồn đáng tin ở đây — xem quy tắc 1
        "rating": None,
        "reviewCount": None,

        "priceRange": str(raw.get("priceRange") or "").strip(),
        "priceLevel": normalize_price_level(raw.get("priceLevel")),
        "time": str(raw.get("time") or "").strip(),
        "mustTry": str(raw.get("mustTry") or "").strip(),
        "review": str(raw.get("review") or "").strip(),
        "mapsUrl": str(raw.get("mapsUrl") or "").strip(),
        "tags": [str(t).strip() for t in tags if str(t).strip()],

        # Ảnh để trống — xem quy tắc 3
        "image": "",

        "lat": raw.get("lat"),
        "lng": raw.get("lng"),

        # Máy không xác minh thay bạn được — xem quy tắc 2
        "verified": False,
        "featured": False,
        "dataSource": source,
    }
