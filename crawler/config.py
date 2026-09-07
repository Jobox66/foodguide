# -*- coding: utf-8 -*-
"""
Cấu hình cho tool crawl. Đọc từ biến môi trường hoặc file .env ở thư mục gốc của project.
KHÔNG ghi giá trị thật vào file này.

File .env đã nằm trong .gitignore.
"""

import os
from pathlib import Path

CRAWLER_DIR = Path(__file__).resolve().parent
OUT_DIR = CRAWLER_DIR / "out"


def _load_dotenv():
    """Đọc file .env ở thư mục gốc project (hoặc crawler/.env nếu có) mà không cần cài thêm thư viện"""
    candidates = [
        CRAWLER_DIR.parent / ".env",
        Path.cwd() / ".env",
        CRAWLER_DIR / ".env",
    ]
    seen_files = set()
    for env_file in candidates:
        try:
            resolved = env_file.resolve()
        except Exception:
            resolved = env_file
        if resolved in seen_files or not env_file.is_file():
            continue
        seen_files.add(resolved)
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
                value = value[1:-1]
            os.environ.setdefault(key, value)


_load_dotenv()

# ─────────────────────────────────────────────────────────────────────────
# Đẩy dữ liệu lên Sheet
#
# Đi qua /api/sheet của chính trang bạn, KHÔNG dùng service account.
# Lý do: máy chủ đã giữ sẵn token và địa chỉ Apps Script; thêm một đường
# nữa nghĩa là thêm một file khoá bí mật phải giữ, mà kết quả không hơn.
# ─────────────────────────────────────────────────────────────────────────
def normalize_api_base(value):
    """
    Dọn địa chỉ trang cho dễ dùng: thêm https:// nếu thiếu, bỏ /api/sheet ở
    đuôi, bỏ dấu / thừa. Dán "angihanoi.vercel.app" hay dán nguyên đường dẫn
    đầy đủ đều ra cùng một kết quả.
    """
    url = str(value or "").strip().rstrip("/")
    if not url:
        return ""
    url = url.removesuffix("/api/sheet").rstrip("/")
    if not url.startswith(("http://", "https://")):
        # localhost thì http, còn lại mặc định https
        url = ("http://" if url.startswith("localhost") or url.startswith("127.") else "https://") + url
    return url


def _api_base():
    """
    Địa chỉ gốc của trang. Nhận cả FOODGUIDE_API lẫn SHEETS_API_URL (tên biến
    có sẵn trong .env, trỏ thẳng tới /api/sheet) để không ai phải sửa .env.
    """
    for name in ("FOODGUIDE_API", "SHEETS_API_URL"):
        cleaned = normalize_api_base(os.environ.get(name, ""))
        if cleaned:
            return cleaned
    return "http://localhost:3000"


API_BASE = _api_base()
SHEET_TAB = os.environ.get("FOODGUIDE_SHEET_TAB", "Crawl_Inbox")

# ─────────────────────────────────────────────────────────────────────────
# Threads Crawler (Bước 2 — Khám phá xu hướng & quán ruột)
# ─────────────────────────────────────────────────────────────────────────
DEFAULT_THREADS_QUERIES = [
    "quán ruột hà nội",
    "quán ngon hà nội",
    "quán ăn ngon hà nội",
    "must try hà nội",
    "cà phê hà nội đẹp",
]

THREADS_SEARCH_QUERIES = [
    q.strip() for q in os.environ.get("THREADS_SEARCH_QUERIES", "").split(",") if q.strip()
] or DEFAULT_THREADS_QUERIES
THREADS_MAX_POSTS = int(os.environ.get("THREADS_MAX_POSTS", "20"))

# ─────────────────────────────────────────────────────────────────────────
# Gemini (bước 3 — làm sạch văn bản tự do)
# Lấy khoá miễn phí ở https://aistudio.google.com/apikey
# ─────────────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")

# ─────────────────────────────────────────────────────────────────────────
# Lịch sự khi cào
#
# Không có mục nào ở đây để "chạy nhanh hơn". Cào chậm là cách rẻ nhất để
# không bị chặn, và để không làm phiền máy chủ của người ta.
# ─────────────────────────────────────────────────────────────────────────
REQUEST_DELAY_SECONDS = float(os.environ.get("CRAWL_DELAY", "3.0"))
MAX_PAGES = int(os.environ.get("CRAWL_MAX_PAGES", "10"))
PAGE_TIMEOUT_MS = 45_000

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

# ─────────────────────────────────────────────────────────────────────────
# Michelin Guide
#
# robots.txt của guide.michelin.com CHO PHÉP đường dẫn danh sách gốc nhưng
# CẤM các URL có tham số lọc/sắp xếp:
#     Disallow: */search?   *sort=*   *?region=   */restaurantlist?
#     Disallow: *lat=*  *lon=*  *radius=*  *boundingBox=*  *nearme=*
#
# Nên chỉ đi đường phân trang thuần /page/N, không thêm query nào.
# ─────────────────────────────────────────────────────────────────────────
# Đường dẫn đã kiểm bằng trình duyệt thật: /en/vn/<thành phố>/restaurants trả
# HTTP 200 với 163 link quán ở Hà Nội. Bản tiếng Việt /vn/vi/... KHÔNG tồn tại
# (trả về trang "Page Not Found"), đừng đổi lại.
MICHELIN_START_URLS = [
    "https://guide.michelin.com/en/vn/ha-noi/restaurants",
    "https://guide.michelin.com/en/vn/ho-chi-minh/restaurants",
]

# Quận nội thành Hà Nội, để tách quận ra khỏi địa chỉ
HANOI_DISTRICTS = [
    "Ba Đình", "Hoàn Kiếm", "Tây Hồ", "Long Biên", "Cầu Giấy", "Đống Đa",
    "Hai Bà Trưng", "Hoàng Mai", "Thanh Xuân", "Nam Từ Liêm", "Bắc Từ Liêm",
    "Hà Đông", "Gia Lâm", "Đông Anh", "Thanh Trì", "Hoài Đức",
]
