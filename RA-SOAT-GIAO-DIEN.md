# Rà soát và chỉnh sửa giao diện — Hanoi Food & Cafe Guide

Ngày 29/10/2026 · 15/15 mục đã làm xong · **Vòng 2: đã xử lý xong ý kiến của bạn (xem mục 7 ở cuối)**

Tài liệu này tóm tắt những gì đã đổi, vì sao, và **ba chỗ tôi tự quyết mà bạn nên xem lại** (mục 14, 15 và phần Giả định ở cuối).

Cách đo: dựng site bằng Chromium qua Playwright ở hai khổ màn hình — desktop 1440×900 và mobile 390×844 (iPhone 14 Pro) — rồi đọc thẳng từ DOM: vị trí phần tử, kích thước vùng chạm, tỉ lệ tương phản tính theo công thức WCAG 2.1. Mọi con số dưới đây là số đo thật, không ước lượng.

---

## 1. Kết quả tổng quan

| Chỉ số                                             | Trước                                   | Sau                                                  |
| ---------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| Vị trí quán đầu tiên — mobile, chế độ Thẻ | **890px** (ngoài màn hình 844px) | **553px**                                      |
| Chiều cao một thẻ quán — mobile                 | 609px (72% màn hình)                    | 395px (47%)                                          |
| Vị trí quán đầu tiên — desktop                | 819px (khung 900px)                       | 757px                                                |
| Phần tử tràn ngang — desktop                     | 12                                        | **0**                                          |
| Hàng lọc `#quickFilterPills` — mobile           | track 1245px trong khe 273px              | 904px trong khe 340px, có vệt mờ báo cuộn       |
| Cặp màu không đạt tương phản                 | 10 (sáng) + 5 (tối)                     | **0 + 0**                                      |
| Vùng chạm dưới 44px — mobile                    | 25                                        | 6 (đều ≥40px, nằm trong modal quản trị)        |
| Quy tắc `:focus-visible`                          | **0**                               | có, áp cho mọi phần tử tương tác             |
| Emoji trong giao diện                               | ~37                                       | 0 (xem mục 12 để biết chỗ còn lại và lý do) |
| Ảnh stock trùng lặp tải về                      | 63 ảnh, ~30 ảnh khác nhau              | 3                                                    |

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

| Chỗ                                  | Trước | Sau                                                |
| ------------------------------------- | ------- | -------------------------------------------------- |
| Chip "Mọi trạng thái" đang chọn  | 2.54:1  | nhóm chip này đã chuyển vào Quản lý        |
| Dòng món nên gọi trong danh sách | 2.82:1  | **6.5:1** (`--accent-orange-text`)         |
| Số lượt đánh giá                | 2.56:1  | **4.8:1** (`--text-light` đổi giá trị) |
| Chip chưa chọn                      | 4.34:1  | **7.1:1** (`--text-on-muted` mới)         |
| Dark mode, chip đang chọn           | 3.68:1  | **~12:1**                                    |

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

| Chỗ                                                     | Số lượng | Lý do                                                                                                                                                                    |
| -------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `icon:` của danh mục trong `data.js`               | 9           | Phục vụ các thẻ `<option>` trong ô chọn danh mục — `<option>` không chứa được SVG. Phần hiển thị trên trang đều đã dùng biểu tượng nét.     |
| Đèn trạng thái 🔴🟡🟢⚪ trong modal Nguồn dữ liệu | 6           | Gán qua `textContent` nên không nhúng SVG được. Đây là bảng chẩn đoán kỹ thuật, và đèn màu là quy ước quen thuộc. Sửa được nếu bạn muốn. |
| Favicon 🍜                                               | 1           | Biểu tượng tab trình duyệt. Ở 16px thì emoji đọc rõ hơn hình nét đơn sắc.                                                                                 |

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
   ý kiến: tôi thấy hơi trống trải, hãy tìm giải pháp để có ảnh, nếu có ảnh thật của quán thì tuyệt nhất
2. **Trục lọc "Hợp cho" thay vì chia nhỏ nhóm cà phê (mục 15).** Nếu bạn muốn chia "Cà phê & Trà" thành các nhóm con thật (cafe view / cafe trứng / specialty / trà), tôi làm được — nhưng cần bạn chốt danh sách nhóm con, vì phân loại 54 quán theo cảm tính của tôi thì sẽ sai nhiều.
   ý kiến: ý hay, bộ lọc này nên đổi tên là mục đích, là trường ko bắt buộc điền trong thông tin, nhưng sẽ giúp lọc nhanh quán theo mục đích
3. **Chuyển bộ lọc trạng thái xác minh vào modal Quản lý.** Nếu bạn vẫn hay lọc "chưa xác minh" ngay ngoài trang chính thì tôi đưa trở lại.
   Ý kiến: đồng ý bỏ
4. **Nút đổi giao diện rời thanh nav vào bảng "Thêm".** Nếu bạn đổi Sáng/Tối thường xuyên thì nói, tôi trả nó về.
   ý kiến: thực ra cứ để ớ góc vẫn oke
5. **Bỏ giờ mở cửa khỏi dòng trong chế độ Danh sách** (giữ trong chi tiết). Trên màn 390px ba mục làm cả ba cùng bị cắt cụt một lúc.
   ý kiến: đồng ý, bỏ dòng mở cửa đi

---

## 6. Những gì tôi *chưa* làm

- **Chia nhỏ taxonomy cà phê** — xem giả định số 2 ở trên.
  cmt: không chỉ áp dụng cho cà phê, mà sẽ áp dụng cho toàn bộ nhé
- **Ảnh thật cho 60 quán** — chỉ bạn chụp được. Luồng tải ảnh lên Drive đã sẵn sàng; sau mỗi lần ghé quán thêm một tấm là lưới thẻ tự khá dần lên.
  Cmt:tham khảo có thể chụp bằng playright khi tìm tên quán ko ?
- **Đèn trạng thái emoji trong modal Nguồn dữ liệu** — xem bảng ở mục 12.
  oke
- **Chạy thử trên máy thật.** Tôi đo bằng Chromium giả lập iPhone 14 Pro. Vài thứ chỉ máy thật mới lộ: `backdrop-filter` trên Safari cũ, vùng an toàn khi xoay ngang màn hình, và cảm giác cuộn của các hàng chip ngang. Đáng mở thử trên điện thoại của bạn trước khi deploy.
  cứ chỉnh rồi tôi sẽ test thực tế UAT sau

---

# 7. VÒNG 2 — đã xử lý ý kiến của bạn

## 7.1. Ảnh: đã có ảnh trở lại, và hết lặp 7 lần

> *Ý kiến: "tôi thấy hơi trống trải, hãy tìm giải pháp để có ảnh, nếu có ảnh thật của quán thì tuyệt nhất"*

Bật ảnh trở lại, nhưng sửa đúng cái đã làm nó hỏng. Giờ có **ba trạng thái ảnh**, mỗi trạng thái trông khác nhau:

| | Hiển thị |
|---|---|
| **Ảnh thật** (bạn chụp, tải lên Drive hoặc tự dán link) | Nguyên bản, không nhãn, không can thiệp gì |
| **Ảnh minh hoạ** (ảnh stock của bộ dữ liệu dựng sẵn) | Nguyên màu, kèm nhãn nhỏ **"Ảnh minh hoạ"** ở góc dưới-trái |
| **Chưa có ảnh** | Ô chữ như vòng 1 |

**Sửa cái gốc: chia lại ảnh cho đều.** Vấn đề thật không phải là "có ảnh hay không", mà là 54 quán cà phê chỉ dùng 19 tấm ảnh, chia rất lệch — có tấm 7 lần, có tấm 1 lần. Giờ ảnh được chia đều trong kho của từng danh mục (ảnh cà phê không nhảy sang quán phở):

| | Trước | Sau |
|---|---|---|
| Tấm lặp nhiều nhất | **7 lần** | **3 lần** |
| Số ảnh khác nhau hiện trên lưới | 19 | **24** |
| Cặp thẻ liền kề trùng ảnh | có | **0** |

**Một hướng tôi đã thử rồi bỏ:** phủ lên mỗi ảnh một lớp màu lấy từ id quán, để hai quán dùng chung một tấm ảnh trông khác hẳn nhau. Kỹ thuật thì chạy tốt và lưới nhìn rất "có hệ thống" — nhưng nó làm **phở hoá hồng và cà phê hoá xanh lá**. Ảnh món ăn sống được là nhờ đúng màu, nên với một cẩm nang ẩm thực đó là đánh đổi sai. Chia lại ảnh cho đều giải quyết đúng vấn đề đó mà không đụng tới màu. (Ghi lại ở đây phòng khi bạn thấy ý đó hay và muốn bật lên — code cũ nằm trong lịch sử git.)

**Đường tới ảnh thật — ngắn lại từ 5 bước còn 2.** Trong modal chi tiết của quán chưa có ảnh thật giờ có nút **"Thêm ảnh thật"**, bấm vào là mở thẳng form Sửa và cuộn tới ô tải ảnh. Trước đây phải: đóng chi tiết → mở Quản lý quán → tìm lại quán → bấm Sửa → cuộn xuống. Năm bước cho việc người ta vừa mới nghĩ tới khi đang xem đúng quán đó.

### Trả lời câu hỏi: chụp ảnh bằng Playwright khi tìm tên quán?

**Với Google Maps thì không nên** — và lý do nằm ngay trong code của chính dự án này.

[api/place.js](api/place.js) đã ghi rõ vì sao không dùng Google Places API: điều khoản Maps Platform §3.2.1(v) cấm phân phối ứng dụng dùng Core Services tại "Prohibited Territory", mà **Việt Nam nằm trong danh sách đó**. Đó là lý do số sao và lượt đánh giá phải nhập tay.

Nếu đã từ chối dùng API chính thức vì điều khoản, thì đi cào màn hình bằng Playwright là đi cửa sau của cùng một dịch vụ — vi phạm nặng hơn, không nhẹ hơn. Thêm ba lý do kỹ thuật:

1. Ảnh chụp màn hình Google Maps là ảnh một **giao diện web** (có thanh tìm kiếm, nút, menu), không phải ảnh món ăn hay ảnh quán. Dán lên thẻ sẽ xấu hơn cả ô chữ hiện tại.
2. Bản quyền ảnh trong Google Maps thuộc về người chụp hoặc chủ quán, không thuộc Google — và cũng không thuộc mình.
3. Google đổi DOM liên tục và có chống bot; crawler sẽ hỏng âm thầm, rồi một ngày trả về ảnh trang CAPTCHA.

**Những đường còn lại, xếp theo mức tôi khuyên dùng:**

| Cách | Đánh giá |
|---|---|
| **Bạn tự chụp, tải lên Drive** | Tốt nhất, và đã có sẵn đường đi. Không vướng bản quyền, ảnh đúng quán, đúng món. Nút "Thêm ảnh thật" ở trên là để rút ngắn việc này. Mỗi lần ghé quán thêm một tấm — 60 quán không phải làm trong một hôm. |
| **Xin ảnh từ chính quán** | Quán nào cũng sẵn lòng, và họ có ảnh đẹp sẵn. Mất công nhắn tin nhưng được ảnh chuẩn kèm quyền dùng rõ ràng. |
| **Lấy `og:image` từ website / fanpage của quán** | Về nguyên tắc đây là tấm ảnh chính quán công bố để làm thẻ xem trước khi chia sẻ link, nên dùng lại kèm dẫn nguồn là hợp lệ hơn hẳn cào Google. Nhưng Facebook chặn phần lớn truy cập tự động nếu không có token, và nhiều quán Hà Nội không có website. Làm được, nhưng tỉ lệ thành công thấp — nói nếu bạn vẫn muốn thử. |
| **Ảnh minh hoạ như hiện tại** | Đang dùng. Lấp chỗ trống một cách trung thực cho tới khi có ảnh thật. |
| **Cào ảnh Google Maps bằng Playwright** | Không nên, vì ba lý do ở trên. |

## 7.2. "Hợp cho" đổi tên thành "Mục đích", và thành một trường thật

> *Ý kiến: "ý hay, bộ lọc này nên đổi tên là mục đích, là trường ko bắt buộc điền trong thông tin, nhưng sẽ giúp lọc nhanh quán theo mục đích"*
> *Cmt mục 6: "không chỉ áp dụng cho cà phê, mà sẽ áp dụng cho toàn bộ nhé"*

Ở vòng 1 "Hợp cho" mới chỉ là một bộ lọc đọc từ dữ liệu dựng sẵn — bạn không nhập được, không sửa được, không xuất ra được. Giờ nó là một trường đầy đủ, **áp dụng cho mọi danh mục**:

- **Đổi tên** thành **"Mục đích"** ở hàng lọc.
- **Thêm ô "Mục đích" vào cả form Thêm quán và form Sửa quán**, đánh dấu rõ *"— không bắt buộc"*.
- **Có gợi ý để từ vựng khỏi phân mảnh:** dưới ô nhập là một hàng chip bấm được (bấm để thêm, bấm lần nữa để gỡ), lấy từ chính những mục đích đã dùng trong cẩm nang, kèm `<datalist>` gợi ý khi gõ. Không có cái này thì chẳng bao lâu sẽ có "Hẹn hò" / "hẹn hò" / "Date" thành ba chip riêng ở hàng lọc.
- **Hiện trong modal chi tiết** ở hàng "Hợp cho". Tag nào trùng với mục đích thì không hiện lại — dữ liệu hay ghi "Check-in" vào cả hai trường.
- **Xuất ra file .csv** ở cột mới "Mục Đích".
- **Đồng bộ lên Google Sheet** ở cột mới "Mục đích".

Đã kiểm tra trọn vòng: nhập → lưu → tải lại trang → vẫn còn → mở form Sửa thì điền sẵn đúng.

> ⚠️ **Một việc phải làm một lần với Google Sheet đang có sẵn.** Cột "Mục đích" được thêm vào CUỐI danh sách cột, vì Apps Script đọc/ghi theo vị trí — chen vào giữa sẽ làm lệch toàn bộ dữ liệu của Sheet cũ. Các bước nằm trong phần chú thích ngay tại chỗ thêm cột trong [tools/sheet-appscript.gs](tools/sheet-appscript.gs):
> 1. Dán lại file đó vào Apps Script rồi Deploy bản mới.
> 2. Gõ tiêu đề "Mục đích" vào ô trống đầu tiên bên phải ở hàng 1 của tab chính.
> 3. **Chỉ khi bạn dùng tab Crawl_Inbox:** cột tick "Duyệt" phải dịch sang phải một ô, vì nó luôn nằm ngay sau cột cuối. Nhanh nhất là xoá hẳn tab Crawl_Inbox — script tự dựng lại đúng chuẩn ở lần cào sau.
>
> Chưa làm bước này thì trang vẫn chạy bình thường, chỉ là Mục đích chưa sang được máy khác.

## 7.3. Ba ý kiến còn lại

| Ý kiến của bạn | Xử lý |
|---|---|
| **3.** "đồng ý bỏ" bộ lọc trạng thái xác minh khỏi trang chính | Giữ nguyên như vòng 1 — nó nằm trong modal Quản lý quán. |
| **4.** "thực ra cứ để ở góc vẫn oke" (nút đổi giao diện) | Tôi hiểu là bạn đồng ý với cách đang bố trí, nên **không đổi gì**: trên máy tính nút vẫn ở góc phải đầu trang, trên điện thoại nằm trong bảng "Thêm". Nếu ý bạn là muốn nó hiện ra ngoài trên cả điện thoại nữa thì nói, sửa nhanh thôi. |
| **5.** "đồng ý, bỏ dòng mở cửa đi" | Giữ nguyên như vòng 1 — chế độ Danh sách không hiện giờ mở cửa nữa, chi tiết thì vẫn có. |

## 7.4. Vài thứ sửa thêm trong vòng 2

- **Lỗi khoảng xám trong modal chi tiết:** ảnh chỉ cao 180px trong khung 240px, chừa một dải xám trống phía dưới. Do lớp `.modal-hero-slot` (vốn dành cho ô chữ) bị gắn nhầm lên cả khối ảnh. Đã bọc chung một khung `.modal-hero` giữ chiều cao.
- **"Dữ liệu dựng sẵn"** — từ vựng hệ thống lọt ra giao diện, người đọc không hiểu là gì. Đổi thành "danh sách ban đầu của cẩm nang".
- **"Món ngon Must-Try"** vẫn còn trong nhãn hai form và cột .csv, trong khi phần hiển thị đã đổi sang "Món nên gọi" ở vòng 1. Giờ thống nhất cả ba chỗ.
- **Nhãn "Tags"** chỉnh cho cùng kiểu với "Mục đích" (`— không bắt buộc`).

## 7.5. Số liệu sau vòng 2

Giữ nguyên toàn bộ thành quả vòng 1, không có bước lùi nào:

| | Giá trị |
|---|---|
| Quán đầu tiên — mobile | 553px (khung 844px) |
| Chiều cao thẻ — mobile | 395px |
| Cặp màu không đạt tương phản | **0** sáng + **0** tối |
| Tấm ảnh lặp nhiều nhất | 7 → **3** |
| Cặp thẻ liền kề trùng ảnh | **0** |
| Kiểm tra chức năng | **41/41 đạt**, không lỗi JavaScript |
| Vòng đời trường Mục đích | nhập → lưu → tải lại → sửa: **đạt** |

File đổi trong vòng 2: `css/style.css`, `index.html`, `js/app.js`, `tools/sheet-appscript.gs`.
