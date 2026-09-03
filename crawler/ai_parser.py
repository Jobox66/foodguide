# -*- coding: utf-8 -*-
"""
BƯỚC 3 — Trích xuất quán ăn từ văn bản tự do bằng Gemini.

BA CHỖ SỬA SO VỚI PROMPT TRONG crawl.md:

  1. TRẢ VỀ MẢNG, KHÔNG PHẢI MỘT OBJECT.
     Một bài "5 quán ruột Hà Nội" có năm quán. Schema cũ chỉ nhận một object
     nên bốn quán còn lại bị mất mà không ai biết.

  2. CẤM SUY ĐOÁN.
     Không nói rõ thì mô hình sẽ tự đoán quận từ tên đường, đoán giá từ loại
     món, đoán danh mục từ cảm giác. Đó là bịa dữ liệu — đúng thứ cả dự án
     này đã bỏ công gỡ bỏ. Prompt phải nói thẳng: không có thì để rỗng.

  3. DÙNG STRUCTURED OUTPUT.
     Gọi thẳng thì Gemini hay bọc JSON trong ```json … ```, rồi mỗi lần đổi
     model lại phải sửa hàm bóc tách. Khai báo response_schema thì nó trả
     JSON thuần, đúng kiểu, không cần bóc.

Không đặt số sao, không bật verified, không lấy ảnh — xem schema.py.
"""

import json
import sys

from config import GEMINI_API_KEY, GEMINI_MODEL
from schema import CATEGORY_IDS, to_place

PROMPT = """Bạn là trợ lý dữ liệu cho một cẩm nang ẩm thực cá nhân.

Đọc bài viết dưới đây và trích xuất MỌI quán ăn/đồ uống được nhắc tới.
Một bài có thể nói về nhiều quán — trả về đủ tất cả.

QUY TẮC BẮT BUỘC:
- Chỉ ghi lại thông tin CÓ TRONG BÀI. Tuyệt đối không suy luận, không đoán,
  không bổ sung kiến thức của bạn về quán đó.
- Không rõ trường nào thì để chuỗi rỗng "". Để trống là đúng; đoán là sai.
- Đặc biệt: KHÔNG suy ra quận từ tên đường. Bài không ghi quận thì để rỗng.
- KHÔNG tự chấm điểm, không ước lượng số sao hay lượt đánh giá.
- Bài không nhắc quán ăn nào thì trả về danh sách rỗng.

category chỉ được nhận đúng một trong các giá trị sau (hoặc rỗng):
{categories}

priceLevel chỉ nhận: low (dưới 50k), mid (50k–150k), high (trên 150k), hoặc rỗng.

BÀI VIẾT:
---
{post}
---"""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "places": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "category": {"type": "string", "enum": CATEGORY_IDS + [""]},
                    "district": {"type": "string"},
                    "address": {"type": "string"},
                    "priceRange": {"type": "string"},
                    "priceLevel": {"type": "string", "enum": ["low", "mid", "high", ""]},
                    "mustTry": {"type": "string"},
                    "review": {"type": "string"},
                    "tags": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["name"],
            },
        }
    },
    "required": ["places"],
}


def parse_post(text, source="threads"):
    """
    Một bài viết  →  danh sách bản ghi đã chuẩn hoá.
    Trả [] nếu bài không nói về quán ăn nào, hoặc nếu gọi API thất bại.
    """
    if not GEMINI_API_KEY:
        print("Chưa có GEMINI_API_KEY. Lấy khoá miễn phí ở "
              "https://aistudio.google.com/apikey rồi điền vào crawler/.env",
              file=sys.stderr)
        return []

    if not text or len(text.strip()) < 20:
        return []

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print("Chưa cài SDK. Chạy: pip install -r crawler/requirements.txt", file=sys.stderr)
        return []

    client = genai.Client(api_key=GEMINI_API_KEY)
    prompt = PROMPT.format(
        categories="\n".join("  - " + c for c in CATEGORY_IDS),
        post=text.strip()[:8000],
    )

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=RESPONSE_SCHEMA,
                temperature=0,   # trích xuất, không sáng tác
            ),
        )
        data = json.loads(response.text)
    except Exception as e:
        print(f"  ✗ Gemini lỗi: {e}", file=sys.stderr)
        return []

    results = []
    for item in data.get("places", []):
        place = to_place(item, source=source)
        if place:
            results.append(place)
    return results


def parse_many(posts, source="threads"):
    """Nhiều bài viết → danh sách quán, đã bỏ trùng theo id"""
    by_id = {}
    for index, post in enumerate(posts, 1):
        print(f"  [{index}/{len(posts)}] đang đọc…")
        for place in parse_post(post, source=source):
            # Cùng quán ở nhiều bài thì giữ bản đầy đủ hơn
            existing = by_id.get(place["id"])
            if not existing or len(str(existing)) < len(str(place)):
                by_id[place["id"]] = place
    return list(by_id.values())


if __name__ == "__main__":
    sample = """Mình mê nhất Phở Bát Đàn ở Hoàn Kiếm, bát tái gầu 60k ăn sáng
    là chuẩn bài. Với cả Cà phê Giảng phố Nguyễn Hữu Huân, cà phê trứng 35k,
    ngồi tầng 2 nhìn xuống phố rất chill."""
    for place in parse_post(sample):
        print(json.dumps(place, ensure_ascii=False, indent=2))
