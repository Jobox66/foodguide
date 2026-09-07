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
from schema import to_place, strip_accents, district_from_address, make_place_id

CARD_SELECTOR = "div.card__menu"

# Khối thông tin trên trang chi tiết. Đợi nó hiện rồi mới đọc JSON-LD.
ADDRESS_READY_SELECTOR = ".data-sheet__block--text"

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


def read_address(page):
    """
    Đọc địa chỉ từ trang chi tiết một quán.

    Ưu tiên JSON-LD (<script type="application/ld+json">) chứ không bóc theo
    class CSS: Michelin nhúng sẵn một khối Restaurant có PostalAddress, đó là
    dữ liệu có cấu trúc họ chủ động công bố, không đổi theo lần thay giao diện
    nào. Chỉ khi không có JSON-LD mới rơi xuống .data-sheet__block--text.

        streetAddress   "GF, Sofitel Legend Metropole, 15 Ngo Quyen Street,
                         Hoan Kiem Ward"
        addressLocality "Hanoi"

    Trả về chuỗi địa chỉ, hoặc rỗng nếu trang không có.
    """
    return page.evaluate("""() => {
        const flat = v => Array.isArray(v) ? v : [v];

        for (const tag of document.querySelectorAll('script[type="application/ld+json"]')) {
            let parsed;
            try { parsed = JSON.parse(tag.textContent); } catch (e) { continue; }

            for (const node of flat(parsed)) {
                if (!node || typeof node !== 'object') continue;
                const addr = node.address;
                if (!addr || typeof addr !== 'object') continue;

                const parts = [addr.streetAddress, addr.addressLocality]
                    .map(s => String(s || '').trim())
                    .filter(Boolean);
                if (parts.length) return parts.join(', ');
            }
        }

        // Dự phòng: dòng đầu của khối thông tin thường là địa chỉ đầy đủ
        const el = document.querySelector('.data-sheet__block--text');
        return el ? (el.innerText || '').replace(/\\s+/g, ' ').trim() : '';
    }""")


def fill_addresses(page, cards, delay=None):
    """
    Mở lần lượt trang chi tiết của từng quán để lấy địa chỉ đường phố.

    Trang danh sách chỉ có "Hanoi, Vietnam", không có số nhà tên đường. Muốn có
    địa chỉ thật thì phải vào trang chi tiết — mỗi quán một lượt tải, nên bước
    này lâu hơn hẳn phần cào danh sách. robots.txt của Michelin KHÔNG cấm
    đường /restaurant/..., chỉ cấm các URL có tham số lọc.

    Sửa thẳng vào `cards`, không trả về gì.
    """
    delay = REQUEST_DELAY_SECONDS if delay is None else delay
    total = len(cards)

    for i, card in enumerate(cards, 1):
        try:
            page.goto(card["href"], timeout=PAGE_TIMEOUT_MS, wait_until="domcontentloaded")

            # Chờ khối thông tin hiện ra rồi mới đọc. domcontentloaded xong KHÔNG
            # có nghĩa là JSON-LD đã có: đọc ngay thì thỉnh thoảng ra rỗng, và
            # rỗng ở đây trông hệt như "trang này không có địa chỉ" — một lỗi
            # đua tiến trình đội lốt dữ liệu thiếu.
            try:
                page.wait_for_selector(ADDRESS_READY_SELECTOR, timeout=8000)
            except Exception:
                pass   # hết giờ chờ thì vẫn thử đọc, may ra JSON-LD đã nằm sẵn

            card["address"] = read_address(page) or ""
        except Exception as e:
            card["address"] = ""
            print(f"     ✗ {card['name']}: {str(e).splitlines()[0][:50]}")

        card["district"] = district_from_address(card["address"])

        if i % 10 == 0 or i == total:
            done = sum(1 for c in cards[:i] if c.get("address"))
            print(f"     {i}/{total} trang · {done} có địa chỉ")

        time.sleep(delay)


# Cả hai lối viết: Michelin dùng tiếng Anh "Vietnam" liền một chữ, còn tiếng
# Việt tách "Việt Nam" — bỏ dấu xong vẫn là hai chữ, không khớp cái liền.
TARGET_COUNTRY = ("vietnam", "viet nam")


def in_target_country(location):
    """
    Trang danh sách Việt Nam có lẫn quán nước khác.

    Đã gặp thật: 4 quán ở Chengdu (Trung Quốc) nằm trong kết quả cào từ
    /en/vn/..., trong đó có quán 2 sao duy nhất — suýt nữa báo cáo "Việt Nam có
    một quán 2 sao" trong khi nó ở Tứ Xuyên. Thẻ quán có sẵn ô địa điểm
    ("Hanoi, Vietnam" / "Chengdu, China") nên lọc được ngay, khỏi cần mở trang
    chi tiết.

    Ô địa điểm rỗng thì GIỮ LẠI, không loại. Selector hỏng mà lại im lặng vứt
    sạch dữ liệu thì tệ hơn nhiều so với lọt vài quán ngoại.
    """
    text = strip_accents(location or "").strip().lower()
    return (not text) or any(marker in text for marker in TARGET_COUNTRY)


def to_michelin_place(card):
    """
    Một thẻ quán  →  bản ghi chuẩn.

    ID CỐ ĐỊNH KHÔNG PHỤ THUỘC QUẬN. make_place_id() bình thường trộn cả quận
    vào id để phân biệt hai quán trùng tên. Nhưng ở đây quận là thứ được điền
    THÊM ở giai đoạn sau: cùng một quán, cào có địa chỉ và cào không có địa chỉ
    sẽ ra hai id khác nhau, và lần đẩy sau tạo ra 147 dòng trùng thay vì cập
    nhật 147 dòng cũ. Nên chốt id theo tên ngay từ đầu, trước khi biết quận.
    Michelin đã lọc trùng theo href nên tên là đủ để phân biệt.
    """
    symbol_count, cuisine = parse_card_text(card["all"], card.get("hotel", ""))

    tags = [read_distinction(card.get("awards"))]
    if cuisine:
        tags.append(cuisine)
    if card.get("hotel"):
        tags.append(card["hotel"])

    return to_place({
        "id": make_place_id("michelin", card["name"], ""),
        "name": card["name"],
        "address": card.get("address", ""),
        "district": card.get("district", ""),
        "category": category_from_cuisine(cuisine),
        "priceRange": "₫" * symbol_count if symbol_count else "",
        "priceLevel": PRICE_SYMBOL_LEVELS.get(symbol_count, ""),
        "tags": tags,
        "review": "",   # không chép mô tả có bản quyền của Michelin
    }, source="michelin")


def crawl(start_urls=None, max_pages=None, headless=True, with_details=False):
    """
    Trả về (danh sách bản ghi chuẩn hoá, bảng id → link trang chi tiết).

    MẶC ĐỊNH KHÔNG VÀO TRANG CHI TIẾT. Địa chỉ chỉ dùng để xếp quán vào đúng bộ
    lọc quận, mà bộ lọc chỉ có nghĩa khi quán đã được duyệt vào cẩm nang. Mở
    143 trang chi tiết ngay lúc cào là tải về địa chỉ của hàng trăm quán sẽ
    không bao giờ được duyệt — vừa mất 9 phút, vừa làm phiền máy chủ người ta
    không vì cái gì.

    Nên bảng link được lưu lại, và `run.py addresses` sẽ lấy địa chỉ SAU, chỉ
    cho những quán đã nằm trong cẩm nang. `--details` giữ lại lối cũ.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Chưa cài Playwright. Chạy:\n"
              "    pip install -r crawler/requirements.txt\n"
              "    python -m playwright install chromium", file=sys.stderr)
        return [], {}

    start_urls = start_urls or MICHELIN_START_URLS
    max_pages = max_pages or MAX_PAGES
    collected = []          # thẻ thô, chưa chuẩn hoá — cần href để vào trang chi tiết
    seen = set()
    skipped_foreign = []

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

                    if not in_target_country(card.get("location")):
                        skipped_foreign.append(f"{card['name']} ({card['location']})")
                        continue

                    collected.append(card)
                    added += 1

                print(f"     +{added} quán (tổng {len(collected)})")

                # Hết trang, Michelin KHÔNG trả trang rỗng — họ lặp lại trang cuối.
                # Nên mốc dừng là "không thêm được quán nào mới", chứ không phải
                # "không có thẻ nào". Thiếu dòng này thì mỗi thành phố tải thừa 8 trang.
                if added == 0:
                    print("     hết trang (trang này lặp lại trang trước)")
                    break

                time.sleep(REQUEST_DELAY_SECONDS)

        if skipped_foreign:
            print(f"\n  Bỏ {len(skipped_foreign)} quán ngoài Việt Nam lẫn trong danh sách:")
            for item in skipped_foreign:
                print(f"     – {item}")

        if with_details and collected:
            print(f"\n  Lấy địa chỉ từ {len(collected)} trang chi tiết"
                  f" (~{len(collected) * (REQUEST_DELAY_SECONDS + 1.5) / 60:.0f} phút)…")
            fill_addresses(page, collected)

        browser.close()

    places = []
    links = {}
    for card in collected:
        place = to_michelin_place(card)
        if not place:
            continue
        places.append(place)
        links[place["id"]] = card["href"]

    return places, links


def fetch_addresses_for(links, headless=True):
    """
    Lấy địa chỉ cho ĐÚNG những quán được nêu tên.

    `links` là {id quán: link trang chi tiết}. Trả về {id: (địa chỉ, quận)}.
    Dùng sau khi bạn đã duyệt quán vào cẩm nang — lúc đó mới cần biết quận để
    xếp vào bộ lọc, và số trang phải mở chỉ bằng số quán bạn thật sự chọn.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Chưa cài Playwright. Chạy:\n"
              "    pip install -r crawler/requirements.txt\n"
              "    python -m playwright install chromium", file=sys.stderr)
        return {}

    cards = [{"name": place_id, "href": href} for place_id, href in links.items()]
    if not cards:
        return {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_context(user_agent=USER_AGENT, locale="en-US").new_page()
        fill_addresses(page, cards)
        browser.close()

    return {c["name"]: (c.get("address", ""), c.get("district", "")) for c in cards}


if __name__ == "__main__":
    found, _ = crawl(headless="--show" not in sys.argv)
    print(f"\nXong: {len(found)} quán.")
    for place in found[:8]:
        print(f"  {place['name']:<38} {place['priceLevel'] or '—':<5} "
              f"{place['category'] or '—':<12} {place['tags']}")
