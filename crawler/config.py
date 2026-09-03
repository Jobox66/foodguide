# -*- coding: utf-8 -*-
"""
Cấu hình cho tool crawl. Đọc từ biến môi trường, KHÔNG ghi giá trị thật vào file này.

Cách dùng: chép crawler/.env.example thành crawler/.env rồi điền.
File .env đã nằm trong .gitignore.
"""

import os
from pathlib import Path

CRAWLER_DIR = Path(__file__).resolve().parent
OUT_DIR = CRAWLER_DIR / "out"


def _load_dotenv():
    """Đọc crawler/.env mà không cần cài thêm thư viện"""
    env_file = CRAWLER_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()

# ─────────────────────────────────────────────────────────────────────────
# Đẩy dữ liệu lên Sheet
#
# Đi qua /api/sheet của chính trang bạn, KHÔNG dùng service account.
# Lý do: máy chủ đã giữ sẵn token và địa chỉ Apps Script; thêm một đường
# nữa nghĩa là thêm một file khoá bí mật phải giữ, mà kết quả không hơn.
# ─────────────────────────────────────────────────────────────────────────
API_BASE = os.environ.get("FOODGUIDE_API", "http://localhost:3000").rstrip("/")
SHEET_TAB = os.environ.get("FOODGUIDE_SHEET_TAB", "Crawl_Inbox")

# ─────────────────────────────────────────────────────────────────────────
# Gemini (bước 3 — làm sạch văn bản tự do)
# Lấy khoá miễn phí ở https://aistudio.google.com/apikey
# ─────────────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

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
MICHELIN_START_URLS = [
    "https://guide.michelin.com/vn/vi/ha-noi-region/restaurants",
    "https://guide.michelin.com/vn/vi/ho-chi-minh-city/restaurants",
]

# Quận nội thành Hà Nội, để tách quận ra khỏi địa chỉ
HANOI_DISTRICTS = [
    "Ba Đình", "Hoàn Kiếm", "Tây Hồ", "Long Biên", "Cầu Giấy", "Đống Đa",
    "Hai Bà Trưng", "Hoàng Mai", "Thanh Xuân", "Nam Từ Liêm", "Bắc Từ Liêm",
    "Hà Đông", "Gia Lâm", "Đông Anh", "Thanh Trì", "Hoài Đức",
]
