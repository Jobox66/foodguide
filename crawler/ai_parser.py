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
import os
import sys
import time

from config import GEMINI_API_KEY, GEMINI_MODEL
from schema import CATEGORY_IDS, to_place

# Gộp bao nhiêu bài vào một lượt gọi. Free tier gemini-3.6-flash cho 20
# lượt/ngày và 5 lượt/phút, tính theo LƯỢT GỌI chứ không theo số chữ.
BATCH_SIZE = int(os.environ.get("GEMINI_BATCH_SIZE", "12"))
MAX_CHARS_PER_POST = int(os.environ.get("GEMINI_MAX_CHARS", "2500"))

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

Riêng hai trường category và priceLevel: không chắc thì BỎ HẲN trường đó ra
khỏi kết quả, đừng ghi chuỗi rỗng.

category chỉ được nhận đúng một trong các giá trị sau:
{categories}

priceLevel chỉ nhận: low (dưới 50k), mid (50k–150k), high (trên 150k).

Dưới đây là NHIỀU bài viết, mỗi bài mở đầu bằng một dòng đánh số riêng.
Đọc hết tất cả, gộp quán của mọi bài vào cùng một danh sách "places".
Cùng một quán xuất hiện ở nhiều bài thì chỉ trả về một lần, lấy bản đầy đủ nhất.

{posts}"""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "places": {
            "type": "array",
            "items": {
                "type": "object",
                # enum KHÔNG phải trang trí: nó chặn mô hình trả về "Cà phê & Trà"
                # thay cho "cafe-chill", hay "$$" thay cho "mid" — hai giá trị
                # trông hợp lý nhưng làm quán rơi khỏi bộ lọc của trang.
                # (Hàng rào này từng bị mất trong một lần merge.)
                #
                # KHÔNG thêm "" vào enum: API từ chối thẳng
                #     enum[8]: cannot be empty  (HTTP 400)
                # Không biết thì mô hình BỎ HẲN trường đó — hai trường này không
                # nằm trong "required", và to_place() đọc bằng .get() nên thiếu
                # cũng không sao. Đây gần như chắc là lý do lần merge trước gỡ
                # enum đi: gỡ thì hết lỗi, nhưng mất luôn hàng rào.
                "properties": {
                    "name": {"type": "string"},
                    "category": {"type": "string", "enum": list(CATEGORY_IDS)},
                    "district": {"type": "string"},
                    "address": {"type": "string"},
                    "priceRange": {"type": "string"},
                    "priceLevel": {"type": "string", "enum": ["low", "mid", "high"]},
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


def parse_batch(texts, source="threads"):
    """
    NHIỀU bài viết  →  danh sách bản ghi, bằng ĐÚNG MỘT lượt gọi API.

    Vì sao phải gộp: hạn mức free tier tính theo LƯỢT GỌI, không theo số chữ —
    20 lượt/ngày cho gemini-3.6-flash. Gọi một lượt cho mỗi bài nghĩa là mỗi
    ngày chỉ đọc được 20 bài, và một mẻ cào 27 bài đã văng 429 giữa chừng.
    Gộp 12 bài một lượt thì cùng mẻ đó chỉ tốn 3 lượt.

    Đổi sang model khác KHÔNG giải quyết được (và gemini-2.0-flash thì đã bị
    Google gỡ hẳn) — gộp lượt gọi mới là cách đúng.
    """
    texts = [t.strip()[:MAX_CHARS_PER_POST] for t in texts if t and len(t.strip()) >= 20]
    if not texts:
        return []

    if not GEMINI_API_KEY:
        print("Chưa có GEMINI_API_KEY. Lấy khoá miễn phí ở "
              "https://aistudio.google.com/apikey rồi điền vào file .env",
              file=sys.stderr)
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
        posts="\n\n".join(f"===== BÀI {i} =====\n{t}" for i, t in enumerate(texts, 1)),
    )

    data = None
    for attempt in range(1, 4):
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
            break
        except Exception as e:
            if ("503" in str(e) or "UNAVAILABLE" in str(e)) and attempt < 3:
                time.sleep(2 * attempt)
                continue
            print(f"  ✗ Gemini lỗi: {e}", file=sys.stderr)
            return []

    if not data:
        return []

    results = []
    for item in data.get("places", []):
        place = to_place(item, source=source)
        if place:
            results.append(place)
    return results


IMAGE_PROMPT = """Bạn là trợ lý dữ liệu cho một cẩm nang ẩm thực cá nhân.

Các ảnh dưới đây lấy từ phần bình luận một bài viết về quán ăn ở Sài Gòn.
Nhiều ảnh là ẢNH CHỤP MÀN HÌNH một danh sách quán, hoặc ảnh có ghi chú tên và
địa chỉ quán. Hãy ĐỌC CHỮ trong ảnh và trích ra mọi quán ăn/đồ uống thấy được.

QUY TẮC BẮT BUỘC:
- Chỉ đọc những gì NHÌN THẤY trong ảnh. Không suy luận, không bổ sung kiến thức
  của bạn về quán đó, không đoán địa chỉ.
- Ảnh mờ hoặc không đọc rõ tên thì BỎ QUA, đừng đoán chữ.
- Ảnh chỉ chụp món ăn / sản phẩm mà không có chữ tên quán thì bỏ qua.
- KHÔNG tự chấm điểm, không ước lượng số sao hay lượt đánh giá.
- Không có quán nào đọc được thì trả về danh sách rỗng.

Riêng hai trường category và priceLevel: không chắc thì BỎ HẲN trường đó.

category chỉ được nhận đúng một trong các giá trị sau:
{categories}

priceLevel chỉ nhận: low (dưới 50k), mid (50k–150k), high (trên 150k).

Ngữ cảnh chữ đi kèm các ảnh này:
{context}"""


def parse_images(image_paths, context="", source="threads"):
    """
    Đọc chữ trong ảnh rồi trích quán — MỘT lượt gọi cho cả nhóm ảnh.

    Vì sao cần: câu trả lời giá trị nhất trên Threads thường không gõ tên quán
    ra chữ mà chụp màn hình cả một danh sách. Chỉ đọc text là bỏ đúng phần đó.
    Gemini đọc được chữ trong ảnh nên không cần thêm thư viện OCR nào.
    """
    paths = [p for p in image_paths if os.path.isfile(p)]
    if not paths or not GEMINI_API_KEY:
        return []

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print("Chưa cài SDK. Chạy: pip install -r crawler/requirements.txt", file=sys.stderr)
        return []

    client = genai.Client(api_key=GEMINI_API_KEY)
    parts = [IMAGE_PROMPT.format(
        categories="\n".join("  - " + c for c in CATEGORY_IDS),
        context=(context or "(không có)")[:3000],
    )]
    for path in paths:
        with open(path, "rb") as f:
            parts.append(types.Part.from_bytes(data=f.read(), mime_type="image/jpeg"))

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=parts,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=RESPONSE_SCHEMA,
                temperature=0,
            ),
        )
        data = json.loads(response.text)
    except Exception as e:
        print(f"  ✗ Gemini lỗi khi đọc ảnh: {e}", file=sys.stderr)
        return []

    results = []
    for item in data.get("places", []):
        place = to_place(item, source=source)
        if place:
            results.append(place)
    return results


def parse_post(text, source="threads"):
    """Một bài viết → danh sách bản ghi. Chỉ là parse_batch với đúng một bài."""
    return parse_batch([text], source=source)


def parse_many(posts, source="threads"):
    """Nhiều bài viết → danh sách quán, đã bỏ trùng theo id"""
    by_id = {}
    lots = [posts[i:i + BATCH_SIZE] for i in range(0, len(posts), BATCH_SIZE)]

    print(f"  {len(posts)} bài → {len(lots)} lượt gọi Gemini"
          f" (gộp {BATCH_SIZE} bài/lượt, hạn mức free tier tính theo lượt gọi)")

    for index, lot in enumerate(lots, 1):
        print(f"  [{index}/{len(lots)}] đang đọc {len(lot)} bài…")
        for place in parse_batch(lot, source=source):
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
