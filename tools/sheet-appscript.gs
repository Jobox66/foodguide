/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FOODGUIDE  ↔  GOOGLE SHEET
 *  Dán toàn bộ file này vào Apps Script của Sheet bạn muốn dùng làm sổ cái.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  CÁCH CÀI (làm một lần, khoảng 5 phút)
 *
 *  1. Tạo một Google Sheet mới (sheets.new). Không cần tạo cột — script tự tạo.
 *
 *  2. Trong Sheet: menu  Tiện ích mở rộng → Apps Script.
 *
 *  3. Xoá sạch nội dung file Code.gs đang có, dán toàn bộ file này vào.
 *
 *  4. ĐẶT TOKEN BẰNG MENU, ĐừNG GÕ VÀO MÃ: tải lại Sheet để hiện menu
 *     🍜 FoodGuide → 🔑 Đặt token. Nghĩ một chuỗi bí mật, ví dụ
 *     "pho-bat-dan-2026-xin-chao", lát nữa điền y hệt vào Vercel.
 *
 *     Token cất trong Thuộc tính tập lệnh nên lần sau cập nhật script bạn cứ
 *     dán ĐÈ CẢ FILE, không phải dán tay từng đoạn để giữ lại token.
 *
 *  5. Bấm  Triển khai (Deploy) → Tuỳ chọn triển khai mới (New deployment)
 *       • Loại (Select type)     : Ứng dụng web (Web app)
 *       • Thực thi với tư cách   : Tôi  (Execute as: Me)
 *       • Ai có quyền truy cập   : Bất kỳ ai  (Who has access: Anyone)
 *
 *     ⚠️ Phải chọn đúng "Bất kỳ ai". Chọn "Bất kỳ ai có Tài khoản Google"
 *        thì máy chủ sẽ bị Google chặn lại ở màn hình đăng nhập.
 *
 *     Google sẽ hỏi cấp quyền — bấm qua màn hình cảnh báo bằng
 *     "Nâng cao (Advanced)" → "Chuyển đến … (unsafe)". Cảnh báo đó xuất hiện
 *     vì script chưa qua kiểm duyệt của Google, mà script này là của chính bạn.
 *
 *     Script xin HAI quyền: Bảng tính (ghi danh sách quán) và Drive (lưu ảnh
 *     quán bạn chụp, xem phần cuối file). Nếu bạn đã cài bản cũ chưa có phần
 *     ảnh thì phải deploy lại một lần để Google hỏi thêm quyền Drive.
 *
 *  6. Copy đường dẫn Web App hiện ra, dạng:
 *       https://script.google.com/macros/s/AKfycb.../exec
 *
 *  7. Sang Vercel → dự án foodguide → Settings → Environment Variables,
 *     thêm hai biến rồi Redeploy:
 *       SHEETS_WEBHOOK_URL = đường dẫn /exec vừa copy
 *       SHEETS_TOKEN       = đúng chuỗi bí mật ở bước 4
 *
 *  Xong. Đường dẫn /exec và token nằm trên máy chủ Vercel, trình duyệt của
 *  người xem trang không bao giờ nhìn thấy — họ chỉ thấy "/api/sheet".
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  MỖI KHI SỬA FILE NÀY, phải Deploy → Quản lý triển khai (Manage deployments)
 *  → biểu tượng bút chì → Phiên bản: Mới (New version) → Triển khai.
 *  Nếu chỉ Lưu mà không deploy lại thì Web App vẫn chạy mã cũ.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Chuỗi bí mật, PHẢI trùng SHEETS_TOKEN trên Vercel.
 *
 * ĐỪNG gõ vào đây. Dùng menu 🍜 FoodGuide → 🔑 Đặt token, nó cất vào Thuộc tính
 * tập lệnh (Script Properties) của dự án Apps Script.
 *
 * Vì sao không để thẳng trong mã:
 *
 *   • File này nằm trong repo công khai trên GitHub. Token gõ vào đây là chỉ
 *     còn cách nhớ đừng bao giờ commit — một lần quên là lộ vĩnh viễn, vì lịch
 *     sử git giữ lại cả bản đã xoá.
 *
 *   • Token nằm trong mã thì mỗi lần cập nhật script phải dán tay từng đoạn để
 *     khỏi đè mất nó. Dán tay là sẽ sót: chỉ cần một hằng số mới nằm nhầm phía
 *     trên dòng token là bản trên Google thiếu mất, mà vẫn chạy — sai âm thầm,
 *     đúng kiểu lỗi đã hành ta mấy lần rồi.
 *
 * Cất ở Script Properties thì dán ĐÈ CẢ FILE lúc nào cũng được, token không suy
 * suyển. Nó vẫn nằm trong tài khoản Google của bạn, chỉ người sửa được Sheet
 * mới đọc được — không công khai ra ngoài.
 *
 * Dòng dưới chỉ là đường lui cho bản cài cũ đã gõ thẳng vào mã.
 */
var SHEET_TOKEN = 'doi-chuoi-nay-thanh-cua-ban';

/** Token đang dùng thật: ưu tiên Script Properties, không có thì mới đọc hằng số */
function sheetToken_() {
  try {
    var saved = PropertiesService.getScriptProperties().getProperty('SHEET_TOKEN');
    if (saved) return String(saved).trim();
  } catch (err) {
    // Chưa cấp quyền thì rơi xuống hằng số bên dưới
  }
  return SHEET_TOKEN;
}

/** Menu 🔑 Đặt token — cất chuỗi bí mật vào Script Properties */
function DAT_TOKEN() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.prompt(
    'Đặt token',
    'Nhập chuỗi bí mật, phải trùng y hệt SHEETS_TOKEN trên Vercel.\n' +
    'Chuỗi này được cất trong Thuộc tính tập lệnh, dán đè mã không làm mất nó.',
    ui.ButtonSet.OK_CANCEL
  );
  if (answer.getSelectedButton() !== ui.Button.OK) return;

  var value = String(answer.getResponseText() || '').trim();
  if (!value) {
    ui.alert('Chưa nhập gì — không đổi.');
    return;
  }
  if (value === 'doi-chuoi-nay-thanh-cua-ban') {
    ui.alert('Đó là chuỗi mẫu trong file, ai đọc repo cũng biết. Nghĩ một chuỗi khác.');
    return;
  }

  PropertiesService.getScriptProperties().setProperty('SHEET_TOKEN', value);
  ui.alert('Đã lưu token (' + value.length + ' ký tự).\n\n' +
           'Kiểm tra SHEETS_TOKEN trên Vercel có trùng không, rồi thử đồng bộ.');
}

/**
 * Phiên bản của CHÍNH FILE NÀY. Tăng lên mỗi khi sửa thứ gì phía máy chủ cần
 * biết, rồi dán lại file lên Apps Script.
 *
 * Vì sao cần: Apps Script chạy trên Google là một bản sao rời, không có cách
 * nào nhìn từ ngoài vào để biết nó đang là bản nào. Đã trả giá hai lần —
 * bản cũ không hiểu tab Crawl_Inbox nên ghi 147 quán thẳng vào cẩm nang, và
 * bản cũ xoá theo số dòng nên xin xoá 8 quán thì mất 28. Cả hai lần đều
 * "chạy bình thường", chỉ sai âm thầm.
 *
 * Giờ `run.py check` đọc số này trong file trên máy rồi so với số Google trả
 * về. Lệch là báo ngay, khỏi phải đoán.
 *
 *   5 — token cất ở Script Properties, dán đè cả file không làm mất token
 *   4 — xoá đối chiếu id trước khi xoá từng dòng (không tin số dòng đã tra)
 *   3 — đếm dòng theo cột ID, bỏ việc rải sẵn 1000 ô tick
 *   2 — thêm tab Crawl_Inbox và tham số sheet
 *   1 — bản đầu
 */
var SCRIPT_VERSION = 5;

/** Tên tab chính thức — dữ liệu ở đây mới lên trang web. Script tự tạo nếu chưa có. */
var SHEET_NAME = 'FoodGuide';

/**
 * Tab chờ duyệt: nơi tool crawl đổ dữ liệu về.
 * Quán cào bằng máy KHÔNG được ghi thẳng vào tab chính — bạn xem qua rồi tick
 * cột "Duyệt", sau đó dùng menu 🍜 FoodGuide → Duyệt các quán đã tick.
 */
var INBOX_SHEET_NAME = 'Crawl_Inbox';
var INBOX_APPROVE_LABEL = 'Duyệt';

/** Chỉ hai tab này được ghi qua API — chặn việc tạo tab bừa bãi từ bên ngoài */
var ALLOWED_SHEETS = {};
ALLOWED_SHEETS[SHEET_NAME] = true;
ALLOWED_SHEETS[INBOX_SHEET_NAME] = true;

/**
 * Thứ tự cột trong Sheet. Đổi label thoải mái (chỉ là chữ ở hàng tiêu đề),
 * nhưng ĐỪNG đổi key và đừng đảo thứ tự — script đọc/ghi theo vị trí.
 */
var COLUMNS = [
  { key: 'id',          label: 'ID' },
  { key: 'name',        label: 'Tên quán' },
  { key: 'category',    label: 'Danh mục' },
  { key: 'district',    label: 'Quận' },
  { key: 'address',     label: 'Địa chỉ' },
  { key: 'rating',      label: 'Số sao' },
  { key: 'reviewCount', label: 'Lượt đánh giá' },
  { key: 'priceRange',  label: 'Khoảng giá' },
  { key: 'priceLevel',  label: 'Mức giá' },
  { key: 'time',        label: 'Giờ mở cửa' },
  { key: 'mustTry',     label: 'Món must-try' },
  { key: 'review',      label: 'Cảm nhận' },
  { key: 'mapsUrl',     label: 'Link Google Maps' },
  { key: 'tags',        label: 'Tags' },
  { key: 'image',       label: 'Ảnh' },
  { key: 'lat',         label: 'Vĩ độ' },
  { key: 'lng',         label: 'Kinh độ' },
  { key: 'verified',    label: 'Đã xác minh' },
  { key: 'featured',    label: 'Nổi bật' },
  { key: 'dataSource',  label: 'Nguồn dữ liệu' },
  { key: 'updatedAt',   label: 'Cập nhật lúc' },

  /* ───────────────────────────────────────────────────────────────────────
     THÊM 29/10/2026 — cột "Mục đích" (hẹn hò, làm việc, tụ tập…).
     Trường tuỳ chọn, ngăn nhau bằng dấu phẩy.

     Đặt ở CUỐI chứ không chen vào giữa: script đọc/ghi theo VỊ TRÍ cột, nên
     chen vào giữa sẽ làm lệch toàn bộ dữ liệu của những Sheet đang có sẵn.

     NẾU SHEET CỦA BẠN ĐÃ TỒN TẠI TỪ TRƯỚC, cần làm một lần:
       1. Dán lại toàn bộ file này vào Apps Script rồi Deploy bản mới.
       2. Ở tab chính, gõ tiêu đề "Mục đích" vào ô trống đầu tiên bên phải
          (hàng 1). Dữ liệu sẽ tự điền từ lần đẩy sau.
       3. CHỈ KHI bạn có dùng tab Crawl_Inbox: cột tick "Duyệt" của tab đó
          phải dịch sang phải một ô, vì nó luôn nằm ngay sau cột cuối cùng.
          Cách nhanh nhất là xoá hẳn tab Crawl_Inbox — script tự dựng lại
          đúng chuẩn ở lần cào tiếp theo.
     Sheet tạo mới sau thời điểm này thì không phải làm gì cả.
     ─────────────────────────────────────────────────────────────────────── */
  { key: 'vibe',        label: 'Mục đích' }
];

var ID_COLUMN = 1; // cột A

/** Những action có ghi/đọc Sheet — chỉ chúng mới cần xếp hàng qua khoá */
var SHEET_ACTIONS = { health: true, pull: true, push: true, 'delete': true };

/* ═══════════════════════════════════════════════════════════════════════════
   ĐIỂM VÀO
   ═══════════════════════════════════════════════════════════════════════════ */

function doGet() {
  // Mở đường dẫn /exec bằng trình duyệt sẽ thấy dòng này — dùng để kiểm tra
  // deploy đã đúng quyền chưa. Không trả về dữ liệu quán.
  //
  // 'via' để máy chủ phân biệt được phản hồi này với phản hồi của doPost. Cả
  // hai đều có ok:true, nên nếu không đánh dấu thì một cú POST bị đổi thành GET
  // sẽ lọt qua như thể đã thành công — chỉ thiếu dữ liệu.
  return jsonOut_({
    ok: true,
    via: 'doGet',
    service: 'foodguide-sheet',
    hint: 'Web App đang chạy. Trang web gọi bằng POST.'
  });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Body không phải JSON.' });
  }

  var token = sheetToken_();
  if (!token || token === 'doi-chuoi-nay-thanh-cua-ban') {
    return jsonOut_({ ok: false,
      error: 'Chưa đặt token. Mở Sheet → menu 🍜 FoodGuide → 🔑 Đặt token.' });
  }
  if (body.token !== token) {
    return jsonOut_({ ok: false, error: 'Sai token — SHEETS_TOKEN trên Vercel chưa trùng SHEET_TOKEN trong Apps Script.' });
  }

  // Tool crawl ghi vào Crawl_Inbox, trang web ghi vào FoodGuide
  var sheetName;
  try {
    sheetName = resolveSheetName_(body.sheet);
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }

  // Khoá chỉ để hai lượt GHI SHEET không đè lên nhau. Thao tác ảnh chỉ đụng
  // Drive, không chạm một ô nào của Sheet — bắt nó xếp hàng chờ tới 20 giây sau
  // một lượt đồng bộ dài là vô ích, và đó chính là cách nhanh nhất để vượt quá
  // thời gian chờ của máy chủ rồi báo "phản hồi quá chậm".
  var lock = null;
  if (SHEET_ACTIONS[body.action] === true) {
    lock = LockService.getScriptLock();
    try {
      lock.waitLock(20000);
    } catch (err) {
      return jsonOut_({ ok: false, error: 'Sheet đang bận, thử lại sau vài giây.' });
    }
  }

  // Mọi phản hồi của doPost đều mang dấu này, kèm action đã thực sự chạy —
  // máy chủ nhờ đó biết chắc mình nhận được kết quả của đúng việc mình nhờ.
  var tag = function (result) {
    if (result && typeof result === 'object') {
      result.via = 'doPost';
      result.action = body.action;
    }
    return jsonOut_(result);
  };

  try {
    switch (body.action) {
      case 'health':      return tag({ ok: true, version: SCRIPT_VERSION, sheet: sheetName,
                                        rows: countPlaces_(sheetName),
                                        inboxRows: countInboxRows_(), photos: true, inbox: true });
      case 'pull':        return tag({ ok: true, places: readAll_(sheetName) });
      case 'push':        return tag(upsertMany_(body.places || [], sheetName));
      case 'delete':      return tag(deleteMany_(body.ids || [], sheetName));
      case 'photo':       return tag(savePhoto_(body));
      case 'deletePhoto': return tag(deletePhoto_(body.fileId));
      default:            return tag({ ok: false, error: 'action không hợp lệ: ' + body.action });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    if (lock) lock.releaseLock();
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ═══════════════════════════════════════════════════════════════════════════
   TRUY CẬP SHEET
   ═══════════════════════════════════════════════════════════════════════════ */

/** Tên tab hợp lệ, hoặc ném lỗi. Bỏ trống thì hiểu là tab chính. */
function resolveSheetName_(requested) {
  var name = String(requested || '').trim();
  if (!name) return SHEET_NAME;
  if (ALLOWED_SHEETS[name] !== true) {
    throw new Error('Tab không được phép ghi: "' + name + '". Chỉ nhận ' +
      SHEET_NAME + ' hoặc ' + INBOX_SHEET_NAME + '.');
  }
  return name;
}

/** Lấy một tab dữ liệu, tự tạo kèm hàng tiêu đề nếu chưa có */
function getSheet_(sheetName) {
  var name = sheetName || SHEET_NAME;
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(name);

  if (!sheet) {
    sheet = book.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    var isInbox = (name === INBOX_SHEET_NAME);
    var labels = COLUMNS.map(function (c) { return c.label; });
    if (isInbox) labels.push(INBOX_APPROVE_LABEL);

    sheet.getRange(1, 1, 1, labels.length).setValues([labels])
      .setFontWeight('bold')
      .setBackground(isInbox ? '#FFF4E5' : '#f1f3f4');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 170);  // ID
    sheet.setColumnWidth(2, 220);  // Tên quán
  }

  return sheet;
}

/**
 * Dòng cuối CÓ DỮ LIỆU, tính theo cột ID — không dùng getLastRow().
 *
 * getLastRow() đếm mọi ô có nội dung, và ô tick RỖNG vẫn là nội dung. Bản trước
 * chèn sẵn 1000 ô tick vào cột Duyệt lúc tạo tab Crawl_Inbox, nên một tab trống
 * trơn vẫn báo 999 dòng, và upsertMany_ nối dữ liệu xuống dòng 1001 — mở tab ra
 * chỉ thấy khoảng trắng mênh mông, phải cuộn cả nghìn dòng mới tới quán đầu tiên.
 * Đó là lý do chỗ nào cũng phải hỏi cột ID thay vì hỏi getLastRow().
 */
function lastDataRow_(sheet) {
  var physical = sheet.getLastRow();
  if (physical < 2) return 1;

  var ids = sheet.getRange(2, ID_COLUMN, physical - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0] || '').trim()) return i + 2;
  }
  return 1;
}

function countPlaces_(sheetName) {
  return Math.max(0, lastDataRow_(getSheet_(sheetName)) - 1);
}

/** Đếm số dòng trong tab chờ duyệt, KHÔNG tạo tab nếu chưa có */
function countInboxRows_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INBOX_SHEET_NAME);
  return sheet ? Math.max(0, lastDataRow_(sheet) - 1) : 0;
}

/** id → số dòng thật trong Sheet */
function buildRowIndex_(sheet) {
  var index = {};
  var lastRow = lastDataRow_(sheet);
  if (lastRow < 2) return index;

  var ids = sheet.getRange(2, ID_COLUMN, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    var id = String(ids[i][0] || '').trim();
    if (id) index[id] = i + 2;
  }
  return index;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ĐỌC / GHI MỘT QUÁN
   ═══════════════════════════════════════════════════════════════════════════ */

function toNumberOrNull_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isFinite(value) ? value : null;
  // Người nhập tay có thể gõ "4,6" theo kiểu Việt Nam
  var num = parseFloat(String(value).replace(',', '.').replace(/[^\d.\-]/g, ''));
  return isFinite(num) ? num : null;
}

function toBool_(value) {
  if (value === true) return true;
  if (value === false || value === '' || value === null || value === undefined) return false;
  var text = String(value).trim().toLowerCase();
  return text === 'true' || text === 'có' || text === 'co' || text === 'x' || text === '1' || text === 'yes';
}

/** Đối tượng quán → một hàng giá trị đúng thứ tự COLUMNS */
function placeToRow_(place) {
  return COLUMNS.map(function (col) {
    switch (col.key) {
      case 'tags':
      case 'vibe':
        return Array.isArray(place[col.key])
          ? place[col.key].join(', ')
          : String(place[col.key] || '');
      case 'rating':
      case 'reviewCount':
      case 'lat':
      case 'lng': {
        var num = toNumberOrNull_(place[col.key]);
        return num === null ? '' : num;
      }
      case 'verified':
      case 'featured':
        return toBool_(place[col.key]);
      case 'updatedAt':
        return new Date();
      default:
        return place[col.key] === null || place[col.key] === undefined ? '' : String(place[col.key]);
    }
  });
}

/** Một hàng trong Sheet → đối tượng quán */
function rowToPlace_(row) {
  var place = {};

  COLUMNS.forEach(function (col, i) {
    var raw = row[i];

    switch (col.key) {
      case 'tags':
      case 'vibe':
        place[col.key] = String(raw || '')
          .split(/[,;]/)
          .map(function (t) { return t.trim(); })
          .filter(function (t) { return t; });
        break;
      case 'rating':
      case 'reviewCount':
      case 'lat':
      case 'lng':
        place[col.key] = toNumberOrNull_(raw);
        break;
      case 'verified':
      case 'featured':
        place[col.key] = toBool_(raw);
        break;
      case 'updatedAt':
        place.updatedAt = raw instanceof Date ? raw.toISOString() : String(raw || '');
        break;
      default:
        place[col.key] = String(raw === null || raw === undefined ? '' : raw).trim();
    }
  });

  return place;
}

/* ═══════════════════════════════════════════════════════════════════════════
   BA THAO TÁC
   ═══════════════════════════════════════════════════════════════════════════ */

function readAll_(sheetName) {
  var sheet = getSheet_(sheetName);
  var lastRow = lastDataRow_(sheet);
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();

  return values
    .map(rowToPlace_)
    .filter(function (p) { return p.id && p.name; });
}

/**
 * Thêm mới hoặc cập nhật theo ID.
 * Quán đã có → ghi đè đúng dòng đó. Quán chưa có → nối vào cuối.
 */
function upsertMany_(places, sheetName) {
  var sheet = getSheet_(sheetName);
  var index = buildRowIndex_(sheet);

  // Chốt chỗ nối NGAY SAU dòng có dữ liệu cuối cùng. Dùng getLastRow() ở đây là
  // nhảy qua cả nghìn ô tick rỗng rồi ghi vào quãng không ai nhìn thấy.
  var appendStart = lastDataRow_(sheet) + 1;

  var updated = 0;
  var appendRows = [];

  places.forEach(function (place) {
    var id = String((place && place.id) || '').trim();
    if (!id || !place.name) return;

    var row = placeToRow_(place);
    var rowNumber = index[id];

    if (rowNumber) {
      sheet.getRange(rowNumber, 1, 1, COLUMNS.length).setValues([row]);
      updated++;
    } else {
      appendRows.push(row);
      // Giữ chỗ để cùng một id gửi hai lần trong một lô không bị nhân đôi
      index[id] = appendStart + appendRows.length - 1;
    }
  });

  if (appendRows.length > 0) {
    sheet
      .getRange(appendStart, 1, appendRows.length, COLUMNS.length)
      .setValues(appendRows);

    // Ô tick chỉ đặt lên đúng những dòng có quán. Rải sẵn cả nghìn ô tick vào
    // vùng trống là cách làm hỏng mọi phép đếm dòng về sau.
    if (sheetName === INBOX_SHEET_NAME) {
      sheet.getRange(appendStart, COLUMNS.length + 1, appendRows.length, 1)
        .insertCheckboxes();
    }
  }

  return { ok: true, added: appendRows.length, updated: updated, total: countPlaces_(sheetName) };
}

/** Xoá theo ID. Xoá từ dòng dưới lên để số dòng phía trên không bị dịch. */
function deleteMany_(ids, sheetName) {
  var sheet = getSheet_(sheetName);
  var index = buildRowIndex_(sheet);

  // Tập id được phép xoá, tra nhanh
  var duocPhep = {};
  ids.forEach(function (id) {
    var key = String(id || '').trim();
    if (key) duocPhep[key] = true;
  });

  var rowNumbers = ids
    .map(function (id) { return index[String(id || '').trim()]; })
    .filter(function (rowNumber) { return rowNumber; })
    .sort(function (a, b) { return b - a; });

  // ĐỌC LẠI ID NGAY TRƯỚC KHI XOÁ, không tin vào số dòng đã tra lúc đầu.
  //
  // Số dòng là thứ hết hạn: chỉ cần lệnh xoá chạy hai lần chồng nhau (Google
  // gửi lại sau khi đường dẫn kết quả trả 404 chẳng hạn), lần sau cầm chỉ mục
  // cũ trong khi các dòng đã dồn lên — số dòng đó giờ trỏ sang quán khác.
  // Chuyện này đã xảy ra thật: xin xoá 8 quán, mất 28 dòng.
  //
  // Đối chiếu id một lần nữa làm cả lớp lỗi đó biến mất: dòng nào không nằm
  // trong danh sách xin xoá thì không bao giờ bị đụng tới, dù chỉ mục sai cỡ
  // nào. Cũng nhờ vậy mà gửi lại lệnh xoá trở nên an toàn.
  var deleted = 0;
  var mismatched = 0;
  rowNumbers.forEach(function (rowNumber) {
    var hienTai = String(sheet.getRange(rowNumber, ID_COLUMN).getValue() || '').trim();
    if (duocPhep[hienTai] === true) {
      sheet.deleteRow(rowNumber);
      deleted++;
    } else {
      mismatched++;
    }
  });

  var result = { ok: true, deleted: deleted, total: countPlaces_(sheetName) };
  if (mismatched > 0) {
    // Không im lặng: lệch chỉ mục nghĩa là có thứ khác vừa sửa Sheet
    result.skipped = mismatched;
    result.note = 'Bỏ qua ' + mismatched + ' dòng vì id không khớp — Sheet đã đổi ' +
                  'kể từ lúc tra chỉ mục. Chạy lại lệnh xoá nếu vẫn còn quán cần bỏ.';
  }
  return result;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ẢNH QUÁN TRONG GOOGLE DRIVE

   Ảnh bạn chụp được lưu vào một thư mục Drive của chính bạn, rồi trang web
   hiển thị qua /api/photo — endpoint đó cache ở edge của Vercel nên Drive chỉ
   bị gọi một lần cho mỗi ảnh. Xem ghi chú đầu file api/photo.js.

   ⚠️ PHẦN NÀY CẦN QUYỀN TRUY CẬP DRIVE.
      Nếu bạn đã deploy script trước khi có đoạn này, phải deploy lại một lần
      (Triển khai → Quản lý triển khai → bút chì → Phiên bản: Mới) và Google
      sẽ hỏi cấp quyền lại. Không làm bước đó thì tải ảnh sẽ báo lỗi quyền.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Tên thư mục chứa ảnh trong Drive. Đổi thoải mái, script tự tạo nếu chưa có. */
var PHOTO_FOLDER_NAME = 'Foodguide - Ảnh quán';

/** Chỉ nhận đúng ba định dạng ảnh phổ biến */
var PHOTO_MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

/**
 * Thư mục ảnh, nhớ sẵn id để khỏi tìm lại.
 * getFoldersByName() là một lượt tra toàn Drive — chạy nhanh khi Drive còn
 * trống, nhưng chậm dần theo số file bạn có, và nó chạy ở MỌI lần tải ảnh.
 * Nhớ id vào Script Properties thì từ lần thứ hai chỉ còn một lệnh mở thẳng.
 */
function getPhotoFolder_() {
  var props = PropertiesService.getScriptProperties();
  var cachedId = props.getProperty('PHOTO_FOLDER_ID');

  if (cachedId) {
    try {
      var cached = DriveApp.getFolderById(cachedId);
      if (!cached.isTrashed()) return cached;
    } catch (err) {
      // Thư mục bị xoá hoặc id hỏng — rơi xuống tìm lại bên dưới
    }
  }

  var found = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  var folder = found.hasNext() ? found.next() : DriveApp.createFolder(PHOTO_FOLDER_NAME);
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

/**
 * Nhận ảnh dạng data URL từ trình duyệt, lưu thành file trong Drive,
 * trả về id để trang web dựng link /api/photo?id=…
 */
function savePhoto_(body) {
  // Đo từng chặng: khi tải ảnh chậm, đây là cách duy nhất biết thời gian đi
  // đâu — giải mã, tìm thư mục, ghi file, hay đặt quyền.
  var t0 = new Date().getTime();
  var mark = function () { var now = new Date().getTime(); var d = now - t0; t0 = now; return d; };
  var ms = {};

  var dataUrl = String(body.dataUrl || '');
  var match = dataUrl.match(/^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    return { ok: false, error: 'Dữ liệu ảnh không hợp lệ.' };
  }

  var mime = match[1];
  var ext = PHOTO_MIME_EXT[mime];
  if (!ext) {
    return { ok: false, error: 'Chỉ nhận ảnh JPG, PNG hoặc WebP. Nhận được: ' + mime };
  }

  var bytes;
  try {
    bytes = Utilities.base64Decode(match[2].replace(/\s/g, ''));
  } catch (err) {
    return { ok: false, error: 'Không giải mã được ảnh.' };
  }
  ms.giaiMa = mark();

  // Tên file do TRÌNH DUYỆT đặt trước khi gửi, không phải do đây sinh ra.
  //
  // Vì sao quan trọng: Apps Script trả kết quả qua một địa chỉ tạm trên
  // googleusercontent, và địa chỉ đó thỉnh thoảng trả 404 — ảnh đã ghi xong vào
  // Drive rồi nhưng phía gọi không nhận được fileId. Nếu tên file do đây tự
  // sinh (kèm Date.now()) thì mỗi lần thử lại tạo một bản mới, Drive đầy ảnh
  // trùng mà vẫn không lấy được id.
  //
  // Để trình duyệt giữ nguyên một uploadId qua các lần thử thì lần sau chỉ cần
  // tìm lại đúng file đó — thử lại bao nhiêu lần cũng chỉ có một tấm ảnh.
  var uploadId = String(body.uploadId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  if (!uploadId) {
    var slug = String(body.placeId || 'quan').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'quan';
    uploadId = slug + '-' + Date.now();
  }
  var name = uploadId + '.' + ext;

  var folder;
  try {
    folder = getPhotoFolder_();
  } catch (err) {
    return { ok: false, error: 'Không mở được thư mục ảnh trên Drive: ' + err.message +
      ' (thường là do chưa deploy lại script sau khi thêm phần ảnh)' };
  }
  ms.timThuMuc = mark();

  // Đã ghi ở lần thử trước rồi thì dùng lại, đừng tạo thêm bản nữa
  var already = folder.getFilesByName(name);
  if (already.hasNext()) {
    var old = already.next();
    ms.ghiFile = mark();
    ms.datQuyen = 0;
    ms.tong = ms.giaiMa + ms.timThuMuc + ms.ghiFile;
    return { ok: true, fileId: old.getId(), name: name, bytes: bytes.length, reused: true, ms: ms };
  }

  var file;
  try {
    file = folder.createFile(Utilities.newBlob(bytes, mime, name));
  } catch (err) {
    return { ok: false, error: 'Không ghi được vào Drive: ' + err.message +
      ' (thường là do chưa deploy lại script sau khi thêm phần ảnh)' };
  }
  ms.ghiFile = mark();

  // /api/photo đọc ảnh mà không mang theo token nào, nên file phải mở theo link.
  // Id của Drive dài và ngẫu nhiên nên không đoán được.
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    file.setTrashed(true);
    return { ok: false, error: 'Không đặt được quyền xem cho ảnh: ' + err.message +
      ' (tài khoản công ty thường chặn chia sẻ ra ngoài — hãy dùng tài khoản Gmail cá nhân)' };
  }

  ms.datQuyen = mark();
  ms.tong = ms.giaiMa + ms.timThuMuc + ms.ghiFile + ms.datQuyen;

  return { ok: true, fileId: file.getId(), name: name, bytes: bytes.length, ms: ms };
}

/** Xoá một ảnh khỏi Drive (đưa vào thùng rác, vẫn khôi phục được trong 30 ngày) */
function deletePhoto_(fileId) {
  var id = String(fileId || '').trim();
  if (!id) return { ok: false, error: 'Thiếu fileId.' };

  try {
    DriveApp.getFileById(id).setTrashed(true);
    return { ok: true, deleted: id };
  } catch (err) {
    // Ảnh đã bị xoá tay từ trước thì coi như xong, không phải lỗi
    return { ok: true, deleted: id, note: 'Không tìm thấy file, có thể đã xoá: ' + err.message };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ▶ CHẠY HÀM NÀY MỘT LẦN SAU KHI DÁN SCRIPT

   Vì sao cần: Deploy KHÔNG làm Google hỏi cấp quyền. Web App chạy bằng bộ
   quyền đã lưu từ lần bạn bấm "Đồng ý" gần nhất. Nếu lần đó script chưa có
   phần Drive, thì mọi lần tải ảnh đều lỗi "không có quyền gọi DriveApp" —
   và deploy lại bao nhiêu lần cũng không sửa được, vì deploy không đụng tới
   phần cấp quyền.

   Chỉ khi bạn CHẠY TAY một hàm có dùng tới Drive thì Google mới hiện lại hộp
   thoại xin quyền. Đó là việc của hàm này.

   Cách chạy:
     1. Trong trình soạn thảo Apps Script, chọn "CAP_QUYEN_LAN_DAU" ở ô
        danh sách hàm phía trên.
     2. Bấm nút ▶ Chạy (Run).
     3. Google hiện hộp thoại xin quyền → Nâng cao → Chuyển đến… (unsafe) →
        Cho phép. Lần này danh sách quyền phải có cả Google Drive.
     4. Xem khung Nhật ký (Execution log) bên dưới, phải ra dòng bắt đầu bằng
        "OK." kèm tên Sheet và tên thư mục ảnh.

   Sau đó mới cần deploy. Nếu vẫn lỗi quyền, mở Project Settings, bật
   "Show appsscript.json", kiểm tra oauthScopes có .../auth/drive không.
   ═══════════════════════════════════════════════════════════════════════════ */

function CAP_QUYEN_LAN_DAU() {
  var sheet = getSheet_();          // xin quyền Bảng tính
  var folder = getPhotoFolder_();   // xin quyền Drive

  var message = 'OK. Sheet: "' + sheet.getName() + '" (' + countPlaces_() + ' quán). ' +
                'Thư mục ảnh: "' + folder.getName() + '". ' +
                'Đã có đủ quyền Bảng tính và Drive — giờ deploy lại là dùng được.';

  Logger.log(message);
  return message;
}

/* ═══════════════════════════════════════════════════════════════════════════
   DUYỆT QUÁN TỪ TAB CRAWL_INBOX

   Tool crawl không được ghi thẳng vào tab chính. Nó đổ vào Crawl_Inbox, bạn
   lướt xem, tick cột "Duyệt" ở những quán ưng ý, rồi dùng menu để đưa sang.

   Menu 🍜 FoodGuide hiện ngay trên thanh công cụ của Sheet, dùng được cả trên
   app điện thoại.
   ═══════════════════════════════════════════════════════════════════════════ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🍜 FoodGuide')
    .addItem('✅ Duyệt các quán đã tick', 'DUYET_INBOX')
    .addItem('🧹 Dọn dòng trống', 'DON_DONG_TRONG')
    .addItem('🔑 Đặt token', 'DAT_TOKEN')
    .addSeparator()
    .addItem('🔑 Cấp quyền lần đầu', 'CAP_QUYEN_LAN_DAU')
    .addToUi();
}

/**
 * Xoá những dòng KHÔNG có ID, gộp dữ liệu lên sát hàng tiêu đề.
 *
 * Dùng để chữa hậu quả của bản trước: nó rải sẵn 1000 ô tick vào cột Duyệt, nên
 * getLastRow() báo 999 dòng khi tab còn trống trơn, và dữ liệu đẩy lên bị nối
 * xuống dòng 1001. Mở tab ra chỉ thấy khoảng trắng, tưởng chưa đẩy được gì.
 *
 * An toàn: chỉ đụng tới dòng có ô ID rỗng. Xoá theo từng đoạn liên tiếp và đi
 * từ dưới lên, để số dòng phía trên không bị dịch giữa chừng.
 */
function compactSheet_(sheet) {
  var physical = sheet.getLastRow();
  if (physical < 2) return 0;

  var ids = sheet.getRange(2, ID_COLUMN, physical - 1, 1).getValues();
  var removed = 0;
  var runEnd = -1;   // chỉ số cuối của đoạn trống đang gom

  for (var i = ids.length - 1; i >= 0; i--) {
    var blank = String(ids[i][0] || '').trim() === '';

    if (blank && runEnd === -1) {
      runEnd = i;
    } else if (!blank && runEnd !== -1) {
      sheet.deleteRows(i + 3, runEnd - i);   // ids[k] nằm ở dòng k+2
      removed += runEnd - i;
      runEnd = -1;
    }
  }

  if (runEnd !== -1) {
    sheet.deleteRows(2, runEnd + 1);
    removed += runEnd + 1;
  }

  return removed;
}

function DON_DONG_TRONG() {
  var ui = SpreadsheetApp.getUi();
  var report = [];

  [SHEET_NAME, INBOX_SHEET_NAME].forEach(function (name) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    if (!sheet) return;
    var removed = compactSheet_(sheet);
    report.push('• ' + name + ': xoá ' + removed + ' dòng trống, còn ' +
                Math.max(0, lastDataRow_(sheet) - 1) + ' quán');
  });

  ui.alert(report.length ? report.join('\n') : 'Không tìm thấy tab nào để dọn.');
}

function DUYET_INBOX() {
  var ui = SpreadsheetApp.getUi();
  var inbox = getSheet_(INBOX_SHEET_NAME);

  // Hai mốc khác nhau, đừng gộp làm một:
  //   lastDataRow_  = có quán thật hay chưa (bỏ qua ô tick rỗng)
  //   getLastRow()  = quét tới đâu, vì người dùng có thể tự gõ tay một dòng
  //                   thiếu ID rồi tick — dòng đó phải được BÁO là hỏng, chứ
  //                   không được lặng lẽ biến mất.
  var lastRow = inbox.getLastRow();

  if (lastDataRow_(inbox) < 2 && lastRow < 2) {
    ui.alert('Tab ' + INBOX_SHEET_NAME + ' đang trống, chưa có quán nào để duyệt.');
    return;
  }

  var approveCol = COLUMNS.length + 1;
  var values = inbox.getRange(2, 1, lastRow - 1, approveCol).getValues();

  var approved = [];
  var rowsToRemove = [];
  var skippedBadRows = 0;

  values.forEach(function (row, i) {
    if (!toBool_(row[approveCol - 1])) return;

    var place = rowToPlace_(row);
    if (!place.id || !place.name) {
      skippedBadRows++;
      return;
    }
    approved.push(place);
    rowsToRemove.push(i + 2);
  });

  if (approved.length === 0) {
    ui.alert('Chưa tick quán nào ở cột "' + INBOX_APPROVE_LABEL + '".' +
      (skippedBadRows > 0 ? '\n\n' + skippedBadRows + ' dòng đã tick nhưng thiếu ID hoặc Tên quán nên bỏ qua.' : ''));
    return;
  }

  var result = upsertMany_(approved, SHEET_NAME);

  // Xoá từ dòng dưới lên để số dòng phía trên không bị dịch
  rowsToRemove
    .sort(function (a, b) { return b - a; })
    .forEach(function (rowNumber) { inbox.deleteRow(rowNumber); });

  ui.alert(
    'Đã duyệt ' + approved.length + ' quán sang tab ' + SHEET_NAME + '.\n\n' +
    '• Thêm mới: ' + result.added + '\n' +
    '• Cập nhật quán đã có: ' + result.updated + '\n' +
    '• Còn lại trong ' + INBOX_SHEET_NAME + ': ' + countInboxRows_() +
    (skippedBadRows > 0 ? '\n\nBỏ qua ' + skippedBadRows + ' dòng thiếu ID hoặc Tên quán.' : '')
  );
}
