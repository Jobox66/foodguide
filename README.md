# 🍜 Hanoi Food & Cafe Guide

> **Cẩm nang ẩm thực & quán cà phê cá nhân hoá** — Tự động bóc tách thông tin từ Google Maps, đồng bộ 2 chiều qua Google Sheets & Drive, tích hợp pipeline Crawler & AI (Google Gemini).

[![Vercel](https://img.shields.io/badge/Vercel-Serverless%20Functions-black?logo=vercel)](https://vercel.com)
[![Google Gemini](https://img.shields.io/badge/AI-Gemini%202.0%20Flash-4285F4?logo=google)](https://aistudio.google.com)
[![Playwright](https://img.shields.io/badge/Crawler-Playwright-45ba4b?logo=playwright)](https://playwright.dev)
[![Google Sheets](https://img.shields.io/badge/Database-Google%20Sheets-34A853?logo=googlesheets)](https://sheets.google.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 🌟 Điểm nổi bật

- ⚡ **Tự động bóc tách thông tin từ Google Maps (Smart Autofill)**: Dán link rút gọn `maps.app.goo.gl` hoặc URL Google Maps đầy đủ, hệ thống tự động resolve redirect, truy xuất tên quán, địa chỉ chi tiết, quận huyện, toạ độ địa lý và danh mục phù hợp.
- ☁️ **Đồng bộ đám mây 2 chiều (Google Sheets)**: Sử dụng Google Sheets làm hệ thống cơ sở dữ liệu serverless không tốn chi phí thông qua Google Apps Script Web App. Lưu trữ offline trước tại `LocalStorage` và tự động đẩy đồng bộ khi có kết nối.
- 📷 **Lưu trữ & Cache ảnh Edge (Google Drive + CDN)**: Tải ảnh chụp quán trực tiếp từ điện thoại lên thư mục Google Drive cá nhân; ảnh được nén phía client và phục vụ qua Serverless Edge Cache với thời hạn cache dài lâu, không làm chạm ngưỡng hạn ngạch của Google Drive.
- 🤖 **Pipeline Tự động hoá Crawler & AI**:
  - Tự động cào danh sách ẩm thực từ **Michelin Guide** (Hà Nội, TP.HCM) tuân thủ chính sách robots.txt.
  - Sử dụng **Gemini 2.0 Flash** để phân tích và trích xuất dữ liệu có cấu trúc từ các bài viết review tự do trên Threads, Facebook, Blog.
  - Luồng duyệt dữ liệu an toàn qua tab trung gian `Crawl_Inbox` trước khi đưa lên cẩm nang chính thức.
- 🔍 **Tìm kiếm & Bộ lọc tức thì**: Tìm kiếm tiếng Việt không dấu (`pho` ➔ `Phở`), lọc linh hoạt theo quận/huyện, tầm giá, danh mục món ăn và trạng thái xác minh.
- 🎨 **Giao diện hiện đại & Mobile-first**: Tối ưu hoá hiển thị cho điện thoại di động, hỗ trợ Dark Mode tự động, định vị và mở ứng dụng chỉ đường chỉ với 1 chạm.

---

## 🏗️ Kiến trúc hệ thống

```text
[ Người dùng / Trình duyệt ]
      │
      ├── (1) Dán link Maps  ──► [/api/place] ──► Resolve redirect maps.app.goo.gl ──► Nominatim (OSM)
      │
      ├── (2) Tải ảnh quán    ──► [/api/sheet] ──► Apps Script ──► Google Drive (Lưu ảnh)
      │                                                │
      ├── (3) Đồng bộ quán    ──► [/api/sheet] ──► Apps Script ──► Google Sheet (Database chính)
      │
      └── (4) Xem ảnh thẻ     ──► [/api/photo] ──► Vercel Edge Cache (CDN) ──► Google Drive
                                                          ▲
[ Tool Crawler & AI ]                                      │
      ├── Michelin Guide (Playwright) ─────────────────────┤
      └── Bài viết review ──► Gemini 2.0 Flash ────────────┘ ──► Đẩy vào Sheet (Crawl_Inbox)
```

---

## 🚀 Hướng dẫn cài đặt & Khởi chạy

### 1. Yêu cầu môi trường
- **Node.js** (v18+) hoặc **Vercel CLI** (`npm i -g vercel`)
- **Python** (v3.9+) nếu dùng thêm tính năng Crawler

### 2. Cài đặt nhanh

```bash
# Clone repository
git clone https://github.com/jobox66/foodguide.git
cd foodguide

# Chuẩn bị file cấu hình môi trường (.env)
cp .env.example .env
```

### 3. Chạy môi trường phát triển (Local)

Khuyến khích sử dụng `vercel dev` để hỗ trợ đầy đủ các API backend:

```bash
# Chạy với Vercel dev server (khuyên dùng)
npx vercel dev

# Hoặc mở nhanh giao diện tĩnh (không có các tính năng giải mã link Maps):
npx serve .
```

Mở trình duyệt tại `http://localhost:3000`.

---

## 🤖 Sử dụng bộ công cụ Crawler & AI

Thư mục `crawler/` cung cấp công cụ tự động thu thập và chuẩn hoá dữ liệu quán:

```bash
# 1. Tạo môi trường ảo & cài đặt thư viện
python3 -m venv .venv
source .venv/bin/activate
pip install -r crawler/requirements.txt
python -m playwright install chromium

# 2. Kiểm tra kết nối tới server API
python crawler/run.py check

# 3. Cào dữ liệu Michelin Guide (lưu file cục bộ để kiểm tra)
python crawler/run.py michelin

# 4. Cào bài viết trên Threads & trích xuất quán bằng Gemini AI
python crawler/run.py threads --query "quán ruột hà nội" --parse

# 5. Trích xuất thông tin quán từ file văn bản review bằng Gemini AI
python crawler/run.py parse bai_review.txt

# 6. Đẩy dữ liệu vào tab Crawl_Inbox trên Google Sheet
python crawler/run.py push crawler/out/michelin.json
```

---

## ⚙️ Cấu hình biến môi trường (`.env`)

Dự án sử dụng **duy nhất 1 file `.env`** đặt tại thư mục gốc:

| Biến | Mục đích | Mặc định / Ví dụ |
|---|---|---|
| `ALLOWED_ORIGINS` | Danh sách domain được phép gọi API (nếu tách frontend riêng) | `https://jobox66.github.io` (hoặc để trống) |
| `SHEETS_WEBHOOK_URL` | URL Web App Google Apps Script kết nối Google Sheet & Drive | `https://script.google.com/macros/s/.../exec` |
| `SHEETS_TOKEN` | Mã token xác thực bảo mật giữa Vercel API và Apps Script | Chuỗi bí mật tự đặt |
| `FOODGUIDE_API` | URL trang web đã deploy để crawler đẩy dữ liệu | `https://ten-trang.vercel.app` |
| `FOODGUIDE_SHEET_TAB` | Tab tiếp nhận dữ liệu cào để duyệt tay | `Crawl_Inbox` |
| `GEMINI_API_KEY` | API Key Google Gemini trích xuất dữ liệu bài viết | Lấy tại [Google AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | Phiên bản mô hình AI sử dụng | `gemini-2.0-flash` |
| `CRAWL_DELAY` | Thời gian giãn cách giữa các lượt request cào | `3.0` (giây) |

---

## 🌐 Triển khai lên Vercel (1-Click Deploy)

1. Đẩy mã nguồn lên tài khoản GitHub của bạn.
2. Truy cập [Vercel Dashboard](https://vercel.com/new) và chọn repository vừa tạo.
3. Điền các biến môi trường vào phần **Environment Variables** (theo mẫu trong `.env.example`).
4. Nhấn **Deploy**. Vercel sẽ tự động cấu hình giao diện web tĩnh và các serverless function tại `/api/*`.

---

## 📁 Cấu trúc dự án

```text
foodguide/
├── index.html              # Giao diện ứng dụng chính & các modal chức năng
├── css/
│   └── style.css           # Toàn bộ CSS, hỗ trợ responsive & Dark Mode
├── js/
│   ├── data.js             # Dữ liệu quán khởi tạo, danh mục và profile
│   └── app.js              # Xử lý giao diện, bộ lọc, autofill và đồng bộ
├── api/                    # Vercel Serverless Functions
│   ├── place.js            # Giải mã link rút gọn Google Maps & bảo vệ SSRF
│   ├── sheet.js            # Proxy trung gian bảo mật giao tiếp Google Sheet & Drive
│   └── photo.js            # Phục vụ ảnh Google Drive với Edge Caching
├── crawler/                # Bộ công cụ cào & xử lý dữ liệu AI
│   ├── run.py              # Điểm thực thi lệnh CLI chính
│   ├── michelin.py         # Crawler Playwright cho Michelin Guide
│   ├── threads.py          # Crawler Playwright & GraphQL cho Threads
│   ├── ai_parser.py        # Trích xuất dữ liệu bằng Gemini API
│   ├── push_to_sheet.py    # Kiểm tra và đẩy dữ liệu lên Crawl_Inbox
│   └── config.py           # Cấu hình nạp biến môi trường từ root .env
├── tools/
│   └── sheet-appscript.gs  # Mã nguồn Google Apps Script (triển khai trên Sheet)
├── .env.example            # Mẫu cấu hình biến môi trường tập trung
├── vercel.json             # Cấu hình routing & header bảo mật Vercel
└── README.md
```

---

## 📄 Bản quyền & Tác giả

Phát triển bởi **DucTN** ([@jobox66](https://github.com/jobox66)). Phát hành theo giấy phép [MIT License](LICENSE).
