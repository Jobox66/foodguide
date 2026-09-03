"""
Bước 2: Trình cào bài viết review trên Threads (Meta).
Sử dụng Playwright để mô phỏng trình duyệt, tìm kiếm bài viết theo từ khoá ẩm thực.
"""

import time
import random
import urllib.parse
from typing import List, Dict, Any, Optional

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False


class ThreadsCrawler:
    BASE_URL = "https://www.threads.net"

    def __init__(self, headless: bool = True):
        self.headless = headless

    def search_posts(self, query: str, max_posts: int = 15) -> List[Dict[str, Any]]:
        """
        Tìm kiếm bài viết trên Threads theo từ khoá ẩm thực.
        """
        if not HAS_PLAYWRIGHT:
            print("❌ Chưa cài đặt thư viện 'playwright'. Hãy chạy: uv add playwright && uv run playwright install chromium")
            return []

        encoded_query = urllib.parse.quote(query)
        search_url = f"{self.BASE_URL}/search?q={encoded_query}&filter=recent"
        posts: List[Dict[str, Any]] = []

        print(f"🔍 Bắt đầu cào Threads với từ khoá: '{query}' (Mục tiêu: {max_posts} bài)...")

        with sync_playwright() as p:
            # Khởi tạo trình duyệt với giả lập người dùng thật
            browser = p.chromium.launch(
                headless=self.headless,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                ]
            )
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 800},
                locale="vi-VN"
            )
            page = context.new_page()

            try:
                page.goto(search_url, timeout=30000, wait_until="domcontentloaded")
                # Chờ nội dung render
                time.sleep(3 + random.uniform(0.5, 1.5))

                scroll_attempts = 0
                max_scrolls = max_posts // 2 + 5

                seen_post_ids = set()

                while len(posts) < max_posts and scroll_attempts < max_scrolls:
                    scroll_attempts += 1
                    
                    # Trích xuất các khối bài viết trên trang
                    # Threads thường dùng thẻ div chứa các liên kết /post/
                    post_elements = page.query_selector_all("div[data-pressable-container='true'], div[role='article']")
                    if not post_elements:
                        # Thử tìm chung các container
                        post_elements = page.query_selector_all("div:has(a[href*='/post/'])")

                    for el in post_elements:
                        try:
                            # Tìm liên kết bài viết
                            link_el = el.query_selector("a[href*='/post/']")
                            post_url = ""
                            post_id = ""
                            if link_el:
                                href = link_el.get_attribute("href") or ""
                                if href:
                                    post_url = urllib.parse.urljoin(self.BASE_URL, href.split("?")[0])
                                    parts = href.strip("/").split("/")
                                    post_id = parts[-1] if parts else href

                            if not post_id or post_id in seen_post_ids:
                                continue

                            # Lấy nội dung text
                            text_content = el.inner_text()
                            if not text_content or len(text_content.strip()) < 20:
                                continue

                            # Lấy ảnh đính kèm nếu có
                            img_elements = el.query_selector_all("img")
                            images = []
                            for img in img_elements:
                                src = img.get_attribute("src")
                                if src and "http" in src and not ("profile" in src or "avatar" in src):
                                    images.append(src)

                            seen_post_ids.add(post_id)
                            posts.append({
                                "raw_id": f"threads-{post_id}",
                                "post_url": post_url,
                                "raw_text": text_content,
                                "images": images,
                                "query": query,
                                "source": "threads"
                            })

                            if len(posts) >= max_posts:
                                break
                        except Exception:
                            continue

                    print(f"  ↳ Đã quét được {len(posts)}/{max_posts} bài... (Lần cuộn {scroll_attempts})")

                    # Cuộn xuống để tải thêm nội dung
                    page.evaluate("window.scrollBy(0, window.innerHeight * 1.5)")
                    time.sleep(random.uniform(2.0, 3.5))

            except Exception as e:
                print(f"  ⚠️ Lỗi khi cào Threads: {e}")
            finally:
                context.close()
                browser.close()

        print(f"✅ Hoàn thành cào Threads! Thu thập được {len(posts)} bài viết thô.")
        return posts


if __name__ == "__main__":
    crawler = ThreadsCrawler(headless=False)
    results = crawler.search_posts(query="quán ngon hà nội", max_posts=3)
    for r in results:
        print("--- Bài viết: ---")
        print("Link:", r["post_url"])
        print("Text:", r["raw_text"][:150])
        print("Ảnh:", len(r["images"]))
