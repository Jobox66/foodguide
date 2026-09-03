# -*- coding: utf-8 -*-
"""
BƯỚC 2 — Cào danh sách Michelin Guide Vietnam.

VÌ SAO PHẢI DÙNG PLAYWRIGHT CHỨ KHÔNG PHẢI requests + BeautifulSoup:

    Kế hoạch ban đầu ghi Michelin "render HTML tĩnh, dễ crawl, không bị chặn".
    Kiểm tra thực tế thì không phải:

        curl + User-Agent trình duyệt        → HTTP 202, 0 byte
        curl + đủ header như trình duyệt     → HTTP 202, 2012 byte:
            window.awsWafCookieDomainList = [];
            window.gokuProps = {"key":"AQIDAHjcYu/GjX+Qlghic..."}

    Đó là AWS WAF với thử thách JavaScript. Thư viện HTTP thuần nhận đúng
    trang thử thách này và không có link quán nào. Phải chạy trình duyệt thật
    để nó tự giải, nên bước này KHÔNG nhanh hơn bước cào mạng xã hội.

GIỚI HẠN TỰ ĐẶT:

  • Chỉ đi đường phân trang thuần /page/N. robots.txt cấm mọi URL có tham số
    lọc, sắp xếp, toạ độ — xem ghi chú trong config.py.
  • Nghỉ giữa các trang (CRAWL_DELAY, mặc định 3 giây).
  • Dùng trình duyệt bình thường. KHÔNG cài plugin giấu dấu vết, không xoay
    proxy, không giải captcha. Nếu Michelin vẫn chặn thì đó là họ từ chối,
    và câu trả lời là dừng lại chứ không phải luồn lách thêm.
  • Không lấy ảnh (bản quyền), không đặt số sao (Michelin không chấm thang 1–5).
"""

import re
import sys
import time

from config import (MICHELIN_START_URLS, REQUEST_DELAY_SECONDS, MAX_PAGES,
                    PAGE_TIMEOUT_MS, USER_AGENT, HANOI_DISTRICTS)
from schema import to_place, strip_accents, price_level_from_vnd

# Hạng Michelin — đưa vào tags, KHÔNG quy đổi thành số sao
DISTINCTIONS = {
    "three-stars-green": "Michelin 3 sao",
    "two-stars-green": "Michelin 2 sao",
    "one-star-green": "Michelin 1 sao",
    "bib-gourmand": "Bib Gourmand",
    "selected-restaurants": "Michelin Selected",
}


def extract_district(address):
    """Tách quận nội thành ra khỏi địa chỉ đầy đủ"""
    plain = strip_accents(address)
    for district in HANOI_DISTRICTS:
        if strip_accents(district) in plain:
            return district
    return ""


def parse_price_range(text):
    """
    "200.000 - 500.000 ₫"  →  ("200.000đ - 500.000đ", "high")
    Không đọc được số thì trả rỗng, không đoán.
    """
    if not text:
        return "", ""

    numbers = [int(n.replace(".", "").replace(",", ""))
               for n in re.findall(r"\d[\d.,]{2,}", text)]
    if not numbers:
        return "", ""

    low = min(numbers)
    high = max(numbers)
    label = f"{low:,}đ - {high:,}đ".replace(",", ".") if low != high else f"{low:,}đ".replace(",", ".")
    return label, price_level_from_vnd(low, high)


def collect_cards(page):
    """Đọc các thẻ quán trên một trang danh sách"""
    return page.evaluate("""() => {
        const out = [];
        document.querySelectorAll('a[href*="/restaurant/"]').forEach(link => {
            const card = link.closest('div');
            if (!card) return;
            const name = (link.textContent || '').trim();
            if (!name || name.length > 120) return;
            out.push({
                name,
                url: link.href,
                text: (card.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 400),
                classes: card.className || ''
            });
        });
        return out;
    }""")


def detect_distinction(blob):
    plain = strip_accents(blob)
    for key, label in DISTINCTIONS.items():
        if key.replace("-", " ") in plain.replace("-", " "):
            return label
    if "bib gourmand" in plain:
        return "Bib Gourmand"
    if "star" in plain or " sao" in plain:
        return "Michelin"
    return "Michelin Selected"


def crawl(start_urls=None, max_pages=None, headless=True):
    """Trả về danh sách bản ghi đã chuẩn hoá theo schema.to_place()"""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Chưa cài Playwright. Chạy:\n"
              "    pip install -r crawler/requirements.txt\n"
              "    python -m playwright install chromium", file=sys.stderr)
        return []

    start_urls = start_urls or MICHELIN_START_URLS
    max_pages = max_pages or MAX_PAGES
    places = []
    seen_urls = set()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(user_agent=USER_AGENT, locale="vi-VN")
        page = context.new_page()

        for start_url in start_urls:
            for page_number in range(1, max_pages + 1):
                url = start_url if page_number == 1 else f"{start_url}/page/{page_number}"
                print(f"  → {url}")

                try:
                    page.goto(url, timeout=PAGE_TIMEOUT_MS, wait_until="domcontentloaded")
                    # Chờ WAF giải xong thử thách rồi trang mới có nội dung thật
                    page.wait_for_selector('a[href*="/restaurant/"]', timeout=PAGE_TIMEOUT_MS)
                except Exception as e:
                    message = str(e).splitlines()[0]
                    if page_number == 1:
                        print(f"     ✗ không mở được: {message}")
                        print("       Nếu lặp lại, khả năng cao Michelin đang chặn. Dừng ở đây,"
                              " đừng tìm cách lách.")
                    else:
                        print(f"     hết trang ({message[:60]})")
                    break

                cards = collect_cards(page)
                if not cards:
                    print("     hết trang")
                    break

                new_on_page = 0
                for card in cards:
                    if card["url"] in seen_urls:
                        continue
                    seen_urls.add(card["url"])

                    blob = card["text"] + " " + card["classes"]
                    address = ""
                    # Địa chỉ thường là đoạn ngay sau tên quán trong thẻ
                    after_name = card["text"].split(card["name"], 1)[-1].strip()
                    if after_name:
                        address = after_name.split("·")[0].strip()[:160]

                    price_range, price_level = parse_price_range(blob)

                    place = to_place({
                        "name": card["name"],
                        "address": address,
                        "district": extract_district(address),
                        "priceRange": price_range,
                        "priceLevel": price_level,
                        "mapsUrl": "",          # để trang tự tra bằng /api/place sau
                        "tags": [detect_distinction(blob)],
                        "review": "",           # không chép mô tả có bản quyền của Michelin
                    }, source="michelin")

                    if place:
                        places.append(place)
                        new_on_page += 1

                print(f"     +{new_on_page} quán (tổng {len(places)})")
                time.sleep(REQUEST_DELAY_SECONDS)

        browser.close()

    return places


if __name__ == "__main__":
    found = crawl(headless="--show" not in sys.argv)
    print(f"\nXong: {len(found)} quán.")
    for place in found[:5]:
        print(f"  {place['id']}  |  {place['name']}  |  {place['district'] or '?'}  |  {place['tags']}")
