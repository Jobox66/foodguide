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


IMAGE_DIR = CRAWLER_DIR / "out" / "threads_images"

# Trần ảnh mỗi khối. Một shop quảng cáo có thể dán 15 ảnh sản phẩm trong một
# bình luận; ảnh chụp danh sách quán thì thường chỉ 1–2 tấm. Không chặn trần là
# đốt quota Gemini vào ảnh bánh ngọt.
MAX_IMAGES_PER_BLOCK = 4


def download_images(posts, max_per_block=MAX_IMAGES_PER_BLOCK):
    """
    Tải ảnh trong các khối về đĩa, ghi đường dẫn vào post["image_files"].

    Trả về tổng số ảnh tải được. Ảnh hỏng thì bỏ qua, không làm hỏng cả mẻ.
    """
    import hashlib
    import urllib.request

    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    total = 0

    for post in posts:
        files = []
        for url in (post.get("images") or [])[:max_per_block]:
            name = hashlib.sha1(url.encode()).hexdigest()[:16] + ".jpg"
            path = IMAGE_DIR / name
            if not path.exists():
                try:
                    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                    with urllib.request.urlopen(req, timeout=30) as r:
                        path.write_bytes(r.read())
                except Exception as e:
                    print(f"     ✗ ảnh hỏng: {str(e)[:60]}", file=sys.stderr)
                    continue
            files.append(str(path))
            total += 1
        post["image_files"] = files

    return total


def _clean_block(raw):
    """Bỏ chữ giao diện và dòng chỉ có số đếm tương tác"""
    lines = []
    for line in (raw or "").splitlines():
        line = line.strip()
        if not line:
            continue
        if line in ("Follow", "Theo dõi", "Reply", "Trả lời", "Like", "Thích",
                    "Repost", "Đăng lại", "Share", "Chia sẻ", "Translate", "Dịch",
                    "More", "Xem thêm"):
            continue
        if re.fullmatch(r"[\d.,]+\s*[KMkm]?", line):          # 6,7K
            continue
        if re.fullmatch(r"\d+\s*(h|m|d|s|w|ngày|giờ|phút|tuần|giây)", line):
            continue
        lines.append(line)
    return "\n".join(lines)


def crawl_url(page, url, max_scrolls=15):
    """
    Đọc MỘT bài viết Threads — cả bài gốc LẪN phần trả lời.

    Vì sao phải đọc phần trả lời: những bài đáng giá nhất trên Threads là câu
    hỏi mồi — "Ở Sài Gòn có quán nào ngon kiểu ít người biết không mọi người?",
    "cho tui xin tên những quán ăn khum thể bỏ lỡ". Bài gốc không có tên quán
    nào; toàn bộ giá trị nằm ở hàng trăm câu trả lời bên dưới. Bản trước chỉ
    lấy container đầu tiên nên cào 28 bài mà chỉ ra 8 quán.

    Trả về danh sách bản ghi: bài gốc, rồi mỗi câu trả lời một bản ghi, có kèm
    chủ đề để bộ bóc tách biết đang nói về thành phố nào.
    """
    print(f"\n→ Mở bài viết: {url}")
    try:
        page.goto(url, wait_until="load", timeout=45000)
        time.sleep(3)
        page.keyboard.press("Escape")
    except Exception as e:
        print(f"  ✗ Lỗi tải trang: {e}", file=sys.stderr)
        return []

    # Cuộn để Threads nạp thêm trả lời. Dừng sớm khi không có gì mới.
    seen_count = 0
    for i in range(max_scrolls):
        page.mouse.wheel(0, 4000)
        time.sleep(random.uniform(1.2, 2.0))
        now = page.locator("div[data-pressable-container='true']").count()
        if now == seen_count:
            break
        seen_count = now

    # Đọc chữ VÀ ảnh trong cùng một lượt. Rất nhiều câu trả lời hay nhất không
    # gõ tên quán ra chữ mà chụp màn hình một danh sách — chính tác giả bài này
    # cũng phải hỏi lại "sao không thấy địa chỉ hay tên quán để tìm á người ơi".
    # Bỏ ảnh là bỏ đúng phần đáng giá nhất.
    try:
        raw_blocks = page.evaluate("""() => {
            return [...document.querySelectorAll("div[data-pressable-container='true']")]
                .map(el => ({
                    text: el.innerText || '',
                    images: [...el.querySelectorAll('img')]
                        // Ảnh nội dung, không phải avatar: avatar Threads bé và vuông
                        .filter(i => i.naturalWidth >= 200 && i.naturalHeight >= 200)
                        .map(i => i.src)
                        .filter(Boolean)
                }));
        }""")
    except Exception as e:
        print(f"  ✗ Không đọc được nội dung: {e}", file=sys.stderr)
        return []

    blocks, images_of = [], []
    for item in raw_blocks:
        text = _clean_block(item.get("text"))
        imgs = item.get("images") or []
        if text in blocks:
            continue
        if len(text) >= 25 or imgs:
            blocks.append(text)
            images_of.append(imgs)

    if not blocks:
        print("  ✗ Không thấy nội dung nào.")
        return []

    # Dòng đầu của bài gốc làm ngữ cảnh — nhờ đó câu trả lời cụt như "quán Dì Ba
    # ngon lắm" vẫn biết đang nói về thành phố nào.
    # Cắt ngắn: tiền tố dài hơn chính câu trả lời thì chỉ làm loãng phần đáng đọc
    topic = re.sub(r"^\S+\s+\d{2}/\d{2}/\d{4}\s*", "", " ".join(blocks[0].split()))[:70]
    so_anh = sum(len(x) for x in images_of)
    print(f"  ✓ {len(blocks)} khối (1 bài gốc + {len(blocks) - 1} trả lời) · {so_anh} ảnh")

    posts = []
    for i, (text, imgs) in enumerate(zip(blocks, images_of)):
        posts.append({
            "id": f"{url}#{i}",
            "text": text if i == 0 else f"[Chủ đề: {topic}]\n{text}",
            "images": imgs,
            "url": url,
            "author": "",
        })
    return posts


def crawl(queries=None, limit=20, headless=True, target_url=None):
    """
    Điểm gọi chính để cào Threads.
    Trả về danh sách các bài viết thô (raw posts).
    """
    if target_url:
        with sync_playwright() as p:
            context = _launch_context(p, headless=headless)
            page = context.new_page()
            posts = crawl_url(page, target_url)
            context.close()
            return posts

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
