# -*- coding: utf-8 -*-
"""
BƯỚC 4 — Đẩy dữ liệu đã cào vào tab Crawl_Inbox.

VÌ SAO ĐI QUA /api/sheet CHỨ KHÔNG DÙNG SERVICE ACCOUNT:

    Kế hoạch ban đầu khuyên dùng gspread + service account. Cách đó chạy được
    nhưng phải tạo và giữ thêm một file khoá bí mật, rồi chia sẻ Sheet cho một
    địa chỉ email máy. Trong khi máy chủ của chính trang đã cầm sẵn token và
    địa chỉ Apps Script rồi — thêm một đường vào Sheet là thêm một thứ để lộ,
    mà không được lợi gì.

VÌ SAO GHI VÀO Crawl_Inbox CHỨ KHÔNG PHẢI FoodGuide:

    Dữ liệu máy cào chưa phải dữ liệu của cẩm nang. Nó nằm ở phòng chờ để bạn
    lướt qua, tick cột "Duyệt", rồi dùng menu 🍜 FoodGuide → Duyệt các quán đã
    tick trong Sheet. Ghi thẳng vào tab chính là phá đúng cơ chế kiểm duyệt.
"""

import json
import sys
import urllib.error
import urllib.request

from config import API_BASE, SHEET_TAB

BATCH_SIZE = 100   # Apps Script chạy lâu quá sẽ bị cắt


def _post(payload, timeout=90):
    request = urllib.request.Request(
        f"{API_BASE}/api/sheet",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode("utf-8"))
        except Exception:
            return {"ok": False, "error": f"HTTP {e.code}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def check():
    """Máy chủ sống chưa, đã nối Sheet chưa"""
    try:
        with urllib.request.urlopen(f"{API_BASE}/api/sheet?health=1", timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        return {"ok": False, "error": str(e)}


def push(places, sheet_tab=None):
    """Đẩy danh sách quán lên Sheet theo từng lô. Trả về (đã thêm, đã cập nhật)."""
    tab = sheet_tab or SHEET_TAB
    if not places:
        print("Không có quán nào để đẩy.")
        return 0, 0

    health = check()
    if not health.get("ok") or not health.get("configured"):
        print(f"✗ Máy chủ chưa sẵn sàng: {health.get('error') or health.get('reason')}", file=sys.stderr)
        print(f"  Đang gọi: {API_BASE}/api/sheet", file=sys.stderr)
        print("  Đặt FOODGUIDE_API trong crawler/.env cho đúng địa chỉ trang đã deploy.", file=sys.stderr)
        return 0, 0

    total_added = 0
    total_updated = 0

    for start in range(0, len(places), BATCH_SIZE):
        batch = places[start:start + BATCH_SIZE]
        result = _post({"action": "push", "sheet": tab, "places": batch})

        if not result.get("ok"):
            print(f"✗ Lô {start // BATCH_SIZE + 1} thất bại: {result.get('error')}", file=sys.stderr)
            continue

        total_added += result.get("added", 0)
        total_updated += result.get("updated", 0)
        print(f"  lô {start // BATCH_SIZE + 1}: +{result.get('added', 0)} mới, "
              f"{result.get('updated', 0)} cập nhật")

    print(f"\nĐã đẩy vào tab {tab}: {total_added} quán mới, {total_updated} cập nhật.")
    print("Mở Google Sheet → tab " + tab + " → tick cột Duyệt → menu 🍜 FoodGuide → Duyệt các quán đã tick.")
    return total_added, total_updated


if __name__ == "__main__":
    print(json.dumps(check(), ensure_ascii=False, indent=2))
