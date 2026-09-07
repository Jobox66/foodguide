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

VÌ SAO PHẢI DÒ PHIÊN BẢN APPS SCRIPT TRƯỚC KHI GHI:

    Bản Apps Script cũ không biết tham số `sheet`. Nó KHÔNG báo lỗi — nó lặng
    lẽ ghi vào tab chính rồi trả về ok:true. Chuyện này đã xảy ra thật: 147
    quán cào về nằm gọn trong cẩm nang, trong khi màn hình in ra dòng chữ
    "Đã đẩy vào tab Crawl_Inbox". Nên trước khi ghi phải hỏi xem đầu bên kia
    có đúng bản hiểu tab hay không, và sau khi ghi phải đếm lại số dòng thật
    thay vì tin vào phản hồi.
"""

import json
import sys
import time
import urllib.error
import urllib.request

import config
from config import SHEET_TAB

BATCH_SIZE = 60    # Lô 100 đủ lâu để Vercel bỏ cuộc chờ (504) trong khi Apps
                   # Script vẫn đang chạy — lúc đó không biết lô đó đã ghi chưa.
RETRIES = 3


def _post(payload, timeout=90):
    """Gửi một lần. Dùng _post_retry cho thao tác ghi."""
    request = urllib.request.Request(
        f"{config.API_BASE}/api/sheet",
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


def _post_retry(payload, timeout=90):
    """
    504 của Vercel không có nghĩa Apps Script thất bại — Vercel hết giờ chờ
    trong khi Google vẫn đang ghi. Thử lại, rồi đếm lại số dòng ở cuối để biết
    chắc chuyện gì đã xảy ra.
    """
    result = {}
    for attempt in range(RETRIES):
        result = _post(payload, timeout=timeout)
        if result.get("ok"):
            return result
        if attempt < RETRIES - 1:
            print(f"     thử lại ({attempt + 1}/{RETRIES}): {result.get('error')}", file=sys.stderr)
            time.sleep(5)
    return result


HUONG_DAN_CAP_NHAT = "\n".join([
    "  Sửa: mở Google Sheet → Tiện ích mở rộng → Apps Script",
    "       → dán đè toàn bộ tools/sheet-appscript.gs",
    "       → Triển khai → Quản lý bản triển khai → ✏️ sửa bản đang dùng",
    "       → Phiên bản: Mới → Triển khai",
])


def probe_script(tab):
    """
    Hỏi thẳng Apps Script: bạn có hiểu tab này không?

    Dấu vân tay phiên bản: bản mới trả thêm inbox:true và inboxRows, bản cũ
    không có. Trả về (ổn chưa, lý do, phản hồi đầy đủ).
    """
    # Thử lại: Sheet chậm nhất thời làm dừng cả lệnh thì phiền, mà đây chỉ là
    # câu hỏi thăm dò, gửi lại không gây tác dụng phụ nào.
    result = _post_retry({"action": "health", "sheet": tab}, timeout=40)

    if not result.get("ok"):
        return False, f"không gọi được Apps Script: {result.get('error')}", result

    if result.get("inbox") is not True:
        return False, (
            f"Apps Script trên Google đang là BẢN CŨ, chưa biết tab {tab}.\n"
            f"  Bản cũ không báo lỗi — nó ghi hết vào tab chính.\n"
            + HUONG_DAN_CAP_NHAT
        ), result

    if result.get("sheet") != tab:
        return False, f"Apps Script hiểu nhầm tab: xin {tab}, nó trả {result.get('sheet')}", result

    return True, "", result


def check():
    """Máy chủ sống chưa, đã nối Sheet chưa"""
    try:
        with urllib.request.urlopen(f"{config.API_BASE}/api/sheet?health=1", timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        return {"ok": False, "error": str(e)}


def pull(sheet_tab=None):
    """Đọc toàn bộ một tab về. Trả None nếu hỏng, để nơi gọi biết mà dừng."""
    tab = sheet_tab or SHEET_TAB
    result = _post_retry({"action": "pull", "sheet": tab})

    if not result.get("ok"):
        print(f"✗ Không đọc được tab {tab}: {result.get('error')}", file=sys.stderr)
        return None
    return [p for p in (result.get("places") or []) if p.get("id")]


def push(places, sheet_tab=None):
    """Đẩy danh sách quán lên Sheet theo từng lô. Trả về (đã thêm, đã cập nhật)."""
    tab = sheet_tab or SHEET_TAB
    if not places:
        print("Không có quán nào để đẩy.")
        return 0, 0

    health = check()
    if not health.get("ok") or not health.get("configured"):
        print(f"✗ Máy chủ chưa sẵn sàng: {health.get('error') or health.get('reason')}", file=sys.stderr)
        print(f"  Đang gọi: {config.API_BASE}/api/sheet", file=sys.stderr)
        print("  Đặt FOODGUIDE_API trong crawler/.env cho đúng địa chỉ trang đã deploy.", file=sys.stderr)
        return 0, 0

    # Chốt chặn: Apps Script trên Google có đúng bản hiểu tab này không
    good, why, probe = probe_script(tab)
    if not good:
        print(f"✗ DỪNG LẠI, chưa ghi gì cả.\n  {why}", file=sys.stderr)
        return 0, 0

    rows_before = probe.get("rows")
    print(f"  tab {tab}: {rows_before} dòng trước khi đẩy")

    total_added = 0
    total_updated = 0
    failed = 0

    for start in range(0, len(places), BATCH_SIZE):
        batch = places[start:start + BATCH_SIZE]
        result = _post_retry({"action": "push", "sheet": tab, "places": batch})

        if not result.get("ok"):
            failed += len(batch)
            print(f"✗ Lô {start // BATCH_SIZE + 1} thất bại: {result.get('error')}", file=sys.stderr)
            continue

        total_added += result.get("added", 0)
        total_updated += result.get("updated", 0)
        print(f"  lô {start // BATCH_SIZE + 1}: +{result.get('added', 0)} mới, "
              f"{result.get('updated', 0)} cập nhật")

    # Đếm lại số dòng thật thay vì tin vào phản hồi. Một lô bị 504 vẫn có thể
    # đã ghi xong — chỉ đếm lại mới biết chắc.
    _, _, after = probe_script(tab)
    rows_after = after.get("rows")

    print(f"\nĐã đẩy vào tab {tab}: {total_added} quán mới, {total_updated} cập nhật.")

    # Đối chiếu bằng hai câu hỏi khác nhau, đừng gộp làm một:
    #   1. Có quán nào rơi mất không?   → added + updated phải đủ số quán gửi đi
    #   2. Có quán nào bị nhân đôi không? → số dòng tăng thêm không được vượt quá
    #
    # KHÔNG so số dòng tăng thêm với riêng `added`. Một lô bị Vercel trả 504 rồi
    # được gửi lại sẽ ghi một lần nhưng đếm hai lần: lần đầu là "mới", lần sau
    # thấy id đã có nên tính là "cập nhật". Lúc đó 120 mới + 27 cập nhật vẫn là
    # đúng 147 quán, chỉ có phép so ngây thơ mới kêu sai.
    handled = total_added + total_updated
    if isinstance(rows_before, int) and isinstance(rows_after, int):
        grew = rows_after - rows_before
        print(f"  Đếm lại trên Sheet: {rows_before} → {rows_after} dòng (+{grew})")
        if grew > len(places):
            print(f"  ⚠ Sheet tăng {grew} dòng trong khi chỉ gửi {len(places)} quán"
                  " — có thể bị nhân đôi, mở Sheet kiểm tra.", file=sys.stderr)

    if handled < len(places):
        print(f"  ⚠ Gửi {len(places)} quán nhưng chỉ ghi nhận {handled}"
              " — chạy lại lệnh này để bù nốt.", file=sys.stderr)

    if failed:
        print(f"  ⚠ {failed} quán chưa đẩy được, chạy lại lệnh này để bù nốt.", file=sys.stderr)

    print(f"Mở Google Sheet → tab {tab} → tick cột Duyệt → menu 🍜 FoodGuide → Duyệt các quán đã tick.")
    return total_added, total_updated


if __name__ == "__main__":
    print(json.dumps(check(), ensure_ascii=False, indent=2))
