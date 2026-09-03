import os
from pathlib import Path
from dotenv import load_dotenv

# Xác định thư mục gốc của crawler
BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent

# Load biến môi trường từ crawler/.env hoặc .env ở thư mục cha
load_dotenv(BASE_DIR / ".env")
load_dotenv(ROOT_DIR / ".env")

# Thư mục xuất dữ liệu
OUTPUT_DIR = BASE_DIR / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Cấu hình Gemini AI
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Cấu hình Google Sheet
SHEETS_API_URL = os.getenv("SHEETS_API_URL", "")
SHEETS_WEBHOOK_URL = os.getenv("SHEETS_WEBHOOK_URL", "")
SHEETS_TOKEN = os.getenv("SHEETS_TOKEN", "")
GOOGLE_SERVICE_ACCOUNT_FILE = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "")
GOOGLE_SHEET_ID = os.getenv("GOOGLE_SHEET_ID", "")

# Cấu hình Threads
THREADS_SEARCH_QUERIES = [
    q.strip() for q in os.getenv("THREADS_SEARCH_QUERIES", "quán ngon hà nội,quán ngon sài gòn").split(",") if q.strip()
]
THREADS_MAX_POSTS = int(os.getenv("THREADS_MAX_POSTS", "20"))

# Header chuẩn giả lập trình duyệt
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
}
