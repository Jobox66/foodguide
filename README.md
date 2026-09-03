# 🍜 Hanoi Food & Cafe Guide (Cẩm Nang Ẩm Thực Cá Nhân)

Website tổng hợp, tuyển chọn và đánh giá các quán ăn, quán cà phê tại Hà Nội. Dán link Google Maps là hệ thống tự đọc thông tin quán, kèm bộ lọc thông minh và định vị 1 chạm.

---

## ✨ Tính năng

1. **Tự động đọc thông tin từ link Google Maps**
   Dán link vào ô "Quét & Tự điền", hệ thống lấy tên quán, địa chỉ, quận, toạ độ, danh mục — riêng số sao và lượt đánh giá bạn nhập tay (ô Điểm nhận thẳng cụm `4,6 (228)`).
   👉 Xem chi tiết ở mục [Autofill hoạt động thế nào](#-autofill-hoạt-động-thế-nào).

2. **Nhãn Đã xác minh / Chưa xác minh**
   Mỗi quán mang một nhãn cho biết dữ liệu đã được đối chiếu với Google Maps hay chưa, kèm nguồn dữ liệu (Google Places / OpenStreetMap / tự nhập / dựng sẵn). Lọc nhanh bằng chip **⚠️ Chưa xác minh** để biết còn quán nào cần rà lại. Bấm nút **✅ Xác minh** trong bảng Quản lý để đánh dấu từng quán.

3. **2 chế độ hiển thị**
   - 🔍 **Khám phá**: thẻ chi tiết từng quán — ảnh, ★, review, món *Must-Try*, mức giá, nút mở Google Maps / chỉ đường.
   - 📑 **Danh mục**: gom nhóm theo loại món để mở nhanh danh sách trên Google Maps.

4. **Tìm kiếm & bộ lọc tức thì**
   - Tìm kiếm **không phân biệt dấu**: gõ `pho` ra `Phở`, `ca phe trung` ra `Cà Phê Trứng`.
   - Lọc theo quận, mức giá, trạng thái xác minh; sắp xếp theo Đề xuất / Điểm cao / Tên A-Z.

5. **Quản lý dữ liệu**
   - Thêm / sửa / xoá quán ngay trên giao diện, lưu vào `LocalStorage`.
   - ☁️ **Đồng bộ Google Sheet** — mỗi thay đổi tự ghi lên Sheet cá nhân của bạn. Xem [mục bên dưới](#️-đồng-bộ-google-sheet).
   - 📊 **Xuất CSV** (UTF-8 BOM) mở thẳng bằng Google Sheets / Excel không lỗi tiếng Việt.

6. **Responsive & Dark Mode** — tối ưu mobile-first, có thanh điều hướng dưới cho điện thoại.

---

## 🪄 Autofill hoạt động thế nào

Nguyên tắc: **chỉ điền dữ liệu đọc được thật.** Ô nào không tra ra thì để trống cho bạn tự nhập — hệ thống không sinh số sao, giá tiền hay lời review giả.

### Kiến trúc

```
Trình duyệt                     Máy chủ                      Nguồn dữ liệu
─────────────                   ────────────                 ─────────────
dán link ──GET /api/place?url=─►  đi theo redirect  ────────►  maps.app.goo.gl
                                  bóc tên + toạ độ            (chỉ resolve link,
         ◄──── tên + toạ độ ────                               không gọi API nào)

         ──── toạ độ ─────────────────────────────────────►  Nominatim (OSM)
         ◄──── địa chỉ + quận ───────────────────────────

         ✍️ số sao + lượt đánh giá: bạn nhìn Google Maps và gõ vào
```

**Khoá Google không bao giờ xuống trình duyệt.** Nó chỉ tồn tại trong biến môi trường của máy chủ. Người dùng mở DevTools cũng không thấy gì ngoài `/api/place` và dữ liệu đã xử lý.

Máy chủ còn giải quyết một việc nữa mà trình duyệt không làm được: **đi theo redirect của link rút gọn** `maps.app.goo.gl`. Trình duyệt bị CORS chặn nên trước đây loại link này luôn đọc ra rỗng.

### Thứ tự thử

| Bước | Nguồn | Lấy được gì |
|---|---|---|
| 1 | Bóc từ URL phía client | Tên + toạ độ, nếu bạn dán URL đầy đủ |
| 2 | Đoạn text dán kèm | Tên + địa chỉ (nút Chia sẻ của app Google Maps) |
| 3 | **`/api/place` — đường chính** | Giải mã link rút gọn `maps.app.goo.gl` |
| 4 | CORS proxy công cộng | Chỉ dùng khi không có máy chủ (mở bằng `file://`) — hay hỏng |
| 5 | OpenStreetMap / Nominatim | Địa chỉ + quận từ toạ độ — miễn phí, luôn bật |

Số sao và lượt đánh giá **không** có trong danh sách này — xem [lý do bên dưới](#️-vì-sao-không-tự-lấy-được-số-sao).

### 💡 Mẹo dán link

- **Tốt nhất:** copy nguyên URL trên thanh địa chỉ trình duyệt khi đang mở quán (dạng `google.com/maps/place/...@21.04,105.81...`).
- **Cũng tốt:** trên app điện thoại bấm *Chia sẻ*, dán **cả đoạn** gồm tên, địa chỉ và link:
  ```
  Hôm Nào Cà Phê
  Số 10, Ngõ 82 Nghĩa Tân, Cầu Giấy, Hà Nội
  https://maps.app.goo.gl/xxxxx
  ```
- **Chỉ mỗi link rút gọn:** cần máy chủ đang chạy. Không có máy chủ thì phải trông chờ CORS proxy công cộng, mà các dịch vụ này thường xuyên chết.

---

## ⚠️ Vì sao không tự lấy được số sao

Nguồn duy nhất có số sao quán ăn Hà Nội là **Google Places API**. Nhưng:

- Places API (New) nằm trong danh sách [Google Maps Core Services](https://cloud.google.com/maps-platform/terms/maps-services)
- Điều khoản Maps Platform §3.2.1(v) cấm *phân phối hoặc quảng bá tại Prohibited Territory* những ứng dụng dùng Core Services
- [Việt Nam nằm trong danh sách đó](https://cloud.google.com/maps-platform/terms/maps-prohibited-territories), cùng Trung Quốc, Cuba, Iran, Triều Tiên, Syria

Ràng buộc gắn với **ứng dụng và nơi phân phối**, không phải loại tài khoản — nên thêm thẻ vào Billing cũng không gỡ được.

Các nguồn thay thế đều không dùng được: OpenStreetMap không có dữ liệu đánh giá; Foursquare tính phí ngay từ lượt đầu cho trường ratings và dữ liệu quán ăn Hà Nội rất mỏng.

**Kết quả:** số sao và lượt đánh giá nhập tay. Mất khoảng 10 giây mỗi quán, và lúc copy link thì bạn đang nhìn thẳng vào con số đó rồi.

Đổi lại: không khoá API, không thẻ, không hạn mức phải canh, không chi phí, không có gì để lộ. Nhãn **Đã xác minh** vì vậy mang nghĩa thật — bạn tự đối chiếu Google Maps rồi mới tick.

### Mẹo nhập nhanh

Ô **Điểm** nhận thẳng cụm copy từ Google Maps rồi tự tách sang ô bên cạnh:

| Bạn gõ | Điểm | Lượt đánh giá |
|---|---|---|
| `4,6 (228)` | 4.6 | 228 |
| `4,8 (12.487)` | 4.8 | 12487 |
| `4,6` | 4.6 | *(giữ nguyên)* |
| `228` | *(giữ nguyên)* | 228 |

Sau khi quét link xong, con trỏ tự nhảy vào ô Điểm và hiện link mở quán trên Google Maps để bạn liếc con số.

---

## 🌐 Deploy lên Vercel

Backend `api/place.js` chỉ làm một việc: đi theo redirect của link rút gọn `maps.app.goo.gl` — thứ trình duyệt không tự làm được vì CORS. Không gọi API nào của Google, không cần khoá.

1. Đẩy mã nguồn lên GitHub.
2. Vào [vercel.com/new](https://vercel.com/new) → chọn repository → **Deploy**.
   Vercel tự nhận thư mục gốc là trang tĩnh, còn `api/place.js` và `api/sheet.js` là serverless function.
3. Xong. Không có biến môi trường nào **bắt buộc** — muốn bật đồng bộ Google Sheet thì thêm `SHEETS_WEBHOOK_URL` và `SHEETS_TOKEN`, xem [mục bên dưới](#️-đồng-bộ-google-sheet).

Nếu tách domain (ví dụ trang trên GitHub Pages, API trên Vercel), thêm biến `ALLOWED_ORIGINS` trên Vercel và điền địa chỉ endpoint đầy đủ vào ô trong modal 🔌.

### Bảo mật của endpoint

| Lớp | Tác dụng |
|---|---|
| Danh sách domain cho phép | Chỉ nhận link thuộc Google Maps. Chặn biến endpoint thành proxy quét mạng nội bộ (SSRF). |
| Giới hạn tần suất | 30 request/phút mỗi IP. |
| `ALLOWED_ORIGINS` | Khi tách domain, chỉ origin trong danh sách mới gọi được. |

> Giới hạn tần suất dùng bộ nhớ của từng instance serverless nên chỉ là *best-effort*.

---

## ☁️ Đồng bộ Google Sheet

`LocalStorage` sống trong đúng một trình duyệt, đúng một máy. Xoá cache là mất sạch. Google Sheet đóng vai trò **sổ cái**: mỗi lần bạn thêm, sửa, xoá một quán, thay đổi được ghi thẳng lên Sheet cá nhân của bạn — và bạn có thể sửa hàng loạt ngay trong Sheet rồi bấm *Lấy từ Sheet về*.

Tính năng này **tuỳ chọn**. Không cấu hình thì trang vẫn chạy đúng như cũ, chỉ lưu ở trình duyệt.

### Cách nối — 7 bước, làm một lần

Hướng dẫn đầy đủ nằm ngay đầu file [`tools/sheet-appscript.gs`](tools/sheet-appscript.gs), tóm tắt:

1. Tạo Sheet trống tại `sheets.new` (không cần tạo cột — script tự tạo).
2. **Tiện ích mở rộng → Apps Script**, xoá `Code.gs`, dán toàn bộ `tools/sheet-appscript.gs`.
3. Sửa `SHEET_TOKEN` thành một chuỗi bí mật tự nghĩ.
4. **Triển khai → Ứng dụng web**, chọn *Thực thi với tư cách: Tôi* và *Ai có quyền truy cập: **Bất kỳ ai***.
5. Copy đường dẫn `.../exec`.
6. Vercel → **Settings → Environment Variables**: thêm `SHEETS_WEBHOOK_URL` và `SHEETS_TOKEN`.
7. **Redeploy**, rồi bấm *Đẩy toàn bộ lên Sheet* trong modal 🔌.

### Vì sao Apps Script, không phải Sheets API

Sheets API cần khoá OAuth hoặc file khoá service account — nhiều thứ bí mật hơn để giữ mà kết quả không hơn. Apps Script Web App chạy dưới danh nghĩa chính bạn nên đã có sẵn quyền vào Sheet của bạn. (Khác Places API, Sheets API **không** thuộc Maps Core Services nên không vướng ràng buộc lãnh thổ — vấn đề duy nhất chỉ là công sức cấu hình.)

### Bí mật nằm ở đâu

Đường dẫn `/exec` và token là thứ mở được Sheet — ai có chúng cũng ghi được. Cả hai nằm trong **biến môi trường trên Vercel**, không nằm trong mã nguồn trang. Trình duyệt của người xem chỉ thấy `/api/sheet` trên chính domain của bạn; `api/sheet.js` ghép token vào rồi mới gọi Google.

### Quy tắc an toàn dữ liệu

| Tình huống | Hành vi |
|---|---|
| Mất mạng lúc thêm quán | Quán vẫn lưu ở máy; thao tác nằm trong hàng đợi ở `LocalStorage`, nút ☁️ hiện số việc chờ, tự đẩy lại ở lần đồng bộ sau. |
| Kéo về khi Sheet khác máy | Hỏi xác nhận trước, rồi lấy bản trên Sheet làm chuẩn. |
| Quán chỉ có ở máy, chưa có trên Sheet | **Không bị xoá.** Kéo về không bao giờ xoá dữ liệu ở máy — chiều xoá chỉ đi từ nút 🗑️. |
| Bấm ☁️ | Đẩy phần đang chờ lên **trước**, rồi mới kéo về — để thay đổi vừa làm không bị bản cũ trên Sheet đè. |

---

## 🚀 Chạy thử trên máy

| Cách | Lệnh | Có `/api/place` & `/api/sheet`? |
|---|---|---|
| **Đầy đủ** (khuyên dùng) | `vercel dev` | ✅ Có — đọc được link rút gọn, đồng bộ được Sheet |
| Chỉ giao diện | `npx serve .` hoặc Live Server | ❌ Không |
| Mở thẳng file | nhấp đúp `index.html` | ❌ Không |

Hai cách sau vẫn dùng được trang, nhưng autofill chỉ tra được địa chỉ qua OpenStreetMap, **không đọc được link rút gọn** `maps.app.goo.gl`, và không đồng bộ lên Sheet — thay đổi nằm lại trong hàng đợi cho tới khi chạy bản có máy chủ.

> `vercel dev` đọc biến môi trường từ file `.env` ở thư mục gốc. Chép `.env.example` thành `.env` rồi điền `SHEETS_WEBHOOK_URL` / `SHEETS_TOKEN` nếu muốn thử đồng bộ trên máy. `.env` đã nằm trong `.gitignore`.

---

## 🛠️ Tuỳ biến dữ liệu

### Thông tin cá nhân (Avatar, Tên, Bio, Mạng xã hội)
Mở [js/data.js](js/data.js), tìm `DEFAULT_PROFILE` ở cuối file:
```javascript
const DEFAULT_PROFILE = {
  name: "Tên của bạn hoặc Tên Guide",
  handle: "@your_handle",
  bio: "Lời giới thiệu ngắn...",
  avatar: "Link ảnh đại diện",
  socials: { facebook: "...", instagram: "...", tiktok: "...", threads: "..." }
};
```

### Thêm quán vào danh sách dựng sẵn
Thêm object vào mảng `INITIAL_PLACES` trong [js/data.js](js/data.js):
```javascript
{
  id: "place-custom-1",
  name: "Tên Quán Ăn",
  category: "mon-soi",   // mon-soi | com-xoi | banh-mi-cuon | lau-nuong
                         // cafe-chill | an-vat | do-a-au | quan-nhau
  district: "Hoàn Kiếm",
  address: "Địa chỉ cụ thể...",
  mapsUrl: "https://maps.google.com/?q=...",
  rating: 4.8,           // để null nếu chưa biết — đừng đoán
  reviewCount: 1200,     // để null nếu chưa biết
  priceRange: "40.000đ - 70.000đ",
  priceLevel: "mid",     // low (<50k) | mid (50k-150k) | high (>150k)
  time: "07:00 - 22:00",
  mustTry: "Món nên gọi",
  review: "Nhận xét của bạn...",
  tags: ["Ăn sáng", "Phố Cổ"],
  image: "https://link-anh.jpg",
  verified: true,        // true nếu bạn đã đối chiếu với Google Maps
  featured: true
}
```

> Dữ liệu bạn chỉnh trong giao diện được lưu ở `LocalStorage` và **luôn thắng** giá trị trong `data.js`. Quán bạn xoá sẽ không quay lại sau khi tải lại trang.

---

## 🌐 Chọn nơi deploy

**Vercel** (khuyên dùng) — phục vụ cả trang tĩnh lẫn `/api/place` trên cùng một domain, không phải cấu hình CORS. Xem [mục Deploy ở trên](#-deploy-lên-vercel).

**GitHub Pages / Netlify Drop** — chỉ chạy phần tĩnh, **không có** `/api/place`. Trang vẫn dùng được nhưng mất khả năng đọc link rút gọn `maps.app.goo.gl`; bạn sẽ phải dán URL đầy đủ từ thanh địa chỉ trình duyệt. Muốn giữ GitHub Pages thì deploy riêng API lên Vercel, điền địa chỉ đầy đủ vào ô *endpoint* trong modal 🔌, và đặt `ALLOWED_ORIGINS=https://ten-ban.github.io` trên Vercel.

## 📁 Cấu trúc

```
foodguide/
├── index.html              # Giao diện & các modal
├── css/style.css           # Toàn bộ style, hỗ trợ Dark Mode
├── js/
│   ├── data.js             # Dữ liệu quán dựng sẵn, danh mục, quận, profile
│   └── app.js              # Logic phía client: render, lọc, autofill, quản lý
├── api/
│   ├── place.js            # Serverless function - giải mã link rút gọn
│   └── sheet.js            # Serverless function - cầu nối tới Google Sheet
├── tools/
│   └── sheet-appscript.gs  # Dán vào Apps Script của Sheet bạn muốn dùng
├── vercel.json             # Cấu hình Vercel
├── .env.example            # Mẫu biến môi trường (tuỳ chọn)
├── .gitignore
└── data/hanoi_cafes_top.csv  # File CSV xuất mẫu (không được code dùng đến)
```
