"""
Bước 4: Đồng bộ dữ liệu vào Google Sheet & Tự động sao lưu ngoại tuyến.
Hỗ trợ cả 2 cách:
  - Cách 1: Gửi qua Webhook/API Proxy của FoodGuide (/api/sheet) - Không cần Google Cloud GCP
  - Cách 2: Ghi trực tiếp bằng Service Account qua gspread (tuỳ chọn)
  - Luôn tự động backup ra file JSON và CSV trong thư mục output/
"""

import os
import csv
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
import requests

from config import (
    OUTPUT_DIR,
    SHEETS_API_URL,
    SHEETS_WEBHOOK_URL,
    SHEETS_TOKEN,
    GOOGLE_SERVICE_ACCOUNT_FILE,
    GOOGLE_SHEET_ID
)


# Danh sách 21 cột chuẩn của FoodGuide khớp 100% với sheet-appscript.gs
COLUMNS = [
    "id", "name", "category", "district", "address",
    "rating", "reviewCount", "priceRange", "priceLevel", "time",
    "mustTry", "review", "mapsUrl", "tags", "image",
    "lat", "lng", "verified", "featured", "dataSource", "updatedAt"
]


class SheetSyncer:
    def __init__(self):
        self.output_dir = OUTPUT_DIR

    def backup_to_files(self, places: List[Dict[str, Any]], prefix: str = "crawl") -> Dict[str, str]:
        """
        Lưu dữ liệu ra file JSON và CSV ngoại tuyến trong crawler/output/.
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        json_path = self.output_dir / f"{prefix}_{timestamp}.json"
        csv_path = self.output_dir / f"{prefix}_{timestamp}.csv"

        # 1. Lưu JSON
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(places, f, ensure_ascii=False, indent=2)

        # 2. Lưu CSV
        with open(csv_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
            writer.writeheader()
            for p in places:
                # Đảm bảo các trường không bị thiếu
                row = {k: p.get(k, "") for k in COLUMNS}
                writer.writerow(row)

        print(f"💾 Đã sao lưu {len(places)} quán ra file:")
        print(f"   • JSON: {json_path}")
        print(f"   • CSV : {csv_path}")

        return {"json": str(json_path), "csv": str(csv_path)}

    def sync_to_sheet(self, places: List[Dict[str, Any]]) -> bool:
        """
        Đẩy dữ liệu quán lên Google Sheet.
        Ưu tiên qua Webhook/API Proxy FoodGuide trước, nếu không có thì thử Service Account GCP.
        """
        if not places:
            print("ℹ️ Không có dữ liệu để đồng bộ.")
            return False

        # Thử Cách 1: Qua API Proxy hoặc Webhook Apps Script
        target_url = SHEETS_API_URL or SHEETS_WEBHOOK_URL
        if target_url and SHEETS_TOKEN:
            print(f"🌐 Đang đồng bộ {len(places)} quán lên Google Sheet qua Webhook/API...")
            return self._sync_via_webhook(places, target_url, SHEETS_TOKEN)

        # Thử Cách 2: Qua gspread Service Account
        if GOOGLE_SERVICE_ACCOUNT_FILE and os.path.exists(GOOGLE_SERVICE_ACCOUNT_FILE) and GOOGLE_SHEET_ID:
            print(f"🔑 Đang đồng bộ {len(places)} quán lên Google Sheet qua Service Account GCP...")
            return self._sync_via_service_account(places)

        print("\n⚠️ CHƯA CẤU HÌNH ĐỒNG BỘ GOOGLE SHEET:")
        print("   Dữ liệu đã được lưu an toàn trong file JSON/CSV ở thư mục 'crawler/output/'.")
        print("   Để đồng bộ tự động lên Sheet, hãy điền SHEETS_WEBHOOK_URL và SHEETS_TOKEN trong file 'crawler/.env'.")
        return False

    def _sync_via_webhook(self, places: List[Dict[str, Any]], url: str, token: str) -> bool:
        """Gửi request POST tới /api/sheet hoặc Apps Script Webhook"""
        payload = {
            "token": token,
            "action": "push",
            "places": places
        }

        try:
            resp = requests.post(url, json=payload, timeout=30)
            if resp.status_code == 200:
                res = resp.json()
                if res.get("ok"):
                    print(f"🎉 Đồng bộ Google Sheet thành công! (Thêm mới: {res.get('added', 0)}, Cập nhật: {res.get('updated', 0)})")
                    return True
                else:
                    print(f"❌ Google Sheet trả về lỗi: {res.get('error')}")
            else:
                print(f"❌ Lỗi HTTP khi gọi Sheet API: {resp.status_code} - {resp.text[:200]}")
        except Exception as e:
            print(f"❌ Lỗi kết nối đến Google Sheet API: {e}")

        return False

    def _sync_via_service_account(self, places: List[Dict[str, Any]]) -> bool:
        """Ghi trực tiếp vào Google Sheet bằng gspread Service Account"""
        try:
            import gspread
            gc = gspread.service_account(filename=GOOGLE_SERVICE_ACCOUNT_FILE)
            sh = gc.open_by_key(GOOGLE_SHEET_ID)

            # Tìm hoặc tạo tab Crawl_Inbox
            try:
                sheet = sh.worksheet("Crawl_Inbox")
            except Exception:
                sheet = sh.add_worksheet(title="Crawl_Inbox", rows="1000", cols="25")
                sheet.append_row(COLUMNS)

            # Chuẩn bị dữ liệu dạng hàng
            rows = []
            for p in places:
                row = [str(p.get(k, "")) for k in COLUMNS]
                rows.append(row)

            sheet.append_rows(rows)
            print(f"🎉 Đã thêm {len(rows)} hàng vào tab 'Crawl_Inbox' qua Google Sheets API!")
            return True
        except Exception as e:
            print(f"❌ Lỗi khi dùng gspread: {e}")
            return False
