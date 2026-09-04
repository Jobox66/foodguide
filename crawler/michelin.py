# -*- coding: utf-8 -*-
"""
BƯỚC 2 — Cào danh sách Michelin Guide Vietnam.

VÌ SAO PHẢI DÙNG PLAYWRIGHT CHỨ KHÔNG PHẢI requests + BeautifulSoup:

    Kế hoạch ban đầu ghi Michelin "render HTML tĩnh, dễ crawl, không bị chặn".
    Đo thực tế thì không phải:

        curl + User-Agent trình duyệt        → HTTP 202, 0 byte
        curl + đủ header như trình duyệt     → HTTP 202, 2012 byte:
            window.awsWafCookieDomainList = [];
            window.gokuProps = {"key":"AQIDAHjcYu/GjX+Qlghic..."}

    Đó là AWS WAF với thử thách JavaScript. Thư viện HTTP thuần nhận đúng trang
    thử thách này và không có link quán nào. Trình duyệt thật thì tự giải xong
    và vào được bình thường — đã kiểm: mở bằng Playwright ra HTTP 200, 163 link
    quán ở trang Hà Nội, và trong HTML không còn dấu vết WAF.

CẤU TRÚC TRANG (đã dò trực tiếp, không đoán):

    div.card__menu                          một thẻ quán (52 thẻ/trang)
      h3.card__menu-content--title          tên quán
      div.card__menu-content--distinction   hạng: Star / Bib Gourmand / Selected
      div.card__menu-footer--score          "Hanoi, Vietnam"
      a[href*="/restaurant/"]               link trang chi tiết
    Dòng giá nằm trong innerText: "₫₫ · Vietnamese Contemporary"
    Phân trang: .../restaurants/page/2

    Trang danh sách KHÔNG có địa chỉ đường phố, chỉ có tên thành phố. Nên quận
    để trống — người duyệt tự điền, hoặc dán link Google Maps cho trang tự tra.

GIỚI HẠN TỰ ĐẶT:

  • Chỉ đi đường phân trang thuần /page/N. robots.txt cấm mọi URL có tham số
    lọc, sắp xếp, toạ độ — xem ghi chú trong config.py.
  • Nghỉ giữa các trang (CRAWL_DELAY, mặc định 3 giây).
  • Trình duyệt bình thường. KHÔNG plugin giấu dấu vết, không xoay proxy, không
    giải captcha. Michelin chặn thì đó là họ từ chối, và câu trả lời là dừng.
  • Không lấy ảnh (bản quyền), không đặt số sao (Michelin không chấm thang 1–5).
"""

import re
import sys
import time

from config import (MICHELIN_START_URLS, REQUEST_DELAY_SECONDS, MAX_PAGES,
                    PAGE_TIMEOUT_MS, USER_AGENT)
from schema import to_place, strip_accents

CARD_SELECTOR = "div.card__menu"

# Ký hiệu giá của Michelin, không phải số tiền. Quy ước của họ: càng nhiều ký
# hiệu càng đắt, thang 1–4.
PRICE_SYMBOL_LEVELS = {1: "low", 2: "mid", 3: "high", 4: "high"}

# Loại ẩm thực → danh mục trong cẩm nang. Chỉ ánh xạ những loại rõ ràng;
# "Vietnamese" quá rộng (có thể là phở, cơm, lẩu...) nên để trống cho người
# duyệt tự chọn, thay vì gán bừa.
CUISINE_TO_CATEGORY = {
    "french": "do-a-au", "italian": "do-a-au", "european": "do-a-au",
    "japanese": "do-a-au", "korean": "do-a-au", "chinese": "do-a-au",
    "thai": "do-a-au", "indian": "do-a-au", "american": "do-a-au",
    "sushi": "do-a-au", "steakhouse": "do-a-au", "mediterranean": "do-a-au",
    "street food": "an-vat", "noodles": "mon-soi", "cafe": "cafe-chill",
    "barbecue": "lau-nuong", "hot pot": "lau-nuong",
}


def parse_card_text(text, hotel=""):
    """
    "Reserve a table Le Beaulieu Hanoi, Vietnam ₫₫₫₫ · French Sofitel Legend..."
    → (số ký hiệu giá, loại ẩm thực)

    Tên khách sạn dính ngay sau loại ẩm thực và chỉ cách một dấu cách, nên không
    cắt được bằng khoảng trắng. Nhưng nó có element riêng
    (.card__menu-footer--restaurant), nên trừ thẳng chuỗi đó ra.
    """
    symbols = re.search(r"([₫$€£]{1,4})\s*·\s*(.{0,80})", text or "")
    if not symbols:
        return 0, ""

    cuisine = symbols.group(2).strip()
    if hotel:
        cuisine = cuisine.replace(hotel, "").strip()
    return len(symbols.group(1)), cuisine[:60]


def read_distinction(award_srcs):
    """
    Hạng Michelin hiển thị bằng icon SVG, KHÔNG phải chữ:
        /assets/images/icons/michelin-star_8519.svg      → sao (đếm số icon)
        /assets/images/icons/bib-gourmand_....svg        → Bib Gourmand
        không có icon nào                                → Selected
    Đọc nhầm chỗ thì mọi quán đều thành "Selected" và mất sạch thông tin hạng.
    """
    blob = " ".join(award_srcs or []).lower()
    if "bib" in blob:
        return "Bib Gourmand"

    stars = sum(1 for src in (award_srcs or []) if "star" in (src or "").lower())
    if stars:
        return f"MICHELIN {stars} sao"
    return "MICHELIN Selected"


def category_from_cuisine(cuisine):
    plain = strip_accents(cuisine)
    for keyword, category_id in CUISINE_TO_CATEGORY.items():
        if keyword in plain:
            return category_id
    return ""


def read_cards(page):
    """Đọc mọi thẻ quán trên trang hiện tại"""
    return page.evaluate("""(selector) => {
        const text = (root, sel) => {
            const el = root.querySelector(sel);
            return el ? (el.innerText || '').replace(/\\s+/g, ' ').trim() : '';
        };
        return [...document.querySelectorAll(selector)].map(card => {
            const link = card.querySelector('a[href*="/restaurant/"]');
            return {
                href: link ? link.href : '',
                name: text(card, '.card__menu-content--title'),
                // Hạng là icon SVG, phải đọc src chứ không đọc chữ
                awards: [...card.querySelectorAll('img.michelin-award')]
                    .map(i => i.getAttribute('src') || i.getAttribute('data-src') || ''),
                hotel: text(card, '.card__menu-footer--restaurant'),
                location: text(card, '.card__menu-footer--score'),
                all: (card.innerText || '').replace(/\\s+/g, ' ').trim()
            };
        }).filter(c => c.name && c.href);
    }""", CARD_SELECTOR)


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
    seen = set()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(user_agent=USER_AGENT, locale="en-US")
        page = context.new_page()

        for start_url in start_urls:
            for page_number in range(1, max_pages + 1):
                url = start_url if page_number == 1 else f"{start_url}/page/{page_number}"
                print(f"  → {url}")

                try:
                    page.goto(url, timeout=PAGE_TIMEOUT_MS, wait_until="domcontentloaded")
                    page.wait_for_selector(CARD_SELECTOR, timeout=PAGE_TIMEOUT_MS)
                except Exception as e:
                    reason = str(e).splitlines()[0][:70]
                    if page_number == 1:
                        print(f"     ✗ không mở được: {reason}")
                        print("       Kiểm tra URL còn đúng không. Nếu trang mở tay được mà đây"
                              " không được, Michelin đang chặn — dừng lại, đừng tìm cách lách.")
                    else:
                        print(f"     hết trang")
                    break

                cards = read_cards(page)
                if not cards:
                    print("     hết trang")
                    break

                added = 0
                for card in cards:
                    if card["href"] in seen:
                        continue
                    seen.add(card["href"])

                    symbol_count, cuisine = parse_card_text(card["all"], card.get("hotel", ""))

                    tags = [read_distinction(card.get("awards"))]
                    if cuisine:
                        tags.append(cuisine)
                    if card.get("hotel"):
                        tags.append(card["hotel"])

                    place = to_place({
                        "name": card["name"],
                        # Trang danh sách chỉ có "Hanoi, Vietnam" — không phải địa chỉ
                        "address": "",
                        "district": "",
                        "category": category_from_cuisine(cuisine),
                        "priceRange": "₫" * symbol_count if symbol_count else "",
                        "priceLevel": PRICE_SYMBOL_LEVELS.get(symbol_count, ""),
                        "tags": tags,
                        "review": "",   # không chép mô tả có bản quyền của Michelin
                    }, source="michelin")

                    if place:
                        places.append(place)
                        added += 1

                print(f"     +{added} quán (tổng {len(places)})")

                # Hết trang, Michelin KHÔNG trả trang rỗng — họ lặp lại trang cuối.
                # Nên mốc dừng là "không thêm được quán nào mới", chứ không phải
                # "không có thẻ nào". Thiếu dòng này thì mỗi thành phố tải thừa 8 trang.
                if added == 0:
                    print("     hết trang (trang này lặp lại trang trước)")
                    break

                time.sleep(REQUEST_DELAY_SECONDS)

        browser.close()

    return places


if __name__ == "__main__":
    found = crawl(headless="--show" not in sys.argv)
    print(f"\nXong: {len(found)} quán.")
    for place in found[:8]:
        print(f"  {place['name']:<38} {place['priceLevel'] or '—':<5} "
              f"{place['category'] or '—':<12} {place['tags']}")
