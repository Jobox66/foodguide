# 🍜 Hanoi Food & Cafe Guide (Cẩm Nang Ẩm Thực Cá Nhân)

Website tổng hợp, tuyển chọn và đánh giá các quán ăn, quán cà phê tại Hà Nội. Dán link Google Maps là hệ thống tự đọc thông tin quán, kèm bộ lọc thông minh và định vị 1 chạm.

---

## ✨ Tính năng

1. **Tự động đọc thông tin từ link Google Maps**
   Dán link vào ô "Quét & Tự điền", hệ thống lấy tên quán, địa chỉ, quận, toạ độ, danh mục — và nếu máy chủ đã cấu hình khoá thì lấy cả số sao, lượt đánh giá, giờ mở cửa, ảnh thật. Khoá Google nằm ở backend, không lộ ra trình duyệt.
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
   - 💾 **Xuất JSON** để sao lưu, 📥 **Nhập JSON** để khôi phục hoặc chuyển sang máy khác.
   - 📊 **Xuất CSV** (UTF-8 BOM) mở thẳng bằng Google Sheets / Excel không lỗi tiếng Việt.

6. **Responsive & Dark Mode** — tối ưu mobile-first, có thanh điều hướng dưới cho điện thoại.

---

## 🪄 Autofill hoạt động thế nào

Nguyên tắc: **chỉ điền dữ liệu đọc được thật.** Ô nào không tra ra thì để trống cho bạn tự nhập — hệ thống không sinh số sao, giá tiền hay lời review giả.

### Kiến trúc

```
Trình duyệt                    Máy chủ (khoá nằm ở đây)         Google
─────────────                  ────────────────────────         ──────
dán link ──GET /api/place?url=─►  1. đi theo redirect  ────────►  maps.app.goo.gl
                                  2. bóc tên + toạ độ
                                  3. gọi Places API    ────────►  places.googleapis.com
                                     (GOOGLE_MAPS_API_KEY
                                      lấy từ biến môi trường)
         ◄──JSON đã chuẩn hoá───   4. trả về, KHÔNG kèm khoá
```

**Khoá Google không bao giờ xuống trình duyệt.** Nó chỉ tồn tại trong biến môi trường của máy chủ. Người dùng mở DevTools cũng không thấy gì ngoài `/api/place` và dữ liệu đã xử lý.

Máy chủ còn giải quyết một việc nữa mà trình duyệt không làm được: **đi theo redirect của link rút gọn** `maps.app.goo.gl`. Trình duyệt bị CORS chặn nên trước đây loại link này luôn đọc ra rỗng.

### Thứ tự thử

| Bước | Nguồn | Lấy được gì |
|---|---|---|
| 1 | Bóc từ URL phía client | Tên + toạ độ, nếu bạn dán URL đầy đủ |
| 2 | Đoạn text dán kèm | Tên + địa chỉ (nút Chia sẻ của app Google Maps) |
| 3 | **`/api/place` — đường chính** | Giải mã link rút gọn, **+ số sao, lượt đánh giá, giờ mở cửa, ảnh thật** nếu máy chủ có khoá |
| 4 | CORS proxy công cộng | Chỉ dùng khi không có máy chủ (mở bằng `file://`) — hay hỏng |
| 5 | OpenStreetMap / Nominatim | Địa chỉ + quận từ toạ độ — miễn phí, luôn bật |

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

## 🔑 Cấu hình Google Places API (khoá đặt ở máy chủ)

Số sao và lượt đánh giá **chỉ Google mới có** — OpenStreetMap không lưu dữ liệu này.

### Không muốn thêm thẻ? Thử Maps Demo Key trước

Google có **[Maps Demo Key](https://developers.google.com/maps/demo-key)** — chỉ cần tài khoản Google, **không cần thẻ**, và có hỗ trợ Places API (New).

Điều Google *không* nói rõ: demo key có mở tới SKU Enterprise (nơi chứa `rating` và `userRatingCount`) hay không. Đừng đoán — kiểm tra bằng lệnh:

```bash
node tools/check-key.js AIza...
```

Script gọi thử đúng quán thật rồi liệt kê từng trường lấy được. Nếu bị chặn ở mức Enterprise, nó tự thử lại ở mức thấp hơn để cho biết khoá còn dùng được đến đâu. Chỉ tốn tối đa 3 request.

Kết quả sẽ rơi vào một trong hai:

- **Lấy được số sao** → dùng luôn, chưa cần thẻ. Nhớ rằng demo key được Google ghi là *không dành cho production*, có hạn mức ngày và có thể thay đổi — nên coi đây là cách bắt đầu, không phải giải pháp lâu dài.
- **Không lấy được số sao** → trang vẫn tự điền tên, địa chỉ, quận, ảnh; riêng số sao nhập tay. Muốn tự động cả số sao thì phải thêm thẻ theo các bước dưới.

### Bước 1 — Tạo khoá

1. Vào [Google Cloud Console](https://console.cloud.google.com/) → tạo một **Project**.
   Bước này cần thẻ. Google **không tự động trừ tiền** khi hết hạn dùng thử — tài khoản bị tạm dừng và bạn phải chủ động nâng cấp, nên thẻ ở đây đóng vai trò xác minh danh tính nhiều hơn là thanh toán.
2. **APIs & Services → Library** → bật **Places API (New)**.
3. **Credentials → Create credentials → API key** → sao chép khoá.
4. Bấm **Edit API key**:
   - *Application restrictions* → **None**.
     Khoá dùng ở phía máy chủ nên không giới hạn theo domain trình duyệt được (request đi ra từ Vercel, không mang theo domain nào để Google đối chiếu). Giới hạn theo *IP addresses* cũng không dùng được vì Vercel chỉ cấp IP cố định ở gói Pro/Enterprise. Đổi lại, khoá không lộ ra ngoài — khác hẳn khoá nhúng thẳng vào trang.
   - *API restrictions* → **Restrict key** → chỉ chọn **Places API (New)**.
5. **Đặt hạn mức cứng** — quan trọng nhất về chi phí.
   Vào **Google Maps Platform → Quotas**, chọn *Places API (New)*, sửa dòng **Requests per day** xuống một con số hợp lý (ví dụ `100`). Vượt hạn mức thì Google từ chối phục vụ thay vì tính tiền. Budget alert chỉ *báo*, không *chặn*.

### Chi phí

Field mask quyết định SKU, và Google tính theo **SKU cao nhất** trong request. Vì cần `rating`, `userRatingCount`, `priceLevel`, `regularOpeningHours` — cả bốn đều thuộc nhóm Enterprise — nên mỗi lần quét rơi vào mức đắt nhất:

| Việc xảy ra khi quét 1 link | SKU | Miễn phí/tháng | Vượt hạn mức |
|---|---|---|---|
| Tra tên, địa chỉ, số sao, lượt đánh giá, giờ | Text Search Enterprise | 1.000 lượt | ~$35 / 1.000 |
| Tải ảnh thật của quán | Places Photo | 1.000 lượt | ~$7 / 1.000 |

Thêm 1 quán tốn 2 lượt → 1.000 lượt ≈ **500 quán/tháng**, thoải mái cho dùng cá nhân. Giá tham khảo [bảng giá chính thức](https://developers.google.com/maps/billing-and-pricing/pricing).

### Bước 2 — Deploy lên Vercel

1. Đẩy mã nguồn lên GitHub. File `.env` đã nằm trong `.gitignore` nên khoá **không** lên theo.
2. Vào [vercel.com/new](https://vercel.com/new) → chọn repository → **Deploy**.
   Vercel tự nhận: thư mục gốc là trang tĩnh, `api/place.js` là serverless function.
3. **Settings → Environment Variables** → bật công tắc **Sensitive** *trước* khi điền, rồi thêm:

   | Name | Value | Environments |
   |---|---|---|
   | `GOOGLE_MAPS_API_KEY` | khoá vừa tạo ở Bước 1 | Production, Preview |
   | `ALLOWED_ORIGINS` | *(để trống nếu web và API cùng domain)* | Production, Preview |

   **Sensitive** khiến Vercel lưu ở dạng không giải mã ngược được — không ai xem lại được giá trị, kể cả qua CLI hay REST API, và giá trị bị che trong build log. Đánh đổi: bạn cũng không lấy lại được khoá từ Vercel, nên hãy giữ một bản trong trình quản lý mật khẩu. (Sensitive chỉ bật được cho Production và Preview, không bật được nếu chọn Development.)

   > ⚠️ Giữ đúng tên biến vì `api/place.js` đọc theo tên này. Đừng thêm tiền tố `NEXT_PUBLIC_` hay `VITE_` — trong các framework đó tiền tố này là lệnh nhúng biến thẳng vào bundle gửi xuống trình duyệt.

4. **Deployments → Redeploy** để biến môi trường có hiệu lực.
5. Mở trang → bấm nút 🔑 → **Kiểm tra kết nối**. Thấy 🟢 là xong.

### Chạy thử ở máy

```bash
npm i -g vercel
cp .env.example .env      # rồi mở .env điền khoá thật
vercel dev                # http://localhost:3000
```

> Mở thẳng file `index.html` bằng trình duyệt thì **không có** `/api/place`. Trang vẫn chạy nhưng chỉ tra được địa chỉ qua OpenStreetMap, và link rút gọn sẽ không đọc được.

### Bảo mật của endpoint

`/api/place` là endpoint công khai, nên nó có sẵn các lớp chặn sau:

| Lớp | Tác dụng |
|---|---|
| Danh sách domain cho phép | Chỉ nhận link thuộc Google Maps. Chặn biến endpoint thành proxy để quét mạng nội bộ (SSRF). |
| Giới hạn tần suất | 30 request/phút cho mỗi IP, tránh bị gọi dồn làm cạn quota Google. |
| `ALLOWED_ORIGINS` | Khi tách domain, chỉ origin trong danh sách mới gọi được. |
| Khoá ở biến môi trường | Không có mặt trong phản hồi, trong link ảnh, hay bất kỳ đâu phía client. |
| Hạn mức cứng ở Google Cloud | Chặn hoá đơn bất ngờ nếu endpoint bị lạm dụng. |

> Giới hạn tần suất dùng bộ nhớ của từng instance serverless nên chỉ là *best-effort*. Nếu trang được nhiều người dùng, hãy chuyển sang Vercel KV hoặc Upstash Redis để đếm chính xác.

---

## 🚀 Chạy thử trên máy

| Cách | Lệnh | Có `/api/place`? |
|---|---|---|
| **Đầy đủ** (khuyên dùng) | `vercel dev` | ✅ Có — đọc được link rút gọn & số sao |
| Chỉ giao diện | `npx serve .` hoặc Live Server | ❌ Không |
| Mở thẳng file | nhấp đúp `index.html` | ❌ Không |

Hai cách sau vẫn dùng được trang, nhưng autofill chỉ tra được địa chỉ qua OpenStreetMap và **không đọc được link rút gọn** `maps.app.goo.gl`.

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

## 🌐 Đưa lên mạng

**Vercel** (khuyên dùng) — xem [Bước 2 ở trên](#bước-2--deploy-lên-vercel). Phục vụ cả trang tĩnh lẫn `/api/place` trên cùng một domain nên không phải cấu hình CORS.

**GitHub Pages / Netlify Drop** — chỉ chạy được phần tĩnh, **không có** `/api/place`. Trang vẫn dùng được nhưng mất khả năng đọc link rút gọn và lấy số sao. Nếu muốn giữ GitHub Pages, hãy deploy riêng API lên Vercel rồi điền địa chỉ đầy đủ vào ô *endpoint* trong modal 🔑, đồng thời đặt biến `ALLOWED_ORIGINS=https://ten-ban.github.io` trên Vercel.

## 📁 Cấu trúc

```
foodguide/
├── index.html              # Giao diện & các modal
├── css/style.css           # Toàn bộ style, hỗ trợ Dark Mode
├── js/
│   ├── data.js             # Dữ liệu quán dựng sẵn, danh mục, quận, profile
│   └── app.js              # Logic phía client: render, lọc, autofill, quản lý
├── api/
│   └── place.js            # Serverless function - GIỮ KHOÁ, giải mã link rút gọn
├── tools/
│   └── check-key.js        # Kiểm tra khoá lấy được những trường nào
├── vercel.json             # Cấu hình Vercel
├── .env.example            # Mẫu biến môi trường
├── .gitignore              # Chặn .env lên Git
└── data/hanoi_cafes_top.csv  # File CSV xuất mẫu (không được code dùng đến)
```
