# -*- coding: utf-8 -*-
"""
Chạy pipeline crawl.

    python crawler/run.py check                 kiểm tra kết nối máy chủ
    python crawler/run.py michelin              cào Michelin, LƯU RA FILE (chưa đẩy)
    python crawler/run.py michelin --push       cào rồi đẩy luôn vào Crawl_Inbox
    python crawler/run.py parse bai.txt         đọc file văn bản qua Gemini
    python crawler/run.py push crawler/out/michelin.json   đẩy một file đã cào trước đó
    python crawler/run.py addresses             lấy địa chỉ cho quán ĐÃ duyệt vào cẩm nang

Mặc định KHÔNG đẩy lên Sheet — xem file JSON trước, thấy ổn mới thêm --push.

Cào KHÔNG lấy địa chỉ. Địa chỉ chỉ dùng để xếp quán vào đúng bộ lọc quận, mà bộ
lọc chỉ có nghĩa với quán đã nằm trong cẩm nang — nên nó là việc của lệnh
`addresses`, chạy sau khi bạn duyệt. Muốn lấy ngay lúc cào thì thêm --details.
"""

import json
import sys
from pathlib import Path

# Console Windows mặc định là cp1252, in tiếng Việt có dấu là văng UnicodeEncodeError
# ngay trước khi kịp làm gì. Ép UTF-8 để chạy được ở mọi cửa sổ dòng lệnh.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import OUT_DIR, SHEET_TAB   # noqa: E402
import push_to_sheet as pusher            # noqa: E402


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


def save_json(data, name):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_file = OUT_DIR / f"{name}.json"
    out_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_file


def fill_addresses_for_approved(args):
    """
    Lấy địa chỉ cho những quán ĐÃ được duyệt vào cẩm nang mà còn thiếu địa chỉ.

    Vì sao không làm ngay lúc cào: địa chỉ chỉ dùng để xếp quán vào đúng bộ lọc
    quận, mà bộ lọc chỉ có nghĩa với quán đã nằm trong cẩm nang. Cào 143 quán
    rồi mở 143 trang chi tiết nghĩa là tải địa chỉ của hàng trăm quán bạn sẽ
    không bao giờ chọn — mất 9 phút và làm phiền máy chủ người ta vô ích.

        --tab Crawl_Inbox   làm ở phòng chờ thay vì tab chính
        --limit 5           chỉ làm 5 quán đầu, để thử trước cho chắc
        --show              hiện cửa sổ trình duyệt
    """
    import config, michelin
    from schema import district_from_address   # noqa: F401  (dùng trong michelin)

    tab = config.SHEET_TAB
    if "--tab" in args:
        tab = args[args.index("--tab") + 1]
    else:
        tab = "FoodGuide"   # mặc định: cẩm nang thật, tức nơi bộ lọc chạy

    links_file = OUT_DIR / "michelin_links.json"
    if not links_file.exists():
        print("Chưa có bảng link trang chi tiết.")
        print("  Chạy:  python crawler/run.py michelin   (lượt cào cũng lưu bảng link)")
        return
    links = json.loads(links_file.read_text(encoding="utf-8"))

    good, why, _ = pusher.probe_script(tab)
    if not good:
        print(f"✗ Dừng lại.\n  {why}")
        return

    rows = pusher.pull(tab)
    if rows is None:
        return

    thieu = {r["id"]: links[r["id"]] for r in rows
             if not str(r.get("address") or "").strip() and r["id"] in links}
    khong_co_link = [r["id"] for r in rows
                     if not str(r.get("address") or "").strip() and r["id"] not in links]

    print(f"Tab {tab}: {len(rows)} quán · {len(thieu)} thiếu địa chỉ và có link Michelin")
    if khong_co_link:
        print(f"  ({len(khong_co_link)} quán thiếu địa chỉ nhưng không phải từ Michelin — bỏ qua)")
    if not thieu:
        print("\n✓ Không có gì để làm.")
        return

    if "--limit" in args:
        n = int(args[args.index("--limit") + 1])
        thieu = dict(list(thieu.items())[:n])
        print(f"  --limit {n}: chỉ làm {len(thieu)} quán lần này")

    print(f"\nMở {len(thieu)} trang chi tiết"
          f" (~{len(thieu) * 4.5 / 60:.0f} phút)…")
    found = michelin.fetch_addresses_for(thieu, headless="--show" not in args)

    capnhat = []
    for row in rows:
        address, district = found.get(row["id"], ("", ""))
        if not address:
            continue
        # Giữ nguyên mọi trường khác — Sheet ghi đè cả dòng, mất thứ bạn đã sửa
        # tay là mất luôn.
        row["address"] = address
        if district and not str(row.get("district") or "").strip():
            row["district"] = district
        capnhat.append(row)

    co_quan = sum(1 for r in capnhat if str(r.get("district") or "").strip())
    print(f"\nLấy được địa chỉ cho {len(capnhat)}/{len(thieu)} quán"
          f" · {co_quan} suy được quận")

    if not capnhat:
        return
    pusher.push(capnhat, sheet_tab=tab)


def apply_api_override(args):
    """--api https://trang-cua-ban.vercel.app  → dùng ngay, khỏi sửa .env"""
    if "--api" not in args:
        return
    index = args.index("--api")
    if index + 1 >= len(args):
        print("Thiếu địa chỉ sau --api")
        sys.exit(1)

    import config
    config.API_BASE = config.normalize_api_base(args[index + 1])
    pusher.config.API_BASE = config.API_BASE
    print(f"Dùng máy chủ: {config.API_BASE}\n")


def main():
    args = sys.argv[1:]
    command = args[0] if args else "help"
    should_push = "--push" in args
    apply_api_override(args)

    if command == "check":
        import config
        result = pusher.check()
        print(f"Máy chủ : {config.API_BASE}/api/sheet")
        print(f"Tab đích: {config.SHEET_TAB}\n")
        print(json.dumps(result, ensure_ascii=False, indent=2))

        if result.get("ok") and result.get("configured"):
            # /api/sheet?health=1 chỉ nói máy chủ có đủ biến môi trường chưa, nó
            # không chạm tới Google. Phải hỏi thật Apps Script mới biết nó đang là
            # bản nào — bản cũ không hiểu tab Crawl_Inbox và ghi hết vào tab chính
            # mà vẫn trả về ok:true.
            good, why, probe = pusher.probe_script(config.SHEET_TAB)
            if good:
                print(f"Apps Script: bản mới — hiểu tab {config.SHEET_TAB}"
                      f" ({probe.get('rows')} dòng đang có trong đó)")
                print("\n✓ Sẵn sàng. Chạy:  python crawler/run.py michelin")
            else:
                print("\n✗ Cào được, nhưng CHƯA đẩy lên Sheet được:")
                print("  " + why)
        elif result.get("ok"):
            print("\n✗ Máy chủ chạy nhưng chưa nối Sheet:", result.get("reason", ""))
        else:
            print("\n✗ Không gọi được máy chủ.")
            print("  • Trang đã deploy: python crawler/run.py check --api https://ten-trang.vercel.app")
            print("  • Chạy tại máy   : npx vercel dev   (rồi dùng --api http://localhost:3000)")
        return

    if command == "michelin":
        import michelin
        print("Cào Michelin Guide (dùng trình duyệt thật vì trang có AWS WAF)…\n")
        places, links = michelin.crawl(headless="--show" not in args,
                                       with_details="--details" in args)
        summarise(places)
        save(places, "michelin")

        # Bảng link để lấy địa chỉ SAU, chỉ cho quán đã được duyệt vào cẩm nang
        if links:
            save_json(links, "michelin_links")

        if should_push:
            pusher.push(places)
        elif places:
            print("\nXem file rồi đẩy bằng:  python crawler/run.py push crawler/out/michelin.json")
        return

    if command == "addresses":
        return fill_addresses_for_approved(args)

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
            pusher.push(places)
        return

    if command == "push":
        if len(args) < 2:
            print("Thiếu tên file. Ví dụ: python crawler/run.py push crawler/out/michelin.json")
            return
        places = json.loads(Path(args[1]).read_text(encoding="utf-8"))
        pusher.push(places)
        return

    print(__doc__)
    print(f"Tab đích hiện tại: {SHEET_TAB}")


if __name__ == "__main__":
    main()
