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
  theme: "light"
};

// Storage Keys
const STORAGE_KEY_PLACES = "foodguide_hanoi_places_v3";
const STORAGE_KEY_DELETED = "foodguide_hanoi_deleted_v1";
const STORAGE_KEY_PROFILE = "foodguide_hanoi_profile_v1";
const STORAGE_KEY_SETTINGS = "foodguide_hanoi_settings_v1";
const STORAGE_KEY_VIEW = "foodguide_view_mode_v1";
const STORAGE_KEY_THEME = "foodguide_theme_v1";

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
function normalizePlace(place) {
  const rating = Number(place.rating);
  const reviewCount = Number(place.reviewCount);
  return {
    ...place,
    rating: Number.isFinite(rating) && rating > 0 ? Math.min(5, rating) : null,
    reviewCount: Number.isFinite(reviewCount) && reviewCount > 0 ? Math.round(reviewCount) : null,
    tags: Array.isArray(place.tags) ? place.tags : [],
    district: place.district || "",
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
  osm: "OpenStreetMap",
  known: "Danh sách đối chiếu",
  link: "Link Google Maps",
  manual: "Tự nhập",
  import: "Nhập từ file"
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
  state.settings = { googleApiKey: "", ...safeParse(localStorage.getItem(STORAGE_KEY_SETTINGS), {}) };
  state.viewMode = localStorage.getItem(STORAGE_KEY_VIEW) || "explorer";
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
  elements.btnExportData = document.getElementById("btnExportData");
  elements.btnOpenManager = document.getElementById("btnOpenManager");
  elements.btnExportSheets = document.getElementById("btnExportSheets");
  elements.btnImportData = document.getElementById("btnImportData");
  elements.importFileInput = document.getElementById("importFileInput");

  // Cài đặt nguồn dữ liệu
  elements.btnOpenSettings = document.getElementById("btnOpenSettings");
  elements.settingsModal = document.getElementById("settingsModal");
  elements.settingsApiKey = document.getElementById("settingsApiKey");
  elements.btnSaveSettings = document.getElementById("btnSaveSettings");
  elements.btnTestApiKey = document.getElementById("btnTestApiKey");
  elements.btnClearApiKey = document.getElementById("btnClearApiKey");
  elements.btnToggleKeyVisible = document.getElementById("btnToggleKeyVisible");
  elements.settingsTestResult = document.getElementById("settingsTestResult");
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

  // Export JSON
  if (elements.btnExportData) {
    elements.btnExportData.addEventListener("click", exportDataJSON);
  }

  // Import JSON (khôi phục từ file sao lưu)
  if (elements.btnImportData) {
    elements.btnImportData.addEventListener("click", () => elements.importFileInput.click());
  }
  if (elements.importFileInput) {
    elements.importFileInput.addEventListener("change", handleImportFile);
  }

  // Cài đặt nguồn dữ liệu
  if (elements.btnOpenSettings) {
    elements.btnOpenSettings.addEventListener("click", openSettingsModal);
  }
  if (elements.btnSaveSettings) {
    elements.btnSaveSettings.addEventListener("click", saveSettings);
  }
  if (elements.btnTestApiKey) {
    elements.btnTestApiKey.addEventListener("click", testApiKey);
  }
  if (elements.btnClearApiKey) {
    elements.btnClearApiKey.addEventListener("click", clearApiKey);
  }
  if (elements.btnToggleKeyVisible) {
    elements.btnToggleKeyVisible.addEventListener("click", () => {
      const input = elements.settingsApiKey;
      input.type = input.type === "password" ? "text" : "password";
    });
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
          <img src="${escapeHtml(place.image || FALLBACK_IMG)}"
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
    <img src="${escapeHtml(place.image || FALLBACK_IMG)}"
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
  const hasKey = Boolean((state.settings.googleApiKey || "").trim());
  elements.magicKeyHint.style.display = hasKey ? "none" : "";
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

const GOOGLE_PRICE_LEVEL_MAP = {
  PRICE_LEVEL_FREE: "low",
  PRICE_LEVEL_INEXPENSIVE: "low",
  PRICE_LEVEL_MODERATE: "mid",
  PRICE_LEVEL_EXPENSIVE: "high",
  PRICE_LEVEL_VERY_EXPENSIVE: "high"
};

/** Gọi Google Places API (New). Endpoint này cho phép gọi thẳng từ trình duyệt. */
async function fetchGooglePlace(apiKey, { textQuery, lat, lng }) {
  const body = { textQuery, languageCode: "vi", regionCode: "VN", maxResultCount: 1 };
  if (lat !== null && lng !== null) {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 300 } };
  }

  const fieldMask = [
    "places.id", "places.displayName", "places.formattedAddress",
    "places.location", "places.rating", "places.userRatingCount", "places.priceLevel",
    "places.regularOpeningHours.weekdayDescriptions", "places.types",
    "places.photos", "places.googleMapsUri"
  ].join(",");

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json.error && json.error.message) || `Places API lỗi ${res.status}`);
  }
  return (json.places && json.places[0]) || null;
}

/**
 * Lấy link ảnh trực tiếp (lh3.googleusercontent.com) thay vì link có kèm khoá API.
 * skipHttpRedirect=true khiến Google trả JSON chứa photoUri, nhờ vậy khoá API
 * không bị nhúng vào dữ liệu lưu và file xuất ra.
 */
async function fetchGooglePhotoUri(apiKey, photoName) {
  const url = `https://places.googleapis.com/v1/${photoName}/media` +
              `?maxHeightPx=800&maxWidthPx=1200&skipHttpRedirect=true&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) return "";
  const json = await res.json().catch(() => ({}));
  return json.photoUri || "";
}

/** Lấy khung giờ mở cửa của hôm nay từ weekdayDescriptions */
function extractTodayOpeningHours(weekdayDescriptions) {
  if (!Array.isArray(weekdayDescriptions) || weekdayDescriptions.length === 0) return "";
  // Google xếp mảng bắt đầu từ Thứ Hai, còn getDay() coi 0 là Chủ Nhật
  const index = (new Date().getDay() + 6) % 7;
  const line = weekdayDescriptions[index] || weekdayDescriptions[0];
  const range = line.match(/(\d{1,2}:\d{2})\s*[\u2013\u2014-]\s*(\d{1,2}:\d{2})/);
  return range ? `${range[1]} - ${range[2]}` : "";
}

/** Đổ dữ liệu Google Places vào kết quả quét */
async function applyGooglePlaceData(found, place, apiKey) {
  if (place.displayName && place.displayName.text) found.name = place.displayName.text;
  if (place.formattedAddress) found.address = place.formattedAddress;
  if (place.location) {
    found.lat = place.location.latitude;
    found.lng = place.location.longitude;
  }
  if (typeof place.rating === "number") found.rating = place.rating;
  if (typeof place.userRatingCount === "number") found.reviewCount = place.userRatingCount;
  if (place.priceLevel && GOOGLE_PRICE_LEVEL_MAP[place.priceLevel]) {
    found.priceLevel = GOOGLE_PRICE_LEVEL_MAP[place.priceLevel];
  }
  if (place.regularOpeningHours) {
    found.time = extractTodayOpeningHours(place.regularOpeningHours.weekdayDescriptions);
  }
  if (place.googleMapsUri) found.mapsUrl = place.googleMapsUri;

  const category = guessCategory(found.name, place.types);
  if (category) found.category = category;

  if (place.photos && place.photos.length > 0) {
    try {
      const photoUri = await fetchGooglePhotoUri(apiKey, place.photos[0].name);
      if (photoUri) found.image = photoUri;
    } catch (e) {
      console.warn("Không tải được ảnh Google Places:", e.message);
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

    // 3. Link rút gọn -> thử giải mã qua proxy
    if (targetUrl && !found.name && isShortMapsLink(targetUrl)) {
      setAutofillBusy("⏳ Đang giải mã link rút gọn...");
      const resolved = await resolveShortLink(targetUrl);
      if (resolved) {
        mergeFound(found, parseMapsUrl(resolved));
      } else {
        notes.push("không giải mã được link rút gọn");
      }
    }

    // 4. Đoạn text dán kèm (nút Chia sẻ của app Google Maps kèm sẵn tên + địa chỉ)
    if (pastedLines.length > 0) {
      mergeFound(found, { name: pastedLines[0], address: pastedLines[1] || "" });
    }

    // 5. Google Places API - nguồn duy nhất có số sao & lượt đánh giá thật
    const apiKey = (state.settings.googleApiKey || "").trim();
    if (apiKey && (found.name || found.lat !== null)) {
      setAutofillBusy("⏳ Đang hỏi Google Places...");
      try {
        const query = found.name || `${found.lat},${found.lng}`;
        const place = await fetchGooglePlace(apiKey, { textQuery: query, lat: found.lat, lng: found.lng });
        if (place) {
          await applyGooglePlaceData(found, place, apiKey);
          found.source = "google";
        } else {
          notes.push("Google Places không tìm thấy quán này");
        }
      } catch (e) {
        notes.push("Places API: " + e.message);
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
      showToast("⚠️ Không đọc được thông tin từ link này. Hãy mở link rồi copy URL đầy đủ trên thanh địa chỉ, hoặc dán tên quán ở dòng phía trên link.");
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

    let message = `🪄 Đã điền: ${filled.join(", ")}.`;
    if (found.rating === null) {
      message += apiKey
        ? " Chưa lấy được số sao, bạn tự nhập nhé."
        : " Chưa có khoá Places API nên không lấy được số sao & lượt đánh giá.";
    }
    if (notes.length > 0) message += ` (${notes.join("; ")})`;
    showToast(message);
  } catch (err) {
    console.error("Lỗi khi quét link:", err);
    showToast("⚠️ Quét thất bại: " + err.message + ". Bạn có thể nhập tay bên dưới.");
  } finally {
    setAutofillBusy(null);
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
    rating: readNumber("newPlaceRating"),
    reviewCount: readNumber("newPlaceReviewCount"),
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

  state.places.unshift(normalizePlace(newPlace));
  savePlaces();
  refreshAfterDataChange();

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
 * Xuất dữ liệu ra file JSON để backup hoặc chia sẻ
 */
function exportDataJSON() {
  const exportData = {
    profile: state.profile,
    categories: state.categories,
    places: state.places,
    exportedAt: new Date().toISOString()
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `hanoi_foodguide_data_${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  showToast("💾 Đã tải về file dữ liệu JSON thành công!");
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
          <img src="${escapeHtml(p.image || FALLBACK_THUMB)}" alt="${escapeHtml(p.name)}" class="manager-thumb"
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
  document.getElementById("editPlaceImage").value = place.image || "";

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
  const parseOrNull = value => {
    const trimmed = String(value).trim();
    if (trimmed === "") return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  };
  const rating = parseOrNull(document.getElementById("editPlaceRating").value);
  const reviewCount = parseOrNull(document.getElementById("editPlaceReviewCount").value);
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
   NHẬP DỮ LIỆU TỪ FILE SAO LƯU
   =================================================================== */

/**
 * Khôi phục cẩm nang từ file .json đã xuất trước đó.
 * Trước đây chỉ có nút Xuất mà không có đường nhập lại, nên mất
 * LocalStorage là mất sạch dù đã tải file backup về máy.
 */
async function handleImportFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = safeParse(text, null);

    // Chấp nhận cả file xuất đầy đủ lẫn mảng quán thuần
    const incoming = Array.isArray(data) ? data : (data && Array.isArray(data.places) ? data.places : null);
    if (!incoming) {
      showToast("⚠️ File không đúng định dạng — cần file .json xuất từ chính trang này.");
      return;
    }

    const valid = incoming.filter(p => p && typeof p.name === "string" && p.name.trim());
    if (valid.length === 0) {
      showToast("⚠️ File không chứa quán nào hợp lệ.");
      return;
    }

    const replace = confirm(
      `File chứa ${valid.length} quán.\n\n` +
      `OK = Thay thế toàn bộ danh sách hiện tại (${state.places.length} quán)\n` +
      `Cancel = Gộp thêm vào danh sách, bỏ qua quán đã có`
    );

    if (replace) {
      state.deletedIds = new Set();
      state.places = valid.map(p => normalizePlace({
        ...p,
        id: p.id || "place-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
        dataSource: p.dataSource || "import"
      }));
      showToast(`📥 Đã khôi phục ${state.places.length} quán từ file sao lưu.`);
    } else {
      const existingIds = new Set(state.places.map(p => p.id));
      let added = 0;
      let skipped = 0;

      valid.forEach(p => {
        const id = p.id || "place-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
        if (existingIds.has(id) || findDuplicatePlace(p.name, p.mapsUrl)) {
          skipped++;
          return;
        }
        state.places.push(normalizePlace({ ...p, id, dataSource: p.dataSource || "import" }));
        existingIds.add(id);
        state.deletedIds.delete(id);
        added++;
      });

      showToast(`📥 Đã thêm ${added} quán mới${skipped > 0 ? `, bỏ qua ${skipped} quán đã có` : ""}.`);
    }

    // Khôi phục cả hồ sơ tác giả nếu file có
    if (data && data.profile && typeof data.profile === "object") {
      state.profile = { ...DEFAULT_PROFILE, ...data.profile };
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(state.profile));
    }

    savePlaces();
    refreshAfterDataChange();
    if (elements.placeManagerModal && elements.placeManagerModal.classList.contains("active")) {
      renderManagerTable();
    }
  } catch (e) {
    console.error("Nhập file thất bại:", e);
    showToast("⚠️ Không đọc được file: " + e.message);
  } finally {
    // Reset để chọn lại đúng file đó vẫn kích hoạt sự kiện change
    event.target.value = "";
  }
}

/* ===================================================================
   CÀI ĐẶT NGUỒN DỮ LIỆU (Google Places API key)
   =================================================================== */

function openSettingsModal() {
  if (!elements.settingsModal) return;
  if (elements.settingsApiKey) {
    elements.settingsApiKey.value = state.settings.googleApiKey || "";
    elements.settingsApiKey.type = "password";
  }
  showSettingsResult("", "");
  elements.settingsModal.classList.add("active");
}

function showSettingsResult(message, kind) {
  if (!elements.settingsTestResult) return;
  elements.settingsTestResult.textContent = message;
  elements.settingsTestResult.className = "settings-test-result" + (message ? ` show ${kind}` : "");
}

function saveSettings() {
  const key = elements.settingsApiKey ? elements.settingsApiKey.value.trim() : "";
  state.settings.googleApiKey = key;

  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(state.settings));
  } catch (e) {
    showToast("⚠️ Không lưu được cài đặt.");
    return;
  }

  updateMagicKeyHint();
  showToast(key ? "🔑 Đã lưu khoá Google Places API." : "🔑 Đã lưu — hiện chạy bằng OpenStreetMap.");
  closeAllModals();
}

function clearApiKey() {
  if (!confirm("Xoá khoá Google Places API khỏi trình duyệt này?")) return;
  state.settings.googleApiKey = "";
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(state.settings));
  if (elements.settingsApiKey) elements.settingsApiKey.value = "";
  updateMagicKeyHint();
  showSettingsResult("Đã xoá khoá. Autofill sẽ chỉ dùng OpenStreetMap.", "ok");
}

/** Gọi thử Places API để người dùng biết khoá đã cấu hình đúng chưa */
async function testApiKey() {
  const key = elements.settingsApiKey ? elements.settingsApiKey.value.trim() : "";
  if (!key) {
    showSettingsResult("Bạn chưa nhập khoá nào.", "err");
    return;
  }

  elements.btnTestApiKey.disabled = true;
  elements.btnTestApiKey.textContent = "⏳ Đang kiểm tra...";
  showSettingsResult("", "");

  try {
    const place = await fetchGooglePlace(key, {
      textQuery: "Cafe Giảng 39 Nguyễn Hữu Huân Hà Nội",
      lat: null,
      lng: null
    });

    if (place && place.displayName) {
      showSettingsResult(
        `✅ Khoá hoạt động tốt. Thử tra "${place.displayName.text}" → ` +
        `★ ${place.rating ?? "?"} (${place.userRatingCount ?? "?"} đánh giá).`,
        "ok"
      );
    } else {
      showSettingsResult("✅ Khoá hợp lệ nhưng không tìm thấy địa điểm thử nghiệm.", "ok");
    }
  } catch (e) {
    showSettingsResult("❌ " + e.message +
      " — kiểm tra lại: đã bật Places API (New) chưa, và domain trang này đã nằm trong danh sách cho phép chưa.", "err");
  } finally {
    elements.btnTestApiKey.disabled = false;
    elements.btnTestApiKey.textContent = "🧪 Kiểm tra khoá";
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
window.exportDataJSON = exportDataJSON;
window.exportGoogleSheetsCSV = exportGoogleSheetsCSV;
window.closeAllModals = closeAllModals;
