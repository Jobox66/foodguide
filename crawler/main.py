"""
FOODGUIDE CRAWLER - TRÌNH ĐIỀU PHỐI CHÍNH (MAIN RUNNER)
Kết hợp 4 bước:
  1. Crawl Michelin Guide VN
  2. Crawl Threads
  3. AI Parser (Gemini Flash)
  4. Sync Google Sheet & Local Backup

Chạy bằng uv:
  uv run main.py --source michelin
  uv run main.py --source threads --query "quán ngon hà nội" --limit 10
  uv run main.py --source all --dry-run
"""

import sys
import argparse
from typing import List, Dict, Any

from config import THREADS_SEARCH_QUERIES
from extractors.michelin import MichelinCrawler
from extractors.threads import ThreadsCrawler
from processors.ai_parser import AIReviewParser
from sync.sheet_sync import SheetSyncer


def parse_args():
    parser = argparse.ArgumentParser(description="FoodGuide Multi-Source Crawler & AI Normalizer")
    parser.add_argument(
        "--source",
        choices=["michelin", "threads", "all"],
        default="all",
        help="Nguồn dữ liệu muốn cào (michelin | threads | all)",
    )
    parser.add_argument(
        "--query",
        type=str,
        default="",
        help="Từ khoá tìm kiếm riêng cho Threads (mặc định dùng cấu hình trong .env)",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=3,
        help="Số trang tối đa khi cào Michelin Guide (mỗi trang ~20 quán)",
    )
    parser.add_argument(
        "--max-posts",
        type=int,
        default=15,
        help="Số bài viết tối đa khi cào Threads",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Chỉ cào và lưu ra file JSON/CSV trong crawler/output/, không đẩy vào Google Sheet",
    )
    parser.add_argument(
        "--no-headless",
        action="store_true",
        help="Mở giao diện trình duyệt thực tế khi cào Threads (để quan sát)",
    )
    return parser.parse_args()


def run_pipeline():
    args = parse_args()
    all_final_places: List[Dict[str, Any]] = []
    syncer = SheetSyncer()

    print("═══════════════════════════════════════════════════════════")
    print("      🍴 FOODGUIDE CRAWLER & AI DATA NORMALIZER 🍴         ")
    print("═══════════════════════════════════════════════════════════\n")

    # ─────────────────────────────────────────────────────────────
    # BƯỚC 1: CÀO MICHELIN GUIDE VIETNAM
    # ─────────────────────────────────────────────────────────────
    if args.source in ["michelin", "all"]:
        print("\n🔹 [BƯỚC 1] BẮT ĐẦU CÀO MICHELIN GUIDE VIETNAM...")
        michelin_crawler = MichelinCrawler(delay_sec=0.8)
        michelin_places = michelin_crawler.crawl_all(
            max_pages=args.max_pages,
            fetch_details=True
        )
        print(f"✨ Lấy được {len(michelin_places)} quán chuẩn từ Michelin Guide.")
        all_final_places.extend(michelin_places)

    # ─────────────────────────────────────────────────────────────
    # BƯỚC 2 & 3: CÀO THREADS & DÙNG AI ĐỂ BÓC TÁCH
    # ─────────────────────────────────────────────────────────────
    if args.source in ["threads", "all"]:
        print("\n🔹 [BƯỚC 2 & 3] BẮT ĐẦU CÀO THREADS & PHÂN TÍCH BẰNG AI...")
        queries = [args.query] if args.query else THREADS_SEARCH_QUERIES
        threads_crawler = ThreadsCrawler(headless=not args.no_headless)
        ai_parser = AIReviewParser()

        threads_places: List[Dict[str, Any]] = []

        for q in queries:
            print(f"\n🔎 Đang quét bài viết với từ khoá: '{q}'...")
            raw_posts = threads_crawler.search_posts(query=q, max_posts=args.max_posts)

            print(f"🤖 Đang đưa {len(raw_posts)} bài viết qua AI để bóc tách thông tin quán...")
            for idx, post in enumerate(raw_posts, 1):
                parsed = ai_parser.parse_raw_post(post)
                if parsed:
                    print(f"   [{idx}/{len(raw_posts)}] ✅ Tìm thấy quán: '{parsed['name']}' ({parsed.get('category')})")
                    threads_places.append(parsed)
                else:
                    print(f"   [{idx}/{len(raw_posts)}] ⏩ Bỏ qua (không phải bài review quán cụ thể)")

        print(f"✨ Trích xuất thành công {len(threads_places)} quán mới từ Threads.")
        all_final_places.extend(threads_places)

    # ─────────────────────────────────────────────────────────────
    # BƯỚC 4: LƯU FILE & ĐỒNG BỘ GOOGLE SHEET
    # ─────────────────────────────────────────────────────────────
    print("\n🔹 [BƯỚC 4] SAO LƯU NGOẠI TUYẾN & ĐỒNG BỘ GOOGLE SHEET...")
    if not all_final_places:
        print("⚠️ Không có quán nào được thu thập trong phiên này.")
        return

    # 1. Luôn tự động backup ra file JSON và CSV
    prefix = f"{args.source}_batch"
    syncer.backup_to_files(all_final_places, prefix=prefix)

    # 2. Đẩy lên Sheet nếu không bật cờ --dry-run
    if args.dry_run:
        print("\n🔒 Đang chạy ở chế độ --dry-run (bỏ qua bước đồng bộ Google Sheet).")
    else:
        syncer.sync_to_sheet(all_final_places)

    print("\n═══════════════════════════════════════════════════════════")
    print(f"🎉 TỔNG KẾT: Đã thu thập và xử lý thành công {len(all_final_places)} địa điểm!")
    print("═══════════════════════════════════════════════════════════\n")


if __name__ == "__main__":
    run_pipeline()
