# 🍜 Hanoi Food & Cafe Guide (Cẩm Nang Ẩm Thực Cá Nhân)

Website tổng hợp, tuyển chọn và đánh giá các quán ăn, quán cà phê tại Hà Nội. Dán link Google Maps là hệ thống tự đọc thông tin quán, kèm bộ lọc thông minh và định vị 1 chạm.

---

## ✨ Tính năng

1. **Tự động đọc thông tin từ link Google Maps**
   Dán link vào ô "Quét & Tự điền", hệ thống lấy tên quán, địa chỉ, quận, toạ độ, danh mục — và nếu bạn cấu hình khoá API thì lấy cả số sao, lượt đánh giá, giờ mở cửa, ảnh thật.
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

Khi bạn dán link, hệ thống thử lần lượt:

| Bước | Nguồn | Lấy được gì |
|---|---|---|
| 1 | Bóc thẳng từ URL | Tên quán, toạ độ — **không cần mạng, luôn chạy được** |
| 2 | Đoạn text bạn dán kèm | Tên + địa chỉ (nút Chia sẻ của app Google Maps kèm sẵn) |
| 3 | CORS proxy công cộng | Giải mã link rút gọn `maps.app.goo.gl` — *hay hỏng, chỉ là nỗ lực bổ sung* |
| 4 | **Google Places API** *(cần khoá)* | **Số sao, lượt đánh giá, giờ mở cửa, mức giá, ảnh thật** |
| 5 | **OpenStreetMap / Nominatim** | Địa chỉ đường phố + quận, từ toạ độ — miễn phí, không cần khoá |

### 💡 Mẹo dán link cho kết quả tốt nhất

- **Tốt nhất — URL đầy đủ:** mở quán trên Google Maps bằng trình duyệt, copy nguyên URL trên thanh địa chỉ (dạng `google.com/maps/place/...@21.04,105.84...`). Có sẵn tên + toạ độ nên chạy ngay, không phụ thuộc proxy.
- **Cũng rất tốt — cả đoạn Chia sẻ:** trên app Google Maps điện thoại bấm *Chia sẻ*, dán **nguyên cả đoạn** gồm tên quán, địa chỉ và link:
  ```
  Hôm Nào Cà Phê
  Số 10, Ngõ 82 Nghĩa Tân, Cầu Giấy, Hà Nội
  https://maps.app.goo.gl/xxxxx
  ```
- **Kém nhất — chỉ mỗi link rút gọn** không kèm chữ: phải trông chờ vào CORS proxy công cộng, mà các dịch vụ này thường xuyên chết. Nếu thất bại, hệ thống sẽ báo và bạn dùng một trong hai cách trên.

### 🔑 Bật Google Places API để lấy số sao thật

Số sao và lượt đánh giá **chỉ Google mới có** — OpenStreetMap không lưu dữ liệu này. Muốn lấy tự động, bấm nút 🔑 trên đầu trang và làm theo:

1. Vào [Google Cloud Console](https://console.cloud.google.com/) → tạo một Project.
2. **APIs & Services → Library** → bật **Places API (New)**.
3. **Credentials → Create credentials → API key**.
4. Bấm **Edit API key** → *Application restrictions* chọn **Websites** → thêm domain trang này (ví dụ `ten-ban.github.io/*`).
5. *API restrictions* → giới hạn đúng **Places API (New)**.
6. Dán khoá vào ô trong trang, bấm **🧪 Kiểm tra khoá** rồi **💾 Lưu**.

> ⚠️ **Bắt buộc giới hạn khoá theo domain.** Khoá lưu trong `localStorage` trình duyệt và đi kèm mỗi request, nên ai mở trang cũng đọc được. Khoá không giới hạn có thể bị người khác dùng và bạn phải trả tiền.

Không có khoá thì trang vẫn chạy bình thường — chỉ là bạn tự nhập số sao thay vì để hệ thống điền.

---

## 🚀 Chạy thử trên máy

- **Nhanh nhất:** nhấp đúp `index.html`.
- **Khuyên dùng:** extension **Live Server** của VS Code, hoặc:
  ```bash
  npx serve .
  ```

> Lưu ý: mở bằng `file://` vẫn chạy được, nhưng chạy qua server (Live Server / GitHub Pages) thì phần gọi Google Places API mới giới hạn được khoá theo domain.

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

## 🌐 Đưa lên mạng miễn phí

### GitHub Pages
1. Đẩy toàn bộ thư mục lên một repository GitHub.
2. **Settings → Pages** → Branch chọn `main` / `root` → **Save**.
3. Sau khoảng 1 phút có link dạng `https://ten-ban.github.io/foodguide/`.
4. Nhớ thêm domain này vào phần giới hạn của khoá Google API (nếu có dùng).

### Vercel / Netlify
Kéo thả thư mục vào [app.netlify.com/drop](https://app.netlify.com/drop) hoặc [vercel.com](https://vercel.com) là xong.

---

## 📁 Cấu trúc

```
foodguide/
├── index.html              # Giao diện & các modal
├── css/style.css           # Toàn bộ style, hỗ trợ Dark Mode
├── js/
│   ├── data.js             # Dữ liệu quán dựng sẵn, danh mục, quận, profile
│   └── app.js              # Toàn bộ logic: render, lọc, autofill, quản lý
└── data/hanoi_cafes_top.csv  # File CSV xuất mẫu (không được code dùng đến)
```
