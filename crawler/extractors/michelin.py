"""
Bước 1: Trình cào dữ liệu Michelin Guide Vietnam.
Thu thập danh sách nhà hàng tại Hà Nội, TP.HCM, Đà Nẵng từ guide.michelin.com.
"""

import re
import time
import urllib.parse
from datetime import datetime
from typing import List, Dict, Any, Optional
import requests
from bs4 import BeautifulSoup

from config import DEFAULT_HEADERS


class MichelinCrawler:
    BASE_URL = "https://guide.michelin.com"
    START_URL = "https://guide.michelin.com/vn/vi/restaurants"

    def __init__(self, delay_sec: float = 1.0):
        self.delay_sec = delay_sec
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)

    def crawl_all(self, max_pages: int = 15, fetch_details: bool = True) -> List[Dict[str, Any]]:
        """
        Cào toàn bộ nhà hàng Michelin tại Việt Nam qua các trang danh sách.
        """
        all_places: List[Dict[str, Any]] = []
        page = 1

        print(f"🚀 Bắt đầu cào Michelin Guide Vietnam (Tối đa {max_pages} trang)...")

        while page <= max_pages:
            url = f"{self.START_URL}/page/{page}" if page > 1 else self.START_URL
            print(f"  📄 Đang đọc trang {page}: {url}")

            try:
                resp = self.session.get(url, timeout=15)
                if resp.status_code == 404:
                    print(f"  🏁 Đã hết trang tại trang {page - 1}.")
                    break
                resp.raise_for_status()
            except Exception as e:
                print(f"  ⚠️ Lỗi khi tải trang {page}: {e}")
                break

            soup = BeautifulSoup(resp.text, "html.parser")
            # Tìm danh sách thẻ nhà hàng
            cards = soup.select(".card__menu, .restaurant__card, .search-results-item")

            if not cards:
                # Thử tìm các thẻ link nhà hàng chung
                cards = [
                    a.find_parent("div")
                    for a in soup.find_all("a", href=re.compile(r"/vn/vi/restaurant/"))
                    if a.find_parent("div")
                ]

            if not cards:
                print(f"  ℹ️ Không tìm thấy thẻ nhà hàng nào ở trang {page}. Dừng.")
                break

            found_in_page = 0
            for card in cards:
                link_el = card.find("a", href=re.compile(r"/vn/vi/restaurant/"))
                if not link_el:
                    continue

                detail_url = urllib.parse.urljoin(self.BASE_URL, link_el["href"])
                name_el = card.select_one(".card__menu-content--title, h3, .restaurant-name")
                name = name_el.get_text(strip=True) if name_el else ""

                if not name:
                    continue

                # Tránh trùng lặp trong cùng 1 đợt cào
                slug_id = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
                unique_id = f"michelin-{slug_id}"

                if any(p["id"] == unique_id for p in all_places):
                    continue

                # Lấy ảnh preview
                img_el = card.find("img")
                img_url = ""
                if img_el:
                    img_url = img_el.get("data-src") or img_el.get("src") or ""

                # Thông tin phụ từ thẻ
                footer_el = card.select_one(".card__menu-footer--price, .restaurant__card-footer")
                cuisine_text = footer_el.get_text(" ", strip=True) if footer_el else ""

                # Xác định phân hạng Michelin
                award = "Michelin Selected"
                if "bib-gourmand" in str(card).lower():
                    award = "Bib Gourmand"
                elif "1-star" in str(card).lower() or "one star" in str(card).lower():
                    award = "1 Michelin Star"
                elif "2-star" in str(card).lower():
                    award = "2 Michelin Stars"
                elif "3-star" in str(card).lower():
                    award = "3 Michelin Stars"

                place = {
                    "id": unique_id,
                    "name": name,
                    "category": self._normalize_category(cuisine_text),
                    "district": "",
                    "address": "",
                    "rating": 5.0 if "Star" in award else (4.8 if award == "Bib Gourmand" else 4.6),
                    "reviewCount": 100,
                    "priceRange": self._extract_price(cuisine_text),
                    "priceLevel": "$$$" if "Star" in award else "$$",
                    "time": "10:00 - 22:00",
                    "mustTry": "",
                    "review": f"Được vinh danh trong Michelin Guide Vietnam ({award}).",
                    "mapsUrl": "",
                    "tags": f"Michelin, {award}, Sang trọng, Đẳng cấp",
                    "image": img_url,
                    "lat": 0.0,
                    "lng": 0.0,
                    "verified": True,
                    "featured": "Star" in award or award == "Bib Gourmand",
                    "dataSource": "michelin",
                    "updatedAt": datetime.utcnow().isoformat() + "Z",
                    "_detail_url": detail_url,
                }

                if fetch_details:
                    self._enrich_details(place)
                    time.sleep(self.delay_sec)

                all_places.append(place)
                found_in_page += 1

            print(f"    ↳ Đã lấy được {found_in_page} nhà hàng ở trang {page} (Tổng cộng: {len(all_places)})")
            page += 1
            time.sleep(self.delay_sec)

        print(f"✅ Hoàn thành cào Michelin Guide! Tổng cộng: {len(all_places)} nhà hàng.")
        return all_places

    def _enrich_details(self, place: Dict[str, Any]) -> None:
        """Đọc trang chi tiết để lấy địa chỉ chính xác, nhận xét thanh tra và link maps"""
        detail_url = place.get("_detail_url")
        if not detail_url:
            return

        try:
            resp = self.session.get(detail_url, timeout=12)
            if resp.status_code != 200:
                return

            soup = BeautifulSoup(resp.text, "html.parser")

            # Địa chỉ
            addr_el = soup.select_one(".restaurant-details__heading--address, .data-sheet__block--text")
            if addr_el:
                addr = addr_el.get_text(strip=True)
                place["address"] = addr
                # Tách quận
                place["district"] = self._extract_district(addr)

            # Lời nhận xét của thanh tra Michelin
            review_el = soup.select_one(".restaurant-details__description--text, .restaurant-details__quote")
            if review_el:
                inspector_note = review_el.get_text(strip=True)
                if inspector_note:
                    place["review"] = inspector_note[:300] + ("..." if len(inspector_note) > 300 else "")

            # Link Google Maps hoặc toạ độ
            maps_link = soup.find("a", href=re.compile(r"google\.com/maps|maps\.apple\.com"))
            if maps_link:
                place["mapsUrl"] = maps_link["href"]

            # Ảnh nét trong trang chi tiết nếu ảnh thumbnail chưa có
            if not place.get("image"):
                hero_img = soup.select_one(".restaurant-details__gallery-image img, .masthead__image img")
                if hero_img:
                    place["image"] = hero_img.get("data-src") or hero_img.get("src") or ""

        except Exception as err:
            # Lỗi chi tiết nhỏ không làm dừng cả pipeline
            pass

    def _normalize_category(self, text: str) -> str:
        t = text.lower()
        if "phở" in t or "bún" in t or "noodles" in t:
            return "Phở & Bún"
        if "cơm" in t or "rice" in t:
            return "Cơm & Xôi"
        if "nướng" in t or "grill" in t or "bbq" in t:
            return "Đồ nướng & Lẩu"
        if "cà phê" in t or "cafe" in t or "coffee" in t:
            return "Cà phê & Trà"
        if "hải sản" in t or "seafood" in t:
            return "Hải sản"
        if "việt" in t or "vietnamese" in t:
            return "Món Việt"
        return "Nhà hàng & Quán ăn"

    def _extract_price(self, text: str) -> str:
        if "·" in text:
            parts = text.split("·")
            for p in parts:
                p = p.strip()
                if "₫" in p or "vnd" in p.lower() or "$" in p:
                    return p
        return "100.000đ - 500.000đ"

    def _extract_district(self, address: str) -> str:
        # Regex tìm Quận/Huyện/Hà Nội/TP.HCM
        patterns = [
            r"(Quận\s+[0-9A-Za-zÀ-ỹ\s]+)",
            r"(Q\.\s*[0-9A-Za-zÀ-ỹ\s]+)",
            r"(Huyện\s+[0-9A-Za-zÀ-ỹ\s]+)",
            r"(Hoàn Kiếm|Ba Đình|Đống Đa|Hai Bà Trưng|Cầu Giấy|Tây Hồ|Thanh Xuân|Nam Từ Liêm|Bắc Từ Liêm|Hoàng Mai|Long Biên|Hà Đông)",
            r"(Bình Thạnh|Phú Nhuận|Tân Bình|Gò Vấp|Thủ Đức|Sơn Trà|Hải Châu|Ngũ Hành Sơn)",
        ]
        for pat in patterns:
            match = re.search(pat, address, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return ""


if __name__ == "__main__":
    crawler = MichelinCrawler(delay_sec=0.5)
    results = crawler.crawl_all(max_pages=1, fetch_details=True)
    print(f"Cào thử nghiệm trang 1 thành công: {len(results)} quán.")
    if results:
        print("Mẫu quán đầu tiên:", results[0])
