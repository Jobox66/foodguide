# Rà soát và chỉnh sửa giao diện — Hanoi Food & Cafe Guide

Ngày 29/10/2026 · 15/15 mục đã làm xong

Tài liệu này tóm tắt những gì đã đổi, vì sao, và **ba chỗ tôi tự quyết mà bạn nên xem lại** (mục 14, 15 và phần Giả định ở cuối).

Cách đo: dựng site bằng Chromium qua Playwright ở hai khổ màn hình — desktop 1440×900 và mobile 390×844 (iPhone 14 Pro) — rồi đọc thẳng từ DOM: vị trí phần tử, kích thước vùng chạm, tỉ lệ tương phản tính theo công thức WCAG 2.1. Mọi con số dưới đây là số đo thật, không ước lượng.

---

## 1. Kết quả tổng quan

| Chỉ số | Trước | Sau |
|---|---|---|
| Vị trí quán đầu tiên — mobile, chế độ Thẻ | **890px** (ngoài màn hình 844px) | **553px** |
| Chiều cao một thẻ quán — mobile | 609px (72% màn hình) | 395px (47%) |
| Vị trí quán đầu tiên — desktop | 819px (khung 900px) | 757px |
| Phần tử tràn ngang — desktop | 12 | **0** |
| Hàng lọc `#quickFilterPills` — mobile | track 1245px trong khe 273px | 904px trong khe 340px, có vệt mờ báo cuộn |
| Cặp màu không đạt tương phản | 10 (sáng) + 5 (tối) | **0 + 0** |
| Vùng chạm dưới 44px — mobile | 25 | 6 (đều ≥40px, nằm trong modal quản trị) |
| Quy tắc `:focus-visible` | **0** | có, áp cho mọi phần tử tương tác |
| Emoji trong giao diện | ~37 | 0 (xem mục 12 để biết chỗ còn lại và lý do) |
| Ảnh stock trùng lặp tải về | 63 ảnh, ~30 ảnh khác nhau | 3 |

Kiểm tra chức năng: 41/41 thao tác đạt trên cả hai khổ màn hình (đổi cách xem, lọc theo danh mục / mục đích / giá, tìm kiếm, mở–đóng cả 5 modal, đổi giao diện, bảng Thêm). Không có lỗi JavaScript nào.

---

## 2. Từng mục một

### Nhóm A — sửa nhanh, tác động lớn

**1. Thu gọn đầu trang trên điện thoại cho cả hai chế độ** ✅

Các quy tắc ẩn tiểu sử / mạng xã hội / thống kê trước đây chỉ áp cho `body.mode-list`. Chế độ Thẻ — vốn là mặc định — không được hưởng, nên mở app ra là trọn một màn hình chỉ có chrome. Đã chuyển các quy tắc đó ra ngoài phạm vi `.mode-list` trong [style.css](css/style.css). Lưới danh mục 2 cột (4 hàng, ~240px, vẫn cắt cụt 5/8 tên) đổi thành một hàng cuộn ngang.

Kết quả: quán đầu tiên từ **890px → 553px**, tức là từ ngoài màn hình vào trong màn hình.

**2. Hàng lọc: xuống dòng trên desktop, báo cuộn trên mobile** ✅

`.filter-scroll-track` giờ `flex-wrap: wrap` mặc định; chỉ dưới 768px mới quay lại `nowrap` kèm `mask-image` tạo vệt mờ hai mép. Hai nhãn "🗺️ THÀNH PHỐ:" và "⚡ LỌC:" thành `sr-only` trên mobile (vẫn đọc được bằng trình đọc màn hình, không chiếm 35% bề ngang nữa).

Desktop: từ 12 phần tử tràn ngang xuống **0**.

**3. Ô dán link Google Maps** ✅

`.magic-input-group` thành `flex-direction: column` dưới 768px. Chữ gợi ý rút từ 90 ký tự xuống "Dán link Google Maps vào đây". Hết tràn chữ.

**4. Trả lại 4 chức năng đã mất trên điện thoại** ✅

Thêm bảng "Thêm" (`#moreSheet` trong [index.html](index.html)) mở từ ô thứ năm của thanh nav, chứa: Đồng bộ Google Sheet (kèm trạng thái), Nguồn dữ liệu, Tải .csv, Chia sẻ, Đổi giao diện. Nút đổi giao diện rời khỏi ô nav riêng của nó — một thiết lập dùng vài lần trong đời không đáng giữ 1/5 thanh nav khi đồng bộ dữ liệu thì không có ô nào.

Thêm một chấm cam trên nút "Thêm" khi còn thay đổi chưa đẩy lên Sheet, để biết mà không cần mở bảng.

**5. Tương phản màu và tiêu điểm bàn phím** ✅

| Chỗ | Trước | Sau |
|---|---|---|
| Chip "Mọi trạng thái" đang chọn | 2.54:1 | nhóm chip này đã chuyển vào Quản lý |
| Dòng món nên gọi trong danh sách | 2.82:1 | **6.5:1** (`--accent-orange-text`) |
| Số lượt đánh giá | 2.56:1 | **4.8:1** (`--text-light` đổi giá trị) |
| Chip chưa chọn | 4.34:1 | **7.1:1** (`--text-on-muted` mới) |
| Dark mode, chip đang chọn | 3.68:1 | **~12:1** |

Thêm khối `:focus-visible` dùng chung: viền 3px màu chủ đạo, đổi sang vàng trên các nền xanh đậm. Trước đây toàn bộ 55KB CSS không có lấy một quy tắc `:focus-visible` nào.

**6. Chỉ gắn huy hiệu cho quán đã xác minh** ✅

Huy hiệu "⚠️ Chưa xác minh" đúng với 60/60 quán nên nó không cảnh báo được gì, chỉ làm mọi quán trông đáng ngờ. Giờ chỉ quán **đã** xác minh mới có huy hiệu. Trong modal chi tiết, thông tin nguồn dữ liệu chuyển xuống cuối dưới dạng chú thích một dòng. Ô thống kê "0 đã xác minh" ở đầu trang cũng ẩn khi con số là 0.

**7. Vùng chạm 44px** ✅

Chip lọc 31px → 44px, pill danh mục 36px → 44px, cộng thêm nút chuyển cách xem, nút ảnh, nút trên thẻ quán, ô form và liên kết chân trang. Còn 6 phần tử dưới 44px (đều ≥40px) nằm trong modal Quản lý và Nguồn dữ liệu — tôi để lại vì đó là màn hình quản trị dùng trên máy tính là chính.

### Nhóm B — cấu trúc

**8. Một bộ chuyển cách xem duy nhất** ✅

Gỡ hẳn `.control-bar` / `.view-mode-tabs` / `.view-tab` khỏi HTML, CSS và JS. Cụm nút cạnh số kết quả giờ có 3 lựa chọn: **Thẻ · Danh sách · Danh mục**, chạy trên cả hai khổ màn hình. `.results-header` không còn bị ẩn ở chế độ Danh mục (trước đây ẩn, mà nó lại chứa đường quay ra). Nút "Thêm quán" chuyển lên `.header-actions`.

**9. Thẻ quán: 10 khối → 5** ✅

Giữ: ảnh (kèm quận + điểm chồng lên), tên, giá, món nên gọi, nút. Bỏ khỏi thẻ: nhãn danh mục in hoa, huy hiệu chưa xác minh, giờ mở cửa, trích dẫn in nghiêng, 3 hashtag không bấm được. Tất cả vẫn còn đủ trong modal chi tiết.

Đảo luôn thứ bậc nút: "Xem chi tiết" (ở lại trong app) thành nút chính màu xanh; Google Maps thu về một nút biểu tượng bên cạnh.

Thẻ từ **609px → 395px**.

**10. Modal chi tiết: tên quán lên đầu** ✅

Thứ tự cũ: danh mục → điểm → cảnh báo chưa xác minh → "Nguồn: Dữ liệu dựng sẵn" → **rồi mới** tên quán (thứ 5, ở ~870px).

Thứ tự mới: **tên quán** → danh mục + điểm → địa chỉ / giá / giờ → món nên gọi → nhận xét → nút → nguồn dữ liệu (chú thích cuối).

Bỏ 5 nhãn có dấu hai chấm ("📍 Địa chỉ:", "💵 Khoảng giá:"…) — biểu tượng bên trái đủ phân biệt, tên nhãn vẫn còn cho trình đọc màn hình qua `.sr-only`. Nhận xét bỏ in nghiêng (chữ nghiêng có dấu tiếng Việt ở cỡ nhỏ rất khó đọc) và giới hạn 62 ký tự/dòng.

**11. Trang Danh mục** ✅

- Nút chính giờ là "Xem N quán" (xanh đặc); "Tìm thêm trên Google Maps" thành nút viền. Trước đây ngược lại — hành động rời khỏi cẩm nang được xếp trên hành động ở lại.
- Hai danh mục rỗng không còn chiếm mỗi cái một thẻ cỡ bằng danh mục 54 quán. Chúng gom thành một dòng mời thêm quán ở cuối trang, kèm nút "Thêm quán đầu tiên".
- Dãy chip danh mục phía trên được ẩn khi đang xem lưới danh mục — trước đây cùng một taxonomy hiện hai lần, chồng lên nhau.

### Nhóm C — nhận diện

**12. Bộ biểu tượng nét thay 37 emoji** ✅

File mới [js/icons.js](js/icons.js): **51 biểu tượng** vẽ tay trên lưới 24×24, nét 1.75, bo đầu tròn, tô bằng `currentColor` nên tự ăn theo màu chữ và theo chế độ Sáng/Tối. HTML chỉ cần ghi `data-icon="search"`, hàm `hydrateIcons()` đổ SVG vào.

Tôi đã dựng một bảng thử toàn bộ 51 hình ở cả cỡ 38px và 17px rồi vẽ lại 8 hình đọc không ra ở cỡ nhỏ (bát phở, bát cơm, vỉ nướng ban đầu co lại trông giống hệt cái cốc).

**Emoji còn lại và lý do giữ:**

| Chỗ | Số lượng | Lý do |
|---|---|---|
| `icon:` của danh mục trong `data.js` | 9 | Phục vụ các thẻ `<option>` trong ô chọn danh mục — `<option>` không chứa được SVG. Phần hiển thị trên trang đều đã dùng biểu tượng nét. |
| Đèn trạng thái 🔴🟡🟢⚪ trong modal Nguồn dữ liệu | 6 | Gán qua `textContent` nên không nhúng SVG được. Đây là bảng chẩn đoán kỹ thuật, và đèn màu là quy ước quen thuộc. Sửa được nếu bạn muốn. |
| Favicon 🍜 | 1 | Biểu tượng tab trình duyệt. Ở 16px thì emoji đọc rõ hơn hình nét đơn sắc. |

**13. Một màu "đang chọn" duy nhất** ✅

Trước đây mỗi nhóm chip một màu: giá = xanh dương, sắp xếp = đen, xác minh = xanh lá. Giờ **vàng + chữ gần đen** cho mọi nhóm, ở cả chế độ Sáng và Tối (~12:1). Nhờ đó quy tắc trở nên học được: **vàng = đang chọn, xanh = hành động chính**.

Nút "Google Sheets" xanh lá đặc cũng hạ xuống kiểu viền và đổi tên thành "Tải .csv" — trước đây nó là màu nút thứ tư trong cùng một khung hình.

**14. Ảnh quán** ⚠️ *cần ý kiến của bạn*

Dữ liệu dựng sẵn có **61 liên kết ảnh nhưng chỉ ~30 ảnh khác nhau**; hai tấm lặp tới **7 lần** mỗi tấm. Tệ hơn, chúng là ảnh stock nên thường không liên quan tới quán — "Santorini Vibes Cafe" (concept Hy Lạp xanh–trắng bên Hồ Tây) hiện một cốc trà kèm bánh quy trên nền trắng.

**Tôi đã chọn: không hiển thị ảnh stock Unsplash nữa.** Chỗ chưa có ảnh chụp thật giờ là một ô chữ — biểu tượng danh mục trên nền màu suy ra từ id quán (mỗi quán một sắc cố định, không đổi khi lọc hay sắp xếp lại). Trong modal chi tiết có thêm một dòng mời bạn chụp ảnh thật khi ghé quán.

Lý do: ảnh sai còn tệ hơn không ảnh, vì cái mà một cẩm nang ẩm thực bán là cảm giác "chỗ này có thật, tôi đã tới". App đã sẵn luồng tải ảnh lên Drive, nên ô trống là một lời mời có đường đi.

**Muốn quay lại ảnh stock: đổi một dòng** — `USE_SEED_STOCK_PHOTOS = false` → `true` trong [js/app.js](js/app.js). Ảnh bạn tự tải lên Drive và link ảnh bạn tự dán thì luôn hiển thị bình thường, không bị ảnh hưởng.

**15. Trục lọc** ⚠️ *cần ý kiến của bạn*

Vấn đề: **54/60 quán nằm chung danh mục "Cà phê & Trà"**, hai danh mục rỗng hẳn. Lọc theo danh mục gần như không chia được gì.

Tôi không chia nhỏ nhóm cà phê bằng tay (phải phân loại lại 54 bản ghi, và ranh giới "cafe view" / "specialty" / "cafe trứng" rất dễ cãi nhau). Thay vào đó tôi dùng trường **`vibe` vốn đã có sẵn trong dữ liệu** — nó trải đều và đúng với cách người ta thật sự chọn quán:

> Hẹn hò 28 · Chill 27 · Tụ tập bạn bè 20 · Check-in 19 · Làm việc 14 · Yên tĩnh 7 · Truyền thống 6 · Gia đình 6

Thêm hàng lọc **"Hợp cho"** dùng trục này (chỉ hiện những mục có từ 4 quán trở lên, tối đa 8 chip).

Panel lọc **không dài thêm**, vì đổi lại tôi chuyển nhóm chip "trạng thái xác minh" vào modal Quản lý quán — soát xem quán nào chưa đối chiếu với Google Maps là việc của người biên tập, không phải bộ lọc của người đi ăn.

Danh mục chưa có quán nào cũng không hiện ở hàng chip nữa (bấm vào chỉ ra danh sách rỗng); chúng quay lại ngay khi có quán đầu tiên.

---

## 3. Mấy thứ làm thêm ngoài 15 mục

Đều nhỏ và nằm trong cùng mạch với những gì đã nêu ở bản rà soát:

- **`prefers-reduced-motion`** trước đây chỉ tắt đúng 1 hiệu ứng quay. Giờ tắt toàn bộ transition, phóng ảnh khi di chuột và cú trượt của bottom sheet.
- **Màn hình "không có kết quả"** dùng các lớp `.empty-state`, `.empty-icon`, `.empty-title` mà **chưa hề có một dòng CSS nào** trong tệp — nó hiện ra lệch trái, không căn giữa. Đã tạo kiểu, và cho hai lối đi: bỏ bộ lọc, hoặc thêm chính quán đang tìm.
- **Lỗi hiện trước khi người dùng làm gì**: mở modal Thêm quán là thấy ngay "🔌 Chưa kết nối được máy chủ". Viết lại thành một lời dặn trước, không phải báo lỗi.
- **Chữ hoa không nhất quán**: "Thêm Quán Ăn / Cafe Mới", "Lưu & Thêm vào Cẩm Nang", "Chỉnh Sửa Thông Tin Quán"… đã về sentence case toàn bộ (tiếng Việt không viết hoa đầu mỗi từ).
- **Thống nhất tên gọi**: thẻ quán ghi "Món Must-Try", modal ghi "Món đặc trưng nhất định phải thử" — cùng một trường, hai tên. Giờ đều là **"Món nên gọi"**.
- **Dấu "•" nối giữa các liên kết chân trang** đã bỏ; liên kết được nới vùng chạm lên 44px.
- **Thu gọn nhịp dọc trên desktop** (đệm hero, khoảng cách giữa các khối): quán đầu tiên từ 819px → 757px.
- **Link "kiểm tra cài đặt"** trong modal trước là link xanh gạch chân mặc định của trình duyệt nằm lạc trong một hộp đã tạo kiểu kỹ — đã có `.inline-link`.

---

## 4. File đã đổi

```
 css/style.css | 1281 ++++++++++++++++------------
 index.html    |  305 ++++++------
 js/app.js     |  828 ++++++++++++++++-----
 js/data.js    |    2 +-        (chỉ dòng tiểu sử, bỏ emoji cuối câu)
 js/icons.js   |  (file mới — 51 biểu tượng)
```

Chưa commit — bạn xem rồi quyết.

---

## 5. Giả định tôi đã tự quyết — xin ý kiến

1. **Bỏ ảnh stock (mục 14).** Đây là thay đổi dễ thấy nhất. Nếu bạn thấy lưới thẻ không ảnh trông trống trải quá thì đổi một dòng là quay lại được.
2. **Trục lọc "Hợp cho" thay vì chia nhỏ nhóm cà phê (mục 15).** Nếu bạn muốn chia "Cà phê & Trà" thành các nhóm con thật (cafe view / cafe trứng / specialty / trà), tôi làm được — nhưng cần bạn chốt danh sách nhóm con, vì phân loại 54 quán theo cảm tính của tôi thì sẽ sai nhiều.
3. **Chuyển bộ lọc trạng thái xác minh vào modal Quản lý.** Nếu bạn vẫn hay lọc "chưa xác minh" ngay ngoài trang chính thì tôi đưa trở lại.
4. **Nút đổi giao diện rời thanh nav vào bảng "Thêm".** Nếu bạn đổi Sáng/Tối thường xuyên thì nói, tôi trả nó về.
5. **Bỏ giờ mở cửa khỏi dòng trong chế độ Danh sách** (giữ trong chi tiết). Trên màn 390px ba mục làm cả ba cùng bị cắt cụt một lúc.

---

## 6. Những gì tôi *chưa* làm

- **Chia nhỏ taxonomy cà phê** — xem giả định số 2 ở trên.
- **Ảnh thật cho 60 quán** — chỉ bạn chụp được. Luồng tải ảnh lên Drive đã sẵn sàng; sau mỗi lần ghé quán thêm một tấm là lưới thẻ tự khá dần lên.
- **Đèn trạng thái emoji trong modal Nguồn dữ liệu** — xem bảng ở mục 12.
- **Chạy thử trên máy thật.** Tôi đo bằng Chromium giả lập iPhone 14 Pro. Vài thứ chỉ máy thật mới lộ: `backdrop-filter` trên Safari cũ, vùng an toàn khi xoay ngang màn hình, và cảm giác cuộn của các hàng chip ngang. Đáng mở thử trên điện thoại của bạn trước khi deploy.
