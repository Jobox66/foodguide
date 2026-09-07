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

cp .env.example .env    # cấu hình tại file .env ở thư mục gốc (điền FOODGUIDE_API, GEMINI_API_KEY...)
```

## Dùng

```bash
# 1. Kiểm tra kết nối (không đụng dữ liệu)
python crawler/run.py check

# 2. Cào — lưu ra crawler/out/michelin.json, CHƯA đẩy đi đâu
python crawler/run.py michelin

# 3. Mở file xem, thấy ổn thì đẩy vào Crawl_Inbox
python crawler/run.py push crawler/out/michelin.json

# 4. Mở Google Sheet → tab Crawl_Inbox → tick cột Duyệt
#    → menu 🍜 FoodGuide → Duyệt các quán đã tick
```

Vài cờ hữu ích:

```bash
--api https://trang-cua-ban.vercel.app   # dùng máy chủ khác, khỏi sửa .env
--show                                   # hiện cửa sổ trình duyệt (gỡ lỗi selector)
--push                                   # cào xong đẩy luôn, bỏ qua bước xem file
CRAWL_MAX_PAGES=2 python ...             # chỉ cào 2 trang cho nhanh
```

Mặc định **không đẩy thẳng**. Bạn xem file JSON trước, thấy ổn mới `push`.

## Apps Script phải là bản mới, nếu không dữ liệu vào nhầm tab

Đây là cái bẫy nguy hiểm nhất của cả gói này, vì nó **không báo lỗi**.

Bản Apps Script cũ (trước khi có phần `Crawl_Inbox`) không biết tham số `sheet`.
Nó không từ chối — nó bỏ qua, ghi hết vào tab chính, rồi trả về `ok:true`. Màn
hình vẫn in "Đã đẩy vào tab Crawl_Inbox" trong khi 147 quán cào về đã nằm gọn
trong cẩm nang thật. Chuyện này đã xảy ra một lần, phải xoá tay 147 dòng.

Nên `push()` giờ **dò phiên bản trước khi ghi dòng nào**, dựa vào dấu vân tay:
bản mới trả `inbox: true` và `inboxRows` trong phản hồi `health`, bản cũ không có.
Sai bản thì dừng hẳn, không ghi gì. `run.py check` cũng báo trước điều này.

Sau khi đẩy còn **đếm lại số dòng thật** trên Sheet chứ không tin vào phản hồi —
Vercel hay trả 504 khi Apps Script chạy quá 60 giây, mà 504 không có nghĩa là
Google chưa ghi. Lô cũng hạ xuống 60 quán cho đỡ chạm trần thời gian.

Cách cập nhật: mở Sheet → Tiện ích mở rộng → Apps Script → dán đè toàn bộ
[`../tools/sheet-appscript.gs`](../tools/sheet-appscript.gs) → Triển khai →
Quản lý bản triển khai → ✏️ sửa bản đang dùng → **Phiên bản: Mới** → Triển khai.
Chọn "Bản triển khai mới" là ra URL khác, trang web sẽ mất kết nối.

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

## Đã kiểm tới đâu

`schema.py`, `ai_parser.py` (schema + prompt), `push_to_sheet.py` có 50 test tự động chạy được không cần mạng — gồm test đối chiếu id danh mục giữa Python và `js/data.js`, để hai bên không lệch nhau.

**`michelin.py` đã chạy thật** trên guide.michelin.com, kết quả một lượt 2 trang mỗi thành phố:

```
143 quán  ·  86 Selected  ·  47 Bib Gourmand  ·  10 một sao  ·  0 hai sao
59 low / 49 mid / 35 high      ·  0 id trùng  ·  0 quán ngoài Việt Nam
142/143 có địa chỉ             ·  Hà Nội 64 quán, 51 suy được quận
rating bịa = 0  |  verified bịa = 0  |  ảnh hotlink = 0
```

> Bộ số cũ ghi "147 quán, 11 một sao, 1 hai sao" là **sai**: nó tính cả 4 quán
> Chengdu lọt vào danh sách Việt Nam, và quán "2 sao" duy nhất chính là một
> trong số đó. Việt Nam không có quán 2 sao nào trong dữ liệu này.

Hai điều học được khi chạy thật, ghi lại kẻo quên:

- **Playwright qua được AWS WAF.** Rào cản thật không phải WAF mà là URL: `/vn/vi/...` là trang "Page Not Found", đường dùng được là `/en/vn/<thành phố>/restaurants`.
- **Hết trang thì Michelin lặp lại trang cuối**, không trả trang rỗng. Nên mốc dừng phải là “không thêm được quán mới nào” chứ không phải “không có thẻ nào” — trước khi sửa, mỗi thành phố tải thừa 8 trang vô ích.
- **Hạng Michelin là icon SVG, không phải chữ** (`michelin-star_8519.svg`). Đọc `.innerText` thì mọi quán đều ra "Selected" và mất sạch 48 Bib Gourmand + 12 quán có sao. Phải đọc `img.michelin-award` rồi lấy `src`.

Michelin đổi giao diện thì chạy `python crawler/run.py michelin --show` để xem cửa sổ trình duyệt và chỉnh lại selector trong `read_cards()`.

## Địa chỉ: phải vào trang chi tiết

Trang *danh sách* chỉ có "Hanoi, Vietnam". Địa chỉ đường phố nằm ở *trang chi tiết* từng quán, trong một khối JSON-LD Michelin nhúng sẵn:

```json
"address": { "@type": "PostalAddress",
  "streetAddress": "GF, Sofitel Legend Metropole, 15 Ngo Quyen Street, Hoan Kiem Ward",
  "addressLocality": "Hanoi" }
```

Đọc JSON-LD chứ **không** bóc theo class CSS: đây là dữ liệu có cấu trúc họ chủ động công bố, không đổi theo lần thay giao diện. `.data-sheet__block--text` chỉ là đường lui.

**Nhưng `crawl()` mặc định KHÔNG làm việc này.** Địa chỉ chỉ dùng để xếp quán vào đúng bộ lọc quận, mà bộ lọc chỉ có nghĩa với quán đã nằm trong cẩm nang. Mở 141 trang chi tiết ngay lúc cào là tải địa chỉ của hàng trăm quán sẽ không bao giờ được duyệt — 9 phút và một đống lượt tải vô ích lên máy chủ người ta.

Nên lượt cào chỉ lưu **bảng link** `id → trang chi tiết` (`out/michelin_links.json`), và `run.py addresses` lấy địa chỉ sau, chỉ cho quán đã ở trong cẩm nang mà còn thiếu ô địa chỉ:

```
michelin   →  Crawl_Inbox  →  bạn tick Duyệt  →  FoodGuide  →  addresses
  27 giây      141 quán        chọn 10 quán       10 quán      10 lượt tải
```

`addresses` đọc cả dòng về, chỉ sửa `address` và `district` rồi đẩy lại — Sheet ghi đè cả dòng nên không làm vậy là mất những gì bạn sửa tay. Quận đã điền sẵn thì không đụng. Chạy lại nhiều lần vô hại: nó bỏ qua quán đã có địa chỉ.

`--details` giữ lại lối cũ (lấy ngay lúc cào), `--limit N` để thử trước, `--tab Crawl_Inbox` để làm ở phòng chờ.

**Đợi trang render rồi mới đọc.** `domcontentloaded` xong không có nghĩa JSON-LD đã có: đọc ngay thì thỉnh thoảng ra rỗng, mà rỗng ở đây trông hệt như "trang này không có địa chỉ" — lỗi đua tiến trình đội lốt dữ liệu thiếu. Đã gặp thật: Le Beaulieu lúc được lúc không cho tới khi thêm `wait_for_selector(ADDRESS_READY_SELECTOR)`.

**ID phải chốt trước khi biết quận.** `make_place_id()` bình thường trộn quận vào id để phân biệt hai quán trùng tên. Nhưng quận ở đây được điền *thêm* ở giai đoạn sau — cùng một quán, cào có địa chỉ và cào không có sẽ ra hai id khác nhau, và lần đẩy sau tạo ra một bộ dòng trùng thay vì cập nhật bộ cũ. Nên `to_michelin_place()` chốt id theo tên ngay từ đầu.

## Hai bẫy dữ liệu chỉ lộ ra khi có địa chỉ

**Tên đường không nói gì về món ăn.** `to_place()` từng đưa `address` vào `guess_category()`. Michelin để trống địa chỉ nên chưa ai thấy hại; tới lúc lấy được địa chỉ thật thì 59/147 quán bị xếp danh mục theo tên đường. Từ khoá khớp kiểu chuỗi con, không ranh giới từ:

| Từ khoá | Khớp nhầm vào |
|---|---|
| `"y "` (Ý) | Ho Chi Minh Cit**y**, Nam K**y** Khoi Nghia, "X **by** Y", Eater**y**, Thu**y** |
| `"che"` (chè) | **Che**ngdu |
| `"mien"` (miến) | Le Van **Mien** Street |

Sửa hai lớp: bỏ `address` khỏi phép đoán, và khớp theo ranh giới từ. Riêng `"y "` từng gán nhầm 10 quán chỉ vì chữ "by" trong tên.

**Danh sách Việt Nam có lẫn quán nước ngoài.** 4 quán ở Chengdu lọt vào kết quả cào từ `/en/vn/...`, trong đó có quán 2 sao duy nhất của cả mẻ — suýt báo cáo "Việt Nam có một quán 2 sao" trong khi nó ở Tứ Xuyên. `in_target_country()` lọc theo ô địa điểm của thẻ ("Hanoi, Vietnam" / "Chengdu, Chinese Mainland"), và **in tên** những quán bị loại chứ không loại âm thầm. Ô địa điểm rỗng thì giữ lại — selector hỏng mà im lặng vứt sạch dữ liệu còn tệ hơn.

## Quận: chỉ suy khi chắc

Từ 2025 Hà Nội bỏ quận, chuyển sang phường. Tên phường trùng quận cũ (`Hoan Kiem Ward`, `Ba Dinh Ward`) thì `district_from_address()` nhận ra; phường mới như `Cua Nam`, `O Cho Dua`, `Quoc Tu Giam` thì để **rỗng**. Cửa Nam nay gộp từ nhiều quận cũ, `Tu Liem` không rõ Nam hay Bắc — đoán sai là đẩy quán vào nhầm bộ lọc, đúng thứ quy tắc 1 cấm.

Quán TP.HCM đương nhiên không khớp quận Hà Nội. Bỏ `ho-chi-minh` khỏi `MICHELIN_START_URLS` nếu cẩm nang chỉ làm Hà Nội.

## Threads Crawler (Bước 2 — Khám phá xu hướng & quán ruột)

Cào các bài chia sẻ review trên mạng xã hội Threads theo từ khoá hoặc link bài viết trực tiếp, sau đó kết hợp với **Gemini 2.0 Flash** để bóc tách dữ liệu quán ăn:

```bash
# 1. Đăng nhập 1 lần duy nhất để lưu phiên làm việc (vượt qua rào cản tìm kiếm của Threads)
python crawler/run.py threads --login

# 2. Cào bài viết theo từ khoá tìm kiếm (lưu bài thô vào crawler/out/threads_posts.json)
python crawler/run.py threads --query "quán ruột hà nội" --limit 15

# 3. Cào và tự động trích xuất quán ăn bằng Gemini AI (lưu vào crawler/out/threads.json)
python crawler/run.py threads --query "quán ruột hà nội" --parse

# 4. Cào một bài viết Threads cụ thể
python crawler/run.py threads --url https://www.threads.com/@user/post/xyz --parse

# 5. Pipeline hoàn chỉnh: Cào -> Gemini AI bóc tách -> Đẩy vào Crawl_Inbox
python crawler/run.py threads --query "quán ngon phố cổ" --parse --push
```
