# -*- coding: utf-8 -*-
"""
BƯỚC 2 — Cào bài viết chia sẻ quán ăn, quán cafe từ mạng xã hội Threads (threads.com / threads.net).

Thu thập văn bản bài viết từ người dùng thật qua tìm kiếm từ khoá hoặc link trực tiếp,
sau đó đưa qua ai_parser (Gemini) để bóc tách thông tin quán ăn.
"""

import json
import random
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

from playwright.sync_api import sync_playwright

import config
from config import CRAWLER_DIR, USER_AGENT

BROWSER_DATA_DIR = CRAWLER_DIR / ".browser_data"


def _launch_context(p, headless=True):
    """
    Khởi tạo trình duyệt với profile người dùng lưu tại .browser_data.
    Ưu tiên Google Chrome thật để giảm tối đa tỷ lệ bị chặn.
    """
    BROWSER_DATA_DIR.mkdir(parents=True, exist_ok=True)
    args = [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-infobars",
    ]
    for channel in ["chrome", None]:
        try:
            return p.chromium.launch_persistent_context(
                user_data_dir=str(BROWSER_DATA_DIR),
                headless=headless,
                channel=channel,
                args=args,
                viewport={"width": 1280, "height": 900},
                locale="vi-VN",
                user_agent=USER_AGENT,
            )
        except Exception:
            continue
    raise RuntimeError("Không thể khởi động trình duyệt Playwright. Chạy: python -m playwright install chromium")


def login():
    """
    Mở trình duyệt có giao diện để người dùng đăng nhập tài khoản Threads/Instagram một lần duy nhất.
    Phiên đăng nhập (cookies, storage) sẽ được lưu tự động vào crawler/.browser_data/.
    """
    print("\n" + "=" * 60)
    print("ĐĂNG NHẬP THREADS")
    print("=" * 60)
    print("Đang mở trình duyệt...")
    print("Vui lòng đăng nhập tài khoản Threads hoặc Instagram trên cửa sổ vừa mở.")
    print("Sau khi đăng nhập thành công vào trang chủ Threads:")
    print("👉 Hãy quay lại đây và nhấn phím [ENTER] để lưu phiên làm việc.\n")

    with sync_playwright() as p:
        context = _launch_context(p, headless=False)
        page = context.new_page()
        page.goto("https://www.threads.com/login", wait_until="load", timeout=45000)

        # Chờ người dùng đăng nhập
        try:
            input("Nhấn [ENTER] tại đây sau khi bạn đã đăng nhập xong...")
        except (KeyboardInterrupt, EOFError):
            pass

        time.sleep(2)
        print(f"URL hiện tại: {page.url}")
        if "login" not in page.url:
            print("✓ Đăng nhập thành công! Phiên làm việc đã được lưu vào crawler/.browser_data/")
        else:
            print("! Lưu ý: Trình duyệt vẫn đang ở trang đăng nhập. Bạn có thể đăng nhập lại bất kỳ lúc nào với --login.")
        context.close()


def _extract_posts_from_json(data, captured_dict):
    """Đệ quy tìm các bài viết (caption/text) trong JSON GraphQL của Threads"""
    if isinstance(data, dict):
        # Trường hợp 1: post object với caption text
        text = None
        if "caption" in data and isinstance(data["caption"], dict):
            text = data["caption"].get("text")
        elif "post" in data and isinstance(data["post"], dict):
            p = data["post"]
            if "caption" in p and isinstance(p["caption"], dict):
                text = p["caption"].get("text")
            elif "text" in p:
                text = p.get("text")

        if text and isinstance(text, str) and len(text.strip()) >= 30:
            post_id = str(data.get("id") or data.get("pk") or hash(text))
            user = data.get("user") or {}
            username = user.get("username", "") if isinstance(user, dict) else ""
            url = f"https://www.threads.com/@{username}/post/{post_id}" if username and post_id else ""
            captured_dict[post_id] = {
                "id": post_id,
                "text": text.strip(),
                "author": username,
                "url": url,
            }

        for v in data.values():
            _extract_posts_from_json(v, captured_dict)

    elif isinstance(data, list):
        for item in data:
            _extract_posts_from_json(item, captured_dict)


def _extract_posts_from_dom(page, captured_dict):
    """Fallback: bóc tách bài viết từ DOM khi trang đã render"""
    try:
        # Tìm các link dẫn tới post: /@username/post/POST_ID
        links = page.locator('a[href*="/post/"]').all()
        for link in links:
            href = link.get_attribute("href") or ""
            if not href:
                continue
            if not href.startswith("http"):
                href = "https://www.threads.com" + href

            match = re.search(r"/@([^/]+)/post/([^/?#]+)", href)
            username = match.group(1) if match else ""
            post_id = match.group(2) if match else href

            if post_id in captured_dict:
                continue

            # Tìm container cha chứa bài viết
            try:
                container = link.locator("xpath=./ancestor::div[contains(@data-pressable-container, 'true') or self::article][1]")
                if container.count() == 0:
                    container = link.locator("xpath=./ancestor::div[4]")
                if container.count() > 0:
                    raw_text = container.first.inner_text()
                    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
                    # Loại bỏ các từ giao diện phổ biến của Threads
                    cleaned_lines = [
                        l for l in lines
                        if l not in ["Follow", "Theo dõi", "Reply", "Trả lời", "Like", "Thích", "Repost", "Đăng lại", "Share", "Chia sẻ"]
                        and not re.match(r"^\d+\s*(h|m|d|s|ngày|giờ|phút|tuần)$", l)
                    ]
                    post_text = "\n".join(cleaned_lines)
                    if len(post_text) >= 30:
                        captured_dict[post_id] = {
                            "id": post_id,
                            "text": post_text,
                            "author": username,
                            "url": href,
                        }
            except Exception:
                continue
    except Exception:
        pass


def crawl_query(page, query, limit=20):
    """
    Cào các bài viết cho một từ khoá tìm kiếm trên Threads.
    """
    captured = {}

    def on_response(response):
        if "graphql" in response.url:
            try:
                data = response.json()
                _extract_posts_from_json(data, captured)
            except Exception:
                pass

    page.on("response", on_response)

    encoded_q = quote(query)
    search_url = f"https://www.threads.com/search?q={encoded_q}&serp_type=default"
    print(f"\n→ Tìm kiếm: '{query}' ({search_url})")

    try:
        page.goto(search_url, wait_until="load", timeout=30000)
    except Exception as e:
        print(f"  ✗ Lỗi tải trang: {e}", file=sys.stderr)
        return []

    time.sleep(3)

    # Đóng dialog bắt đăng nhập nếu có nút đóng (Escape)
    try:
        page.keyboard.press("Escape")
    except Exception:
        pass

    # Kiểm tra xem có bị chặn đăng nhập không
    body_text = page.locator("body").inner_text()
    if "Đã xảy ra lỗi" in body_text or "Something went wrong" in body_text:
        print("\n" + "!" * 60)
        print("  ✗ Threads yêu cầu đăng nhập để sử dụng tính năng tìm kiếm.")
        print("  👉 Vui lòng chạy lệnh sau để đăng nhập 1 lần duy nhất:")
        print("     python crawler/run.py threads --login")
        print("!" * 60 + "\n")
        return []

    # Cuộn trang để tải thêm bài viết (Infinite Scroll)
    max_scrolls = 15
    scroll_count = 0
    stagnant_count = 0
    prev_total = 0

    print("  Đang cuộn trang để thu thập bài viết…")
    while len(captured) < limit and scroll_count < max_scrolls:
        # Bóc tách thêm từ DOM
        _extract_posts_from_dom(page, captured)
        current_total = len(captured)
        print(f"  [Cuộn {scroll_count + 1}] Thu thập được: {current_total}/{limit} bài viết")

        if current_total >= limit:
            break

        if current_total == prev_total:
            stagnant_count += 1
            if stagnant_count >= 3:
                # Không thấy bài mới sau 3 lần cuộn liên tiếp
                break
        else:
            stagnant_count = 0

        prev_total = current_total

        # Cuộn ngẫu nhiên
        scroll_y = random.randint(800, 1400)
        page.evaluate(f"window.scrollBy(0, {scroll_y})")
        scroll_count += 1
        time.sleep(random.uniform(2.0, 3.5))

    posts = list(captured.values())[:limit]
    for p in posts:
        p["query"] = query
    print(f"  ✓ Thu về {len(posts)} bài viết từ từ khoá '{query}'")
    return posts


def crawl_url(page, url):
    """Cào trực tiếp nội dung một bài viết cụ thể từ link Threads"""
    print(f"\n→ Đang mở bài viết: {url}")
    try:
        page.goto(url, wait_until="load", timeout=30000)
        time.sleep(3)
        page.keyboard.press("Escape")
    except Exception as e:
        print(f"  ✗ Lỗi tải trang: {e}", file=sys.stderr)
        return None

    # Lấy text bài viết
    try:
        container = page.locator("article, div[data-pressable-container='true']").first
        if container.count() > 0:
            text = container.inner_text()
        else:
            text = page.locator("body").inner_text()
        return {
            "id": url,
            "text": text.strip(),
            "url": url,
            "author": "",
        }
    except Exception as e:
        print(f"  ✗ Không đọc được nội dung bài: {e}", file=sys.stderr)
        return None


def crawl(queries=None, limit=20, headless=True, target_url=None):
    """
    Điểm gọi chính để cào Threads.
    Trả về danh sách các bài viết thô (raw posts).
    """
    if target_url:
        with sync_playwright() as p:
            context = _launch_context(p, headless=headless)
            page = context.new_page()
            post = crawl_url(page, target_url)
            context.close()
            return [post] if post else []

    search_queries = queries or config.THREADS_SEARCH_QUERIES
    if not search_queries:
        search_queries = ["quán ruột hà nội"]

    all_posts = {}
    with sync_playwright() as p:
        context = _launch_context(p, headless=headless)
        page = context.new_page()

        for q in search_queries:
            posts = crawl_query(page, q, limit=limit)
            for p_item in posts:
                # Tránh trùng bài giữa các từ khoá
                key = p_item.get("id") or p_item.get("text")[:50]
                if key not in all_posts:
                    all_posts[key] = p_item

        context.close()

    return list(all_posts.values())
