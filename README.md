# 🍜 Hanoi Food & Cafe Guide (Cẩm Nang Ẩm Thực Cá Nhân)

Website tổng hợp, tuyển chọn và đánh giá các quán ăn, quán cà phê tại Hà Nội với giao diện **Vibrant & Friendly** (lấy cảm hứng từ linkbio oreviet), tích hợp Google Maps định vị 1 chạm và chế độ lọc thông minh.

---

## ✨ Tính năng nổi bật

1. **2 Chế độ hiển thị linh hoạt (View Switcher)**:
   - 🔍 **Chế độ Khám phá (Explorer Card View)**: Xem chi tiết từng quán gồm hình ảnh, đánh giá ★, review tác giả, món *Must-Try*, mức giá và nút *Mở Google Maps* / *Chỉ đường*.
   - 📑 **Chế độ Danh mục Google Maps (Portal Linkbio View)**: Giống phong cách `oreviet`, nhóm các danh mục món (Món sợi, Lẩu nướng, Cafe chill, Quán nhậu...) để mở nhanh danh sách Google Maps hoặc lọc tức thì.
2. **Tìm kiếm & Bộ lọc tức thì (Instant Filter)**:
   - Tìm kiếm realtime theo tên quán, món ăn, địa chỉ, phố xá.
   - Lọc theo Quận/Khu vực (Hoàn Kiếm, Ba Đình, Đống Đa, Hai Bà Trưng, Cầu Giấy...).
   - Lọc theo Mức giá (Dưới 50k, 50k - 150k, Trên 150k).
   - Sắp xếp theo Đề xuất, Đánh giá cao nhất, Tên A-Z.
3. **Modal Thêm quán trực quan (+ Thêm quán mới)**:
   - Tự do nhập thêm quán ăn yêu thích ngay trên giao diện web mà không cần chạm vào code. Dữ liệu tự động lưu trong trình duyệt (`LocalStorage`).
4. **Sao lưu & Xuất dữ liệu JSON**:
   - Bấm nút 💾 để tải về toàn bộ danh sách quán dưới dạng file `.json`.
5. **Giao diện Responsive 100% & Hỗ trợ Dark Mode**:
   - Tối ưu hoàn hảo cho điện thoại di động (Mobile-First).
   - Nút bật/tắt Dark Mode 🌙/☀️ dễ chịu cho mắt khi xem về đêm.

---

## 🚀 Cách chạy & xem thử trên máy tính

### Cách 1: Mở trực tiếp (Nhanh nhất)
- Nhấp đúp chuột vào file `index.html` để mở ngay trên trình duyệt Chrome, Edge hoặc Safari.

### Cách 2: Chạy qua Live Server (Khuyên dùng)
- Nếu dùng VS Code / IDE: Cài extension **Live Server** và nhấn **Go Live**.
- Hoặc dùng lệnh terminal:
  ```bash
  npx serve .
  ```

---

## 🛠️ Hướng dẫn Tùy biến & Chỉnh sửa Dữ liệu

### 1. Thay đổi thông tin cá nhân (Avatar, Tên, Bio, Mạng xã hội)
Mở file [js/data.js](file:///d:/_Code/foodguide/js/data.js), tìm biến `DEFAULT_PROFILE` ở cuối file:
```javascript
const DEFAULT_PROFILE = {
  name: "Tên của bạn hoặc Tên Guide",
  handle: "@your_handle",
  bio: "Lời giới thiệu ngắn về sở thích ăn uống của bạn...",
  avatar: "Link ảnh đại diện",
  socials: {
    facebook: "https://facebook.com/...",
    instagram: "https://instagram.com/...",
    tiktok: "https://tiktok.com/...",
    threads: "https://threads.net/..."
  }
};
```

### 2. Thêm hoặc Sửa danh sách quán ăn mặc định
Mở file [js/data.js](file:///d:/_Code/foodguide/js/data.js), trong mảng `INITIAL_PLACES`, thêm một đối tượng quán mới:
```javascript
{
  id: "place-custom-1",
  name: "Tên Quán Ăn",
  category: "mon-soi", // mon-soi | com-xoi | banh-mi-cuon | lau-nuong | cafe-chill | an-vat | do-a-au | quan-nhau
  district: "Hoàn Kiếm",
  address: "Địa chỉ cụ thể...",
  mapsUrl: "https://maps.google.com/?q=Ten+Quan+Dia+Chi",
  rating: 4.8,
  priceRange: "40.000đ - 70.000đ",
  priceLevel: "mid", // low (<50k), mid (50k-150k), high (>150k)
  time: "07:00 - 22:00",
  mustTry: "Món ngon nhất định phải gọi",
  review: "Nhận xét chi tiết của bạn về hương vị và không gian...",
  tags: ["Ăn sáng", "Phố Cổ"],
  image: "https://link-anh-mon-an.jpg",
  featured: true
}
```

---

## 🌐 Hướng dẫn Đưa Website lên Mạng MIỄN PHÍ (Deploy)

Bạn có thể đưa trang web này lên mạng để ai cũng có thể truy cập qua đường link riêng:

### Cách 1: Qua GitHub Pages (Miễn phí 100%)
1. Đăng tải toàn bộ thư mục code lên một Repository trên GitHub (ví dụ: `foodguide`).
2. Vào **Settings** của Repo > Chọn mục **Pages**.
3. Tại phần **Branch**, chọn `main` / `root` rồi nhấn **Save**.
4. Sau 1 phút, bạn sẽ có đường link dạng: `https://ten-ban.github.io/foodguide/`

### Cách 2: Qua Vercel / Netlify (Kéo thả siêu nhanh)
1. Truy cập [app.netlify.com/drop](https://app.netlify.com/drop) hoặc [vercel.com](https://vercel.com).
2. Kéo thả toàn bộ thư mục `foodguide` vào trình duyệt.
3. Nhận ngay đường link web trực tiếp để gắn vào Bio Instagram / TikTok / Facebook!
