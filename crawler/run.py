# -*- coding: utf-8 -*-
"""
Chạy pipeline crawl.

    python crawler/run.py check                 kiểm tra kết nối máy chủ
    python crawler/run.py michelin              cào Michelin, LƯU RA FILE (chưa đẩy)
    python crawler/run.py michelin --push       cào rồi đẩy luôn vào Crawl_Inbox
    python crawler/run.py parse bai.txt         đọc file văn bản qua Gemini
    python crawler/run.py push out/michelin.json   đẩy một file đã cào trước đó

Mặc định KHÔNG đẩy lên Sheet — xem file JSON trước, thấy ổn mới thêm --push.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import OUT_DIR, SHEET_TAB   # noqa: E402
import sync                              # noqa: E402


def save(places, name):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_file = OUT_DIR / f"{name}.json"
    out_file.write_text(json.dumps(places, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nĐã lưu {len(places)} quán vào {out_file}")
    return out_file


def summarise(places):
    """In vài dòng để mắt người kiểm tra trước khi đẩy lên Sheet"""
    if not places:
        return
    no_district = sum(1 for p in places if not p["district"])
    no_category = sum(1 for p in places if not p["category"])
    print(f"\n  {len(places)} quán"
          f" · {no_district} chưa rõ quận"
          f" · {no_category} chưa xếp danh mục")
    print("  (số sao và ảnh luôn để trống — máy không tự điền hai thứ đó)")
    print("\n  Năm quán đầu:")
    for place in places[:5]:
        print(f"    • {place['name']}  |  {place['district'] or '—'}  |  {place['category'] or '—'}")


def main():
    args = sys.argv[1:]
    command = args[0] if args else "help"
    should_push = "--push" in args

    if command == "check":
        print(json.dumps(sync.check(), ensure_ascii=False, indent=2))
        return

    if command == "michelin":
        import michelin
        print("Cào Michelin Guide (dùng trình duyệt thật vì trang có AWS WAF)…\n")
        places = michelin.crawl(headless="--show" not in args)
        summarise(places)
        save(places, "michelin")
        if should_push:
            sync.push(places)
        elif places:
            print(f"\nXem file rồi đẩy bằng:  python crawler/run.py push out/michelin.json")
        return

    if command == "parse":
        if len(args) < 2:
            print("Thiếu tên file. Ví dụ: python crawler/run.py parse bai.txt")
            return
        import ai_parser
        text = Path(args[1]).read_text(encoding="utf-8")
        posts = [p.strip() for p in text.split("\n---\n") if p.strip()]
        print(f"Đọc {len(posts)} bài qua Gemini…\n")
        places = ai_parser.parse_many(posts)
        summarise(places)
        save(places, "parsed")
        if should_push:
            sync.push(places)
        return

    if command == "push":
        if len(args) < 2:
            print("Thiếu tên file. Ví dụ: python crawler/run.py push out/michelin.json")
            return
        places = json.loads(Path(args[1]).read_text(encoding="utf-8"))
        sync.push(places)
        return

    print(__doc__)
    print(f"Tab đích hiện tại: {SHEET_TAB}")


if __name__ == "__main__":
    main()
