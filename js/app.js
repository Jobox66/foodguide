/**
 * Food & Cafe Guide - Main Application Logic
 */

// App State
const state = {
  places: [],
  categories: [],
  profile: {},
  settings: {},
  currentCategory: "all",
  searchQuery: "",
  selectedDistrict: "Tất cả quận",
  selectedPriceLevel: "all",
  selectedVerification: "all",
  sortBy: "featured",
  viewMode: "explorer", // 'explorer' (thẻ chi tiết) hoặc 'portal' (danh mục bio)
  deletedIds: new Set(),
  backendStatus: { online: false },
  sheetStatus: { online: false, configured: false, reason: "", syncing: false },
  // Thao tác chưa đẩy được lên Sheet (mất mạng, máy chủ lỗi). Nằm trong
  // LocalStorage nên đóng tab rồi mở lại vẫn còn để thử tiếp.
  sheetQueue: { upserts: {}, deletes: [] },
  theme: "light"
};

// Storage Keys
const STORAGE_KEY_PLACES = "foodguide_hanoi_places_v3";
const STORAGE_KEY_DELETED = "foodguide_hanoi_deleted_v1";
const STORAGE_KEY_PROFILE = "foodguide_hanoi_profile_v1";
const STORAGE_KEY_SETTINGS = "foodguide_hanoi_settings_v1";
const STORAGE_KEY_VIEW = "foodguide_view_mode_v1";
const STORAGE_KEY_THEME = "foodguide_theme_v1";
const STORAGE_KEY_SHEET_QUEUE = "foodguide_hanoi_sheet_queue_v1";

// DOM Elements Cache
const elements = {};

/* ===================================================================
   TIỆN ÍCH DÙNG CHUNG
   =================================================================== */

/**
 * Chặn HTML injection khi ghép chuỗi người dùng nhập vào innerHTML.
 * Không có hàm này, một tên quán chứa dấu " sẽ phá vỡ thuộc tính alt/src.
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu: "pho" khớp "Phở" */
function normalizeVi(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

/** JSON.parse an toàn — một key hỏng không được làm chết cả trang */
function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (e) {
    console.warn("Dữ liệu lưu bị hỏng, dùng giá trị mặc định:", e.message);
    return fallback;
  }
}

/**
 * Chuẩn hoá một quán. Thiếu dữ liệu thì để null (hiển thị "—"),
 * tuyệt đối không sinh giá trị giả để lấp chỗ trống.
 */
/* ───────────────────────────────────────────────────────────────────
   Hai trường dưới đây điều khiển bộ lọc, nên giá trị lạ không chỉ hiển
   thị sai mà làm quán biến mất khỏi kết quả lọc. Dữ liệu vào cẩm nang
   giờ có nhiều đường (nhập tay, Google Sheet, tool crawl), nên phải
   chuẩn hoá ngay tại cửa thay vì tin nguồn gửi tới.
   ─────────────────────────────────────────────────────────────────── */

const PRICE_LEVELS = new Set(["low", "mid", "high"]);

/** Các cách viết mức giá hay gặp, quy về đúng ba giá trị bộ lọc dùng */
const PRICE_LEVEL_ALIASES = {
  "$": "low", "$$": "mid", "$$$": "high", "$$$$": "high",
  "binh dan": "low", "re": "low", "cheap": "low", "budget": "low",
  "trung binh": "mid", "vua phai": "mid", "moderate": "mid",
  "cao cap": "high", "dat": "high", "expensive": "high", "sang trong": "high"
};

/**
 * Đưa danh mục về đúng id. Chấp nhận cả tên hiển thị ("Cà phê & Trà") vì
 * người nhập tay trong Sheet và AI parser đều hay ghi tên thay vì id.
 * Không nhận ra thì trả rỗng — quán vẫn hiện ở "Tất cả", chỉ là chưa xếp
 * danh mục. Thà để trống còn hơn gán bừa vào một danh mục sai.
 */
function normalizeCategoryId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const real = INITIAL_CATEGORIES.filter(c => c.id !== "all");
  if (real.some(c => c.id === raw)) return raw;

  const target = normalizeVi(raw);
  const byName = real.find(c => normalizeVi(c.name) === target || normalizeVi(c.id) === target);
  if (byName) return byName.id;

  // Tên đầy đủ dài hơn cách người ta thường gọi ("Ăn vặt" so với
  // "Ăn vặt & Tráng miệng"), nên thử khớp một phần — nhưng CHỈ nhận khi đúng
  // một danh mục khớp. Hai kết quả trở lên nghĩa là mập mờ, và đoán bừa lúc đó
  // còn tệ hơn để trống.
  if (target.length < 3) return "";

  const hits = real.filter(c => {
    const name = normalizeVi(c.name);
    return name.indexOf(target) !== -1 || target.indexOf(name) !== -1;
  });
  return hits.length === 1 ? hits[0].id : "";
}

/** Mức giá về low | mid | high, hoặc rỗng nếu không hiểu */
function normalizePriceLevel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (PRICE_LEVELS.has(raw)) return raw;
  return PRICE_LEVEL_ALIASES[raw] || PRICE_LEVEL_ALIASES[normalizeVi(raw)] || "";
}

function normalizePlace(place) {
  const rating = Number(place.rating);
  const reviewCount = Number(place.reviewCount);
  return {
    ...place,
    rating: Number.isFinite(rating) && rating > 0 ? Math.min(5, rating) : null,
    reviewCount: Number.isFinite(reviewCount) && reviewCount > 0 ? Math.round(reviewCount) : null,
    tags: Array.isArray(place.tags) ? place.tags : [],
    district: place.district || "",
    category: normalizeCategoryId(place.category),
    priceLevel: normalizePriceLevel(place.priceLevel),
    dataSource: place.dataSource || "seed",
    verified: place.verified === true
  };
}

function formatRating(rating) {
  return rating === null || rating === undefined ? "—" : Number(rating).toFixed(1);
}

/** Link tìm kiếm Google Maps dự phòng khi quán chưa lưu mapsUrl */
function buildMapsSearchUrl(place) {
  const query = [place.name, place.address].filter(Boolean).join(" ") || place.name || "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function formatReviewCount(count) {
  if (!count) return "";
  return count >= 1000 ? (count / 1000).toFixed(1) + "k" : String(count);
}

/** Nhãn nguồn dữ liệu hiển thị trong bảng quản lý */
const DATA_SOURCE_LABELS = {
  seed: "Dữ liệu dựng sẵn",
  google: "Google Places",
  backend: "Máy chủ giải mã link",
  osm: "OpenStreetMap",
  known: "Danh sách đối chiếu",
  link: "Link Google Maps",
  manual: "Tự nhập",
  sheet: "Google Sheet",
  import: "Nhập từ file" // dữ liệu cũ, từ thời còn nút nhập JSON
};

/**
 * Khởi động ứng dụng
 */
document.addEventListener("DOMContentLoaded", () => {
  initData();
  cacheDOMElements();
  initTheme();
  setupEventListeners();
  updateCategoryCounts();
  renderAll();
  refreshBackendStatus(); // chạy nền, không chặn lần render đầu
  syncOnOpen();           // đẩy phần đang chờ rồi kéo thay đổi từ Sheet về
  watchForReturnToTab();
});

/**
 * Tải dữ liệu từ LocalStorage hoặc bộ khởi tạo ban đầu.
 *
 * Nguyên tắc: bản lưu của người dùng là nguồn chuẩn — giữ nguyên thứ tự và
 * mọi chỉnh sửa. INITIAL_PLACES chỉ dùng để bù các trường mà bản lưu chưa có,
 * và để bổ sung quán mới xuất hiện ở phiên bản sau.
 */
function initData() {
  state.categories = [...INITIAL_CATEGORIES];
  state.deletedIds = new Set(safeParse(localStorage.getItem(STORAGE_KEY_DELETED), []));

  const defaultMap = new Map(INITIAL_PLACES.map(p => [p.id, p]));
  const saved = safeParse(localStorage.getItem(STORAGE_KEY_PLACES), null);

  let merged;
  if (Array.isArray(saved)) {
    merged = saved
      .filter(p => p && p.id && !state.deletedIds.has(p.id))
      .map(p => (defaultMap.has(p.id) ? { ...defaultMap.get(p.id), ...p } : p));

    const known = new Set(merged.map(p => p.id));
    INITIAL_PLACES.forEach(def => {
      if (!known.has(def.id) && !state.deletedIds.has(def.id)) merged.push(def);
    });
  } else {
    merged = INITIAL_PLACES.filter(p => !state.deletedIds.has(p.id));
  }

  state.places = merged.map(normalizePlace);
  state.profile = { ...DEFAULT_PROFILE, ...safeParse(localStorage.getItem(STORAGE_KEY_PROFILE), {}) };
  state.settings = { apiBaseUrl: "", ...safeParse(localStorage.getItem(STORAGE_KEY_SETTINGS), {}) };
  delete state.settings.googleApiKey; // khoá không còn được lưu phía trình duyệt
  state.viewMode = localStorage.getItem(STORAGE_KEY_VIEW) || "explorer";

  const queue = safeParse(localStorage.getItem(STORAGE_KEY_SHEET_QUEUE), null);
  state.sheetQueue = {
    upserts: queue && queue.upserts && typeof queue.upserts === "object" ? queue.upserts : {},
    deletes: queue && Array.isArray(queue.deletes) ? queue.deletes : []
  };
}

/** Ghi danh sách quán (kèm danh sách đã xoá) xuống LocalStorage */
function savePlaces() {
  try {
    localStorage.setItem(STORAGE_KEY_PLACES, JSON.stringify(state.places));
    localStorage.setItem(STORAGE_KEY_DELETED, JSON.stringify([...state.deletedIds]));
  } catch (e) {
    console.error("Lưu thất bại:", e);
    showToast("⚠️ Không lưu được dữ liệu — bộ nhớ trình duyệt đã đầy.");
  }
}

/** Vẽ lại mọi thứ phụ thuộc danh sách quán sau khi thêm/sửa/xoá */
function refreshAfterDataChange() {
  updateCategoryCounts();
  renderCategoryPills();
  renderProfile();
  renderPlaces();
}

/**
 * Cache các phần tử DOM
 */
function cacheDOMElements() {
  elements.profileAvatar = document.getElementById("profileAvatar");
  elements.profileName = document.getElementById("profileName");
  elements.profileHandle = document.getElementById("profileHandle");
  elements.profileBio = document.getElementById("profileBio");
  elements.profileStats = document.getElementById("profileStats");
  elements.socialLinksContainer = document.getElementById("socialLinksContainer");

  elements.categoryPills = document.getElementById("categoryPills");
  elements.placesContainer = document.getElementById("placesContainer");
  elements.portalContainer = document.getElementById("portalContainer");
  elements.resultsCount = document.getElementById("resultsCount");

  elements.searchInput = document.getElementById("searchInput");
  elements.searchClearBtn = document.getElementById("searchClearBtn");
  elements.districtPills = document.getElementById("districtPills");
  elements.priceChips = document.querySelectorAll(".price-chip");
  elements.sortChips = document.querySelectorAll(".sort-chip");
  elements.verifyChips = document.querySelectorAll(".verify-chip");
  elements.resetFiltersBtn = document.getElementById("resetFiltersBtn");

  elements.viewTabs = document.querySelectorAll(".view-tab");
  elements.themeToggleBtn = document.getElementById("themeToggleBtn");
  elements.shareGuideBtn = document.getElementById("shareGuideBtn");
  elements.btnAddPlace = document.getElementById("btnAddPlace");
  elements.btnOpenManager = document.getElementById("btnOpenManager");
  elements.btnExportSheets = document.getElementById("btnExportSheets");

  // Đồng bộ Google Sheet
  elements.btnSyncSheet = document.getElementById("btnSyncSheet");
  elements.sheetStatusBox = document.getElementById("sheetStatusBox");
  elements.btnSheetPush = document.getElementById("btnSheetPush");
  elements.btnSheetPull = document.getElementById("btnSheetPull");

  // Cài đặt nguồn dữ liệu
  elements.btnOpenSettings = document.getElementById("btnOpenSettings");
  elements.settingsModal = document.getElementById("settingsModal");
  elements.settingsApiBase = document.getElementById("settingsApiBase");
  elements.btnSaveSettings = document.getElementById("btnSaveSettings");
  elements.btnTestBackend = document.getElementById("btnTestBackend");
  elements.settingsTestResult = document.getElementById("settingsTestResult");
  elements.backendStatusBox = document.getElementById("backendStatusBox");
  elements.magicKeyHint = document.getElementById("magicKeyHint");

  // Magic Auto-fill
  elements.quickMapsUrlInput = document.getElementById("quickMapsUrlInput");
  elements.btnQuickAutoFill = document.getElementById("btnQuickAutoFill");

  // Place Manager Modal
  elements.placeManagerModal = document.getElementById("placeManagerModal");
  elements.managerTableBody = document.getElementById("managerTableBody");
  elements.managerSearchInput = document.getElementById("managerSearchInput");
  elements.managerDistrictFilter = document.getElementById("managerDistrictFilter");
  elements.btnManagerExportCsv = document.getElementById("btnManagerExportCsv");
  elements.btnManagerAddNew = document.getElementById("btnManagerAddNew");

  // Edit Place Modal
  elements.editPlaceModal = document.getElementById("editPlaceModal");
  elements.editPlaceForm = document.getElementById("editPlaceForm");

  // Modals
  elements.placeDetailModal = document.getElementById("placeDetailModal");
  elements.placeModalContent = document.getElementById("placeModalContent");
  elements.addPlaceModal = document.getElementById("addPlaceModal");
  elements.addPlaceForm = document.getElementById("addPlaceForm");
  elements.shareModal = document.getElementById("shareModal");
  elements.shareUrlInput = document.getElementById("shareUrlInput");
  elements.btnCopyShareUrl = document.getElementById("btnCopyShareUrl");

  // Toasts
  elements.toastContainer = document.getElementById("toastContainer");

  // Mobile Bottom Nav
  elements.mobileBottomNav = document.getElementById("mobileBottomNav");
  elements.mobileNavButtons = document.querySelectorAll(".mobile-nav-btn[data-nav-view]");
  elements.btnMobileAddPlace = document.getElementById("btnMobileAddPlace");
  elements.btnMobileManager = document.getElementById("btnMobileManager");
  elements.btnMobileTheme = document.getElementById("btnMobileTheme");
  elements.mobileThemeIcon = document.getElementById("mobileThemeIcon");
}

/**
 * Thiết lập Dark / Light Theme
 */
function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEY_THEME) || "light";
  state.theme = savedTheme;
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon();
}

function toggleTheme() {
  state.theme = state.theme === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", state.theme);
  localStorage.setItem(STORAGE_KEY_THEME, state.theme);
  updateThemeIcon();
  showToast(state.theme === "dark" ? "🌙 Đã chuyển sang chế độ Tối" : "☀️ Đã chuyển sang chế độ Sáng");
}

function updateThemeIcon() {
  if (elements.themeToggleBtn) {
    elements.themeToggleBtn.innerHTML = state.theme === "dark" ? "☀️" : "🌙";
    elements.themeToggleBtn.setAttribute("title", state.theme === "dark" ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối");
  }
  if (elements.mobileThemeIcon) {
    elements.mobileThemeIcon.innerHTML = state.theme === "dark" ? "☀️" : "🌙";
  }
}

/**
 * Cập nhật số lượng quán cho từng danh mục
 */
function updateCategoryCounts() {
  state.categories.forEach(cat => {
    if (cat.id === "all") {
      cat.count = state.places.length;
    } else {
      cat.count = state.places.filter(p => p.category === cat.id).length;
    }
  });
}

/**
 * Thiết lập các sự kiện lắng nghe
 */
function setupEventListeners() {
  // Tìm kiếm
  if (elements.searchInput) {
    elements.searchInput.addEventListener("input", (e) => {
      state.searchQuery = normalizeVi(e.target.value.trim());
      if (elements.searchClearBtn) {
        elements.searchClearBtn.classList.toggle("visible", state.searchQuery.length > 0);
      }
      renderPlaces();
    });
  }

  if (elements.searchClearBtn) {
    elements.searchClearBtn.addEventListener("click", () => {
      elements.searchInput.value = "";
      state.searchQuery = "";
      elements.searchClearBtn.classList.remove("visible");
      renderPlaces();
    });
  }

  // Lọc mức giá (Price Chips)
  document.querySelectorAll(".price-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      state.selectedPriceLevel = chip.dataset.price;
      document.querySelectorAll(".price-chip").forEach(c => {
        c.classList.toggle("active", c.dataset.price === state.selectedPriceLevel);
      });
      renderPlaces();
    });
  });

  // Sắp xếp (Sort Chips)
  document.querySelectorAll(".sort-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      state.sortBy = chip.dataset.sort;
      document.querySelectorAll(".sort-chip").forEach(c => {
        c.classList.toggle("active", c.dataset.sort === state.sortBy);
      });
      renderPlaces();
    });
  });

  // Lọc theo trạng thái xác minh
  document.querySelectorAll(".verify-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      state.selectedVerification = chip.dataset.verify;
      document.querySelectorAll(".verify-chip").forEach(c => {
        c.classList.toggle("active", c.dataset.verify === state.selectedVerification);
      });
      renderPlaces();
    });
  });

  // Đặt lại bộ lọc
  if (elements.resetFiltersBtn) {
    elements.resetFiltersBtn.addEventListener("click", resetFilters);
  }

  // Chuyển chế độ xem (View Mode Tabs Desktop)
  elements.viewTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      setViewMode(tab.dataset.view);
    });
  });

  // Mobile Bottom Navigation Events
  if (elements.mobileNavButtons) {
    elements.mobileNavButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.navView;
        setViewMode(mode);
      });
    });
  }

  if (elements.btnMobileAddPlace) {
    elements.btnMobileAddPlace.addEventListener("click", openAddPlaceModal);
  }

  if (elements.btnMobileManager) {
    elements.btnMobileManager.addEventListener("click", openPlaceManagerModal);
  }

  if (elements.btnMobileTheme) {
    elements.btnMobileTheme.addEventListener("click", toggleTheme);
  }

  // Nút theme & share Desktop
  if (elements.themeToggleBtn) {
    elements.themeToggleBtn.addEventListener("click", toggleTheme);
  }

  if (elements.shareGuideBtn) {
    elements.shareGuideBtn.addEventListener("click", openShareModal);
  }

  // Quản lý quán (Place Manager)
  if (elements.btnOpenManager) {
    elements.btnOpenManager.addEventListener("click", openPlaceManagerModal);
  }

  // Xuất file Google Sheets (.csv)
  if (elements.btnExportSheets) {
    elements.btnExportSheets.addEventListener("click", exportGoogleSheetsCSV);
  }
  if (elements.btnManagerExportCsv) {
    elements.btnManagerExportCsv.addEventListener("click", exportGoogleSheetsCSV);
  }
  if (elements.btnManagerAddNew) {
    elements.btnManagerAddNew.addEventListener("click", () => {
      closeAllModals();
      openAddPlaceModal();
    });
  }

  // Filter & Search trong bảng quản lý
  if (elements.managerSearchInput) {
    elements.managerSearchInput.addEventListener("input", renderManagerTable);
  }
  if (elements.managerDistrictFilter) {
    elements.managerDistrictFilter.addEventListener("change", renderManagerTable);
  }

  // Ô Điểm nhận thẳng cụm "4,6 (228)" copy từ Google Maps
  attachRatingParser("newPlaceRating", "newPlaceReviewCount");
  attachRatingParser("editPlaceRating", "editPlaceReviewCount");

  // Form chỉnh sửa quán
  if (elements.editPlaceForm) {
    elements.editPlaceForm.addEventListener("submit", handleEditPlaceSubmit);
  }

  // Magic Auto-fill từ Google Maps Link
  if (elements.btnQuickAutoFill) {
    elements.btnQuickAutoFill.addEventListener("click", handleMagicAutoFill);
  }
  if (elements.quickMapsUrlInput) {
    elements.quickMapsUrlInput.addEventListener("keydown", (e) => {
      // Enter chạy quét luôn; Shift+Enter để xuống dòng khi dán đoạn chia sẻ nhiều dòng
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleMagicAutoFill();
      }
    });
  }

  // Mở modal thêm quán
  if (elements.btnAddPlace) {
    elements.btnAddPlace.addEventListener("click", openAddPlaceModal);
  }

  // Form thêm quán
  if (elements.addPlaceForm) {
    elements.addPlaceForm.addEventListener("submit", handleAddPlaceSubmit);
  }

  // Tải ảnh quán lên Drive
  attachPhotoUploader("newPlace", () => "");
  attachPhotoUploader("editPlace", () => {
    const idField = document.getElementById("editPlaceId");
    return idField ? idField.value : "";
  });

  // Đồng bộ Google Sheet
  if (elements.btnSyncSheet) {
    elements.btnSyncSheet.addEventListener("click", syncWithSheet);
  }
  if (elements.btnSheetPush) {
    elements.btnSheetPush.addEventListener("click", pushAllToSheet);
  }
  if (elements.btnSheetPull) {
    elements.btnSheetPull.addEventListener("click", () => pullFromSheet({ silent: false }));
  }

  // Cài đặt nguồn dữ liệu
  if (elements.btnOpenSettings) {
    elements.btnOpenSettings.addEventListener("click", openSettingsModal);
  }
  if (elements.btnSaveSettings) {
    elements.btnSaveSettings.addEventListener("click", saveSettings);
  }
  if (elements.btnTestBackend) {
    elements.btnTestBackend.addEventListener("click", testBackend);
  }

  // Đóng modal khi click ra ngoài hoặc nút close
  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.classList.remove("active");
      }
    });
  });

  document.querySelectorAll(".modal-close-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const overlay = btn.closest(".modal-overlay");
      if (overlay) overlay.classList.remove("active");
    });
  });

  // Phím ESC chỉ đóng modal trên cùng (sửa quán mở trên bảng quản lý thì
  // đóng form sửa vẫn giữ bảng quản lý đang mở)
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = [...document.querySelectorAll(".modal-overlay.active")];
    if (open.length > 0) open[open.length - 1].classList.remove("active");
  });

  // Sao chép link chia sẻ
  if (elements.btnCopyShareUrl) {
    elements.btnCopyShareUrl.addEventListener("click", copyShareUrl);
  }
}

/**
 * Đặt lại tất cả bộ lọc
 */
function resetFilters() {
  state.searchQuery = "";
  state.selectedDistrict = "Tất cả quận";
  state.selectedPriceLevel = "all";
  state.selectedVerification = "all";
  state.sortBy = "featured";
  state.currentCategory = "all";

  if (elements.searchInput) elements.searchInput.value = "";
  if (elements.searchClearBtn) elements.searchClearBtn.classList.remove("visible");

  // Reset active classes on District Chips
  if (elements.districtPills) {
    elements.districtPills.querySelectorAll(".district-chip").forEach(c => {
      c.classList.toggle("active", c.dataset.district === "Tất cả quận");
    });
  }

  // Reset Price Chips
  document.querySelectorAll(".price-chip").forEach(p => {
    p.classList.toggle("active", p.dataset.price === "all");
  });

  // Reset Sort Chips
  document.querySelectorAll(".sort-chip").forEach(s => {
    s.classList.toggle("active", s.dataset.sort === "featured");
  });

  // Reset Verify Chips
  document.querySelectorAll(".verify-chip").forEach(v => {
    v.classList.toggle("active", v.dataset.verify === "all");
  });

  renderCategoryPills();
  renderPlaces();
  showToast("🔄 Đã đặt lại tất cả bộ lọc");
}

/**
 * Render toàn bộ giao diện
 */
function renderAll() {
  renderProfile();
  renderDistrictsPills();
  renderCategoryPills();
  renderViewMode();
}

/**
 * Render Profile tác giả
 */
function renderProfile() {
  if (elements.profileAvatar) elements.profileAvatar.src = state.profile.avatar;
  if (elements.profileName) elements.profileName.textContent = state.profile.name;
  if (elements.profileHandle) elements.profileHandle.textContent = state.profile.handle;
  if (elements.profileBio) elements.profileBio.textContent = state.profile.bio;

  if (elements.profileStats) {
    const verifiedCount = state.places.filter(p => p.verified).length;
    elements.profileStats.innerHTML = `
      <div class="stat-item">📍 <strong>${state.places.length}</strong> địa điểm</div>
      <div class="stat-item">✅ <strong>${verifiedCount}</strong> đã xác minh</div>
      <div class="stat-item">🏷️ <strong>${state.categories.length - 1}</strong> danh mục</div>
      <div class="stat-item">🏙️ <strong>Hà Nội</strong></div>
    `;
  }

  if (elements.socialLinksContainer && state.profile.socials) {
    const socials = state.profile.socials;
    let html = "";
    if (socials.facebook) html += `<a href="${escapeHtml(socials.facebook)}" target="_blank" rel="noopener" class="social-chip">📘 Facebook</a>`;
    if (socials.instagram) html += `<a href="${escapeHtml(socials.instagram)}" target="_blank" rel="noopener" class="social-chip">📸 Instagram</a>`;
    if (socials.tiktok) html += `<a href="${escapeHtml(socials.tiktok)}" target="_blank" rel="noopener" class="social-chip">🎵 TikTok</a>`;
    if (socials.threads) html += `<a href="${escapeHtml(socials.threads)}" target="_blank" rel="noopener" class="social-chip">🧵 Threads</a>`;
    elements.socialLinksContainer.innerHTML = html;
  }
}

/**
 * Render thanh cuộn ngang danh sách quận (District Chips)
 */
function renderDistrictsPills() {
  if (!elements.districtPills) return;
  let html = "";
  DISTRICTS.forEach(d => {
    const isActive = state.selectedDistrict === d ? "active" : "";
    const icon = d === "Tất cả quận" ? "📍" : "🏙️";
    html += `
      <button class="filter-chip district-chip ${isActive}" data-district="${escapeHtml(d)}">
        ${icon} ${escapeHtml(d)}
      </button>
    `;
  });
  elements.districtPills.innerHTML = html;

  // Lắng nghe sự kiện click trên từng chip quận
  elements.districtPills.querySelectorAll(".district-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      state.selectedDistrict = chip.dataset.district;
      elements.districtPills.querySelectorAll(".district-chip").forEach(c => {
        c.classList.toggle("active", c.dataset.district === state.selectedDistrict);
      });
      renderPlaces();
    });
  });
}

/**
 * Render thanh cuộn danh mục (Category Pills)
 */
function renderCategoryPills() {
  if (!elements.categoryPills) return;
  updateCategoryCounts();

  let html = "";
  state.categories.forEach(cat => {
    const isActive = state.currentCategory === cat.id ? "active" : "";
    html += `
      <button class="cat-pill ${isActive}" data-cat-id="${escapeHtml(cat.id)}">
        <span class="cat-icon">${escapeHtml(cat.icon)}</span>
        <span class="cat-name">${escapeHtml(cat.name)}</span>
        <span class="cat-count">${cat.count}</span>
      </button>
    `;
  });

  elements.categoryPills.innerHTML = html;

  // Gắn sự kiện click
  elements.categoryPills.querySelectorAll(".cat-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      state.currentCategory = btn.dataset.catId;
      renderCategoryPills();
      
      // Nếu đang ở Portal view, tự động chuyển sang Explorer để xem các quán của danh mục
      if (state.viewMode === "portal" && state.currentCategory !== "all") {
        setViewMode("explorer");
      } else {
        renderPlaces();
      }
    });
  });
}

/**
 * Thiết lập và hiển thị theo View Mode (Explorer / Portal)
 */
function setViewMode(mode) {
  state.viewMode = mode;
  localStorage.setItem(STORAGE_KEY_VIEW, mode);
  
  // Đồng bộ Desktop Tabs
  if (elements.viewTabs) {
    elements.viewTabs.forEach(t => {
      const isActive = t.dataset.view === mode;
      t.classList.toggle("active", isActive);
      t.setAttribute("aria-selected", String(isActive));
    });
  }

  // Đồng bộ Mobile Bottom Nav
  if (elements.mobileNavButtons) {
    elements.mobileNavButtons.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.navView === mode);
    });
  }

  renderViewMode();
}

function renderViewMode() {
  if (state.viewMode === "portal") {
    elements.portalContainer.style.display = "block";
    elements.placesContainer.style.display = "none";
    document.querySelector(".filters-panel").style.display = "none";
    document.querySelector(".results-header").style.display = "none";
    renderPortalView();
  } else {
    elements.portalContainer.style.display = "none";
    elements.placesContainer.style.display = "grid";
    document.querySelector(".filters-panel").style.display = "block";
    document.querySelector(".results-header").style.display = "flex";
    renderPlaces();
  }
}

/**
 * Render Chế độ Danh mục (Portal / Linkbio View phong cách oreviet)
 */
function renderPortalView() {
  if (!elements.portalContainer) return;

  // Danh mục có quán xếp trước, danh mục rỗng làm mờ ở cuối
  const validCategories = state.categories
    .filter(c => c.id !== "all")
    .map(c => ({ ...c, places: state.places.filter(p => p.category === c.id) }))
    .sort((x, y) => y.places.length - x.places.length);

  let html = `<div class="portal-categories-grid">`;

  validCategories.forEach(cat => {
    const count = cat.places.length;
    const isEmpty = count === 0;
    const mapsLink = cat.mapsUrl || `https://www.google.com/maps/search/${encodeURIComponent(cat.name + " Hà Nội")}`;

    html += `
      <div class="portal-cat-card${isEmpty ? " is-empty" : ""}">
        <div>
          <div class="portal-cat-header">
            <div class="portal-cat-icon">${escapeHtml(cat.icon)}</div>
            <div>
              <h3 class="portal-cat-title">${escapeHtml(cat.name)}</h3>
              <p class="portal-cat-desc">${escapeHtml(cat.description)}</p>
            </div>
          </div>
          <div class="stat-item" style="margin-top: 8px;">
            ${isEmpty
              ? `📭 <strong>Chưa có quán nào</strong> trong danh mục này`
              : `✨ Có <strong>${count} quán</strong> được chọn lọc & đánh giá`}
          </div>
        </div>

        <div class="portal-cat-actions">
          <a href="${escapeHtml(mapsLink)}" target="_blank" rel="noopener" class="btn-open-maps-list">
            📍 Mở trên Google Maps
          </a>
          <button class="btn-explore-cat" data-cat="${escapeHtml(cat.id)}" ${isEmpty ? "disabled" : ""}>
            ${isEmpty ? "Chưa có quán" : `🔍 Xem quán (${count})`}
          </button>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  elements.portalContainer.innerHTML = html;

  // Lắng nghe sự kiện "Xem quán" từ Portal Card
  elements.portalContainer.querySelectorAll(".btn-explore-cat").forEach(btn => {
    btn.addEventListener("click", () => {
      const catId = btn.dataset.cat;
      state.currentCategory = catId;
      renderCategoryPills();
      setViewMode("explorer");
    });
  });
}

/**
 * Lọc và sắp xếp danh sách quán
 */
function getFilteredPlaces() {
  return state.places.filter(place => {
    // Lọc theo Danh mục
    if (state.currentCategory !== "all" && place.category !== state.currentCategory) {
      return false;
    }

    // Lọc theo Quận
    if (state.selectedDistrict !== "Tất cả quận" && place.district !== state.selectedDistrict) {
      return false;
    }

    // Lọc theo Mức giá
    if (state.selectedPriceLevel !== "all" && place.priceLevel !== state.selectedPriceLevel) {
      return false;
    }

    // Lọc theo trạng thái xác minh dữ liệu
    if (state.selectedVerification === "verified" && !place.verified) return false;
    if (state.selectedVerification === "unverified" && place.verified) return false;

    // Tìm kiếm từ khóa, bỏ dấu tiếng Việt (tên quán, địa chỉ, must-try, review, tags)
    if (state.searchQuery) {
      const q = state.searchQuery;
      const haystack = normalizeVi([
        place.name,
        place.address,
        place.district,
        place.mustTry,
        place.review,
        (place.tags || []).join(" ")
      ].join(" "));

      if (!haystack.includes(q)) return false;
    }

    return true;
  }).sort((a, b) => {
    // Quán chưa có điểm được xếp sau cùng thay vì bị NaN đẩy lung tung
    const ratingOf = p => (p.rating === null ? -1 : p.rating);

    if (state.sortBy === "rating") {
      return ratingOf(b) - ratingOf(a);
    } else if (state.sortBy === "name") {
      return String(a.name || "").localeCompare(String(b.name || ""), "vi");
    } else if (state.sortBy === "featured") {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return ratingOf(b) - ratingOf(a);
    }
    return 0;
  });
}

/**
 * Render danh sách thẻ quán ăn (Explorer View)
 */
function renderPlaces() {
  if (!elements.placesContainer) return;

  const filteredPlaces = getFilteredPlaces();

  if (elements.resultsCount) {
    elements.resultsCount.innerHTML = `Hiển thị <strong>${filteredPlaces.length}</strong> / ${state.places.length} địa điểm`;
  }

  if (filteredPlaces.length === 0) {
    elements.placesContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🍽️🔍</div>
        <h3 class="empty-title">Không tìm thấy quán phù hợp</h3>
        <p class="empty-desc">Thử tìm kiếm với từ khóa khác hoặc xóa bớt các bộ lọc xem sao nhé!</p>
        <button class="btn-submit" style="max-width: 220px; margin: 0 auto;" onclick="resetFilters()">
          Đặt lại bộ lọc
        </button>
      </div>
    `;
    return;
  }

  const FALLBACK_IMG = "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80";

  let html = "";
  filteredPlaces.forEach(place => {
    const categoryObj = state.categories.find(c => c.id === place.category) || {};
    const categoryName = categoryObj.name ? categoryObj.name.split("(")[0].trim() : place.category;
    const reviewText = formatReviewCount(place.reviewCount);

    html += `
      <div class="place-card" data-id="${escapeHtml(place.id)}">
        <div class="place-image-wrapper">
          <img src="${escapeHtml(photoSrc(place.image, 600) || FALLBACK_IMG)}"
               alt="${escapeHtml(place.name)}"
               class="place-img"
               loading="lazy"
               onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
          <div class="place-district-badge">📍 ${escapeHtml(place.district || "Chưa rõ quận")}</div>
          <div class="place-badge-rating">
            ★ ${formatRating(place.rating)}${reviewText ? ` <span style="font-size: 0.72rem; opacity: 0.85; margin-left: 2px;">(${reviewText})</span>` : ""}
          </div>
        </div>

        <div class="place-card-body">
          <div class="place-flag-row">
            <span class="place-category-tag">${escapeHtml(categoryObj.icon || "🍜")} ${escapeHtml(categoryName)}</span>
            ${place.verified
              ? `<span class="verified-flag" title="Bạn đã đối chiếu thông tin này với Google Maps">✅ Đã xác minh</span>`
              : `<span class="unverified-flag" title="Số sao, giá và review chưa được đối chiếu với Google Maps">⚠️ Chưa xác minh</span>`}
          </div>

          <h3 class="place-title" data-open-place="${escapeHtml(place.id)}">${escapeHtml(place.name)}</h3>

          <div class="place-meta-row">
            <span class="meta-item price-tag">💵 ${place.priceRange ? escapeHtml(place.priceRange) : '<span class="value-missing">Chưa có giá</span>'}</span>
            ${place.time ? `<span class="meta-item">⏰ ${escapeHtml(place.time)}</span>` : ""}
          </div>

          ${place.mustTry ? `
            <div class="must-try-box">
              <div class="must-try-label">✨ Món Must-Try:</div>
              <div class="must-try-content">${escapeHtml(place.mustTry)}</div>
            </div>
          ` : ""}

          ${place.review
            ? `<p class="place-review-snippet">"${escapeHtml(place.review)}"</p>`
            : `<p class="place-review-snippet value-missing">Chưa có nhận xét — bấm Sửa để thêm cảm nhận của bạn.</p>`}

          <div class="place-tags-row">
            ${(place.tags || []).slice(0, 3).map(tag => `<span class="sub-tag">#${escapeHtml(tag)}</span>`).join("")}
          </div>

          <div class="place-card-actions">
            <a href="${escapeHtml(place.mapsUrl || buildMapsSearchUrl(place))}" target="_blank" rel="noopener" class="btn-open-maps">
              📍 Mở Google Maps
            </a>
            <button class="btn-view-details" data-open-place="${escapeHtml(place.id)}">
              Chi tiết
            </button>
          </div>
        </div>
      </div>
    `;
  });

  elements.placesContainer.innerHTML = html;

  // Gắn sự kiện thay cho onclick inline (tránh vỡ markup khi tên quán có dấu nháy)
  elements.placesContainer.querySelectorAll("[data-open-place]").forEach(el => {
    el.addEventListener("click", () => openPlaceDetailModal(el.dataset.openPlace));
  });
}

/**
 * Mở Modal chi tiết quán ăn
 */
function openPlaceDetailModal(placeId) {
  const place = state.places.find(p => p.id === placeId);
  if (!place || !elements.placeModalContent) return;

  const categoryObj = state.categories.find(c => c.id === place.category) || {};
  const FALLBACK_IMG = "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80";

  const mapsUrl = place.mapsUrl || buildMapsSearchUrl(place);
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([place.name, place.address].filter(Boolean).join(" "))}`;
  const missing = '<span class="value-missing">Chưa có dữ liệu</span>';

  elements.placeModalContent.innerHTML = `
    <img src="${escapeHtml(photoSrc(place.image, 1200) || FALLBACK_IMG)}"
         alt="${escapeHtml(place.name)}"
         class="modal-hero-img"
         onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">

    <div class="modal-body">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px;">
        <span class="place-category-tag">${escapeHtml(categoryObj.icon || "🍽️")} ${escapeHtml(categoryObj.name || place.category)}</span>
        <span class="place-badge-rating" style="position: static; font-size: 0.95rem;">
          ★ ${formatRating(place.rating)} / 5.0 ${place.reviewCount ? `(${place.reviewCount.toLocaleString("vi-VN")} đánh giá)` : ""}
        </span>
      </div>

      <div class="place-flag-row">
        ${place.verified
          ? `<span class="verified-flag">✅ Đã đối chiếu với Google Maps</span>`
          : `<span class="unverified-flag">⚠️ Chưa xác minh — số liệu có thể không chính xác</span>`}
        <span class="source-tag">Nguồn: ${escapeHtml(DATA_SOURCE_LABELS[place.dataSource] || place.dataSource)}</span>
      </div>

      <h2 class="modal-title">${escapeHtml(place.name)}</h2>

      <div class="place-meta-row" style="margin-bottom: 16px; font-size: 0.9rem;">
        <span class="meta-item">📍 <strong>Địa chỉ:</strong> ${place.address ? escapeHtml(place.address) : missing}</span>
      </div>

      <div class="place-meta-row" style="margin-bottom: 16px;">
        <span class="meta-item price-tag">💵 <strong>Khoảng giá:</strong> ${place.priceRange ? escapeHtml(place.priceRange) : missing}</span>
        <span class="meta-item">⏰ <strong>Giờ mở cửa:</strong> ${place.time ? escapeHtml(place.time) : missing}</span>
      </div>

      ${place.mustTry ? `
        <div class="must-try-box" style="margin-bottom: 18px; padding: 12px 16px;">
          <div class="must-try-label" style="font-size: 0.95rem;">🌟 Món đặc trưng nhất định phải thử:</div>
          <div class="must-try-content" style="font-size: 0.92rem; margin-top: 4px;">${escapeHtml(place.mustTry)}</div>
        </div>
      ` : ""}

      <div style="margin-bottom: 18px;">
        <h4 style="font-size: 0.95rem; font-weight: 800; margin-bottom: 6px;">📝 Đánh giá & Cảm nhận:</h4>
        <p style="color: var(--text-main); font-size: 0.92rem; line-height: 1.6; background: var(--bg-page); padding: 12px 16px; border-radius: 8px; border-left: 3px solid var(--primary);">
          ${place.review ? escapeHtml(place.review) : '<span class="value-missing">Bạn chưa viết nhận xét cho quán này.</span>'}
        </p>
      </div>

      ${place.tags && place.tags.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <h4 style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 8px;">TAGS / ĐẶC ĐIỂM:</h4>
          <div class="place-tags-row">
            ${place.tags.map(t => `<span class="sub-tag" style="font-size: 0.8rem; padding: 4px 10px;">#${escapeHtml(t)}</span>`).join("")}
          </div>
        </div>
      ` : ""}

      <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 20px;">
        <a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener" class="btn-open-maps" style="padding: 12px; font-size: 0.95rem;">
          📍 Mở xem vị trí trên Google Maps
        </a>
        <a href="${escapeHtml(directionsUrl)}" target="_blank" rel="noopener" class="btn-submit" style="text-align: center; text-decoration: none; padding: 12px; font-size: 0.95rem; margin-top: 0; background: #10B981; border-color: #059669; box-shadow: 2px 2px 0px #059669;">
          🚗 Chỉ đường trực tiếp đến quán
        </a>
      </div>
    </div>
  `;

  elements.placeDetailModal.classList.add("active");
}

/**
 * Mở Modal thêm quán mới
 */
function openAddPlaceModal() {
  if (!elements.addPlaceModal) return;

  // Xoá dữ liệu của lần thêm trước để không lẫn sang quán mới
  if (elements.addPlaceForm) elements.addPlaceForm.reset();
  if (elements.quickMapsUrlInput) elements.quickMapsUrlInput.value = "";
  const sourceField = document.getElementById("newPlaceDataSource");
  if (sourceField) sourceField.value = "manual";
  resetPhotoField("newPlace", "");

  // Danh mục — có lựa chọn trống để không bị gán bừa khi chưa nhận diện được
  const catSelect = document.getElementById("newPlaceCategory");
  if (catSelect) {
    let catHtml = `<option value="">— Chưa chọn danh mục —</option>`;
    state.categories.filter(c => c.id !== "all").forEach(c => {
      catHtml += `<option value="${escapeHtml(c.id)}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`;
    });
    catSelect.innerHTML = catHtml;
  }

  // Quận — cũng có lựa chọn trống thay vì mặc định "Hoàn Kiếm"
  const distSelect = document.getElementById("newPlaceDistrict");
  if (distSelect) {
    let distHtml = `<option value="">— Chưa rõ quận —</option>`;
    DISTRICTS.filter(d => d !== "Tất cả quận").forEach(d => {
      distHtml += `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`;
    });
    distSelect.innerHTML = distHtml;
  }

  // Mức giá — bỏ mặc định "mid" để không khẳng định điều chưa biết
  const priceSelect = document.getElementById("newPlacePriceLevel");
  if (priceSelect && !priceSelect.querySelector('option[value=""]')) {
    priceSelect.insertAdjacentHTML("afterbegin", `<option value="">— Chưa rõ mức giá —</option>`);
  }
  if (priceSelect) priceSelect.value = "";

  updateMagicKeyHint();
  elements.addPlaceModal.classList.add("active");
}

/** Ẩn/hiện gợi ý thêm khoá API tuỳ theo đã cấu hình hay chưa */
function updateMagicKeyHint() {
  if (!elements.magicKeyHint) return;

  // Máy chủ chạy bình thường thì không cần nhắc gì
  if (state.backendStatus.online) {
    elements.magicKeyHint.style.display = "none";
    return;
  }

  elements.magicKeyHint.style.display = "";
  elements.magicKeyHint.innerHTML =
    `🔌 Chưa kết nối được máy chủ — link rút gọn <code>maps.app.goo.gl</code> có thể không đọc được.
     Hãy dán URL đầy đủ trên thanh địa chỉ, hoặc
     <a href="javascript:void(0)" onclick="openSettingsModal()">kiểm tra cài đặt</a>.`;
}

// Danh mục dữ liệu nhận diện nhanh 0ms cho các link rút gọn Google Maps đã xác thực
const KNOWN_MAPS_SHORTLINKS = {
  "a1vpshb65gp5szff7": {
    name: "Cộng Cà Phê - Lạc Long Quân",
    address: "677 Lạc Long Quân, Phú Thượng, Tây Hồ, Hà Nội",
    district: "Tây Hồ",
    category: "cafe-chill",
    priceRange: "1.000đ - 100.000đ",
    priceLevel: "low",
    rating: 4.5,
    reviewCount: 228,
    time: "07:00 - 23:30",
    mustTry: "Cà phê cốt dừa béo ngậy / Bạc xỉu cốt dừa / Trà cam quế",
    review: "Không gian thời bao cấp đặc trưng với khoảng sân vườn rộng rãi rợp bóng cây xanh ngay mặt phố Lạc Long Quân gần Hồ Tây. Thích hợp tụ tập bạn bè, làm việc hoặc ngắm phố xá.",
    tags: ["Cộng Cà Phê", "Cốt dừa", "Lạc Long Quân", "Tây Hồ", "Sân vườn"],
    image: "https://images.unsplash.com/photo-1507133750040-3a7f57a05f47?auto=format&fit=crop&w=800&q=80"
  },
  "6tzvvfbjier63saq6": {
    name: "Hôm Nào Cà Phê",
    address: "Số 10, Ngõ 82 Nghĩa Tân, Cầu Giấy, Hà Nội",
    district: "Cầu Giấy",
    category: "cafe-chill",
    priceRange: "30.000đ - 60.000đ",
    priceLevel: "low",
    rating: 4.7,
    reviewCount: 380,
    time: "07:00 - 23:00",
    mustTry: "Cà phê cốt dừa béo ngậy / Trà đào cam sả / Cà phê sữa truyền thống",
    review: "Quán cafe sân vườn xanh mát ngập tràn ánh sáng và cây xanh, không gian ấm cúng mộc mạc thích hợp học tập, làm việc hoặc hẹn hò bạn bè.",
    tags: ["Không gian xanh", "Sân vườn", "Nghĩa Tân", "Cầu Giấy", "Học tập"],
    image: "https://lh3.googleusercontent.com/p/AF1QipM9lSO1Tf0u7Yx1OZy7vVR713akEbdZS803QcCN=w960-h720-k-no"
  },
  "7eidn2uffg2raukt5": {
    name: "Tiny Cafe | Sky Garden",
    address: "Tầng 19A, 169 Nguyễn Ngọc Vũ, Trung Hòa, Cầu Giấy, Hà Nội",
    district: "Cầu Giấy",
    category: "cafe-chill",
    priceRange: "35.000đ - 60.000đ",
    priceLevel: "low",
    rating: 4.6,
    reviewCount: 520,
    time: "07:30 - 23:00",
    mustTry: "Cà phê trứng béo ngậy / Trà đào cam sả / Bạc xỉu cốt dừa",
    review: "Quán cafe rooftop view sân vườn trên cao cực chill tại tầng 19A Nguyễn Ngọc Vũ. Không gian thoáng đãng ngắm trọn hoàng hôn và thành phố lên đèn, đồ uống đa dạng cùng phong cách vintage xinh xắn.",
    tags: ["Rooftop", "Sky Garden", "Nguyễn Ngọc Vũ", "Cầu Giấy", "View đẹp", "Hoàng hôn"],
    image: "https://lh3.googleusercontent.com/p/AF1QipNXo691F61a9h372k8yR9bZ19w6_81923=s1200-w1200-h800"
  },
  "9xsg8vedj3xgow8rt": {
    name: "Tiny Cafe | Sky Garden",
    address: "Tầng 19A, 169 Nguyễn Ngọc Vũ, Trung Hòa, Cầu Giấy, Hà Nội",
    district: "Cầu Giấy",
    category: "cafe-chill",
    priceRange: "35.000đ - 60.000đ",
    priceLevel: "low",
    rating: 4.6,
    reviewCount: 520,
    time: "07:30 - 23:00",
    mustTry: "Cà phê trứng béo ngậy / Trà đào cam sả / Bạc xỉu cốt dừa",
    review: "Quán cafe rooftop view sân vườn trên cao cực chill tại tầng 19A Nguyễn Ngọc Vũ. Không gian thoáng đãng ngắm trọn hoàng hôn và thành phố lên đèn, đồ uống đa dạng cùng phong cách vintage xinh xắn.",
    tags: ["Rooftop", "Sky Garden", "Nguyễn Ngọc Vũ", "Cầu Giấy", "View đẹp", "Hoàng hôn"],
    image: "https://lh3.googleusercontent.com/p/AF1QipNXo691F61a9h372k8yR9bZ19w6_81923=s1200-w1200-h800"
  },
  "gaaea84pqxp5qx5t8": {
    name: "Annamoi - trà và cà phê thủ công",
    address: "21 - 23 Hàng Bún, Ba Đình, Hà Nội",
    district: "Ba Đình",
    category: "cafe-chill",
    priceRange: "35.000đ - 65.000đ",
    priceLevel: "low",
    rating: 4.8,
    reviewCount: 320,
    time: "08:00 - 22:30",
    mustTry: "Cà phê muối béo ngậy / Trà thủ công ủ lạnh / Cà phê pha phin truyền thống",
    review: "Không gian vintage nhiều cây xanh thoáng đãng, đồ uống pha chế thủ công đậm đà. Nổi bật với cà phê muối thơm béo ngậy và các loại trà hoa quả thủ công thanh mát.",
    tags: ["Cà phê muối", "Trà thủ công", "Hàng Bún", "Ba Đình", "Vintage"],
    image: "https://lh3.googleusercontent.com/p/AF1QipM4p1hYj8-Nkmq223wK9E6hN81m2u5f=s1200-w1200-h800"
  },
  "mdakp1vlj2ipjgpzr": {
    name: "Phiên",
    address: "19 P. Ngọc Hà, Đội Cấn, Ba Đình, Hà Nội 100000",
    district: "Ba Đình",
    category: "cafe-chill",
    priceRange: "30.000đ - 55.000đ",
    priceLevel: "low",
    rating: 4.8,
    reviewCount: 450,
    time: "07:30 - 22:30",
    mustTry: "Trà thảo mộc thanh nhiệt / Cà phê cốt dừa / Nước ép hoa quả tươi",
    review: "Quán nước không gian mộc mạc, yên tĩnh và rất chill nằm ngay phố Ngọc Hà gần Bảo tàng Hồ Chí Minh. Đồ uống thanh mát, giá cả bình dân và nhân viên thân thiện.",
    tags: ["Quán nước", "Ngọc Hà", "Ba Đình", "Yên tĩnh", "Check-in"],
    image: "https://lh3.googleusercontent.com/p/AF1QipN9p1hYj8-Nkmq223wK9E6hN81m2u5f=s1200-w1200-h800"
  },
  "liewtxqpywyqilqnb": {
    name: "Bít Tết Ba Duy",
    address: "105N3, Ngõ 34 Phố Vạn Bảo, Ngọc Hà, Ba Đình, Hà Nội",
    district: "Ba Đình",
    category: "do-a-au",
    priceRange: "80.000đ - 150.000đ / người",
    priceLevel: "mid",
    rating: 4.8,
    reviewCount: 574,
    time: "07:00 - 21:30",
    mustTry: "Bít tết bò chảo gang xèo xèo + Bánh mì nướng giòn + Trứng ốp la lòng đào",
    review: "Bít tết thịt bò tươi mềm ngọt ngấm sốt đậm đà thơm nức trên chảo gang nóng xèo xèo, ăn kèm bánh mì nướng giòn rụm và dưa nộm thanh mát cực bắt miệng!",
    tags: ["Bít tết", "Chảo gang", "Vạn Bảo", "Ba Đình", "Ăn no"],
    image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80"
  }
};

/* ===================================================================
   ĐỌC DỮ LIỆU THẬT TỪ LINK GOOGLE MAPS

   Nguyên tắc: chỉ điền những gì đọc được thật. Ô nào không tra ra
   thì để trống cho người dùng tự nhập — không sinh số liệu giả.

   Thứ tự thử:
     1. Từ điển link đã đối chiếu tay (KNOWN_MAPS_SHORTLINKS)
     2. Bóc trực tiếp từ URL đầy đủ  -> tên + toạ độ, không cần mạng
     3. Giải mã link rút gọn qua CORS proxy (best-effort, có thể hỏng)
     4. Đoạn text người dùng dán kèm (nút Chia sẻ của app Google Maps)
     5. Google Places API nếu có khoá -> số sao, lượt đánh giá, giờ, ảnh THẬT
     6. Nominatim/OpenStreetMap -> địa chỉ + quận THẬT từ toạ độ
   =================================================================== */

const SHORTLINK_HOSTS = ["maps.app.goo.gl", "share.google", "goo.gl", "g.co"];

function isShortMapsLink(url) {
  return SHORTLINK_HOSTS.some(host => url.includes(host));
}

/** Giải mã một đoạn URL Google Maps (có thể bị mã hoá 2 lần khi nằm trong HTML) */
function decodeMapsSegment(segment) {
  let out = String(segment).replace(/\+/g, " ");
  for (let i = 0; i < 2 && /%[0-9A-Fa-f]{2}/.test(out); i++) {
    try {
      out = decodeURIComponent(out);
    } catch (e) {
      break;
    }
    out = out.replace(/\+/g, " ");
  }
  return out.trim();
}

/**
 * Bóc tên quán + toạ độ ngay từ chuỗi URL, không cần gọi mạng.
 * Đây là đường đi tin cậy nhất: URL đầy đủ trên thanh địa chỉ trình duyệt
 * luôn chứa /maps/place/<Tên>/@<lat>,<lng> và !3d<lat>!4d<lng>.
 */
function parseMapsUrl(url) {
  const result = { name: "", address: "", lat: null, lng: null };
  if (!url) return result;

  const placeMatch = url.match(/\/maps\/place\/([^/@?#]+)/);
  if (placeMatch) {
    const decoded = decodeMapsSegment(placeMatch[1]);
    const parts = decoded.split(",");
    result.name = parts[0].trim();
    if (parts.length > 1) result.address = parts.slice(1).join(",").trim();
  }

  if (!result.name) {
    const queryMatch = url.match(/[?&](?:q|query)=([^&#]+)/);
    if (queryMatch) {
      const decoded = decodeMapsSegment(queryMatch[1]);
      // Bỏ qua nếu q= chỉ là một cặp toạ độ
      if (!/^-?[\d.]+\s*,\s*-?[\d.]+$/.test(decoded)) {
        const parts = decoded.split(",");
        result.name = parts[0].trim();
        if (parts.length > 1) result.address = parts.slice(1).join(",").trim();
      }
    }
  }

  // !3d/!4d là toạ độ CỦA QUÁN; @lat,lng chỉ là tâm khung nhìn nên kém chính xác hơn
  const exact = url.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/);
  const viewport = url.match(/@(-?[\d.]+),(-?[\d.]+)/);
  const coord = exact || viewport;
  if (coord) {
    const lat = parseFloat(coord[1]);
    const lng = parseFloat(coord[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      result.lat = lat;
      result.lng = lng;
    }
  }

  return result;
}

/**
 * Giải mã link rút gọn qua CORS proxy công cộng.
 *
 * Gọi SONG SONG rồi lấy kết quả về đầu tiên: các proxy miễn phí thường
 * chết hoặc hết hạn mức, gọi tuần tự sẽ bắt người dùng chờ cộng dồn
 * hết timeout này đến timeout khác. Song song thì chờ tối đa 6 giây.
 * Thất bại cũng không sao — luồng chính vẫn chạy tiếp bằng text dán kèm.
 */
async function resolveShortLink(url) {
  const proxies = [
    target => `https://api.cors.lol/?url=${encodeURIComponent(target)}`,
    target => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    target => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    target => `https://corsproxy.io/?url=${encodeURIComponent(target)}`
  ];

  const attempts = proxies.map(async buildUrl => {
    const res = await fetch(buildUrl(url), { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`proxy trả về ${res.status}`);

    const body = await res.text();
    // Proxy hết hạn mức thường trả JSON lỗi rất ngắn - đừng nhận nhầm là HTML
    if (!body || body.length < 500) throw new Error("phản hồi quá ngắn");

    const hit = body.match(/\/maps\/place\/[^"'\\<>\s]{3,300}/);
    if (!hit) throw new Error("không tìm thấy /maps/place/ trong phản hồi");

    // Regex đã dừng ở ranh giới ký tự thoát nên đoạn bắt được luôn là đường dẫn sạch
    return "https://www.google.com" + hit[0];
  });

  try {
    return await Promise.any(attempts);
  } catch (e) {
    console.warn("Không proxy nào giải mã được link rút gọn.");
    return null;
  }
}

/** Chuẩn hoá tên quận từ dữ liệu OpenStreetMap về đúng danh sách DISTRICTS */
function matchDistrictName(rawName) {
  if (!rawName) return "";
  const cleaned = normalizeVi(
    String(rawName).replace(/^(quận|phường|huyện|thị xã|thị trấn|thành phố)\s+/i, "")
  );
  return DISTRICTS.find(d => d !== "Tất cả quận" && normalizeVi(d) === cleaned) || "";
}

/** Tra địa chỉ thật từ toạ độ bằng Nominatim (OpenStreetMap) - miễn phí, không cần khoá */
async function reverseGeocodeOSM(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}` +
              `&zoom=18&addressdetails=1&accept-language=vi`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Nominatim trả về ${res.status}`);

  const data = await res.json();
  const addr = data && data.address;
  if (!addr) return null;

  const line = [
    addr.house_number,
    addr.road,
    addr.quarter || addr.neighbourhood,
    addr.suburb || addr.city_district,
    addr.city || "Hà Nội"
  ].filter(Boolean).join(", ");

  let district = "";
  for (const candidate of [addr.suburb, addr.city_district, addr.quarter, addr.neighbourhood, addr.county]) {
    district = matchDistrictName(candidate);
    if (district) break;
  }

  return { address: line, district };
}

/** Suy quận từ chuỗi địa chỉ THẬT. Không đoán ra được thì trả về rỗng. */
function guessDistrictFromText(text) {
  const haystack = normalizeVi(text);
  if (!haystack.trim()) return "";

  // Ưu tiên khớp thẳng tên quận có sẵn trong địa chỉ
  const direct = DISTRICTS.find(d => d !== "Tất cả quận" && haystack.includes(normalizeVi(d)));
  if (direct) return direct;

  // Dự phòng: các tuyến phố đặc trưng của từng quận
  const streetHints = [
    { district: "Ba Đình", streets: ["hang bun", "ngoc ha", "van bao", "quan thanh", "giang vo", "doi can", "kim ma", "lieu giai", "hoang hoa tham", "truc bach"] },
    { district: "Hoàn Kiếm", streets: ["bat dan", "hang bac", "hang gai", "dinh tien hoang", "nguyen huu huan", "ly thai to", "hang buom", "ta hien", "trang tien", "luong van can", "hang trong"] },
    { district: "Hai Bà Trưng", streets: ["le van huu", "lo duc", "to hien thanh", "tang bat ho", "lac trung", "ba trieu", "pho hue", "bach mai", "dai co viet", "minh khai"] },
    { district: "Đống Đa", streets: ["dang van ngu", "chua boc", "xa dan", "thai ha", "ton duc thang", "o cho dua", "huynh thuc khang", "lang ha", "hoang cau", "nguyen luong bang"] },
    { district: "Cầu Giấy", streets: ["nghia tan", "nguyen ngoc vu", "duy tan", "xuan thuy", "tran thai tong", "hoang quoc viet", "trung hoa", "nguyen khang", "dich vong", "cau giay"] },
    { district: "Tây Hồ", streets: ["quang an", "to ngoc van", "xuan dieu", "trich sai", "lac long quan", "au co", "nghi tam", "nhat tan", "vo chi cong", "ho tay"] },
    { district: "Thanh Xuân", streets: ["nguyen trai", "nguyen tuan", "khuat duy tien", "le van luong", "vu tong phan", "nguy nhu kon tum", "royal city"] }
  ];

  for (const hint of streetHints) {
    if (hint.streets.some(street => haystack.includes(street))) return hint.district;
  }
  return "";
}

/** Ánh xạ loại địa điểm của Google sang danh mục của cẩm nang */
const GOOGLE_TYPE_TO_CATEGORY = {
  cafe: "cafe-chill", coffee_shop: "cafe-chill", tea_house: "cafe-chill", bakery: "cafe-chill",
  juice_shop: "cafe-chill", dessert_shop: "an-vat", ice_cream_shop: "an-vat", candy_store: "an-vat",
  bar: "quan-nhau", pub: "quan-nhau", night_club: "quan-nhau", bar_and_grill: "quan-nhau",
  barbecue_restaurant: "lau-nuong", korean_restaurant: "lau-nuong", buffet_restaurant: "lau-nuong",
  japanese_restaurant: "do-a-au", sushi_restaurant: "do-a-au", ramen_restaurant: "do-a-au",
  italian_restaurant: "do-a-au", pizza_restaurant: "do-a-au", steak_house: "do-a-au",
  french_restaurant: "do-a-au", american_restaurant: "do-a-au", hamburger_restaurant: "do-a-au",
  sandwich_shop: "banh-mi-cuon", breakfast_restaurant: "mon-soi", vietnamese_restaurant: "mon-soi",
  meal_takeaway: "com-xoi", meal_delivery: "com-xoi"
};

/**
 * Đoán danh mục món từ tên quán + loại địa điểm Google.
 * Danh mục là cách sắp xếp chủ quan nên đoán là chấp nhận được -
 * khác hẳn số sao hay giá tiền, hai thứ tuyệt đối không được đoán.
 */
function guessCategory(text, googleTypes) {
  for (const type of googleTypes || []) {
    if (GOOGLE_TYPE_TO_CATEGORY[type]) return GOOGLE_TYPE_TO_CATEGORY[type];
  }

  const haystack = normalizeVi(text);
  const rules = [
    { cat: "cafe-chill", re: /(ca phe|cafe|coffee|tra sua|tiem tra|tea|matcha|roastery|bakery|banh ngot|sinh to|nuoc ep)/ },
    { cat: "lau-nuong", re: /(lau|nuong|bbq|hotpot|kbbq|manwah|haidilao)/ },
    { cat: "quan-nhau", re: /(bia hoi|bia |nhau|pub|beer|craft)/ },
    { cat: "do-a-au", re: /(bit tet|steak|beefsteak|bo ne|sushi|sashimi|ramen|pizza|pasta|dimsum|mi cay|nha hang nhat|han quoc)/ },
    { cat: "banh-mi-cuon", re: /(banh mi|banh cuon|pho cuon|goi cuon|banh bao|banh goi)/ },
    { cat: "com-xoi", re: /(com |xoi|com tam|com rang|com nieu|com ga)/ },
    { cat: "an-vat", re: /(che |kem |nom |nem chua|oc |tao pho|banh trang|an vat|sua chua)/ },
    { cat: "mon-soi", re: /(pho |bun |mien |mi |banh da)/ }
  ];

  for (const rule of rules) {
    if (rule.re.test(haystack)) return rule.cat;
  }
  return "";
}

/* ===================================================================
   GỌI MÁY CHỦ RIÊNG (/api/place)

   Khoá Google Places nằm trong biến môi trường của máy chủ, không bao
   giờ có mặt trong mã nguồn phía trình duyệt. Máy chủ cũng là thứ duy
   nhất đi theo được redirect của link rút gọn maps.app.goo.gl — trình
   duyệt bị CORS chặn nên không tự làm được.
   =================================================================== */

const DEFAULT_API_ENDPOINT = "/api/place";

function getApiEndpoint() {
  const custom = (state.settings.apiBaseUrl || "").trim();
  return custom || DEFAULT_API_ENDPOINT;
}

/** Hỏi máy chủ xem có sống không và đã cấu hình khoá chưa */
async function checkBackendHealth() {
  const endpoint = getApiEndpoint();
  const separator = endpoint.includes("?") ? "&" : "?";

  const res = await fetch(`${endpoint}${separator}health=1`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`máy chủ trả về ${res.status}`);

  await res.json();
  return { online: true };
}

/** Nhờ máy chủ giải mã link và tra Google Places */
async function fetchPlaceFromBackend(mapsUrl, hint) {
  const endpoint = getApiEndpoint();
  const separator = endpoint.includes("?") ? "&" : "?";
  const query = `url=${encodeURIComponent(mapsUrl)}` + (hint ? `&hint=${encodeURIComponent(hint)}` : "");

  const res = await fetch(`${endpoint}${separator}${query}`, { signal: AbortSignal.timeout(25000) });
  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json.ok) {
    throw new Error(json.error || `máy chủ trả về ${res.status}`);
  }
  return json;
}

/* ===================================================================
   ĐỒNG BỘ GOOGLE SHEET

   LocalStorage vẫn là nguồn chuẩn khi đang dùng: mọi thao tác ghi xuống
   máy trước, rồi mới đẩy lên Sheet. Sheet đóng vai trò sổ cái — nơi dữ
   liệu sống sót khi xoá cache trình duyệt, đổi máy, hoặc muốn sửa hàng
   loạt bằng tay.

   Thao tác đẩy lên thất bại (mất mạng, máy chủ lỗi) không bị mất: nó nằm
   trong hàng đợi ở LocalStorage và được thử lại ở lần đồng bộ sau.

   Trình duyệt không giữ địa chỉ Web App lẫn token — hai thứ đó nằm trong
   biến môi trường trên Vercel, xem ghi chú đầu file api/sheet.js.
   =================================================================== */

const DEFAULT_SHEET_ENDPOINT = "/api/sheet";

/** Các trường được đồng bộ. Thứ tự cột do Apps Script quyết định, không phải ở đây. */
const SHEET_FIELDS = [
  "id", "name", "category", "district", "address",
  "rating", "reviewCount", "priceRange", "priceLevel", "time",
  "mustTry", "review", "mapsUrl", "tags", "image",
  "lat", "lng", "verified", "featured", "dataSource"
];

/** Mỗi lô gửi tối đa ngần này quán, để Apps Script không chạy quá lâu rồi bị cắt */
const SHEET_BATCH_SIZE = 100;

function getSheetEndpoint() {
  const custom = (state.settings.apiBaseUrl || "").trim();
  if (!custom) return DEFAULT_SHEET_ENDPOINT;

  // Người dùng chỉ khai báo endpoint của /api/place; /api/sheet nằm cạnh nó
  const swapped = custom.replace(/\/place(?=$|[?#])/, "/sheet");
  return swapped !== custom ? swapped : custom.replace(/\/[^/?#]*(?=$|[?#])/, "/sheet");
}

/** Chỉ giữ các trường Sheet hiểu — bớt dữ liệu thừa gửi qua mạng */
function toSheetPlace(place) {
  const trimmed = {};
  SHEET_FIELDS.forEach(key => { trimmed[key] = place[key]; });
  return trimmed;
}

/** Chuỗi đại diện để so hai bản ghi xem có khác nhau thật không */
function placeSignature(place) {
  return JSON.stringify(SHEET_FIELDS.map(key => {
    const value = place[key];
    if (Array.isArray(value)) return value.join(",");
    if (value === null || value === undefined) return "";
    return String(value);
  }));
}

function pendingSheetCount() {
  return Object.keys(state.sheetQueue.upserts).length + state.sheetQueue.deletes.length;
}

function saveSheetQueue() {
  try {
    localStorage.setItem(STORAGE_KEY_SHEET_QUEUE, JSON.stringify(state.sheetQueue));
  } catch (e) {
    console.warn("Không lưu được hàng đợi đồng bộ:", e.message);
  }
  updateSheetButton();
  renderSheetSettingsBox();
}

/** Ghi nhận một quán cần đẩy lên Sheet, rồi thử đẩy ngay trong nền */
function queueSheetUpsert(place) {
  if (!place || !place.id) return;

  state.sheetQueue.upserts[place.id] = toSheetPlace(place);
  state.sheetQueue.deletes = state.sheetQueue.deletes.filter(id => id !== place.id);
  saveSheetQueue();

  flushSheetQueue({ silent: true });
}

function queueSheetDelete(placeId) {
  if (!placeId) return;

  delete state.sheetQueue.upserts[placeId];
  if (!state.sheetQueue.deletes.includes(placeId)) {
    state.sheetQueue.deletes.push(placeId);
  }
  saveSheetQueue();

  flushSheetQueue({ silent: true });
}

async function callSheetApi(payload, timeoutMs = 30000) {
  const res = await fetch(getSheetEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok !== true) {
    throw new Error(json.error || `máy chủ trả về ${res.status}`);
  }
  return json;
}

/** Hỏi máy chủ: có nối được Sheet không, và đã cấu hình đủ biến môi trường chưa */
async function refreshSheetStatus() {
  const endpoint = getSheetEndpoint();
  const separator = endpoint.includes("?") ? "&" : "?";

  try {
    const res = await fetch(`${endpoint}${separator}health=1`, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();

    state.sheetStatus.online = true;
    state.sheetStatus.configured = json.configured === true;
    state.sheetStatus.reason = json.reason || "";
  } catch (e) {
    state.sheetStatus.online = false;
    state.sheetStatus.configured = false;
    state.sheetStatus.reason = e.message;
  }

  updateSheetButton();
  renderSheetSettingsBox();
  return state.sheetStatus;
}

/**
 * Hỏi thẳng Apps Script xem nó đang chạy bản nào.
 *
 * /api/sheet?health=1 chỉ cho biết máy chủ đã có đủ biến môi trường chưa — nó
 * không chạm tới Google. Hàm này đi trọn vòng tới Apps Script, nên phân biệt
 * được "chưa cấu hình" với "script đang là bản cũ, chưa có phần ảnh". Chỉ gọi
 * khi mở modal cài đặt, vì mỗi lần đi vòng mất một hai giây.
 */
async function checkSheetCapabilities() {
  try {
    const json = await callSheetApi({ action: "health" }, 25000);
    state.sheetStatus.rows = typeof json.rows === "number" ? json.rows : null;
    state.sheetStatus.photos = json.photos === true;
    state.sheetStatus.scriptError = "";
  } catch (e) {
    state.sheetStatus.rows = null;
    state.sheetStatus.photos = null;
    state.sheetStatus.scriptError = e.message;
  }

  renderSheetSettingsBox();
  return state.sheetStatus;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Đẩy hàng đợi lên Sheet.
 * Chỉ xoá khỏi hàng đợi đúng những mục đã gửi thành công — thao tác phát sinh
 * trong lúc đang gửi vẫn được giữ lại cho lượt sau.
 */
async function flushSheetQueue(options) {
  const silent = Boolean(options && options.silent);
  const upserts = Object.values(state.sheetQueue.upserts);
  const deletes = [...state.sheetQueue.deletes];

  if (upserts.length === 0 && deletes.length === 0) {
    return { pushed: 0, deleted: 0 };
  }
  if (!state.sheetStatus.configured) {
    if (!silent) showToast("☁️ Chưa nối Google Sheet — mở ⚙️ Nguồn dữ liệu để xem cách cài.");
    return null;
  }

  try {
    for (const batch of chunk(upserts, SHEET_BATCH_SIZE)) {
      await callSheetApi({ action: "push", places: batch });
      batch.forEach(p => { delete state.sheetQueue.upserts[p.id]; });
      saveSheetQueue();
    }

    for (const batch of chunk(deletes, SHEET_BATCH_SIZE)) {
      await callSheetApi({ action: "delete", ids: batch });
      state.sheetQueue.deletes = state.sheetQueue.deletes.filter(id => !batch.includes(id));
      saveSheetQueue();
    }

    return { pushed: upserts.length, deleted: deletes.length };
  } catch (e) {
    // Hàng đợi giữ nguyên phần chưa gửi được, lần sau thử lại
    saveSheetQueue();
    if (!silent) showToast("⚠️ Chưa đẩy lên Sheet được: " + e.message);
    else console.warn("Đồng bộ nền thất bại:", e.message);
    return null;
  }
}

/** Đẩy toàn bộ danh sách hiện tại lên Sheet, không chỉ phần đang chờ */
async function pushAllToSheet() {
  state.places.forEach(p => { state.sheetQueue.upserts[p.id] = toSheetPlace(p); });
  saveSheetQueue();

  const result = await flushSheetQueue({ silent: false });
  if (result) showToast(`⬆️ Đã đẩy ${result.pushed} quán lên Google Sheet.`);
  return result;
}

/**
 * Kéo dữ liệu từ Sheet về máy.
 *
 * Nguyên tắc an toàn: kéo về KHÔNG BAO GIỜ xoá quán ở máy. Quán chỉ có ở máy
 * mà chưa có trên Sheet được coi là chưa đẩy lên, nên đưa vào hàng đợi thay vì
 * bị coi là đã xoá. Chiều xoá chỉ đi từ nút 🗑️ trong trang.
 */
async function pullFromSheet(options) {
  const silent = Boolean(options && options.silent);

  if (!state.sheetStatus.configured) {
    if (!silent) showToast("☁️ Chưa nối Google Sheet — mở ⚙️ Nguồn dữ liệu để xem cách cài.");
    return null;
  }

  let rows;
  try {
    const json = await callSheetApi({ action: "pull" });
    rows = (Array.isArray(json.places) ? json.places : [])
      .filter(r => r && r.id && r.name)
      .map(r => { delete r.updatedAt; return r; }); // cột giờ ghi, trang không dùng
  } catch (e) {
    if (!silent) showToast("⚠️ Không đọc được Google Sheet: " + e.message);
    return null;
  }

  const localById = new Map(state.places.map(p => [p.id, p]));
  const pendingDeletes = new Set(state.sheetQueue.deletes);

  const incomingNew = [];
  const incomingChanged = [];

  rows.forEach(row => {
    if (pendingDeletes.has(row.id)) return; // đang chờ xoá khỏi Sheet, đừng kéo về

    const local = localById.get(row.id);
    if (!local) {
      incomingNew.push(normalizePlace({ ...row, dataSource: row.dataSource || "sheet" }));
      return;
    }

    // So trên bản ĐÃ chuẩn hoá — đúng bằng thứ sẽ được lưu xuống. So với dòng
    // thô thì một ô trống trên Sheet lại khác giá trị mặc định mà normalizePlace
    // điền vào, và lần kéo về nào cũng báo "có thay đổi" dù chẳng có gì đổi.
    const merged = normalizePlace({ ...local, ...row });
    if (placeSignature(merged) !== placeSignature(local)) incomingChanged.push(merged);
  });

  if (incomingNew.length === 0 && incomingChanged.length === 0) {
    if (!silent) showToast("✅ Máy và Google Sheet đã khớp nhau.");
    return { added: 0, updated: 0 };
  }

  // Ghi đè bản ở máy là thao tác mất dữ liệu — hỏi trước
  if (!silent && incomingChanged.length > 0) {
    const proceed = confirm(
      `Google Sheet có thay đổi so với bản trên máy:\n\n` +
      `• ${incomingChanged.length} quán sẽ được cập nhật theo Sheet\n` +
      `• ${incomingNew.length} quán mới sẽ được thêm vào\n\n` +
      `Bấm OK để lấy bản trên Sheet làm chuẩn.`
    );
    if (!proceed) return null;
  }

  incomingChanged.forEach(place => {
    const index = state.places.findIndex(p => p.id === place.id);
    if (index !== -1) state.places[index] = place;
  });

  incomingNew.forEach(place => {
    // Có mặt trên Sheet nghĩa là quán còn tồn tại, kể cả khi từng bị xoá ở máy
    state.deletedIds.delete(place.id);
    state.places.push(place);
    // Bản đã chuẩn hoá có thể khác dòng trên Sheet (ô trống được điền mặc định),
    // đẩy ngược lên để hai bên khớp nhau ngay từ lần kéo sau
    state.sheetQueue.upserts[place.id] = toSheetPlace(place);
  });

  savePlaces();
  refreshAfterDataChange();
  if (elements.placeManagerModal && elements.placeManagerModal.classList.contains("active")) {
    renderManagerTable();
  }
  if (incomingNew.length > 0) {
    saveSheetQueue();
    await flushSheetQueue({ silent: true });
  }

  if (!silent) {
    showToast(`📥 Đã lấy về ${incomingNew.length} quán mới, cập nhật ${incomingChanged.length} quán.`);
  }
  return { added: incomingNew.length, updated: incomingChanged.length };
}

/**
 * Khoảng nghỉ giữa hai lần đồng bộ tự động. Đủ ngắn để hai máy không lệch nhau
 * lâu, đủ dài để đổi qua đổi lại giữa các tab không thành gọi máy chủ liên tục.
 */
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
let lastAutoSyncAt = 0;

/**
 * Đồng bộ nền lúc mở trang.
 *
 * Trước đây lúc mở trang chỉ ĐẨY phần đang chờ lên Sheet chứ không KÉO về. Hậu
 * quả: thêm quán ở máy tính thì máy tính thấy, nhưng mở trên điện thoại lại không có —
 * mỗi máy đọc bản lưu riêng trong trình duyệt của nó, mà Sheet thì chỉ được hỏi tới
 * khi người dùng tự bấm nút ☁️.
 *
 * Thứ tự giống hệt nút ☁️: đẩy trước để thay đổi ở máy không bị bản cũ trên Sheet
 * đè, và đẩy hỏng thì không kéo.
 */
async function syncOnOpen() {
  if (state.sheetStatus.syncing) return null;

  lastAutoSyncAt = Date.now();
  state.sheetStatus.syncing = true;
  updateSheetButton();

  try {
    await refreshSheetStatus();
    if (!state.sheetStatus.configured) return null;

    const pushed = await flushSheetQueue({ silent: true });
    if (pushed === null) return null;

    const result = await pullFromSheet({ silent: true });
    if (result && (result.added || result.updated)) {
      showToast(`📥 Đã lấy từ Google Sheet: ${result.added} quán mới, ${result.updated} quán cập nhật.`);
    }
    return result;
  } catch (e) {
    console.warn("Đồng bộ nền thất bại:", e.message);
    return null;
  } finally {
    state.sheetStatus.syncing = false;
    updateSheetButton();
  }
}

/**
 * Điện thoại hiếm khi tải lại trang: tab nằm sẵn trong trình duyệt hàng tuần, mở lại
 * từ danh sách ứng dụng KHÔNG chạy DOMContentLoaded. Chỉ đồng bộ lúc tải trang thì
 * điện thoại vẫn đứng yên ở bản cũ. Nên kéo thêm mỗi lần quay lại tab.
 */
function watchForReturnToTab() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastAutoSyncAt < AUTO_SYNC_INTERVAL_MS) return;
    syncOnOpen();
  });
}

/**
 * Nút ☁️ trên đầu trang: đẩy phần đang chờ lên trước, rồi lấy thay đổi từ
 * Sheet về. Đẩy trước để thay đổi vừa làm ở máy không bị bản cũ trên Sheet đè.
 */
async function syncWithSheet() {
  if (state.sheetStatus.syncing) return;

  lastAutoSyncAt = Date.now();
  state.sheetStatus.syncing = true;
  updateSheetButton();

  try {
    await refreshSheetStatus();

    if (!state.sheetStatus.online) {
      showToast("🔴 Không gọi được máy chủ — trang đang chạy ngoài Vercel?");
      return;
    }
    if (!state.sheetStatus.configured) {
      showToast("☁️ Chưa nối Google Sheet. Mở ⚙️ Nguồn dữ liệu để xem 7 bước cài.");
      openSettingsModal();
      return;
    }

    const pushed = await flushSheetQueue({ silent: false });
    if (pushed === null) return; // đẩy lỗi thì đừng kéo về, tránh mất thay đổi ở máy

    await pullFromSheet({ silent: false });
  } finally {
    state.sheetStatus.syncing = false;
    updateSheetButton();
  }
}

/** Cập nhật hình thức nút ☁️ theo trạng thái kết nối và số việc đang chờ */
function updateSheetButton() {
  const btn = elements.btnSyncSheet;
  if (!btn) return;

  const pending = pendingSheetCount();

  if (state.sheetStatus.syncing) {
    btn.textContent = "⏳";
    btn.classList.add("is-syncing");
    btn.title = "Đang đồng bộ với Google Sheet…";
    return;
  }

  btn.classList.remove("is-syncing");
  btn.textContent = "☁️";
  btn.classList.toggle("sheet-off", !state.sheetStatus.configured);
  btn.classList.toggle("sheet-pending", pending > 0);
  btn.dataset.pending = pending > 0 ? String(pending) : "";

  btn.title = !state.sheetStatus.configured
    ? "Chưa nối Google Sheet — bấm để xem hướng dẫn cài"
    : pending > 0
      ? `Đồng bộ Google Sheet — ${pending} thay đổi đang chờ đẩy lên`
      : "Đồng bộ với Google Sheet";
}

/* ===================================================================
   ẢNH QUÁN — CHỤP RỒI TẢI LÊN

   Ảnh đi vào Drive của chính bạn qua Apps Script, rồi trang hiển thị qua
   /api/photo (cache ở edge — xem ghi chú đầu file api/photo.js).

   Thu nhỏ ngay trong trình duyệt trước khi gửi. Ảnh điện thoại bây giờ
   thường 3–6 MB, mà thẻ quán chỉ hiển thị vài trăm pixel — gửi nguyên bản
   thì chậm, tốn dung lượng Drive, và vượt giới hạn body của máy chủ.
   =================================================================== */

// Ảnh lớn nhất trang dùng tới là 1200px (ảnh hero trong modal chi tiết), nên
// gửi lên hơn thế là phí — mà mỗi KB thừa đều là thời gian Apps Script phải
// giải mã và tải lên Drive, tức là nguy cơ vượt thời gian chờ.
const PHOTO_MAX_DIM = 1200;
const PHOTO_MAX_PAYLOAD = 700 * 1024;       // trần cho chuỗi base64 gửi lên
const PHOTO_START_QUALITY = 0.78;
const PHOTO_MIN_QUALITY = 0.45;             // dưới mức này ảnh món ăn bắt đầu vỡ rõ
const PHOTO_URL_PREFIX = "/api/photo?id=";

/**
 * Giải mã file ảnh, ưu tiên createImageBitmap để ảnh dọc chụp bằng điện thoại
 * không bị xoay ngang — thẻ EXIF Orientation chỉ được tôn trọng khi khai báo
 * imageOrientation: "from-image".
 */
async function decodeImageFile(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (e) {
      // Trình duyệt cũ không nhận tuỳ chọn này — dùng cách dưới
    }
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không đọc được file."));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Không mở được ảnh."));
    img.onload = () => resolve(img);
    img.src = dataUrl;
  });
}

/** File ảnh → chuỗi data URL đã thu nhỏ, đủ nhỏ để gửi qua máy chủ */
async function shrinkImageFile(file) {
  if (!file || !/^image\//.test(file.type || "")) {
    throw new Error("File này không phải ảnh.");
  }

  const source = await decodeImageFile(file);
  const width = source.width;
  const height = source.height;
  if (!width || !height) throw new Error("Ảnh hỏng hoặc rỗng.");

  const scale = Math.min(1, PHOTO_MAX_DIM / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const ctx = canvas.getContext("2d");
  // Nền trắng để ảnh PNG trong suốt không thành đen sau khi đổi sang JPEG
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (typeof source.close === "function") source.close();

  let quality = PHOTO_START_QUALITY;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);

  // Kiểm tra mức TIẾP THEO trước khi hạ, nếu không vòng lặp sẽ tụt xuống dưới
  // sàn đúng một bước — thà báo lỗi còn hơn lặng lẽ lưu một tấm ảnh vỡ nát.
  while (dataUrl.length > PHOTO_MAX_PAYLOAD && quality - 0.12 >= PHOTO_MIN_QUALITY) {
    quality -= 0.12;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  if (dataUrl.length > PHOTO_MAX_PAYLOAD) {
    throw new Error("Ảnh vẫn quá nặng sau khi thu nhỏ, thử ảnh khác.");
  }
  return dataUrl;
}

/**
 * Dịch lỗi kỹ thuật thành việc cần làm.
 * Ba lỗi hay gặp nhất đều nằm ở phía Google chứ không phải ở trang, và thông
 * báo gốc ("action không hợp lệ: photo") không nói được phải sửa ở đâu.
 */
function photoErrorHint(text) {
  // Quy tắc hẹp đặt trước quy tắc rộng. Lỗi chính sách chia sẻ có chữ "quyền"
  // và thường kèm chữ "Drive", nên nếu để sau quy tắc quyền chung thì nó bị
  // nuốt và người dùng đi cấp quyền — trong khi bệnh nằm ở chỗ khác hẳn.
  if (/Không đặt được quyền xem/i.test(text)) {
    return "Tài khoản này bị chặn chia sẻ file ra ngoài (hay gặp ở tài khoản công ty). " +
      "Dùng Sheet trên một tài khoản Gmail cá nhân.";
  }
  if (/action không hợp lệ/i.test(text)) {
    return "Apps Script đang chạy bản cũ chưa có phần ảnh. Dán lại tools/sheet-appscript.gs " +
      "rồi Triển khai → Quản lý triển khai → bút chì → Phiên bản: Mới.";
  }
  if (/doGet/i.test(text)) {
    return "Kiểm tra SHEETS_WEBHOOK_URL trên Vercel có đúng đường dẫn /exec mới nhất không.";
  }
  if (/404/.test(text)) {
    // Apps Script đã chạy xong rồi mới hỏng ở bước lấy kết quả, nên ảnh
    // nhiều khả năng đã nằm trong Drive — bấm lại sẽ tạo bản thứ hai.
    return 'Mở thư mục "Foodguide - Ảnh quán" trong Drive xem ảnh đã lên chưa rồi hãy thử lại, ' +
      "kẻo có hai bản của cùng một tấm.";
  }
  if (/permission|quyền|authoriz|scope/i.test(text) && /Drive/i.test(text)) {
    return "Mở Apps Script, chọn hàm CAP_QUYEN_LAN_DAU rồi bấm ▶ Chạy và đồng ý cấp quyền. " +
      "Deploy KHÔNG làm Google hỏi cấp quyền — phải chạy tay một lần.";
  }
  if (/đăng nhập|Sign in/i.test(text)) {
    return 'Deploy lại với "Ai có quyền truy cập: Bất kỳ ai".';
  }
  if (/quá lớn|413/i.test(text)) {
    return "Thử ảnh khác hoặc chụp lại ở độ phân giải thấp hơn.";
  }
  if (/Sheet đang bận/i.test(text)) {
    return "Đợi vài giây rồi thử lại.";
  }
  return "";
}

/**
 * Giữ NGUYÊN VĂN câu máy chủ trả về, rồi mới nối thêm gợi ý cách sửa.
 *
 * Bản trước thay hẳn câu gốc bằng bản dịch. Khi luật đoán sai, người dùng đi
 * sửa nhầm chỗ mà không còn cách nào biết Google thực sự đã nói gì — đúng thứ
 * làm mất thời gian nhất khi gỡ lỗi.
 */
function explainPhotoError(message) {
  const text = String(message || "");
  const hint = photoErrorHint(text);
  return hint ? text + " → " + hint : text;
}

/** Gửi ảnh lên Drive, trả về đường dẫn để lưu vào trường image */
/** Khoá idempotent cho một lần chọn ảnh — giữ nguyên qua mọi lần thử lại */
function makeUploadId(placeId) {
  const slug = String(placeId || "quan").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "quan";
  const random = Math.random().toString(36).slice(2, 8);
  return `${slug}-${Date.now()}-${random}`;
}

/**
 * Lỗi này có đáng thử lại không?
 * Chỉ những lỗi mà việc ghi CÓ THỂ đã thành công hoặc chỉ là trục trặc đường
 * truyền. Sai token, sai định dạng, thiếu quyền thì thử lại chỉ tốn thời gian.
 */
function isTransientUploadError(message) {
  return /404|quá chậm|hết hiệu lực|chập chờn|fetch failed|network|timeout|aborted|502|503|504/i
    .test(String(message || ""));
}

/**
 * Gửi ảnh lên Drive, trả về đường dẫn để lưu vào trường image.
 *
 * Thử lại tối đa ba lần với CÙNG một uploadId. Apps Script hay ghi xong ảnh
 * rồi mới hỏng ở bước trả kết quả (địa chỉ tạm trên googleusercontent trả 404),
 * nên lần thử sau tìm thấy đúng file cũ và lấy được id — không sinh ảnh trùng.
 */
async function uploadPhotoDataUrl(placeId, dataUrl, onRetry) {
  const uploadId = makeUploadId(placeId);
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const json = await callSheetApi(
        { action: "photo", placeId: placeId || "", uploadId, dataUrl },
        70000
      );
      if (!json.fileId) throw new Error("Máy chủ không trả về id ảnh.");

      // Apps Script gửi kèm thời gian từng chặng — ghi ra console để lần sau
      // chậm thì biết ngay nghẽn ở đâu, khỏi phải đoán
      if (json.ms) console.info("Tải ảnh (ms):", json.ms, json.reused ? "(dùng lại file cũ)" : "");

      return {
        url: PHOTO_URL_PREFIX + encodeURIComponent(json.fileId),
        ms: json.ms || null,
        attempts: attempt,
        reused: json.reused === true
      };
    } catch (e) {
      lastError = e;
      if (attempt === 3 || !isTransientUploadError(e.message)) break;

      if (onRetry) onRetry(attempt, e.message);
      await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }

  throw lastError || new Error("Tải ảnh thất bại.");
}

/** Ảnh này có phải ảnh mình tự tải lên không (để hiện nhãn trong form) */
function isUploadedPhoto(url) {
  return typeof url === "string" && url.indexOf(PHOTO_URL_PREFIX) === 0;
}

/**
 * Chọn cỡ ảnh theo chỗ hiển thị. Chỉ áp cho ảnh tự tải lên — /api/photo nhận
 * đúng hai bề ngang nên mỗi ảnh chỉ sinh hai mục cache. Link ảnh dán từ ngoài
 * thì giữ nguyên, không đụng vào.
 */
function photoSrc(url, width) {
  if (!url) return "";
  if (!isUploadedPhoto(url)) return url;
  return url + "&w=" + (width === 1200 ? "1200" : "600");
}

/**
 * Gắn nút tải ảnh cho một form.
 * prefix là "newPlace" hoặc "editPlace" — các id trong HTML theo đúng quy ước đó.
 */
function attachPhotoUploader(prefix, getPlaceId) {
  const urlInput = document.getElementById(prefix + "Image");
  const fileInput = document.getElementById(prefix + "PhotoFile");
  const button = document.getElementById(prefix + "PhotoBtn");
  const hint = document.getElementById(prefix + "PhotoHint");
  const preview = document.getElementById(prefix + "PhotoPreview");
  if (!urlInput || !fileInput || !button) return;

  // Ô này nhận cả đường dẫn tương đối (/api/photo?id=…) lẫn link tuyệt đối,
  // mà type="url" của HTML coi đường dẫn tương đối là không hợp lệ rồi chặn
  // luôn nút Lưu — ảnh đã lên Drive nhưng không sao ghi vào cẩm nang được.
  //
  // Ép ở đây thay vì chỉ sửa trong HTML: một bản index.html còn nằm trong cache
  // trình duyệt vẫn được chữa ngay khi app.js chạy.
  if (urlInput.type === "url") {
    urlInput.type = "text";
    urlInput.setAttribute("inputmode", "url");
  }

  const setHint = (text, kind) => {
    if (!hint) return;
    hint.textContent = text;
    hint.className = "photo-hint" + (kind ? " " + kind : "");
  };

  const refreshPreview = () => {
    if (!preview) return;
    const value = urlInput.value.trim();
    if (!value) {
      preview.hidden = true;
      preview.removeAttribute("src");
      return;
    }
    preview.src = value;
    preview.hidden = false;
  };

  button.addEventListener("click", () => fileInput.click());
  urlInput.addEventListener("input", refreshPreview);
  urlInput.addEventListener("change", refreshPreview);

  if (preview) {
    preview.addEventListener("error", () => {
      preview.hidden = true;
      setHint("⚠️ Link ảnh này không tải được.", "err");
    });
    preview.addEventListener("load", () => { preview.hidden = false; });
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = ""; // chọn lại đúng file đó vẫn kích hoạt sự kiện
    if (!file) return;

    if (!state.sheetStatus.configured) {
      setHint("⚠️ Chưa nối Google Sheet nên chưa có chỗ chứa ảnh. Mở 🔌 để cài.", "err");
      return;
    }

    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = "⏳ Đang tải lên...";
    setHint("Đang thu nhỏ và gửi ảnh lên Drive của bạn…", "");

    try {
      const dataUrl = await shrinkImageFile(file);
      const result = await uploadPhotoDataUrl(
        getPlaceId ? getPlaceId() : "",
        dataUrl,
        attempt => setHint(`Google trả lỗi tạm, đang thử lại (lần ${attempt + 1}/3)…`, "")
      );

      urlInput.value = result.url;
      refreshPreview();
      const kb = Math.round((dataUrl.length * 3) / 4 / 1024);
      const secs = result.ms && result.ms.tong ? ` trong ${(result.ms.tong / 1000).toFixed(1)}s` : "";
      const retried = result.attempts > 1 ? ` — phải thử ${result.attempts} lần` : "";
      setHint(`✅ Đã lưu vào Drive (${kb} KB${secs}${retried}). Nhớ bấm Lưu để ghi vào cẩm nang.`, "ok");
    } catch (e) {
      setHint("⚠️ Tải ảnh thất bại: " + explainPhotoError(e.message), "err");
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });

  // Gọi một lần để form mở ra đã đúng trạng thái
  refreshPreview();
}

/** Đặt lại ô ảnh khi mở form (dùng chung cho cả thêm mới lẫn sửa) */
function resetPhotoField(prefix, value) {
  const urlInput = document.getElementById(prefix + "Image");
  const hint = document.getElementById(prefix + "PhotoHint");
  const preview = document.getElementById(prefix + "PhotoPreview");

  if (urlInput) urlInput.value = value || "";
  if (hint) {
    hint.className = "photo-hint";
    hint.textContent = isUploadedPhoto(value)
      ? "Ảnh bạn đã tải lên Drive."
      : value
        ? "Đang dùng ảnh minh hoạ — tải ảnh thật lên để thay."
        : "Chụp tại quán rồi tải lên, ảnh vào Drive của bạn.";
  }
  if (preview) {
    if (value) {
      preview.src = value;
      preview.hidden = false;
    } else {
      preview.hidden = true;
      preview.removeAttribute("src");
    }
  }
}

/* ===================================================================
   Ô NHẬP ĐIỂM GOOGLE MAPS

   Số sao và lượt đánh giá là hai trường duy nhất phải nhập tay, nên đây
   là thao tác lặp lại nhiều nhất khi thêm quán. Google Maps hiển thị hai
   con số dính liền nhau ("4,6 (228)"), nên ô Điểm nhận luôn cả cụm đó rồi
   tự tách — đỡ phải gõ vào hai chỗ.
   =================================================================== */

/**
 * Tách chuỗi kiểu Google Maps thành điểm và lượt đánh giá.
 * Chấp nhận: "4,6 (228)" · "4.6 (1.234)" · "4,6 · 228 đánh giá" · "4.6" · "228"
 * Dấu phẩy là phần thập phân, dấu chấm trong ngoặc là phân cách hàng nghìn — đúng
 * cách Google Maps hiển thị ở giao diện tiếng Việt.
 */
function parseRatingInput(raw) {
  const text = String(raw || "").trim();
  if (!text) return { rating: null, reviewCount: null };

  // Lượt đánh giá thường nằm trong ngoặc: (228) hoặc (1.234)
  let reviewCount = null;
  const inParens = text.match(/\(([\d.,\s]+)\)/);
  if (inParens) {
    const digits = inParens[1].replace(/[^\d]/g, "");
    if (digits) reviewCount = parseInt(digits, 10);
  }

  // Điểm là số đầu tiên, dấu phẩy hoặc chấm đều là phần thập phân
  let rating = null;
  const head = inParens ? text.slice(0, inParens.index) : text;
  const ratingMatch = head.match(/(\d)[.,](\d)/) || head.match(/(?:^|\s)([1-5])(?:\s|$)/);
  if (ratingMatch) {
    rating = ratingMatch[2] !== undefined
      ? parseFloat(`${ratingMatch[1]}.${ratingMatch[2]}`)
      : parseFloat(ratingMatch[1]);
  }

  // Không có ngoặc: số thứ hai (nếu có) được coi là lượt đánh giá
  if (reviewCount === null && !inParens) {
    const numbers = text.match(/\d[\d.,]*/g) || [];
    if (numbers.length >= 2) {
      const digits = numbers[1].replace(/[^\d]/g, "");
      if (digits) reviewCount = parseInt(digits, 10);
    } else if (numbers.length === 1 && rating === null) {
      // Chỉ một số và không phải điểm (ví dụ "228") thì là lượt đánh giá
      const digits = numbers[0].replace(/[^\d]/g, "");
      if (digits && parseInt(digits, 10) > 5) reviewCount = parseInt(digits, 10);
    }
  }

  if (rating !== null && (rating < 1 || rating > 5)) rating = null;
  return { rating, reviewCount };
}

/**
 * Gắn khả năng tách tự động cho một cặp ô Điểm / Lượt đánh giá.
 * Chỉ tách khi người dùng gõ thứ gì đó phức tạp hơn một số đơn thuần,
 * để không cản trở việc gõ tay từng ô.
 */
function attachRatingParser(ratingId, reviewCountId) {
  const ratingEl = document.getElementById(ratingId);
  const countEl = document.getElementById(reviewCountId);
  if (!ratingEl || !countEl) return;

  const split = () => {
    const raw = ratingEl.value;
    // "4.6" hoặc "4,6" đơn thuần thì để yên cho người dùng gõ tiếp
    if (/^\s*\d([.,]\d?)?\s*$/.test(raw)) return;

    const { rating, reviewCount } = parseRatingInput(raw);
    if (rating === null && reviewCount === null) return;

    if (rating !== null) ratingEl.value = String(rating);
    if (reviewCount !== null) {
      countEl.value = String(reviewCount);
      countEl.classList.add("just-filled");
      setTimeout(() => countEl.classList.remove("just-filled"), 1200);
    }
  };

  ratingEl.addEventListener("paste", () => setTimeout(split, 0));
  ratingEl.addEventListener("blur", split);
  ratingEl.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      split();
      countEl.focus();
    }
  });
}

/**
 * Sau khi quét link xong, đưa con trỏ thẳng vào ô Điểm và hiện link mở
 * quán trên Google Maps để người dùng nhìn con số rồi gõ luôn.
 */
function focusRatingInput(mapsUrl) {
  const ratingEl = document.getElementById("newPlaceRating");
  const linkEl = document.getElementById("linkOpenPlaceMaps");

  if (linkEl) {
    if (mapsUrl) {
      linkEl.href = mapsUrl;
      linkEl.target = "_blank";
      linkEl.rel = "noopener";
      linkEl.hidden = false;
    } else {
      linkEl.hidden = true;
    }
  }

  if (ratingEl && !ratingEl.value) {
    // Chỉ là tiện ích con trỏ — không được phép ném lỗi làm hỏng lượt quét
    try {
      if (typeof ratingEl.scrollIntoView === "function") {
        ratingEl.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      ratingEl.focus();
    } catch (e) {
      console.warn("Không đưa được con trỏ vào ô Điểm:", e.message);
    }
  }
}

/** Trạng thái bận của nút Quét & Tự điền */
function setAutofillBusy(label) {
  if (!elements.btnQuickAutoFill) return;
  if (label) {
    elements.btnQuickAutoFill.textContent = label;
    elements.btnQuickAutoFill.disabled = true;
  } else {
    elements.btnQuickAutoFill.textContent = "✨ Quét & Tự điền";
    elements.btnQuickAutoFill.disabled = false;
  }
}

/** Chỉ ghi đè khi giá trị nguồn thực sự có nội dung và đích còn trống */
function mergeFound(target, source) {
  Object.keys(source).forEach(key => {
    const value = source[key];
    const empty = target[key] === "" || target[key] === null || target[key] === undefined;
    if (value !== "" && value !== null && value !== undefined && empty) {
      target[key] = value;
    }
  });
}

/**
 * 🪄 Quét link Google Maps và điền form bằng dữ liệu đọc được thật.
 */
async function handleMagicAutoFill() {
  const rawInput = (elements.quickMapsUrlInput ? elements.quickMapsUrlInput.value : "").trim();
  if (!rawInput) {
    showToast("⚠️ Vui lòng dán link Google Maps của quán!");
    if (elements.quickMapsUrlInput) elements.quickMapsUrlInput.focus();
    return;
  }

  const urlMatch = rawInput.match(/https?:\/\/[^\s]+/);
  const targetUrl = urlMatch ? urlMatch[0] : "";
  const pastedLines = rawInput
    .replace(/https?:\/\/\S+/g, "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  let scanResultMapsUrl = null;
  const found = {
    name: "", address: "", district: "", category: "",
    lat: null, lng: null, rating: null, reviewCount: null,
    priceLevel: "", priceRange: "", time: "", image: "",
    mustTry: "", review: "", tags: null,
    mapsUrl: targetUrl, source: ""
  };
  const notes = [];

  setAutofillBusy("⏳ Đang đọc link...");

  try {
    // 1. Từ điển link đã đối chiếu tay
    const lowerUrl = targetUrl.toLowerCase();
    const knownEntry = Object.entries(KNOWN_MAPS_SHORTLINKS)
      .find(([key]) => lowerUrl.includes(key));
    if (knownEntry) {
      const data = knownEntry[1];
      mergeFound(found, {
        name: data.name, address: data.address, district: data.district,
        category: data.category, rating: data.rating, reviewCount: data.reviewCount,
        priceLevel: data.priceLevel, priceRange: data.priceRange,
        time: data.time, image: data.image, mustTry: data.mustTry, review: data.review
      });
      found.tags = data.tags;
      found.source = "known";
    }

    // 2. Bóc thẳng từ URL (không cần mạng)
    if (targetUrl) mergeFound(found, parseMapsUrl(targetUrl));

    // 3. Đoạn text dán kèm (nút Chia sẻ của app Google Maps kèm sẵn tên + địa chỉ)
    if (pastedLines.length > 0) {
      mergeFound(found, { name: pastedLines[0], address: pastedLines[1] || "" });
    }

    // 4. MÁY CHỦ RIÊNG — đường chính.
    //    Chỉ máy chủ mới đi theo được redirect của link rút gọn, và cũng chỉ
    //    máy chủ mới giữ khoá Google Places để lấy số sao / lượt đánh giá thật.
    let backendUsed = false;
    if (targetUrl) {
      setAutofillBusy("⏳ Đang hỏi máy chủ...");
      try {
        const result = await fetchPlaceFromBackend(targetUrl, found.name);
        const place = result.place || {};
        backendUsed = true;

        // Dữ liệu từ máy chủ là chuẩn nhất nên được ghi đè lên phỏng đoán phía client
        if (place.name) found.name = place.name;
        if (place.address) found.address = place.address;
        if (place.lat !== null && place.lat !== undefined) found.lat = place.lat;
        if (place.lng !== null && place.lng !== undefined) found.lng = place.lng;
        if (place.rating !== null && place.rating !== undefined) found.rating = place.rating;
        if (place.reviewCount !== null && place.reviewCount !== undefined) found.reviewCount = place.reviewCount;
        if (place.priceLevel) found.priceLevel = place.priceLevel;
        if (place.time) found.time = place.time;
        if (place.image) found.image = place.image;
        if (place.mapsUrl) found.mapsUrl = place.mapsUrl;

        const category = guessCategory(found.name, place.types);
        if (category) found.category = category;

        found.source = result.source === "google" ? "google" : "backend";
        (result.notes || []).forEach(n => notes.push(n));
      } catch (e) {
        notes.push("máy chủ: " + e.message);
      }
    }

    // 5. Máy chủ không dùng được (mở bằng file:// hoặc chưa deploy)
    //    -> thử nốt các CORS proxy công cộng. Hay hỏng, nên để cuối cùng.
    if (!backendUsed && targetUrl && !found.name && isShortMapsLink(targetUrl)) {
      setAutofillBusy("⏳ Đang thử giải mã link rút gọn...");
      const resolved = await resolveShortLink(targetUrl);
      if (resolved) {
        mergeFound(found, parseMapsUrl(resolved));
      } else {
        notes.push("không giải mã được link rút gọn");
      }
    }

    // 6. Chưa có địa chỉ mà đã có toạ độ -> tra OpenStreetMap
    if (!found.address && found.lat !== null) {
      setAutofillBusy("⏳ Đang tra địa chỉ (OpenStreetMap)...");
      try {
        const geo = await reverseGeocodeOSM(found.lat, found.lng);
        if (geo) {
          found.address = geo.address;
          if (!found.district) found.district = geo.district;
          if (!found.source) found.source = "osm";
        }
      } catch (e) {
        notes.push("không tra được địa chỉ từ toạ độ");
      }
    }

    // 7. Suy quận & danh mục từ chính dữ liệu đã đọc được
    if (!found.district) found.district = guessDistrictFromText(`${found.address} ${found.name}`);
    if (!found.category) found.category = guessCategory(`${found.name} ${found.address}`, []);
    if (!found.source) found.source = targetUrl ? "link" : "manual";

    if (!found.name && !found.address) {
      showToast(backendUsed
        ? "⚠️ Máy chủ không đọc được thông tin từ link này. Hãy thử dán URL đầy đủ trên thanh địa chỉ trình duyệt."
        : "⚠️ Chưa kết nối được máy chủ. Hãy mở link rồi copy URL đầy đủ trên thanh địa chỉ, hoặc dán tên quán ở dòng phía trên link.");
      return;
    }

    fillAddFormFromScan(found);

    const filled = [];
    if (found.name) filled.push("tên");
    if (found.address) filled.push("địa chỉ");
    if (found.district) filled.push("quận");
    if (found.rating !== null) filled.push("số sao");
    if (found.reviewCount !== null) filled.push("lượt đánh giá");
    if (found.time) filled.push("giờ mở cửa");
    if (found.image) filled.push("ảnh");

    let message = `🪄 Đã điền: ${filled.join(", ")}. Còn điểm Google Maps — mời bạn nhập.`;
    if (notes.length > 0) message += ` (${notes.join("; ")})`;
    showToast(message);
    scanResultMapsUrl = found.mapsUrl;
  } catch (err) {
    console.error("Lỗi khi quét link:", err);
    showToast("⚠️ Quét thất bại: " + err.message + ". Bạn có thể nhập tay bên dưới.");
  } finally {
    setAutofillBusy(null);
    // Đặt ngoài khối try: đây là tiện ích con trỏ, không phải một phần của việc quét
    if (scanResultMapsUrl !== null) focusRatingInput(scanResultMapsUrl);
  }
}

/** Đổ kết quả quét vào form. Trường nào không có dữ liệu thật thì để trống. */
function fillAddFormFromScan(found) {
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value === null || value === undefined ? "" : value;
  };

  setValue("newPlaceName", found.name);
  setValue("newPlaceAddress", found.address);
  setValue("newPlaceMapsUrl", found.mapsUrl);
  setValue("newPlaceRating", found.rating);
  setValue("newPlaceReviewCount", found.reviewCount);
  setValue("newPlacePrice", found.priceRange);
  setValue("newPlaceTime", found.time);
  setValue("newPlaceImage", found.image);
  setValue("newPlaceLat", found.lat);
  setValue("newPlaceLng", found.lng);
  setValue("newPlaceDataSource", found.source);

  // Các trường chủ quan: chỉ điền khi đến từ danh sách đã đối chiếu tay
  setValue("newPlaceMustTry", found.mustTry);
  setValue("newPlaceReview", found.review);
  setValue("newPlaceTags", Array.isArray(found.tags) ? found.tags.join(", ") : "");

  const categorySelect = document.getElementById("newPlaceCategory");
  if (categorySelect) categorySelect.value = found.category || "";

  const districtSelect = document.getElementById("newPlaceDistrict");
  if (districtSelect) districtSelect.value = found.district || "";

  const priceSelect = document.getElementById("newPlacePriceLevel");
  if (priceSelect) priceSelect.value = found.priceLevel || "";

  // Dữ liệu Google Places coi như đã đối chiếu; các nguồn khác thì chưa
  const verifiedBox = document.getElementById("newPlaceVerified");
  if (verifiedBox) verifiedBox.checked = found.source === "google";
}

/**
 * Xử lý khi Submit form thêm quán mới
 */
function handleAddPlaceSubmit(e) {
  e.preventDefault();

  const readValue = id => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  };
  const readNumber = id => {
    const value = readValue(id);
    if (value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  // Ô Điểm là text để nhận được cụm "4,6 (228)", nên tách lại lần cuối khi lưu
  const scores = parseRatingInput(readValue("newPlaceRating"));
  const reviewCountTyped = parseRatingInput(readValue("newPlaceReviewCount")).reviewCount;

  const name = readValue("newPlaceName");
  const address = readValue("newPlaceAddress");

  if (!name || !address) {
    showToast("⚠️ Vui lòng nhập tên quán và địa chỉ!");
    return;
  }

  // Chống thêm trùng khi lỡ dán lại cùng một link
  const mapsUrlInput = readValue("newPlaceMapsUrl");
  const duplicate = findDuplicatePlace(name, mapsUrlInput);
  if (duplicate) {
    const proceed = confirm(
      `"${duplicate.name}" đã có trong cẩm nang (${duplicate.address || "chưa có địa chỉ"}).

` +
      `Bấm OK để vẫn thêm bản ghi mới, hoặc Cancel để huỷ.`
    );
    if (!proceed) return;
  }

  const tagsStr = readValue("newPlaceTags");
  const newPlace = {
    id: "place-" + Date.now(),
    name,
    category: readValue("newPlaceCategory"),
    district: readValue("newPlaceDistrict"),
    address,
    mapsUrl: mapsUrlInput || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + " " + address)}`,
    rating: scores.rating,
    reviewCount: scores.reviewCount !== null ? scores.reviewCount : reviewCountTyped,
    priceRange: readValue("newPlacePrice"),
    priceLevel: readValue("newPlacePriceLevel"),
    time: readValue("newPlaceTime"),
    mustTry: readValue("newPlaceMustTry"),
    review: readValue("newPlaceReview"),
    tags: tagsStr ? tagsStr.split(",").map(t => t.trim()).filter(Boolean) : [],
    image: readValue("newPlaceImage"),
    lat: readNumber("newPlaceLat"),
    lng: readNumber("newPlaceLng"),
    dataSource: readValue("newPlaceDataSource") || "manual",
    verified: Boolean(document.getElementById("newPlaceVerified") && document.getElementById("newPlaceVerified").checked),
    featured: false
  };

  const stored = normalizePlace(newPlace);
  state.places.unshift(stored);
  savePlaces();
  refreshAfterDataChange();
  queueSheetUpsert(stored); // ghi tiếp lên Google Sheet trong nền

  closeAllModals();
  elements.addPlaceForm.reset();
  showToast(`🎉 Đã thêm "${name}" vào Food Guide!`);
}

/** Tìm quán đã có, khớp theo link Google Maps hoặc theo tên (bỏ dấu) */
function findDuplicatePlace(name, mapsUrl, excludeId) {
  const targetName = normalizeVi(name);
  return state.places.find(p => {
    if (excludeId && p.id === excludeId) return false;
    if (mapsUrl && p.mapsUrl && p.mapsUrl === mapsUrl) return true;
    return normalizeVi(p.name) === targetName;
  }) || null;
}

/**
 * 📊 Xuất dữ liệu ra file Google Sheets / Excel (.csv) chuẩn UTF-8 BOM
 */
function exportGoogleSheetsCSV() {
  const headers = [
    "Tên Quán",
    "Danh Mục",
    "Quận",
    "Địa Chỉ",
    "Số Sao",
    "Lượt Đánh Giá",
    "Khoảng Giá",
    "Giờ Mở Cửa",
    "Món Must-Try",
    "Đánh Giá / Review",
    "Link Google Maps",
    "Tags",
    "Trạng Thái Xác Minh",
    "Nguồn Dữ Liệu"
  ];
  
  let csvContent = "\uFEFF"; // UTF-8 BOM cho Google Sheets & Excel không lỗi tiếng Việt
  csvContent += headers.map(h => `"${h}"`).join(",") + "\r\n";
  
  state.places.forEach(p => {
    const cat = state.categories.find(c => c.id === p.category);
    const catName = cat ? cat.name : p.category;
    const row = [
      (p.name || "").replace(/"/g, '""'),
      catName || "",
      p.district || "",
      (p.address || "").replace(/"/g, '""'),
      p.rating === null || p.rating === undefined ? "" : p.rating,
      p.reviewCount === null || p.reviewCount === undefined ? "" : p.reviewCount,
      p.priceRange || "",
      p.time || "",
      (p.mustTry || "").replace(/"/g, '""'),
      (p.review || "").replace(/"/g, '""'),
      p.mapsUrl || "",
      (p.tags || []).join(";"),
      p.verified ? "Đã xác minh" : "Chưa xác minh",
      DATA_SOURCE_LABELS[p.dataSource] || p.dataSource || ""
    ];
    csvContent += row.map(val => `"${val}"`).join(",") + "\r\n";
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", url);
  downloadAnchor.setAttribute("download", `hanoi_foodguide_google_sheets_${Date.now()}.csv`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  URL.revokeObjectURL(url);

  showToast("📊 Đã xuất file Google Sheets (.csv) thành công!");
}

/**
 * Mở Modal Quản Lý Danh Sách Quán (Place Manager)
 */
function openPlaceManagerModal() {
  if (!elements.placeManagerModal) return;

  if (elements.managerDistrictFilter) {
    let distHtml = "";
    DISTRICTS.forEach(d => {
      distHtml += `<option value="${d}">${d}</option>`;
    });
    elements.managerDistrictFilter.innerHTML = distHtml;
    elements.managerDistrictFilter.value = "Tất cả quận";
  }

  if (elements.managerSearchInput) {
    elements.managerSearchInput.value = "";
  }

  renderManagerTable();
  elements.placeManagerModal.classList.add("active");
}

/**
 * Render Bảng Quản Lý Quán (Manager Table)
 */
function renderManagerTable() {
  if (!elements.managerTableBody) return;
  const q = normalizeVi((elements.managerSearchInput ? elements.managerSearchInput.value : "").trim());
  const dFilter = (elements.managerDistrictFilter ? elements.managerDistrictFilter.value : "Tất cả quận");

  const filtered = state.places.filter(p => {
    if (dFilter !== "Tất cả quận" && p.district !== dFilter) return false;
    if (q) {
      const haystack = normalizeVi(`${p.name} ${p.address} ${p.district}`);
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    elements.managerTableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 24px; color: var(--text-muted);">
          Không tìm thấy quán nào phù hợp.
        </td>
      </tr>
    `;
    return;
  }

  const FALLBACK_THUMB = "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=100&q=80";

  let html = "";
  filtered.forEach(p => {
    const cat = state.categories.find(c => c.id === p.category);
    const catName = cat ? `${cat.icon} ${cat.name.split("(")[0]}` : (p.category || "Chưa phân loại");
    const reviewFormatted = p.reviewCount ? `${formatReviewCount(p.reviewCount)}+` : "—";

    html += `
      <tr>
        <td>
          <img src="${escapeHtml(photoSrc(p.image, 600) || FALLBACK_THUMB)}" alt="${escapeHtml(p.name)}" class="manager-thumb" loading="lazy"
               onerror="this.onerror=null;this.src='${FALLBACK_THUMB}'">
        </td>
        <td>
          <strong style="display: block; color: var(--text-main); font-size: 0.92rem;">${escapeHtml(p.name)}</strong>
          <span style="font-size: 0.78rem; color: var(--text-muted);">📍 ${escapeHtml(p.address || "Chưa có địa chỉ")} (${escapeHtml(p.district || "chưa rõ quận")})</span>
          <div style="margin-top: 5px;">
            ${p.verified
              ? `<span class="verified-flag">✅ Đã xác minh</span>`
              : `<span class="unverified-flag">⚠️ Chưa xác minh</span>`}
            <span class="source-tag">${escapeHtml(DATA_SOURCE_LABELS[p.dataSource] || p.dataSource)}</span>
          </div>
        </td>
        <td>
          <span class="sub-tag">${escapeHtml(catName)}</span>
        </td>
        <td>
          <span style="font-weight: 800; color: #D97706;">★ ${formatRating(p.rating)}</span>
          <span class="reviews-count-tag">(${escapeHtml(reviewFormatted)})</span>
        </td>
        <td style="text-align: center; white-space: nowrap;">
          <button class="btn-row-action btn-row-verify" data-toggle-verify="${escapeHtml(p.id)}"
                  title="${p.verified ? "Bỏ đánh dấu đã xác minh" : "Đánh dấu đã đối chiếu với Google Maps"}">
            ${p.verified ? "↩️ Bỏ dấu" : "✅ Xác minh"}
          </button>
          <button class="btn-row-action btn-row-edit" data-edit-place="${escapeHtml(p.id)}">
            ✏️ Sửa
          </button>
          <button class="btn-row-action btn-row-delete" data-delete-place="${escapeHtml(p.id)}">
            🗑️ Xóa
          </button>
        </td>
      </tr>
    `;
  });

  elements.managerTableBody.innerHTML = html;

  elements.managerTableBody.querySelectorAll("[data-edit-place]").forEach(btn => {
    btn.addEventListener("click", () => openEditPlaceModal(btn.dataset.editPlace));
  });
  elements.managerTableBody.querySelectorAll("[data-delete-place]").forEach(btn => {
    btn.addEventListener("click", () => deletePlace(btn.dataset.deletePlace));
  });
  elements.managerTableBody.querySelectorAll("[data-toggle-verify]").forEach(btn => {
    btn.addEventListener("click", () => toggleVerified(btn.dataset.toggleVerify));
  });
}

/**
 * Mở Modal Chỉnh Sửa Quán (Edit Place)
 */
function openEditPlaceModal(placeId) {
  const place = state.places.find(p => p.id === placeId);
  if (!place || !elements.editPlaceModal) return;

  const catSelect = document.getElementById("editPlaceCategory");
  if (catSelect) {
    let catHtml = "";
    state.categories.filter(c => c.id !== "all").forEach(c => {
      catHtml += `<option value="${c.id}">${c.icon} ${c.name}</option>`;
    });
    catSelect.innerHTML = `<option value="">— Chưa chọn danh mục —</option>` + catHtml;
    catSelect.value = place.category || "";
  }

  const distSelect = document.getElementById("editPlaceDistrict");
  if (distSelect) {
    let distHtml = "";
    DISTRICTS.filter(d => d !== "Tất cả quận").forEach(d => {
      distHtml += `<option value="${d}">${d}</option>`;
    });
    distSelect.innerHTML = `<option value="">— Chưa rõ quận —</option>` + distHtml;
    distSelect.value = place.district || "";
  }

  document.getElementById("editPlaceId").value = place.id;
  document.getElementById("editPlaceName").value = place.name;
  document.getElementById("editPlaceAddress").value = place.address;
  document.getElementById("editPlaceMapsUrl").value = place.mapsUrl || "";
  document.getElementById("editPlaceRating").value = place.rating === null ? "" : place.rating;
  document.getElementById("editPlaceReviewCount").value = place.reviewCount === null ? "" : place.reviewCount;
  document.getElementById("editPlacePrice").value = place.priceRange || "";
  document.getElementById("editPlacePriceLevel").value = place.priceLevel || "mid";
  document.getElementById("editPlaceTime").value = place.time || "";
  document.getElementById("editPlaceMustTry").value = place.mustTry || "";
  document.getElementById("editPlaceReview").value = place.review || "";
  document.getElementById("editPlaceTags").value = (place.tags || []).join(", ");
  resetPhotoField("editPlace", place.image);

  const verifiedBox = document.getElementById("editPlaceVerified");
  if (verifiedBox) verifiedBox.checked = place.verified === true;

  elements.editPlaceModal.classList.add("active");
}

/**
 * Xử lý Submit Form Chỉnh Sửa Quán
 */
function handleEditPlaceSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("editPlaceId").value;
  const index = state.places.findIndex(p => p.id === id);
  if (index === -1) return;

  const name = document.getElementById("editPlaceName").value.trim();
  const category = document.getElementById("editPlaceCategory").value;
  const district = document.getElementById("editPlaceDistrict").value;
  const address = document.getElementById("editPlaceAddress").value.trim();
  const mapsUrl = document.getElementById("editPlaceMapsUrl").value.trim() || `https://maps.google.com/?q=${encodeURIComponent(name + " " + address)}`;
  const editScores = parseRatingInput(document.getElementById("editPlaceRating").value);
  const editCountTyped = parseRatingInput(document.getElementById("editPlaceReviewCount").value).reviewCount;
  const rating = editScores.rating;
  const reviewCount = editScores.reviewCount !== null ? editScores.reviewCount : editCountTyped;
  const verified = Boolean(document.getElementById("editPlaceVerified") && document.getElementById("editPlaceVerified").checked);
  const priceRange = document.getElementById("editPlacePrice").value.trim();
  const priceLevel = document.getElementById("editPlacePriceLevel").value;
  const time = document.getElementById("editPlaceTime").value.trim();
  const mustTry = document.getElementById("editPlaceMustTry").value.trim();
  const review = document.getElementById("editPlaceReview").value.trim();
  const tagsStr = document.getElementById("editPlaceTags").value.trim();
  const image = document.getElementById("editPlaceImage").value.trim();

  state.places[index] = normalizePlace({
    ...state.places[index],
    name,
    category,
    district,
    address,
    mapsUrl,
    rating,
    reviewCount,
    priceRange,
    priceLevel,
    time,
    mustTry,
    review,
    tags: tagsStr ? tagsStr.split(",").map(t => t.trim()).filter(Boolean) : [],
    image: image || state.places[index].image,
    verified
  });

  savePlaces();
  refreshAfterDataChange();
  renderManagerTable();
  queueSheetUpsert(state.places[index]);

  elements.editPlaceModal.classList.remove("active");
  showToast(`✏️ Đã cập nhật thông tin "${name}" thành công!`);
}

/**
 * Xóa quán khỏi danh sách
 */
function deletePlace(placeId) {
  const place = state.places.find(p => p.id === placeId);
  if (!place) return;

  if (confirm(`Bạn có chắc chắn muốn xóa quán "${place.name}" khỏi danh sách không?`)) {
    state.places = state.places.filter(p => p.id !== placeId);
    // Ghi nhớ id đã xoá, nếu không quán mặc định sẽ quay lại sau khi tải lại trang
    state.deletedIds.add(placeId);
    savePlaces();
    refreshAfterDataChange();
    renderManagerTable();
    queueSheetDelete(placeId);
    showToast(`🗑️ Đã xóa "${place.name}" khỏi danh sách!`);
  }
}

/** Bật/tắt trạng thái đã đối chiếu của một quán */
function toggleVerified(placeId) {
  const place = state.places.find(p => p.id === placeId);
  if (!place) return;

  place.verified = !place.verified;
  savePlaces();
  renderPlaces();
  renderManagerTable();
  queueSheetUpsert(place);
  showToast(place.verified
    ? `✅ Đã đánh dấu "${place.name}" là đã đối chiếu`
    : `↩️ Đã bỏ dấu xác minh của "${place.name}"`);
}

/**
 * Modal Chia sẻ
 */
function openShareModal() {
  if (!elements.shareModal) return;
  const currentUrl = window.location.href;
  if (elements.shareUrlInput) {
    elements.shareUrlInput.value = currentUrl;
  }
  elements.shareModal.classList.add("active");
}

function copyShareUrl() {
  if (elements.shareUrlInput) {
    elements.shareUrlInput.select();
    navigator.clipboard.writeText(elements.shareUrlInput.value).then(() => {
      showToast("📋 Đã sao chép link Food Guide vào bộ nhớ tạm!");
    }).catch(() => {
      document.execCommand("copy");
      showToast("📋 Đã sao chép link!");
    });
  }
}

/* ===================================================================
   CÀI ĐẶT NGUỒN DỮ LIỆU

   Chỉ lưu địa chỉ endpoint. Không có khoá API nào ở phía trình duyệt,
   cũng không có ở máy chủ — xem ghi chú đầu file api/place.js.
   =================================================================== */

function openSettingsModal() {
  if (!elements.settingsModal) return;
  if (elements.settingsApiBase) {
    elements.settingsApiBase.value = state.settings.apiBaseUrl || "";
  }
  showSettingsResult("", "");
  elements.settingsModal.classList.add("active");
  refreshBackendStatus();
  refreshSheetStatus().then(status => {
    if (status.configured) checkSheetCapabilities();
  });
}

/** Dòng trạng thái Google Sheet trong modal cài đặt */
function renderSheetSettingsBox() {
  const box = elements.sheetStatusBox;
  if (!box) return;

  const pending = pendingSheetCount();
  const pendingNote = pending > 0 ? ` — ${pending} thay đổi đang chờ đẩy lên.` : "";

  if (!state.sheetStatus.online) {
    box.className = "backend-status err";
    box.textContent = "🔴 Không gọi được /api/sheet. Trang đang chạy ngoài Vercel, " +
      "hoặc chưa deploy bản mới nhất." + pendingNote;
  } else if (!state.sheetStatus.configured) {
    box.className = "backend-status";
    box.textContent = "⚪ Máy chủ chạy nhưng chưa nối Sheet. " +
      (state.sheetStatus.reason || "Thiếu biến môi trường.") +
      " Làm theo 7 bước bên dưới là xong." + pendingNote;
  } else if (state.sheetStatus.scriptError) {
    box.className = "backend-status err";
    box.textContent = "🔴 Máy chủ có đủ cấu hình nhưng gọi Apps Script không được: " +
      state.sheetStatus.scriptError + pendingNote;
  } else if (state.sheetStatus.photos === false) {
    // Đi được tới Apps Script nhưng nó trả lời như bản cũ — thiếu đúng phần ảnh
    box.className = "backend-status warn";
    box.textContent = "🟡 Đã nối Sheet, nhưng Apps Script đang chạy BẢN CŨ chưa có phần ảnh. " +
      "Dán lại tools/sheet-appscript.gs rồi Triển khai → Quản lý triển khai → bút chì → " +
      "Phiên bản: Mới. Chỉ bấm Lưu là chưa đủ." + pendingNote;
  } else {
    const rowNote = typeof state.sheetStatus.rows === "number" ? ` (${state.sheetStatus.rows} dòng)` : "";
    box.className = "backend-status ok";
    box.textContent = pending > 0
      ? `🟡 Đã nối Google Sheet${rowNote}${pendingNote} Bấm ☁️ trên đầu trang để đẩy nốt.`
      : `🟢 Đã nối Google Sheet${rowNote} — thêm, sửa, xoá quán và tải ảnh đều tự ghi lên.`;
  }

  if (elements.btnSheetPush) elements.btnSheetPush.disabled = !state.sheetStatus.configured;
  if (elements.btnSheetPull) elements.btnSheetPull.disabled = !state.sheetStatus.configured;
}

function showSettingsResult(message, kind) {
  if (!elements.settingsTestResult) return;
  elements.settingsTestResult.textContent = message;
  elements.settingsTestResult.className = "settings-test-result" + (message ? ` show ${kind}` : "");
}

function saveSettings() {
  state.settings.apiBaseUrl = elements.settingsApiBase ? elements.settingsApiBase.value.trim() : "";

  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(state.settings));
  } catch (e) {
    showToast("⚠️ Không lưu được cài đặt.");
    return;
  }

  showToast("💾 Đã lưu cài đặt endpoint.");
  refreshBackendStatus();
  closeAllModals();
}

/** Hỏi máy chủ xem đã chạy chưa, rồi hiển thị trạng thái */
async function refreshBackendStatus() {
  const box = elements.backendStatusBox;
  if (box) {
    box.textContent = "Đang kiểm tra máy chủ…";
    box.className = "backend-status";
  }

  try {
    await checkBackendHealth();
    state.backendStatus = { online: true };
    if (box) {
      box.textContent = "🟢 Máy chủ đang chạy — đọc được cả link rút gọn maps.app.goo.gl.";
      box.className = "backend-status ok";
    }
  } catch (e) {
    state.backendStatus = { online: false };
    if (box) {
      box.textContent = "🔴 Chưa kết nối được máy chủ (" + e.message +
        "). Trang vẫn dùng được, nhưng link rút gọn có thể không đọc được — " +
        "hãy dán URL đầy đủ trên thanh địa chỉ trình duyệt.";
      box.className = "backend-status err";
    }
  }

  updateMagicKeyHint();
}

/** Nút Kiểm tra kết nối: dùng đúng giá trị đang gõ trong ô, chưa cần lưu */
async function testBackend() {
  const previous = state.settings.apiBaseUrl;
  state.settings.apiBaseUrl = elements.settingsApiBase ? elements.settingsApiBase.value.trim() : "";

  elements.btnTestBackend.disabled = true;
  elements.btnTestBackend.textContent = "⏳ Đang kiểm tra...";
  showSettingsResult("", "");

  try {
    await checkBackendHealth();
    showSettingsResult("✅ Kết nối thành công. Bấm Lưu cài đặt để dùng.", "ok");
    await refreshBackendStatus();
  } catch (e) {
    state.settings.apiBaseUrl = previous;
    showSettingsResult(
      "❌ Không gọi được endpoint: " + e.message +
      ". Kiểm tra lại địa chỉ, hoặc trang đang mở bằng file:// (cần chạy qua vercel dev / bản đã deploy).",
      "err"
    );
  } finally {
    elements.btnTestBackend.disabled = false;
    elements.btnTestBackend.textContent = "🧪 Kiểm tra kết nối";
  }
}

/**
 * Đóng tất cả Modal
 */
function closeAllModals() {
  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.classList.remove("active");
  });
}

/**
 * Hiển thị Toast thông báo
 */
function showToast(message) {
  if (!elements.toastContainer) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  const span = document.createElement("span");
  span.textContent = message;
  toast.appendChild(span);
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

// Gán toàn cục cho các nút onclick còn lại trong HTML
window.resetFilters = resetFilters;
window.openAddPlaceModal = openAddPlaceModal;
window.openPlaceManagerModal = openPlaceManagerModal;
window.openSettingsModal = openSettingsModal;
window.openPlaceDetailModal = openPlaceDetailModal;
window.openEditPlaceModal = openEditPlaceModal;
window.deletePlace = deletePlace;
window.toggleVerified = toggleVerified;
window.exportGoogleSheetsCSV = exportGoogleSheetsCSV;
window.closeAllModals = closeAllModals;
