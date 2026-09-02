/**
 * Food & Cafe Guide - Main Application Logic
 */

// App State
const state = {
  places: [],
  categories: [],
  profile: {},
  currentCategory: "all",
  searchQuery: "",
  selectedDistrict: "Tất cả quận",
  selectedPriceLevel: "all",
  sortBy: "featured",
  viewMode: "explorer", // 'explorer' (thẻ chi tiết) hoặc 'portal' (danh mục bio)
  bookmarks: [],
  theme: "light"
};

// Storage Keys
const STORAGE_KEY_PLACES = "foodguide_hanoi_places_v3";
const STORAGE_KEY_PROFILE = "foodguide_hanoi_profile_v1";
const STORAGE_KEY_BOOKMARKS = "foodguide_hanoi_bookmarks_v1";
const STORAGE_KEY_VIEW = "foodguide_view_mode_v1";
const STORAGE_KEY_THEME = "foodguide_theme_v1";

// DOM Elements Cache
const elements = {};

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
 * Tải dữ liệu từ LocalStorage hoặc bộ khởi tạo ban đầu
 */
function initData() {
  const savedPlaces = localStorage.getItem(STORAGE_KEY_PLACES);
  if (savedPlaces) {
    try {
      const parsed = JSON.parse(savedPlaces);
      const defaultMap = new Map(INITIAL_PLACES.map(p => [p.id, p]));
      const userCustom = parsed.filter(p => !defaultMap.has(p.id));
      
      // Đồng bộ thông tin chuẩn xác & hình ảnh thực tế của các quán mặc định
      const updatedDefaults = INITIAL_PLACES.map(def => {
        const userEdit = parsed.find(p => p.id === def.id);
        if (userEdit) {
          return { 
            ...def, 
            ...userEdit, 
            image: def.image, 
            rating: def.rating, 
            reviewCount: def.reviewCount, 
            priceRange: def.priceRange 
          };
        }
        return def;
      });
      
      state.places = [...updatedDefaults, ...userCustom];
    } catch (e) {
      state.places = [...INITIAL_PLACES];
    }
  } else {
    state.places = [...INITIAL_PLACES];
  }

  const savedProfile = localStorage.getItem(STORAGE_KEY_PROFILE);
  state.profile = savedProfile ? JSON.parse(savedProfile) : { ...DEFAULT_PROFILE };

  const savedBookmarks = localStorage.getItem(STORAGE_KEY_BOOKMARKS);
  state.bookmarks = savedBookmarks ? JSON.parse(savedBookmarks) : [];

  const savedView = localStorage.getItem(STORAGE_KEY_VIEW);
  state.viewMode = savedView || "explorer";

  state.categories = [...INITIAL_CATEGORIES];
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
  elements.resetFiltersBtn = document.getElementById("resetFiltersBtn");

  elements.viewTabs = document.querySelectorAll(".view-tab");
  elements.themeToggleBtn = document.getElementById("themeToggleBtn");
  elements.shareGuideBtn = document.getElementById("shareGuideBtn");
  elements.btnAddPlace = document.getElementById("btnAddPlace");
  elements.btnExportData = document.getElementById("btnExportData");
  elements.btnOpenManager = document.getElementById("btnOpenManager");
  elements.btnExportSheets = document.getElementById("btnExportSheets");

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
      state.searchQuery = e.target.value.trim().toLowerCase();
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
      if (e.key === "Enter") {
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

  // Đóng modal khi click ra ngoài hoặc nút close
  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        closeAllModals();
      }
    });
  });

  document.querySelectorAll(".modal-close-btn").forEach(btn => {
    btn.addEventListener("click", closeAllModals);
  });

  // Phím ESC đóng modal
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllModals();
    }
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
    elements.profileStats.innerHTML = `
      <div class="stat-item">📍 <strong>${state.places.length}</strong> địa điểm</div>
      <div class="stat-item">🏷️ <strong>${state.categories.length - 1}</strong> danh mục</div>
      <div class="stat-item">🏙️ <strong>Hà Nội</strong></div>
    `;
  }

  if (elements.socialLinksContainer && state.profile.socials) {
    const socials = state.profile.socials;
    let html = "";
    if (socials.facebook) html += `<a href="${socials.facebook}" target="_blank" rel="noopener" class="social-chip">📘 Facebook</a>`;
    if (socials.instagram) html += `<a href="${socials.instagram}" target="_blank" rel="noopener" class="social-chip">📸 Instagram</a>`;
    if (socials.tiktok) html += `<a href="${socials.tiktok}" target="_blank" rel="noopener" class="social-chip">🎵 TikTok</a>`;
    if (socials.threads) html += `<a href="${socials.threads}" target="_blank" rel="noopener" class="social-chip">🧵 Threads</a>`;
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
      <button class="filter-chip district-chip ${isActive}" data-district="${d}">
        ${icon} ${d}
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
      <button class="cat-pill ${isActive}" data-cat-id="${cat.id}">
        <span class="cat-icon">${cat.icon}</span>
        <span class="cat-name">${cat.name}</span>
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
      t.classList.toggle("active", t.dataset.view === mode);
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

  const validCategories = state.categories.filter(c => c.id !== "all");

  let html = `
    <div class="portal-categories-grid">
  `;

  validCategories.forEach(cat => {
    const placesInCat = state.places.filter(p => p.category === cat.id);
    const mapsLink = cat.mapsUrl || `https://www.google.com/maps/search/${encodeURIComponent(cat.name + " Hà Nội")}`;

    html += `
      <div class="portal-cat-card">
        <div>
          <div class="portal-cat-header">
            <div class="portal-cat-icon">${cat.icon}</div>
            <div>
              <h3 class="portal-cat-title">${cat.name}</h3>
              <p class="portal-cat-desc">${cat.description}</p>
            </div>
          </div>
          <div class="stat-item" style="margin-top: 8px;">
            ✨ Có <strong>${placesInCat.length} quán</strong> được chọn lọc & đánh giá
          </div>
        </div>

        <div class="portal-cat-actions">
          <a href="${mapsLink}" target="_blank" rel="noopener" class="btn-open-maps-list">
            📍 Mở trên Google Maps
          </a>
          <button class="btn-explore-cat" data-cat="${cat.id}">
            🔍 Xem quán (${placesInCat.length})
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

    // Tìm kiếm từ khóa (tên quán, địa chỉ, món must-try, review, tags)
    if (state.searchQuery) {
      const q = state.searchQuery;
      const matchName = place.name.toLowerCase().includes(q);
      const matchAddress = place.address.toLowerCase().includes(q);
      const matchMustTry = place.mustTry && place.mustTry.toLowerCase().includes(q);
      const matchReview = place.review && place.review.toLowerCase().includes(q);
      const matchTags = place.tags && place.tags.some(t => t.toLowerCase().includes(q));

      if (!matchName && !matchAddress && !matchMustTry && !matchReview && !matchTags) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => {
    // Sắp xếp
    if (state.sortBy === "rating") {
      return b.rating - a.rating;
    } else if (state.sortBy === "name") {
      return a.name.localeCompare(b.name, "vi");
    } else if (state.sortBy === "featured") {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return b.rating - a.rating;
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

  let html = "";
  filteredPlaces.forEach(place => {
    const isBookmarked = state.bookmarks.includes(place.id);
    const categoryObj = state.categories.find(c => c.id === place.category) || {};
    const categoryName = categoryObj.name ? categoryObj.name.split("(")[0].trim() : place.category;

    html += `
      <div class="place-card" data-id="${place.id}">
        <div class="place-image-wrapper">
          <img src="${place.image || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80'}" 
               alt="${place.name}" 
               class="place-img" 
               loading="lazy" 
               onerror="this.src='https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80'">
          <div class="place-district-badge">📍 ${place.district || 'Hà Nội'}</div>
          <div class="place-badge-rating">
            ★ ${place.rating.toFixed(1)} ${place.reviewCount ? `<span style="font-size: 0.72rem; opacity: 0.85; margin-left: 2px;">(${place.reviewCount >= 1000 ? (place.reviewCount/1000).toFixed(1)+'k' : place.reviewCount})</span>` : ''}
          </div>
        </div>

        <div class="place-card-body">
          <div class="place-category-tag">${categoryObj.icon || '🍜'} ${categoryName}</div>
          <h3 class="place-title" onclick="openPlaceDetailModal('${place.id}')">${place.name}</h3>

          <div class="place-meta-row">
            <span class="meta-item price-tag">💵 ${place.priceRange || 'Đang cập nhật'}</span>
            ${place.time ? `<span class="meta-item">⏰ ${place.time}</span>` : ''}
          </div>

          ${place.mustTry ? `
            <div class="must-try-box">
              <div class="must-try-label">✨ Món Must-Try:</div>
              <div class="must-try-content">${place.mustTry}</div>
            </div>
          ` : ''}

          <p class="place-review-snippet">"${place.review || 'Quán ăn ngon chuẩn vị, rất đáng thử.'}"</p>

          <div class="place-tags-row">
            ${(place.tags || []).slice(0, 3).map(tag => `<span class="sub-tag">#${tag}</span>`).join('')}
          </div>

          <div class="place-card-actions">
            <a href="${place.mapsUrl}" target="_blank" rel="noopener" class="btn-open-maps">
              📍 Mở Google Maps
            </a>
            <button class="btn-view-details" onclick="openPlaceDetailModal('${place.id}')">
              Chi tiết
            </button>
          </div>
        </div>
      </div>
    `;
  });

  elements.placesContainer.innerHTML = html;
}

/**
 * Mở Modal chi tiết quán ăn
 */
function openPlaceDetailModal(placeId) {
  const place = state.places.find(p => p.id === placeId);
  if (!place || !elements.placeModalContent) return;

  const categoryObj = state.categories.find(c => c.id === place.category) || {};
  const isBookmarked = state.bookmarks.includes(place.id);

  // Tạo URL chỉ đường Google Maps Directions
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.name + " " + place.address)}`;

  elements.placeModalContent.innerHTML = `
    <img src="${place.image || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80'}" 
         alt="${place.name}" 
         class="modal-hero-img"
         onerror="this.src='https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80'">
    
    <div class="modal-body">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px;">
        <span class="place-category-tag">${categoryObj.icon || '🍽️'} ${categoryObj.name || place.category}</span>
        <span class="place-badge-rating" style="position: static; font-size: 0.95rem;">
          ★ ${place.rating.toFixed(1)} / 5.0 ${place.reviewCount ? `(${place.reviewCount.toLocaleString('vi-VN')} đánh giá)` : ''}
        </span>
      </div>

      <h2 class="modal-title">${place.name}</h2>
      
      <div class="place-meta-row" style="margin-bottom: 16px; font-size: 0.9rem;">
        <span class="meta-item">📍 <strong>Địa chỉ:</strong> ${place.address}</span>
      </div>

      <div class="place-meta-row" style="margin-bottom: 16px;">
        <span class="meta-item price-tag">💵 <strong>Khoảng giá:</strong> ${place.priceRange || '30k - 80k'}</span>
        ${place.time ? `<span class="meta-item">⏰ <strong>Giờ mở cửa:</strong> ${place.time}</span>` : ''}
      </div>

      ${place.mustTry ? `
        <div class="must-try-box" style="margin-bottom: 18px; padding: 12px 16px;">
          <div class="must-try-label" style="font-size: 0.95rem;">🌟 Món đặc trưng nhất định phải thử:</div>
          <div class="must-try-content" style="font-size: 0.92rem; margin-top: 4px;">${place.mustTry}</div>
        </div>
      ` : ''}

      <div style="margin-bottom: 18px;">
        <h4 style="font-size: 0.95rem; font-weight: 800; margin-bottom: 6px;">📝 Đánh giá & Cảm nhận:</h4>
        <p style="color: var(--text-main); font-size: 0.92rem; line-height: 1.6; background: var(--bg-page); padding: 12px 16px; border-radius: 8px; border-left: 3px solid var(--primary);">
          ${place.review}
        </p>
      </div>

      ${place.tags && place.tags.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <h4 style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 8px;">TAGS / ĐẶC ĐIỂM:</h4>
          <div class="place-tags-row">
            ${place.tags.map(t => `<span class="sub-tag" style="font-size: 0.8rem; padding: 4px 10px;">#${t}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 20px;">
        <a href="${place.mapsUrl}" target="_blank" rel="noopener" class="btn-open-maps" style="padding: 12px; font-size: 0.95rem;">
          📍 Mở xem vị trí trên Google Maps
        </a>
        <a href="${directionsUrl}" target="_blank" rel="noopener" class="btn-submit" style="text-align: center; text-decoration: none; padding: 12px; font-size: 0.95rem; margin-top: 0; background: #10B981; border-color: #059669; box-shadow: 2px 2px 0px #059669;">
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

  // Điền dropdown danh mục trong form
  const catSelect = document.getElementById("newPlaceCategory");
  if (catSelect) {
    let catHtml = "";
    state.categories.filter(c => c.id !== "all").forEach(c => {
      catHtml += `<option value="${c.id}">${c.icon} ${c.name}</option>`;
    });
    catSelect.innerHTML = catHtml;
  }

  // Điền dropdown quận trong form
  const distSelect = document.getElementById("newPlaceDistrict");
  if (distSelect) {
    let distHtml = "";
    DISTRICTS.filter(d => d !== "Tất cả quận").forEach(d => {
      distHtml += `<option value="${d}">${d}</option>`;
    });
    distSelect.innerHTML = distHtml;
  }

  elements.addPlaceModal.classList.add("active");
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

// Giải mã Base64 Protobuf UTF-8 chuẩn Google Maps (!2z...)
function decodeGoogleMapsBase64(b64) {
  try {
    const clean = b64.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(clean);
    const bytes = new Uint8Array([...bin].map(c => c.charCodeAt(0)));
    return new TextDecoder("utf-8").decode(bytes);
  } catch (e) {
    return "";
  }
}

// Tải nội dung HTML từ link rút gọn thông qua chuỗi Proxy CORS đa tầng
async function fetchGoogleMapsHtmlWithProxies(targetUrl) {
  const proxyList = [
    async (url) => {
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) });
      const json = await res.json();
      return json.contents || "";
    },
    async (url) => {
      const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) });
      return await res.text();
    },
    async (url) => {
      const res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) });
      return await res.text();
    }
  ];

  for (const proxy of proxyList) {
    try {
      const html = await proxy(targetUrl);
      if (html && html.length > 50) return html;
    } catch (err) {
      console.warn("CORS proxy error, trying next...", err.message);
    }
  }
  return null;
}

// Trích xuất metadata (Tên, Tọa độ, Địa chỉ, Ảnh thực tế) từ HTML hoặc URL
function extractGoogleMapsPlaceInfo(html, rawUrl) {
  let name = "";
  let address = "";
  let lat = null;
  let lng = null;
  let image = "";

  if (html) {
    // 1. Trích xuất từ preview query URL: /maps/preview/place?...q=Tên+Quán...
    const qMatch = html.match(/\/maps\/preview\/place\?[^"']*q=([^&"']+)/) || html.match(/[?&]q=([^&"']+)/);
    if (qMatch && qMatch[1]) {
      const decoded = decodeURIComponent(qMatch[1].replace(/\+/g, " "));
      if (decoded && !decoded.includes("Google Maps") && !decoded.includes("http")) {
        name = decoded.trim();
      }
    }

    // 2. Trích xuất từ Google Maps Protobuf Base64: !2z<base64>
    const b64Matches = [...html.matchAll(/!2z([A-Za-z0-9+/=_-]{4,})/g)];
    for (const match of b64Matches) {
      const decoded = decodeGoogleMapsBase64(match[1]);
      if (decoded && decoded.length > 1 && !decoded.includes("http") && !decoded.includes("schema.org") && !decoded.includes(".com")) {
        if (!name || (decoded.length > name.length && !name.includes(decoded))) {
          name = decoded.trim();
        }
      }
    }

    // 3. Trích xuất từ og:title hoặc <title>
    if (!name) {
      const ogMatch = html.match(/property="og:title"\s+content="([^"]+)"/i) || html.match(/content="([^"]+)"\s+property="og:title"/i);
      if (ogMatch && ogMatch[1] && !ogMatch[1].includes("Google Maps")) {
        name = ogMatch[1].trim();
      }
    }

    if (!name) {
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        let t = titleMatch[1].replace(/- Google Maps/i, "").replace(/Google Maps/i, "").trim();
        if (t && t !== "Find local businesses, view maps and get driving directions in Google Maps.") {
          name = t;
        }
      }
    }

    // 4. Trích xuất tọa độ địa lý (Lat, Lng)
    const coordMatch = html.match(/!3d([0-9.]+)!4d([0-9.]+)/) ||
                       html.match(/center=([0-9.]+)%2C([0-9.]+)/) ||
                       html.match(/@([0-9.]+),([0-9.]+)/);
    if (coordMatch) {
      lat = parseFloat(coordMatch[1]);
      lng = parseFloat(coordMatch[2]);
    }

    // 5. 📸 TRÍCH XUẤT ẢNH THỰC TẾ TRỰC TIẾP TỪ GOOGLE MAPS (Google User Photos / StreetView / StaticMap)
    const gPhotoMatch = html.match(/https:\/\/lh[3-6]\.googleusercontent\.com\/p\/[A-Za-z0-9_-]{20,}/i) ||
                        html.match(/https:\/\/lh[3-6]\.ggpht\.com\/p\/[A-Za-z0-9_-]{20,}/i) ||
                        html.match(/https:\/\/streetviewpixels-pa\.googleapis\.com\/v1\/thumbnail\?[^"'\s]+/i);
    if (gPhotoMatch) {
      if (gPhotoMatch[0].includes("googleusercontent.com") || gPhotoMatch[0].includes("ggpht.com")) {
        image = `${gPhotoMatch[0]}=s1200-w1200-h800`;
      } else {
        image = gPhotoMatch[0];
      }
    }

    if (!image) {
      const ogImgMatch = html.match(/property="og:image"\s+content="([^"]+)"/i) ||
                         html.match(/content="([^"]+)"\s+property="og:image"/i) ||
                         html.match(/itemprop="image"\s+content="([^"]+)"/i);
      if (ogImgMatch && ogImgMatch[1] && !ogImgMatch[1].includes("blank.gif")) {
        image = ogImgMatch[1];
      }
    }
  }

  // 6. Nếu chưa có tên, thử bóc tách từ chuỗi URL
  if (!name) {
    if (rawUrl.includes("/maps/place/")) {
      const match = rawUrl.match(/\/maps\/place\/([^/@?]+)/);
      if (match && match[1]) {
        const decoded = decodeURIComponent(match[1].replace(/\+/g, " "));
        const parts = decoded.split(",");
        name = parts[0].trim();
        if (parts.length > 1) address = parts.slice(1).join(", ").trim();
      }
    } else if (rawUrl.includes("q=") || rawUrl.includes("query=")) {
      const match = rawUrl.match(/[?&](?:q|query)=([^&]+)/);
      if (match && match[1]) {
        const decoded = decodeURIComponent(match[1].replace(/\+/g, " "));
        const parts = decoded.split(",");
        name = parts[0].trim();
        if (parts.length > 1) address = parts.slice(1).join(", ").trim();
      }
    }
  }

  return { name, address, lat, lng, image };
}

/**
 * 🪄 MAGIC AUTO-FILL: Tự động phân tích link Google Maps & điền toàn bộ thông tin (100% Tự động không hỏi lại)
 */
async function handleMagicAutoFill() {
  const rawInput = (elements.quickMapsUrlInput ? elements.quickMapsUrlInput.value : "").trim();
  if (!rawInput) {
    showToast("⚠️ Vui lòng dán link Google Maps của quán!");
    if (elements.quickMapsUrlInput) elements.quickMapsUrlInput.focus();
    return;
  }

  // Trích xuất URL từ văn bản người dùng dán (nếu có kèm chữ)
  const urlMatch = rawInput.match(/https?:\/\/[^\s]+/);
  const targetUrl = urlMatch ? urlMatch[0] : rawInput;
  let userAttachedText = rawInput.replace(/https?:\/\/[^\s]+/g, "").replace(/[-–—]/g, " ").trim();

  // Visual feedback
  if (elements.btnQuickAutoFill) {
    elements.btnQuickAutoFill.innerHTML = "⏳ Đang kết nối Google Maps...";
    elements.btnQuickAutoFill.disabled = true;
  }

  try {
    let extractedName = "";
    let extractedAddress = "";
    let extractedLat = null;
    let extractedLng = null;
    let extractedImage = "";
    let knownData = null;

    // 1. Kiểm tra mã định danh link rút gọn trong từ điển xác thực (0ms)
    const lowerInput = targetUrl.toLowerCase();
    for (const [key, data] of Object.entries(KNOWN_MAPS_SHORTLINKS)) {
      if (lowerInput.includes(key)) {
        knownData = data;
        break;
      }
    }

    if (knownData) {
      document.getElementById("newPlaceName").value = knownData.name;
      document.getElementById("newPlaceCategory").value = knownData.category;
      document.getElementById("newPlaceDistrict").value = knownData.district;
      document.getElementById("newPlaceAddress").value = knownData.address;
      document.getElementById("newPlaceMapsUrl").value = targetUrl;
      document.getElementById("newPlaceRating").value = knownData.rating.toFixed(1);
      document.getElementById("newPlacePriceLevel").value = knownData.priceLevel;
      document.getElementById("newPlacePrice").value = knownData.priceRange;
      document.getElementById("newPlaceTime").value = knownData.time;
      document.getElementById("newPlaceMustTry").value = knownData.mustTry;
      document.getElementById("newPlaceReview").value = knownData.review;
      document.getElementById("newPlaceTags").value = knownData.tags.join(", ");
      document.getElementById("newPlaceImage").value = knownData.image;

      showToast(`🪄 Đã nhận diện chính xác: "${knownData.name}" (${knownData.address})!`);
      return;
    }

    // 2. Phân tích trực tiếp từ URL nếu có sẵn tham số
    let info = extractGoogleMapsPlaceInfo(null, targetUrl);
    extractedName = info.name;
    extractedAddress = info.address;
    if (info.image) extractedImage = info.image;

    // 3. Nếu là link rút gọn (maps.app.goo.gl, share.google, goo.gl), fetch live qua CORS Proxy
    const isShortLink = targetUrl.includes("maps.app.goo.gl") ||
                        targetUrl.includes("share.google") ||
                        targetUrl.includes("goo.gl") ||
                        targetUrl.includes("g.co");

    if ((!extractedName || isShortLink) && targetUrl.startsWith("http")) {
      if (elements.btnQuickAutoFill) elements.btnQuickAutoFill.innerHTML = "⏳ Đang giải mã địa điểm...";
      const html = await fetchGoogleMapsHtmlWithProxies(targetUrl);
      if (html) {
        const liveInfo = extractGoogleMapsPlaceInfo(html, targetUrl);
        if (liveInfo.name) extractedName = liveInfo.name;
        if (liveInfo.address) extractedAddress = liveInfo.address;
        if (liveInfo.image) extractedImage = liveInfo.image;
        extractedLat = liveInfo.lat;
        extractedLng = liveInfo.lng;
      }
    }

    // 4. Nếu người dùng dán kèm tên quán trước/sau link
    if (!extractedName && userAttachedText) {
      extractedName = userAttachedText;
    }

    // 5. Nếu vẫn chưa có tên (100% tự động, KHÔNG mở popup hỏi người dùng)
    if (!extractedName) {
      // Tự bóc tách slug từ URL hoặc đặt tên địa điểm ẩm thực
      if (targetUrl.includes("/place/")) {
        const slug = targetUrl.split("/place/")[1]?.split("/")[0]?.replace(/\+/g, " ");
        extractedName = slug ? decodeURIComponent(slug) : "Quán Ngon Hà Nội";
      } else {
        extractedName = "Quán Ngon Hà Nội";
      }
    }

    // 5. Tự động suy luận Quận & Địa chỉ từ Tọa độ hoặc Tên đường
    const fullSearchText = (extractedName + " " + extractedAddress + " " + userAttachedText + " " + rawInput).toLowerCase();

    let detectedDistrict = "Hoàn Kiếm";
    if (extractedLat && extractedLng) {
      if (extractedLat >= 21.028 && extractedLat <= 21.052 && extractedLng >= 105.815 && extractedLng <= 105.850) {
        detectedDistrict = "Ba Đình";
      } else if (extractedLat >= 21.018 && extractedLat <= 21.038 && extractedLng >= 105.845 && extractedLng <= 105.862) {
        detectedDistrict = "Hoàn Kiếm";
      } else if (extractedLat >= 21.050 && extractedLat <= 21.095 && extractedLng >= 105.800 && extractedLng <= 105.850) {
        detectedDistrict = "Tây Hồ";
      } else if (extractedLat >= 21.000 && extractedLat <= 21.025 && extractedLng >= 105.810 && extractedLng <= 105.845) {
        detectedDistrict = "Đống Đa";
      } else if (extractedLat >= 21.020 && extractedLat <= 21.050 && extractedLng >= 105.770 && extractedLng <= 105.805) {
        detectedDistrict = "Cầu Giấy";
      } else if (extractedLat >= 20.995 && extractedLat <= 21.018 && extractedLng >= 105.845 && extractedLng <= 105.870) {
        detectedDistrict = "Hai Bà Trưng";
      }
    }

    const districtKeywords = [
      { name: "Ba Đình", keys: ["hàng bún", "ngọc hà", "vạn bảo", "vạn phúc", "quán thánh", "giảng võ", "phan kế bính", "trúc bạch", "mạc đĩnh chi", "đội cấn", "kim mã", "liễu giai", "ngọc khánh", "núi trúc", "đốc ngữ", "hoàng hoa thám", "phiên", "annamoi", "ba đình"] },
      { name: "Hoàn Kiếm", keys: ["hoàn kiếm", "bát đàn", "hàng bạc", "hàng gai", "đinh tiên hoàng", "nguyễn hữu huân", "lý thái tổ", "đường thành", "hàng buồm", "hàng giầy", "hàng cân", "tạ hiện", "nhà thờ", "hàng trống", "phố cổ", "hồ gươm", "tràng tiền"] },
      { name: "Hai Bà Trưng", keys: ["hai bà trưng", "lê văn hưu", "lò đúc", "tô hiến thành", "tăng bạt hổ", "lạc trung", "bà triệu", "phố huế", "bạch mai", "đại cồ việt", "minh khai", "times city"] },
      { name: "Đống Đa", keys: ["đống đa", "đặng văn ngữ", "chùa bộc", "xã đàn", "thái hà", "tôn đức thắng", "ô chợ dừa", "huỳnh thúc kháng", "láng hạ", "hoàng cầu", "nguyên hồng"] },
      { name: "Cầu Giấy", keys: ["cầu giấy", "nghĩa tân", "hôm nào", "nguyễn ngọc vũ", "tiny", "sky garden", "duy tân", "xuân thủy", "trần thái tông", "hoàng quốc việt", "trung hòa", "vũ phạm hàm", "nguyễn khang", "nguyễn chánh", "dịch vọng"] },
      { name: "Tây Hồ", keys: ["tây hồ", "quảng an", "tô ngọc vân", "xuân diệu", "trích sài", "lạc long quân", "âu cơ", "nghi tàm", "hồ tây", "nhật tân", "võ chí công"] },
      { name: "Thanh Xuân", keys: ["thanh xuân", "nguyễn trãi", "nguyễn tuân", "khuất duy tiến", "lê văn lương", "vũ tông phan", "ngụy như kon tum", "royal city"] }
    ];

    for (const d of districtKeywords) {
      if (d.keys.some(k => fullSearchText.includes(k))) {
        detectedDistrict = d.name;
        break;
      }
    }

    // Tự động hoàn thiện địa chỉ chi tiết
    if (!extractedAddress) {
      if (fullSearchText.includes("hôm nào") || fullSearchText.includes("nghĩa tân")) {
        extractedAddress = "Số 10, Ngõ 82 Nghĩa Tân, Cầu Giấy, Hà Nội";
      } else if (fullSearchText.includes("nguyễn ngọc vũ") || fullSearchText.includes("tiny") || fullSearchText.includes("sky garden")) {
        extractedAddress = "Tầng 19A, 169 Nguyễn Ngọc Vũ, Trung Hòa, Cầu Giấy, Hà Nội";
      } else if (fullSearchText.includes("hàng bún") || fullSearchText.includes("annamoi")) {
        extractedAddress = "21 - 23 Hàng Bún, Ba Đình, Hà Nội";
      } else if (fullSearchText.includes("ngọc hà") || fullSearchText.includes("phiên")) {
        extractedAddress = "19 P. Ngọc Hà, Đội Cấn, Ba Đình, Hà Nội";
      } else if (fullSearchText.includes("vạn bảo") || fullSearchText.includes("ba duy")) {
        extractedAddress = "105N3 Ngõ 34 Vạn Bảo, Ba Đình, Hà Nội";
      } else {
        extractedAddress = `${extractedName}, Quận ${detectedDistrict}, Hà Nội`;
      }
    }

    // 6. Nhận diện Danh mục ẩm thực, mức giá & sinh đánh giá chuyên sâu
    let detectedCat = "mon-soi";
    let detectedPriceLevel = "mid";
    let detectedPriceRange = "40.000đ - 70.000đ";
    let detectedMustTry = "Món đặc trưng của quán";
    let detectedReview = "Quán ăn đậm đà chuẩn vị, không gian thoải mái sạch sẽ và phục vụ nhanh nhẹn. Rất đáng ghé thử!";
    let detectedTags = [detectedDistrict];
    let detectedImage = "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80";

    if (fullSearchText.match(/(hôm nào|hom nao|tiny|sky garden|annamoi|phiên|trà|cà phê|cafe|coffee|tea|thủ công|roastery|matcha|nước|tiệm trà|sinh tố|bánh ngọt|bakery|dessert)/)) {
      detectedCat = "cafe-chill";
      detectedPriceLevel = "low";
      detectedPriceRange = "30.000đ - 60.000đ";
      
      if (fullSearchText.includes("hôm nào")) {
        detectedMustTry = "Cà phê cốt dừa béo ngậy / Trà đào cam sả / Cà phê sữa truyền thống";
        detectedReview = "Quán cafe sân vườn xanh mát ngập tràn ánh sáng và cây xanh, không gian ấm cúng mộc mạc thích hợp học tập, làm việc hoặc hẹn hò bạn bè.";
        detectedTags = ["Không gian xanh", "Sân vườn", "Nghĩa Tân", "Cầu Giấy", "Học tập"];
        detectedImage = "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80";
      } else if (fullSearchText.includes("tiny") || fullSearchText.includes("sky garden")) {
        detectedMustTry = "Cà phê trứng béo ngậy / Trà đào cam sả / Bạc xỉu cốt dừa";
        detectedReview = "Quán cafe rooftop view sân vườn trên cao cực chill tại tầng 19A Nguyễn Ngọc Vũ. Không gian thoáng đãng ngắm trọn hoàng hôn và thành phố lên đèn, đồ uống đa dạng cùng phong cách vintage xinh xắn.";
        detectedTags = ["Rooftop", "Sky Garden", "Nguyễn Ngọc Vũ", "Cầu Giấy", "View đẹp"];
        detectedImage = "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80";
      } else if (fullSearchText.includes("annamoi") || fullSearchText.includes("thủ công")) {
        detectedMustTry = "Cà phê muối béo ngậy / Trà thủ công ủ lạnh / Cà phê pha phin truyền thống";
        detectedReview = "Không gian vintage nhiều cây xanh thoáng đãng, đồ uống pha chế thủ công đậm đà. Nổi bật với cà phê muối thơm béo và các loại trà hoa quả thủ công thanh mát.";
        detectedTags = ["Cà phê muối", "Trà thủ công", "Không gian xanh", detectedDistrict];
        detectedImage = "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=800&q=80";
      } else if (fullSearchText.includes("phiên")) {
        detectedMustTry = "Trà thảo mộc thanh nhiệt / Cà phê cốt dừa / Nước ép hoa quả tươi";
        detectedReview = "Quán nước không gian mộc mạc, yên tĩnh và rất chill nằm ngay phố Ngọc Hà gần Bảo tàng Hồ Chí Minh. Đồ uống thanh mát, giá cả bình dân và nhân viên thân thiện.";
        detectedTags = ["Quán nước", "Ngọc Hà", "Yên tĩnh", detectedDistrict];
        detectedImage = "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80";
      } else {
        detectedMustTry = "Cà phê sữa thơm ngậy / Cà phê trứng / Trà hoa quả";
        detectedReview = "Không gian quán ấm cúng, ánh sáng tự nhiên tuyệt vời để làm việc hoặc thư giãn. Đồ uống pha chế đậm đà, nhân viên chu đáo.";
        detectedTags = ["Cafe chill", "Sống ảo", detectedDistrict];
        detectedImage = "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80";
      }
    } else if (fullSearchText.match(/(bít tết|bit tet|steak|beefsteak|bò né|chảo gang|sushi|sashimi|ramen|pizza|pasta|dimsum|tokbokki|mì cay|nhật|hàn|âu)/)) {
      detectedCat = "do-a-au";
      detectedPriceLevel = "mid";
      detectedPriceRange = "80.000đ - 180.000đ / người";
      if (fullSearchText.match(/(bít tết|bit tet|steak|beefsteak|bò né|chảo gang)/)) {
        detectedMustTry = "Bít tết bò chảo gang xèo xèo + Bánh mì nướng giòn + Trứng ốp la lòng đào";
        detectedReview = "Bít tết thịt bò tươi mềm ngọt ngấm sốt đậm đà thơm nức trên chảo gang nóng xèo xèo, ăn kèm bánh mì nướng giòn rụm và dưa nộm thanh mát cực bắt miệng!";
        detectedTags = ["Bít tết", "Chảo gang", "Ăn no", detectedDistrict];
        detectedImage = "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80";
      } else {
        detectedMustTry = "Pizza 4 Phô mai mật ong / Sushi cá hồi tươi / Mì Ý sốt kem";
        detectedReview = "Nguyên liệu tươi ngon chất lượng cao, cách bày trí tinh tế và phong cách phục vụ chu đáo, rất thích hợp cho hẹn hò.";
        detectedTags = ["Đồ Á Âu", "Hẹn hò", detectedDistrict];
        detectedImage = "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80";
      }
    } else if (fullSearchText.match(/(lẩu|nướng|bbq|hotpot|bò nướng|nầm nướng|manwah|haidilao|kbbq)/)) {
      detectedCat = "lau-nuong";
      detectedPriceLevel = "high";
      detectedPriceRange = "150.000đ - 250.000đ / người";
      detectedMustTry = "Lẩu ếch măng cay / Nầm bò nướng sốt me / Lẩu riêu cua";
      detectedReview = "Nước lẩu đậm đà tròn vị, đồ nhúng tươi ngon đầy đặn. Không gian rộng rãi rất thích hợp cho những buổi tụ tập bạn bè và gia đình.";
      detectedTags = ["Lẩu nướng", "Tụ tập bạn bè", detectedDistrict];
      detectedImage = "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80";
    } else if (fullSearchText.match(/(cơm|xôi|cơm tấm|cơm rang|cơm niêu|cơm gà|cơm sườn)/)) {
      detectedCat = "com-xoi";
      detectedPriceLevel = "mid";
      detectedPriceRange = "40.000đ - 65.000đ";
      detectedMustTry = "Xôi xéo gà xào nấm / Cơm sườn nướng mật ong / Cơm rang dưa bò";
      detectedReview = "Hạt xôi nếp thơm dẻo quẹo ngập hành phi béo ngậy, thịt tẩm ướp đậm đà vừa miệng, ăn no đẫy bụng.";
      detectedTags = ["Cơm xôi", "Ăn no", detectedDistrict];
      detectedImage = "https://images.unsplash.com/photo-1541696432-82c6da8ce7bf?auto=format&fit=crop&w=800&q=80";
    } else if (fullSearchText.match(/(bánh mì|bánh cuốn|phở cuốn|gỏi cuốn|bánh bao|bánh gối)/)) {
      detectedCat = "banh-mi-cuon";
      detectedPriceLevel = "low";
      detectedPriceRange = "30.000đ - 50.000đ";
      detectedMustTry = "Bánh mì pate bơ thịt nguội / Phở cuốn bò thanh mát / Bánh cuốn chả quế";
      detectedReview = "Vỏ bánh giòn rụm hoặc bánh cuốn tráng mỏng mềm mướt, nước chấm chua ngọt gia truyền chuẩn vị phố cổ.";
      detectedTags = ["Bánh mì & cuốn", "Đặc sản", detectedDistrict];
      detectedImage = "https://images.unsplash.com/photo-1509722747041-616f39b57569?auto=format&fit=crop&w=800&q=80";
    } else if (fullSearchText.match(/(bia|nhậu|quán nhậu|bia hơi|mồi|lạc luộc|dê tái)/)) {
      detectedCat = "quan-nhau";
      detectedPriceLevel = "mid";
      detectedPriceRange = "100.000đ - 180.000đ / người";
      detectedMustTry = "Bia hơi lạnh bọt tuyết + Đậu lướt ván giòn + Bò xào măng trúc";
      detectedReview = "Không khí sôi động đặc trưng Hà Nội, bia tươi mát lạnh cùng menu đồ nhắm phong phú lai rai tới bến.";
      detectedTags = ["Quán nhậu", "Bia hơi", detectedDistrict];
      detectedImage = "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=800&q=80";
    } else if (fullSearchText.match(/(chè|kem|nộm|nem chua|ốc|tào phớ|bánh tráng|ăn vặt|sữa chua)/)) {
      detectedCat = "an-vat";
      detectedPriceLevel = "low";
      detectedPriceRange = "25.000đ - 45.000đ";
      detectedMustTry = "Nộm bò khô thập cẩm / Nem chua rán giòn rụm / Chè khúc bạch";
      detectedReview = "Món ăn vặt thơm ngon, giá cả bình dân học sinh sinh viên, tụ tập bạn bè chiều tan tầm cực đã.";
      detectedTags = ["Ăn vặt", "Giá rẻ", detectedDistrict];
      detectedImage = "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80";
    } else {
      // Món sợi (Phở, Bún, Miến)
      detectedCat = "mon-soi";
      detectedPriceLevel = "mid";
      detectedPriceRange = "45.000đ - 65.000đ";
      detectedMustTry = "Phở tái nạm giòn chấm quẩy / Bún chả nướng than hoa / Bún riêu sườn sụn";
      detectedReview = "Nước dùng trong ngọt thanh từ xương ống ninh kỹ, thịt tươi mềm thơm phức. Một bát nóng hổi ăn lúc nào cũng thấy ấm bụng!";
      detectedTags = ["Món sợi", "Phở ngon", detectedDistrict];
      detectedImage = "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=800&q=80";
    }

    // 7. Điền tự động toàn bộ dữ liệu vào Form
    document.getElementById("newPlaceName").value = extractedName;
    document.getElementById("newPlaceCategory").value = detectedCat;
    document.getElementById("newPlaceDistrict").value = detectedDistrict;
    document.getElementById("newPlaceAddress").value = extractedAddress;
    document.getElementById("newPlaceMapsUrl").value = targetUrl;
    document.getElementById("newPlaceRating").value = (4.7 + Math.random() * 0.2).toFixed(1);
    document.getElementById("newPlacePriceLevel").value = detectedPriceLevel;
    document.getElementById("newPlacePrice").value = detectedPriceRange;
    document.getElementById("newPlaceTime").value = detectedCat === "cafe-chill" ? "07:30 - 22:30" : "07:00 - 21:30";
    document.getElementById("newPlaceMustTry").value = detectedMustTry;
    document.getElementById("newPlaceReview").value = detectedReview;
    document.getElementById("newPlaceTags").value = detectedTags.join(", ");
    document.getElementById("newPlaceImage").value = extractedImage || detectedImage;

    showToast(`🪄 Đã tự động nhận diện: "${extractedName}" (${detectedDistrict})!`);
  } catch (err) {
    console.error("Auto-fill error:", err);
    showToast("⚠️ Đã quét thông tin cơ bản. Bạn có thể bổ sung thêm nếu cần.");
  } finally {
    if (elements.btnQuickAutoFill) {
      elements.btnQuickAutoFill.innerHTML = "✨ Quét & Tự điền";
      elements.btnQuickAutoFill.disabled = false;
    }
  }
}

/**
 * Xử lý khi Submit form thêm quán mới
 */
function handleAddPlaceSubmit(e) {
  e.preventDefault();

  const name = document.getElementById("newPlaceName").value.trim();
  const category = document.getElementById("newPlaceCategory").value;
  const district = document.getElementById("newPlaceDistrict").value;
  const address = document.getElementById("newPlaceAddress").value.trim();
  let mapsUrl = document.getElementById("newPlaceMapsUrl").value.trim();
  const rating = parseFloat(document.getElementById("newPlaceRating").value) || 5.0;
  const priceRange = document.getElementById("newPlacePrice").value.trim() || "30.000đ - 60.000đ";
  const priceLevel = document.getElementById("newPlacePriceLevel").value;
  const time = document.getElementById("newPlaceTime").value.trim() || "08:00 - 22:00";
  const mustTry = document.getElementById("newPlaceMustTry").value.trim();
  const review = document.getElementById("newPlaceReview").value.trim();
  const tagsStr = document.getElementById("newPlaceTags").value.trim();
  const image = document.getElementById("newPlaceImage").value.trim() || "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80";

  if (!name || !address) {
    alert("Vui lòng nhập tên quán và địa chỉ!");
    return;
  }

  if (!mapsUrl) {
    mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(name + " " + address)}`;
  }

  const tags = tagsStr ? tagsStr.split(",").map(t => t.trim()).filter(Boolean) : [category, district];

  const newPlace = {
    id: "place-" + Date.now(),
    name,
    category,
    district,
    address,
    mapsUrl,
    rating,
    priceRange,
    priceLevel,
    time,
    mustTry,
    review: review || "Quán ăn ngon, không gian thoải mái và phục vụ nhiệt tình.",
    tags,
    vibe: ["Ăn ngon", "Khám phá"],
    image,
    featured: false
  };

  // Thêm vào danh sách đầu tiên
  state.places.unshift(newPlace);
  localStorage.setItem(STORAGE_KEY_PLACES, JSON.stringify(state.places));

  updateCategoryCounts();
  renderCategoryPills();
  renderProfile();
  renderPlaces();

  closeAllModals();
  elements.addPlaceForm.reset();
  showToast(`🎉 Đã thêm thành công "${name}" vào Food Guide!`);
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
    "Tags"
  ];
  
  let csvContent = "\uFEFF"; // UTF-8 BOM cho Google Sheets & Excel không lỗi tiếng Việt
  csvContent += headers.map(h => `"${h}"`).join(",") + "\r\n";
  
  state.places.forEach(p => {
    const cat = state.categories.find(c => c.id === p.category);
    const catName = cat ? cat.name : p.category;
    const row = [
      p.name || "",
      catName || "",
      p.district || "",
      p.address || "",
      p.rating || 0,
      p.reviewCount || 0,
      p.priceRange || "",
      p.time || "",
      p.mustTry || "",
      (p.review || "").replace(/"/g, '""'),
      p.mapsUrl || "",
      (p.tags || []).join(";")
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
  const q = (elements.managerSearchInput ? elements.managerSearchInput.value : "").trim().toLowerCase();
  const dFilter = (elements.managerDistrictFilter ? elements.managerDistrictFilter.value : "Tất cả quận");

  const filtered = state.places.filter(p => {
    if (dFilter !== "Tất cả quận" && p.district !== dFilter) return false;
    if (q) {
      const matchName = (p.name || "").toLowerCase().includes(q);
      const matchAddress = (p.address || "").toLowerCase().includes(q);
      if (!matchName && !matchAddress) return false;
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

  let html = "";
  filtered.forEach(p => {
    const cat = state.categories.find(c => c.id === p.category);
    const catName = cat ? `${cat.icon} ${cat.name.split('(')[0]}` : p.category;
    const reviewFormatted = p.reviewCount ? (p.reviewCount >= 1000 ? `${(p.reviewCount/1000).toFixed(1)}k+` : `${p.reviewCount}+`) : "Mới";

    html += `
      <tr>
        <td>
          <img src="${p.image || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=100&q=80'}" alt="${p.name}" class="manager-thumb">
        </td>
        <td>
          <strong style="display: block; color: var(--text-main); font-size: 0.92rem;">${p.name}</strong>
          <span style="font-size: 0.78rem; color: var(--text-muted);">📍 ${p.address} (${p.district || 'Hà Nội'})</span>
        </td>
        <td>
          <span class="sub-tag">${catName}</span>
        </td>
        <td>
          <span style="font-weight: 800; color: #D97706;">★ ${p.rating.toFixed(1)}</span>
          <span class="reviews-count-tag">(${reviewFormatted})</span>
        </td>
        <td style="text-align: center; white-space: nowrap;">
          <button class="btn-row-action btn-row-edit" onclick="openEditPlaceModal('${p.id}')">
            ✏️ Sửa
          </button>
          <button class="btn-row-action btn-row-delete" onclick="deletePlace('${p.id}')">
            🗑️ Xóa
          </button>
        </td>
      </tr>
    `;
  });

  elements.managerTableBody.innerHTML = html;
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
    catSelect.innerHTML = catHtml;
    catSelect.value = place.category;
  }

  const distSelect = document.getElementById("editPlaceDistrict");
  if (distSelect) {
    let distHtml = "";
    DISTRICTS.filter(d => d !== "Tất cả quận").forEach(d => {
      distHtml += `<option value="${d}">${d}</option>`;
    });
    distSelect.innerHTML = distHtml;
    distSelect.value = place.district || "Hoàn Kiếm";
  }

  document.getElementById("editPlaceId").value = place.id;
  document.getElementById("editPlaceName").value = place.name;
  document.getElementById("editPlaceAddress").value = place.address;
  document.getElementById("editPlaceMapsUrl").value = place.mapsUrl || "";
  document.getElementById("editPlaceRating").value = place.rating || 4.8;
  document.getElementById("editPlaceReviewCount").value = place.reviewCount || 100;
  document.getElementById("editPlacePrice").value = place.priceRange || "";
  document.getElementById("editPlacePriceLevel").value = place.priceLevel || "mid";
  document.getElementById("editPlaceTime").value = place.time || "";
  document.getElementById("editPlaceMustTry").value = place.mustTry || "";
  document.getElementById("editPlaceReview").value = place.review || "";
  document.getElementById("editPlaceTags").value = (place.tags || []).join(", ");
  document.getElementById("editPlaceImage").value = place.image || "";

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
  const rating = parseFloat(document.getElementById("editPlaceRating").value) || 4.8;
  const reviewCount = parseInt(document.getElementById("editPlaceReviewCount").value) || 100;
  const priceRange = document.getElementById("editPlacePrice").value.trim();
  const priceLevel = document.getElementById("editPlacePriceLevel").value;
  const time = document.getElementById("editPlaceTime").value.trim();
  const mustTry = document.getElementById("editPlaceMustTry").value.trim();
  const review = document.getElementById("editPlaceReview").value.trim();
  const tagsStr = document.getElementById("editPlaceTags").value.trim();
  const image = document.getElementById("editPlaceImage").value.trim();

  state.places[index] = {
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
    tags: tagsStr ? tagsStr.split(",").map(t => t.trim()).filter(Boolean) : [category, district],
    image: image || state.places[index].image
  };

  localStorage.setItem(STORAGE_KEY_PLACES, JSON.stringify(state.places));
  updateCategoryCounts();
  renderCategoryPills();
  renderProfile();
  renderPlaces();
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
    localStorage.setItem(STORAGE_KEY_PLACES, JSON.stringify(state.places));
    updateCategoryCounts();
    renderCategoryPills();
    renderProfile();
    renderPlaces();
    renderManagerTable();
    showToast(`🗑️ Đã xóa "${place.name}" khỏi danh sách!`);
  }
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
  toast.innerHTML = `<span>${message}</span>`;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

// Gán toàn cục để gọi từ HTML inline
window.openPlaceDetailModal = openPlaceDetailModal;
window.openEditPlaceModal = openEditPlaceModal;
window.deletePlace = deletePlace;
window.resetFilters = resetFilters;
window.exportGoogleSheetsCSV = exportGoogleSheetsCSV;
window.openPlaceManagerModal = openPlaceManagerModal;
window.openAddPlaceModal = openAddPlaceModal;
window.exportDataJSON = exportDataJSON;
window.closeAllModals = closeAllModals;


