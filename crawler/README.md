# Tool crawl → Crawl_Inbox

Cào dữ liệu quán, chuẩn hoá, đẩy vào tab **`Crawl_Inbox`** của Google Sheet để bạn duyệt tay trước khi lên cẩm nang.

```
Michelin ─┐
          ├─► schema.to_place() ─► /api/sheet (sheet=Crawl_Inbox) ─► bạn tick "Duyệt" ─► tab FoodGuide ─► web
Bài viết ─┘        (chuẩn hoá)          (không cần service account)      (menu 🍜 trong Sheet)
```

## Cài

```bash
pip install -r crawler/requirements.txt
python -m playwright install chromium

cp crawler/.env.example crawler/.env    # rồi điền FOODGUIDE_API và GEMINI_API_KEY
```

## Dùng

```bash
python crawler/run.py check                    # máy chủ sống chưa, đã nối Sheet chưa
python crawler/run.py michelin                 # cào, lưu ra out/michelin.json — CHƯA đẩy
python crawler/run.py michelin --show          # cào và xem trình duyệt chạy (gỡ lỗi)
python crawler/run.py push out/michelin.json   # xem file thấy ổn rồi mới đẩy
python crawler/run.py parse bai-viet.txt       # văn bản tự do → JSON qua Gemini
```

Mặc định **không đẩy thẳng**. Bạn xem file JSON trước, thấy ổn mới `push`.

Sau khi đẩy: mở Sheet → tab `Crawl_Inbox` → tick cột **Duyệt** ở những quán ưng ý → menu **🍜 FoodGuide → Duyệt các quán đã tick**.

## Ba quy tắc trong `schema.py`

Đây là phần quan trọng nhất của gói này, và là chỗ khác nhiều nhất so với kế hoạch ban đầu trong [`../crawl.md`](../crawl.md).

| | Vì sao |
|---|---|
| **`rating` luôn `None`** | Kế hoạch cũ định gán mặc định 4.2–5.0. Đó là bịa số — con số hiện cạnh ngôi sao, người đọc tin là thật. Michelin cũng không chấm thang 1–5, họ có Sao / Bib Gourmand / Selected; hạng đó đi vào `tags`. |
| **`verified` luôn `False`** | Nhãn "Đã xác minh" trong cẩm nang nghĩa là *bạn* đã tự đối chiếu Google Maps. Máy không làm thay được, bật sẵn là làm nhãn mất nghĩa. |
| **`image` luôn rỗng** | Ảnh Michelin có bản quyền. Ảnh mạng xã hội nằm trên CDN có chữ ký, hết hạn sau vài ngày là gãy. Chụp ảnh thật rồi tải lên qua nút 📷 trong trang. |

Thêm hai chỗ nữa phải đúng, nếu sai thì quán cào về **biến mất khỏi bộ lọc**:

- `category` phải là **id** (`cafe-chill`), không phải tên hiển thị (`Cà phê & Trà`)
- `priceLevel` phải là `low` / `mid` / `high`, không phải `$` / `$$` / `$$$`

`js/app.js` cũng chuẩn hoá lại hai trường này khi nhận dữ liệu, nên đây là hai lớp bảo vệ độc lập.

## Michelin: cần trình duyệt thật

Kế hoạch ban đầu ghi Michelin "render HTML tĩnh, dễ crawl, không bị chặn". Kiểm tra thực tế thì ngược lại:

```
curl + User-Agent trình duyệt       → HTTP 202, 0 byte
curl + đủ header như trình duyệt    → HTTP 202, 2012 byte:
    window.awsWafCookieDomainList = [];
    window.gokuProps = {"key":"AQIDAHjcYu/GjX+Qlghic..."}
```

AWS WAF với thử thách JavaScript. `requests` + BeautifulSoup nhận đúng trang thử thách, **0 link quán**. Nên bước này không nhanh hơn bước cào mạng xã hội như kế hoạch giả định.

**Giới hạn tự đặt trong `michelin.py`:**

- Chỉ đi đường phân trang thuần `/page/N`. `robots.txt` của Michelin cấm mọi URL có tham số lọc / sắp xếp / toạ độ (`*sort=*`, `*?region=`, `*/search?`, `*lat=*`, `*/restaurantlist?`).
- Nghỉ 3 giây giữa các trang (`CRAWL_DELAY`).
- Trình duyệt bình thường: **không** plugin giấu dấu vết, **không** xoay proxy, **không** giải captcha. Michelin vẫn chặn thì đó là họ từ chối — dừng lại, đừng lách thêm.

## Chưa kiểm được gì

`schema.py`, `ai_parser.py` (schema + prompt), `sync.py` đã có 50 test tự động chạy được không cần mạng — gồm cả test đối chiếu id danh mục giữa Python và `js/data.js`, để hai bên không lệch nhau.

**`michelin.py` chưa chạy thật lần nào** vì Playwright chưa được cài trong môi trường này. Bộ chọn (selector) dựa trên cấu trúc `a[href*="/restaurant/"]` — nhiều khả năng đúng, nhưng phải chạy `python crawler/run.py michelin --show` một lần để xem và chỉnh lại nếu Michelin đổi giao diện.

## Threads

Chưa làm, và đang nằm ở cuối hàng đợi có chủ đích. Điều khoản của Meta cấm thu thập tự động; đây cũng là chặng cho dữ liệu bẩn nhất (văn bản tự do, phải qua AI mới dùng được) trong khi rủi ro cao nhất. Làm ba phần trên chạy ổn đã.

Hướng rẻ hơn nhiều cho cùng mục đích: lưu quán vào một **danh sách trên Google Maps** khi đi đường, rồi dùng Google Takeout xuất CSV (Title + URL). Không WAF, không chống bot, không vướng điều khoản — vì đó là dữ liệu của chính bạn, do Google cung cấp công cụ xuất. Mỗi URL đưa qua `/api/place` là ra tên, địa chỉ, quận, toạ độ.
