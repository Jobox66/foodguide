"""
Bước 3: Tầng làm sạch & Trích xuất cấu trúc bằng Gemini AI.
Chuyển đổi bài viết review tự do thành đối tượng chuẩn theo 21 cột của FoodGuide.
"""

import os
import re
import json
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
import requests

from config import GEMINI_API_KEY


SYSTEM_PROMPT = """
Bạn là chuyên gia trích xuất dữ liệu ẩm thực cho trang web FoodGuide Việt Nam.
Nhiệm vụ của bạn là đọc nội dung bài viết chia sẻ trên mạng xã hội (Threads, FB...) và xác định xem đây có phải là bài review/giới thiệu một quán ăn hoặc quán đồ uống cụ thể hay không.

Nếu KHÔNG PHẢI bài review quán ăn cụ thể (ví dụ: tâm sự lan man, hỏi xin địa chỉ chung chung, bán hàng không liên quan), trả về JSON:
{"is_food_place": false}

Nếu ĐÚNG LÀ bài review quán ăn/uống, hãy trích xuất các thông tin sau dưới dạng JSON chuẩn (nếu thiếu thông tin nào hãy để chuỗi rỗng ""):
{
  "is_food_place": true,
  "name": "Tên quán ăn / quán cafe",
  "category": "Chọn 1 trong các nhóm: Phở & Bún | Cơm & Xôi | Đồ nướng & Lẩu | Cà phê & Trà | Ăn vặt | Hải sản | Món Việt | Nhà hàng & Quán ăn",
  "district": "Tên quận/huyện nếu biết (ví dụ: Hoàn Kiếm, Cầu Giấy, Quận 1, Bình Thạnh...)",
  "address": "Địa chỉ chi tiết của quán nếu được nhắc đến",
  "priceRange": "Khoảng giá ước lượng (ví dụ: 35.000đ - 60.000đ)",
  "priceLevel": "Mức giá: '$' (dưới 50k), '$$' (50k - 200k), '$$$' (trên 200k)",
  "mustTry": "Món nên thử nhất theo bài viết",
  "review": "Tóm tắt cảm nhận ngắn gọn, khách quan dưới 2 câu",
  "tags": "Các từ khoá nổi bật cách nhau bởi dấu phẩy (ví dụ: vỉa hè, view đẹp, mở đêm, điều hoà, ngồi chill)",
  "estimatedRating": 4.5
}

Chỉ trả về DUY NHẤT một khối JSON hợp lệ, không giải thích gì thêm.
"""


class AIReviewParser:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or GEMINI_API_KEY

    def parse_raw_post(self, post: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Gửi bài viết thô vào Gemini Flash để phân tích và chuẩn hoá.
        """
        raw_text = post.get("raw_text", "").strip()
        if len(raw_text) < 20:
            return None

        # Nếu chưa cấu hình API Key, dùng bộ phân tích heuristic/fallback
        if not self.api_key or self.api_key == "your_gemini_api_key_here":
            print("  ℹ️ Chưa có GEMINI_API_KEY, đang dùng bộ phân tích dự phòng (regex/heuristic)...")
            return self._heuristic_fallback_parse(post)

        # Gọi Gemini REST API
        parsed_data = self._call_gemini(raw_text)
        if not parsed_data or not parsed_data.get("is_food_place") or not parsed_data.get("name"):
            return None

        slug_name = re.sub(r"[^a-z0-9]+", "-", parsed_data["name"].lower()).strip("-")
        place_id = f"threads-{slug_name}-{int(time.time()) % 10000}"

        images = post.get("images", [])
        main_image = images[0] if images else ""

        # Ghép thành cấu trúc chuẩn 21 cột của FoodGuide
        return {
            "id": place_id,
            "name": parsed_data.get("name", ""),
            "category": parsed_data.get("category", "Nhà hàng & Quán ăn"),
            "district": parsed_data.get("district", ""),
            "address": parsed_data.get("address", ""),
            "rating": float(parsed_data.get("estimatedRating", 4.5)),
            "reviewCount": 10,
            "priceRange": parsed_data.get("priceRange", "30.000đ - 70.000đ"),
            "priceLevel": parsed_data.get("priceLevel", "$$"),
            "time": "08:00 - 22:00",
            "mustTry": parsed_data.get("mustTry", ""),
            "review": parsed_data.get("review", ""),
            "mapsUrl": post.get("post_url", ""),
            "tags": parsed_data.get("tags", "Threads review"),
            "image": main_image,
            "lat": 0.0,
            "lng": 0.0,
            "verified": False,
            "featured": False,
            "dataSource": "threads",
            "updatedAt": datetime.utcnow().isoformat() + "Z",
            "_source_post_url": post.get("post_url", ""),
        }

    def _call_gemini(self, text: str) -> Optional[Dict[str, Any]]:
        """Gọi Google Gemini Flash API"""
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={self.api_key}"

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": SYSTEM_PROMPT},
                        {"text": f"Nội dung bài viết review:\n\"\"\"\n{text}\n\"\"\""}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json"
            }
        }

        try:
            resp = requests.post(endpoint, json=payload, timeout=20)
            if resp.status_code != 200:
                print(f"  ⚠️ Lỗi Gemini API (Status {resp.status_code}): {resp.text[:150]}")
                return None

            data = resp.json()
            raw_json = data["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(raw_json)
        except Exception as e:
            print(f"  ⚠️ Lỗi khi gọi Gemini: {e}")
            return None

    def _heuristic_fallback_parse(self, post: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Bộ bóc tách dự phòng cơ bản khi chưa có Gemini API Key"""
        text = post.get("raw_text", "")
        # Lấy dòng đầu tiên khả dĩ làm tên quán
        lines = [line.strip() for line in text.split("\n") if len(line.strip()) > 3]
        if not lines:
            return None

        first_line = lines[0]
        # Loại bỏ các tiền tố phổ biến
        clean_name = re.sub(r"^(review|quán|quán ruột|phát hiện|must try|địa chỉ)[:\s\-]+", "", first_line, flags=re.I)
        clean_name = clean_name[:40].strip()

        if len(clean_name) < 3:
            clean_name = "Quán ngon Threads"

        slug_name = re.sub(r"[^a-z0-9]+", "-", clean_name.lower()).strip("-")
        images = post.get("images", [])

        return {
            "id": f"threads-{slug_name}-{int(time.time()) % 1000}",
            "name": clean_name,
            "category": "Nhà hàng & Quán ăn",
            "district": "",
            "address": "",
            "rating": 4.5,
            "reviewCount": 10,
            "priceRange": "30.000đ - 70.000đ",
            "priceLevel": "$$",
            "time": "08:00 - 22:00",
            "mustTry": "",
            "review": text[:180] + ("..." if len(text) > 180 else ""),
            "mapsUrl": post.get("post_url", ""),
            "tags": "Threads review, Mới phát hiện",
            "image": images[0] if images else "",
            "lat": 0.0,
            "lng": 0.0,
            "verified": False,
            "featured": False,
            "dataSource": "threads",
            "updatedAt": datetime.utcnow().isoformat() + "Z",
        }
