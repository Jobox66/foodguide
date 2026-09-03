# FOODGUIDE CRAWLER - HƯỚNG DẪN SỬ DỤNG VỚI `uv`

Hệ sinh thái tự động thu thập và làm sạch dữ liệu quán ăn/uống cho **FoodGuide**:
- **Bước 1**: Cào danh sách chuẩn từ **Michelin Guide Vietnam** (Hà Nội, TP.HCM, Đà Nẵng).
- **Bước 2**: Cào bài review chia sẻ "quán ruột" trên **Threads** bằng Playwright.
- **Bước 3**: Bóc tách bài review tự do thành bảng 21 cột chuẩn bằng **Google Gemini Flash AI**.
- **Bước 4**: Tự động sao lưu ngoại tuyến (`.json`, `.csv`) và đồng bộ lên **Google Sheets**.

---

## 1. Cài đặt môi trường ảo với `uv`

Nếu máy bạn chưa có `uv`, cài nhanh bằng lệnh PowerShell:
```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### Khởi tạo môi trường ảo và cài đặt thư viện:
Di chuyển vào thư mục `crawler`:
```powershell
cd d:\1.tangocduc\Code\foodguide\crawler
```

Dùng `uv` để đồng bộ thư viện từ `pyproject.toml`:
```powershell
uv sync
```
*(Nếu cần cài thêm Playwright browser cho Bước 2 cào Threads):*
```powershell
uv run playwright install chromium
```

---

## 2. Cấu hình biến môi trường (`.env`)

Tạo file `.env` từ file mẫu `.env.example`:
```powershell
copy .env.example .env
```

Mở file `.env` và điền:
1. **`GEMINI_API_KEY`**: Lấy miễn phí tại [Google AI Studio](https://aistudio.google.com/) (Dùng cho Bước 3 AI phân tích).
2. **`SHEETS_WEBHOOK_URL`** & **`SHEETS_TOKEN`**: Link Webhook và Token từ file `sheet-appscript.gs` của bạn (Dùng cho Bước 4 tự động đồng bộ vào Sheet).

---

## 3. Các lệnh chạy cơ bản

`uv run` sẽ tự động kích hoạt môi trường ảo mà bạn không cần phải `activate` thủ công:

### A. Chỉ cào danh sách nhà hàng Michelin Guide VN:
```powershell
uv run main.py --source michelin --max-pages 2 --dry-run
```
*(Bỏ `--dry-run` nếu muốn đồng bộ ngay vào Google Sheet)*

### B. Chỉ cào bài review trên Threads + Phân tích bằng Gemini AI:
```powershell
uv run main.py --source threads --query "quán ngon hà nội" --max-posts 10 --dry-run
```

Nếu muốn hiển thị cửa sổ trình duyệt để quan sát Playwright cuộn trang:
```powershell
uv run main.py --source threads --query "quán ngon sài gòn" --no-headless
```

### C. Chạy toàn bộ pipeline (Michelin + Threads + AI + Đồng bộ):
```powershell
uv run main.py --source all
```

---

## 4. Dữ liệu đầu ra (Output)

Mỗi lần chạy, dữ liệu sẽ tự động được lưu vào thư mục `crawler/output/`:
- File **`.json`**: Chứa toàn bộ mảng dữ liệu có cấu trúc.
- File **`.csv`**: Bạn có thể mở trực tiếp bằng Microsoft Excel để xem, lọc hoặc copy paste thủ công bất kỳ lúc nào.
