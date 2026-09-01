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
const STORAGE_KEY_PLACES = "foodguide_hanoi_places_v1";
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
  state.places = savedPlaces ? JSON.parse(savedPlaces) : [...INITIAL_PLACES];

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
  elements.districtSelect = document.getElementById("districtSelect");
  elements.sortSelect = document.getElementById("sortSelect");
  elements.pricePills = document.querySelectorAll(".price-pill");
  elements.resetFiltersBtn = document.getElementById("resetFiltersBtn");

  elements.viewTabs = document.querySelectorAll(".view-tab");
  elements.themeToggleBtn = document.getElementById("themeToggleBtn");
  elements.shareGuideBtn = document.getElementById("shareGuideBtn");
  elements.btnAddPlace = document.getElementById("btnAddPlace");
  elements.btnExportData = document.getElementById("btnExportData");

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

  // Lọc theo quận
  if (elements.districtSelect) {
    elements.districtSelect.addEventListener("change", (e) => {
      state.selectedDistrict = e.target.value;
      renderPlaces();
    });
  }

  // Sắp xếp
  if (elements.sortSelect) {
    elements.sortSelect.addEventListener("change", (e) => {
      state.sortBy = e.target.value;
      renderPlaces();
    });
  }

  // Lọc mức giá
  elements.pricePills.forEach(pill => {
    pill.addEventListener("click", () => {
      elements.pricePills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      state.selectedPriceLevel = pill.dataset.price;
      renderPlaces();
    });
  });

  // Đặt lại bộ lọc
  if (elements.resetFiltersBtn) {
    elements.resetFiltersBtn.addEventListener("click", resetFilters);
  }

  // Chuyển chế độ xem (Explorer vs Portal)
  elements.viewTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      elements.viewTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      state.viewMode = tab.dataset.view;
      localStorage.setItem(STORAGE_KEY_VIEW, state.viewMode);
      renderViewMode();
    });
  });

  // Nút theme & share
  if (elements.themeToggleBtn) {
    elements.themeToggleBtn.addEventListener("click", toggleTheme);
  }

  if (elements.shareGuideBtn) {
    elements.shareGuideBtn.addEventListener("click", openShareModal);
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
  if (elements.districtSelect) elements.districtSelect.value = "Tất cả quận";
  if (elements.sortSelect) elements.sortSelect.value = "featured";

  elements.pricePills.forEach(p => {
    p.classList.toggle("active", p.dataset.price === "all");
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
  renderDistrictsDropdown();
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
 * Render dropdown danh sách quận
 */
function renderDistrictsDropdown() {
  if (!elements.districtSelect) return;
  let html = "";
  DISTRICTS.forEach(d => {
    html += `<option value="${d}">${d}</option>`;
  });
  elements.districtSelect.innerHTML = html;
  elements.districtSelect.value = state.selectedDistrict;
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
  elements.viewTabs.forEach(t => {
    t.classList.toggle("active", t.dataset.view === mode);
  });
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
          <div class="place-badge-rating">★ ${place.rating.toFixed(1)}</div>
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
        <span class="place-badge-rating" style="position: static; font-size: 0.95rem;">★ ${place.rating.toFixed(1)} / 5.0</span>
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

// Gán toàn cục để gọi từ HTML inline nếu cần
window.openPlaceDetailModal = openPlaceDetailModal;
window.resetFilters = resetFilters;
