/**
 * app.js
 * Frontend application logic for PMR
 * Includes multi-brand organization (brand tabs & folder views)
 */

// State
let currentFilter = 'all';
let currentSearch = '';
let currentSort = 'updated_desc';
let currentBrand = 'all';
let currentViewMode = localStorage.getItem('pmr_view_mode') || 'tabs'; // 'tabs' or 'grouped'
let activeModalProductId = null;
let availableBrands = [];

// DOM Elements
const inspectForm = document.getElementById('inspectForm');
const urlInput = document.getElementById('urlInput');
const pasteBtn = document.getElementById('pasteBtn');
const targetPriceInput = document.getElementById('targetPriceInput');
const autoSaveCheck = document.getElementById('autoSaveCheck');
const rawHtmlInput = document.getElementById('rawHtmlInput');
const brandInput = document.getElementById('brandInput');
const brandDatalist = document.getElementById('brandDatalist');
const submitBtn = document.getElementById('submitBtn');
const loadingSpinner = document.getElementById('loadingSpinner');

// Tabs
const singleTabBtn = document.getElementById('singleTabBtn');
const batchTabBtn = document.getElementById('batchTabBtn');
const singleFormWrapper = document.getElementById('singleFormWrapper');
const batchFormWrapper = document.getElementById('batchFormWrapper');
const batchForm = document.getElementById('batchForm');
const batchTextarea = document.getElementById('batchTextarea');
const batchBrandInput = document.getElementById('batchBrandInput');
const batchSubmitBtn = document.getElementById('batchSubmitBtn');
const batchSpinner = document.getElementById('batchSpinner');
const batchProgressBar = document.getElementById('batchProgressBar');
const batchProgressFill = document.getElementById('batchProgressFill');
const batchProgressText = document.getElementById('batchProgressText');

// Demos
const demoLinksBtn = document.getElementById('demoLinksBtn');
const demoMenu = document.getElementById('demoMenu');

// Results & Watchlist
const inspectResultSection = document.getElementById('inspectResultSection');
const inspectResultCard = document.getElementById('inspectResultCard');
const closeResultBtn = document.getElementById('closeResultBtn');
const productsContainer = document.getElementById('productsContainer');
const watchlistSearchInput = document.getElementById('watchlistSearchInput');
const sortSelect = document.getElementById('sortSelect');
const recheckAllBtn = document.getElementById('recheckAllBtn');
const exportBtn = document.getElementById('exportBtn');
const exportMenu = document.getElementById('exportMenu');

// Brand Folder Elements
const brandTabsBar = document.getElementById('brandTabsBar');
const activeFolderIndicator = document.getElementById('activeFolderIndicator');
const addBrandBtn = document.getElementById('addBrandBtn');
const viewTabsBtn = document.getElementById('viewTabsBtn');
const viewGroupedBtn = document.getElementById('viewGroupedBtn');

// New Brand Modal Elements
const newBrandModal = document.getElementById('newBrandModal');
const newBrandBackdrop = document.getElementById('newBrandBackdrop');
const newBrandCloseBtn = document.getElementById('newBrandCloseBtn');
const newBrandCancelBtn = document.getElementById('newBrandCancelBtn');
const newBrandForm = document.getElementById('newBrandForm');
const newBrandNameInput = document.getElementById('newBrandNameInput');

// Stats
const statTotal = document.getElementById('statTotal');
const statInStock = document.getElementById('statInStock');
const statOutOfStock = document.getElementById('statOutOfStock');
const statDrops = document.getElementById('statDrops');

// History Modal
const historyModal = document.getElementById('historyModal');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalProductTitle = document.getElementById('modalProductTitle');
const modalProductStore = document.getElementById('modalProductStore');
const modalCurrentPrice = document.getElementById('modalCurrentPrice');
const modalLowestPrice = document.getElementById('modalLowestPrice');
const modalHighestPrice = document.getElementById('modalHighestPrice');
const modalTargetPrice = document.getElementById('modalTargetPrice');
const modalBrandInput = document.getElementById('modalBrandInput');
const modalSaveBrandBtn = document.getElementById('modalSaveBrandBtn');
const modalDataPoints = document.getElementById('modalDataPoints');
const chartContainer = document.getElementById('chartContainer');
const modalTimelineBody = document.getElementById('modalTimelineBody');
const modalRecheckBtn = document.getElementById('modalRecheckBtn');
const modalVisitLink = document.getElementById('modalVisitLink');

// Theme
const themeToggleBtn = document.getElementById('themeToggleBtn');
const toastContainer = document.getElementById('toastContainer');

// ============================================================================
// Initialization
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initViewMode();
  setupEventListeners();
  loadStats();
  loadBrands();
  loadProducts();
});

function initTheme() {
  const savedTheme = localStorage.getItem('pmr_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('pmr_theme', next);
}

function initViewMode() {
  if (currentViewMode === 'grouped') {
    viewGroupedBtn.classList.add('active');
    viewTabsBtn.classList.remove('active');
  } else {
    viewTabsBtn.classList.add('active');
    viewGroupedBtn.classList.remove('active');
  }
}

// ============================================================================
// Event Listeners
// ============================================================================
function setupEventListeners() {
  // Theme
  themeToggleBtn.addEventListener('click', toggleTheme);

  // Tabs (Single / Batch Form)
  singleTabBtn.addEventListener('click', () => switchTab('single'));
  batchTabBtn.addEventListener('click', () => switchTab('batch'));

  // View Mode Toggle (Tabs vs Grouped Folders)
  viewTabsBtn.addEventListener('click', () => {
    currentViewMode = 'tabs';
    localStorage.setItem('pmr_view_mode', 'tabs');
    viewTabsBtn.classList.add('active');
    viewGroupedBtn.classList.remove('active');
    loadProducts();
  });

  viewGroupedBtn.addEventListener('click', () => {
    currentViewMode = 'grouped';
    localStorage.setItem('pmr_view_mode', 'grouped');
    viewGroupedBtn.classList.add('active');
    viewTabsBtn.classList.remove('active');
    loadProducts();
  });

  // Clipboard Paste
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        showToast('Link pasted from clipboard', 'info');
      }
    } catch {
      showToast('Could not access clipboard. Please paste manually.', 'error');
    }
  });

  // Demo Links
  demoLinksBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    demoMenu.classList.toggle('show');
  });

  document.querySelectorAll('.dropdown-item[data-demo]').forEach(item => {
    item.addEventListener('click', () => {
      const demoUrl = item.getAttribute('data-demo');
      urlInput.value = demoUrl;
      demoMenu.classList.remove('show');
      inspectForm.requestSubmit();
    });
  });

  // Export dropdown
  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    demoMenu.classList.remove('show');
    exportMenu.classList.remove('show');
  });

  // Single Link Submit
  inspectForm.addEventListener('submit', handleInspectSubmit);

  // Batch Form Submit
  batchForm.addEventListener('submit', handleBatchSubmit);

  // Dismiss Result
  closeResultBtn.addEventListener('click', () => {
    inspectResultSection.classList.add('hidden');
  });

  // Watchlist Search & Sort
  let debounceTimeout;
  watchlistSearchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      currentSearch = e.target.value;
      loadProducts();
    }, 300);
  });

  sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    loadProducts();
  });

  // Filter Pills (Status: In Stock / Out of Stock / Price Drops / Target)
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.getAttribute('data-filter');
      loadProducts();
    });
  });

  // Re-check All
  recheckAllBtn.addEventListener('click', handleRecheckAll);

  // New Brand Tab Modal
  addBrandBtn.addEventListener('click', () => {
    newBrandNameInput.value = '';
    newBrandModal.classList.remove('hidden');
    newBrandNameInput.focus();
  });

  newBrandCloseBtn.addEventListener('click', () => newBrandModal.classList.add('hidden'));
  newBrandCancelBtn.addEventListener('click', () => newBrandModal.classList.add('hidden'));
  newBrandBackdrop.addEventListener('click', () => newBrandModal.classList.add('hidden'));

  newBrandForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = newBrandNameInput.value.trim();
    if (!name) return;

    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      newBrandModal.classList.add('hidden');
      currentBrand = data.brand || name;
      showToast(`Created brand tab: ${name}`, 'success');
      await loadBrands();
      loadProducts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Product History Modal
  modalCloseBtn.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', closeModal);
  modalRecheckBtn.addEventListener('click', () => {
    if (activeModalProductId) {
      recheckProduct(activeModalProductId, true);
    }
  });

  modalSaveBrandBtn.addEventListener('click', async () => {
    if (!activeModalProductId) return;
    const newBrand = modalBrandInput.value.trim() || 'Unassigned';
    try {
      const res = await fetch(`/api/products/${activeModalProductId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: newBrand })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      showToast(`Moved product to ${newBrand} folder!`, 'success');
      loadBrands();
      loadProducts();
      openHistoryModal(activeModalProductId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function switchTab(tab) {
  if (tab === 'single') {
    singleTabBtn.classList.add('active');
    batchTabBtn.classList.remove('active');
    singleFormWrapper.classList.add('active');
    batchFormWrapper.classList.remove('active');
  } else {
    batchTabBtn.classList.add('active');
    singleTabBtn.classList.remove('active');
    batchFormWrapper.classList.add('active');
    singleFormWrapper.classList.remove('active');
  }
}

// ============================================================================
// Brand Folders & Tabs Management
// ============================================================================
async function loadBrands() {
  try {
    const res = await fetch('/api/brands');
    const data = await res.json();
    if (data.success && data.brands) {
      availableBrands = data.brands;
      updateBrandDatalist(availableBrands);
      renderBrandTabs(availableBrands);
    }
  } catch (err) {
    console.error('Failed to load brands:', err);
  }
}

function updateBrandDatalist(brands) {
  if (!brandDatalist) return;
  brandDatalist.innerHTML = brands
    .filter(b => b.name && b.name !== 'Unassigned')
    .map(b => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)} (${b.count} items)</option>`)
    .join('');
}

function renderBrandTabs(brands) {
  if (!brandTabsBar) return;

  const totalCount = brands.reduce((acc, b) => acc + (b.count || 0), 0);

  // Update active folder indicator text
  if (currentBrand === 'all') {
    activeFolderIndicator.textContent = `Viewing: All Brands (${totalCount})`;
  } else {
    const match = brands.find(b => b.name.toLowerCase() === currentBrand.toLowerCase());
    const count = match ? match.count : 0;
    activeFolderIndicator.textContent = `Viewing: ${currentBrand} (${count})`;
  }

  // Build All Brands tab
  let html = `
    <button class="brand-tab-pill ${currentBrand === 'all' ? 'active' : ''}" onclick="selectBrandTab('all')">
      <span>📁 All Brands</span>
      <span class="brand-count-badge">${totalCount}</span>
    </button>
  `;

  // Render individual brand tabs
  for (const b of brands) {
    const isActive = currentBrand.toLowerCase() === b.name.toLowerCase();
    const isUnassigned = b.name === 'Unassigned';
    const icon = isUnassigned ? '📂' : '🏷️';

    html += `
      <div class="brand-tab-pill ${isActive ? 'active' : ''}" onclick="selectBrandTab('${escapeHtml(b.name)}')">
        <span>${icon} ${escapeHtml(b.name)}</span>
        <span class="brand-count-badge">${b.count}</span>
        <button class="brand-tab-close-btn" title="Close '${escapeHtml(b.name)}' tab" onclick="event.stopPropagation(); closeBrandTab('${escapeHtml(b.name)}', ${b.count})">&times;</button>
      </div>
    `;
  }

  brandTabsBar.innerHTML = html;
}

window.selectBrandTab = function(brandName) {
  currentBrand = brandName;
  if (brandInput) {
    if (brandName !== 'all' && brandName !== 'Unassigned') {
      brandInput.value = brandName;
      brandInput.placeholder = `Saving to "${brandName}" tab`;
    } else {
      brandInput.value = '';
      brandInput.placeholder = 'Choose a tab or leave empty (Unassigned)';
    }
  }
  if (batchBrandInput) {
    batchBrandInput.value = (brandName !== 'all' && brandName !== 'Unassigned') ? brandName : '';
  }
  renderBrandTabs(availableBrands);
  loadProducts();
};

window.closeBrandTab = async function(brandName, count) {
  if (brandName === 'Unassigned') {
    if (!confirm('Close Unassigned tab? Products will remain in "All Brands".')) return;
    if (currentBrand.toLowerCase() === 'unassigned') {
      currentBrand = 'all';
    }
    renderBrandTabs(availableBrands);
    loadProducts();
    return;
  }

  let confirmMsg = '';
  if (count > 0) {
    confirmMsg = `Close "${brandName}" tab?\n\nIts ${count} product(s) will be kept safe and moved to "Unassigned" so you don't lose any data.`;
  } else {
    confirmMsg = `Close "${brandName}" tab?`;
  }

  if (!confirm(confirmMsg)) return;

  try {
    const res = await fetch('/api/brands', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: brandName })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast(`Closed "${brandName}" tab`, 'info');
    if (currentBrand.toLowerCase() === brandName.toLowerCase()) {
      currentBrand = 'all';
    }
    await loadBrands();
    loadProducts();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.deleteBrandFolder = window.closeBrandTab;

window.promptChangeBrand = async function(productId, currentBrandName) {
  const brandOptions = availableBrands.map(b => b.name).filter(n => n !== 'Unassigned');
  const suggestion = brandOptions.length > 0 ? ` (e.g. ${brandOptions.slice(0, 3).join(', ')})` : '';
  const newBrand = prompt(`Enter brand / folder name for this product${suggestion}:`, currentBrandName || '');

  if (newBrand === null) return; // User cancelled
  const cleanBrand = newBrand.trim() || 'Unassigned';

  try {
    const res = await fetch(`/api/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand: cleanBrand })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast(`Product moved to "${cleanBrand}" folder!`, 'success');
    loadBrands();
    loadProducts();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ============================================================================
// Single Inspection
// ============================================================================
async function handleInspectSubmit(e) {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  const targetPrice = targetPriceInput.value ? parseFloat(targetPriceInput.value) : null;
  const brand = (brandInput && brandInput.value.trim()) 
    ? brandInput.value.trim() 
    : (currentBrand !== 'all' && currentBrand !== 'Unassigned' ? currentBrand : null);
  const save = autoSaveCheck.checked;
  const rawHtml = rawHtmlInput && rawHtmlInput.value ? rawHtmlInput.value.trim() : null;

  setLoading(true);

  try {
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, save, targetPrice, rawHtml, brand })
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to inspect product');
    }

    renderInspectionResult(data.data, data.saved);
    inspectResultSection.classList.remove('hidden');
    inspectResultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    showToast(`Checked successfully: ${data.data.formattedPrice} (${data.data.availability.label})`, 'success');

    if (save) {
      loadStats();
      loadBrands();
      loadProducts();
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  if (isLoading) {
    loadingSpinner.classList.remove('hidden');
  } else {
    loadingSpinner.classList.add('hidden');
  }
}

function renderInspectionResult(p, saved) {
  const badgeClass = p.availability.badgeClass || 'badge-secondary';
  const imgHtml = p.imageUrl 
    ? `<img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.title)}" onerror="this.onerror=null;this.parentElement.innerHTML='<span class=\'result-no-image\'>No Image Available</span>'"/>`
    : `<span class="result-no-image">No Image</span>`;

  const assignedFolder = saved?.product?.brand || (brandInput?.value?.trim() || null);

  inspectResultCard.innerHTML = `
    <div class="result-image-box">
      ${imgHtml}
    </div>
    <div class="result-details">
      <div class="result-top-badges">
        <span class="store-badge">${escapeHtml(p.domain)}</span>
        <span class="strategy-badge">${escapeHtml(p.strategy)}</span>
        <span class="latency-badge">${p.responseTimeMs}ms</span>
        ${assignedFolder && assignedFolder !== 'Unassigned' ? `<span class="store-badge" style="color:var(--accent-primary);border-color:var(--accent-primary);">📁 Tab: ${escapeHtml(assignedFolder)}</span>` : ''}
      </div>

      <h3 class="result-title">${escapeHtml(p.title)}</h3>

      <div class="result-price-row">
        <span class="result-price-big">${escapeHtml(p.formattedPrice)}</span>
        <span class="badge ${badgeClass}">
          <span class="badge-dot"></span>
          ${escapeHtml(p.availability.label)}
        </span>
      </div>

      <div class="result-actions">
        <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">
          Visit Store
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>
        ${saved?.product?.id ? `
          <button class="btn btn-primary btn-sm" onclick="openHistoryModal(${saved.product.id})">
            View Price History
          </button>
        ` : `
          <button class="btn btn-primary btn-sm" onclick="saveCurrentProduct('${escapeHtml(p.url)}')">
            Save to Watchlist
          </button>
        `}
      </div>
    </div>
  `;
}

window.saveCurrentProduct = async function(url) {
  try {
    const brand = (brandInput && brandInput.value.trim()) 
      ? brandInput.value.trim() 
      : (currentBrand !== 'all' && currentBrand !== 'Unassigned' ? currentBrand : null);
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, save: true, brand })
    });
    const d = await res.json();
    if (d.success) {
      showToast('Saved to Watchlist!', 'success');
      loadStats();
      loadBrands();
      loadProducts();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ============================================================================
// Batch Inspection
// ============================================================================
async function handleBatchSubmit(e) {
  e.preventDefault();
  const rawText = batchTextarea.value.trim();
  if (!rawText) return;

  const urls = rawText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 5 && (line.startsWith('http://') || line.startsWith('https://') || line.includes('.')));

  if (urls.length === 0) {
    showToast('Please enter at least one valid URL', 'error');
    return;
  }

  const save = document.getElementById('batchSaveCheck').checked;
  const brand = (batchBrandInput && batchBrandInput.value.trim()) 
    ? batchBrandInput.value.trim() 
    : (currentBrand !== 'all' && currentBrand !== 'Unassigned' ? currentBrand : null);

  batchSubmitBtn.disabled = true;
  batchSpinner.classList.remove('hidden');
  batchProgressBar.classList.remove('hidden');
  batchProgressFill.style.width = '30%';
  batchProgressText.textContent = `Analyzing ${urls.length} products...`;

  try {
    const res = await fetch('/api/check-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, save, brand })
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Batch check failed');
    }

    batchProgressFill.style.width = '100%';
    batchProgressText.textContent = `Completed ${data.count} items!`;

    showToast(`Checked ${data.count} links successfully!`, 'success');
    batchTextarea.value = '';
    loadStats();
    loadBrands();
    loadProducts();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setTimeout(() => {
      batchSubmitBtn.disabled = false;
      batchSpinner.classList.add('hidden');
      batchProgressBar.classList.add('hidden');
    }, 2000);
  }
}

// ============================================================================
// Watchlist & Stats
// ============================================================================
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (data.success && data.stats) {
      statTotal.textContent = data.stats.total;
      statInStock.textContent = data.stats.inStock;
      statOutOfStock.textContent = data.stats.outOfStock;
      statDrops.textContent = data.stats.priceDrops;
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function loadProducts() {
  try {
    const params = new URLSearchParams({
      search: currentSearch,
      filter: currentFilter,
      sort: currentSort,
      brand: currentBrand
    });

    const res = await fetch(`/api/products?${params.toString()}`);
    const data = await res.json();

    if (!data.success) throw new Error(data.error);

    if (currentViewMode === 'grouped') {
      renderGroupedProductCards(data.products || []);
    } else {
      renderProductCards(data.products || []);
    }
  } catch (err) {
    console.error('Failed to load products:', err);
    productsContainer.innerHTML = `<div class="empty-watchlist"><p class="text-danger">Failed to load watchlist: ${err.message}</p></div>`;
  }
}

// Render Standard Tab View
function renderProductCards(products) {
  if (products.length === 0) {
    const brandLabel = currentBrand === 'all' ? 'Watchlist' : `"${currentBrand}" Folder`;
    productsContainer.innerHTML = `
      <div class="empty-watchlist">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
        <h3>No Products in ${escapeHtml(brandLabel)}</h3>
        <p>Paste a product link above and inspect it to start tracking prices inside this brand folder.</p>
        <button class="btn btn-primary btn-sm" onclick="document.getElementById('urlInput').focus()">Paste First Link</button>
      </div>
    `;
    return;
  }

  productsContainer.innerHTML = products.map(p => generateProductCardHtml(p)).join('');
}

// Render Grouped File Folder View
function renderGroupedProductCards(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="empty-watchlist">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <h3>No Products Found</h3>
        <p>Paste links above to organize products into brand folders.</p>
      </div>
    `;
    return;
  }

  // Group by brand
  const groups = {};
  for (const p of products) {
    const b = p.brand || 'Unassigned';
    if (!groups[b]) groups[b] = [];
    groups[b].push(p);
  }

  const brandKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  let html = '';
  for (const b of brandKeys) {
    const items = groups[b];
    const groupId = `folder-group-${encodeURIComponent(b)}`;
    html += `
      <div class="brand-folder-group" style="grid-column: 1 / -1;">
        <div class="brand-folder-header" onclick="toggleFolderSection('${groupId}')">
          <div class="brand-folder-title-wrap">
            <span>📂</span>
            <span>${escapeHtml(b)}</span>
            <span class="brand-folder-counter">${items.length} item${items.length === 1 ? '' : 's'}</span>
          </div>
          <div style="font-size:0.8rem;color:var(--text-dim);">
            <span>Click to toggle folder &bull; ▾</span>
          </div>
        </div>
        <div id="${groupId}" class="products-container">
          ${items.map(p => generateProductCardHtml(p)).join('')}
        </div>
      </div>
    `;
  }

  productsContainer.innerHTML = html;
}

window.toggleFolderSection = function(groupId) {
  const el = document.getElementById(groupId);
  if (el) {
    el.classList.toggle('hidden');
  }
};

function generateProductCardHtml(p) {
  const badgeClass = getBadgeClass(p.availability);
  const hasPriceDrop = p.price_diff < 0;
  const hasPriceRise = p.price_diff > 0;
  const targetMet = p.target_met;
  const brandName = p.brand || 'Unassigned';

  const imgHtml = p.image_url 
    ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.title)}" loading="lazy" onerror="this.style.display='none'"/>`
    : `<span class="result-no-image">No Image</span>`;

  return `
    <div class="product-card" id="card-${p.id}">
      <div class="product-card-top">
        ${imgHtml}
        <div class="card-top-badges">
          ${hasPriceDrop ? `<span class="drop-badge">${p.diff_percent}% 📉</span>` : ''}
          ${targetMet ? `<span class="target-alert-pill">🎯 Below Target</span>` : ''}
        </div>
      </div>

      <div class="product-card-body">
        <div class="card-meta-row">
          <button class="card-brand-tag" title="Click to move/change brand folder" onclick="promptChangeBrand(${p.id}, '${escapeHtml(brandName)}')">
            <span>🏷️ ${escapeHtml(brandName)}</span>
            <span style="font-size:0.7rem;opacity:0.6;">▾</span>
          </button>
          <span class="card-updated">${formatRelativeTime(p.updated_at)}</span>
        </div>

        <h4 class="card-title" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</h4>

        <div class="card-price-row">
          <div>
            <span class="card-price">${escapeHtml(p.formatted_price)}</span>
            ${(hasPriceDrop || hasPriceRise) && p.original_price ? `
              <span class="original-price-strike">${formatCurrency(p.original_price, p.currency)}</span>
            ` : ''}
          </div>
          <span class="badge ${badgeClass}">
            <span class="badge-dot"></span>
            ${escapeHtml(p.availability_label || 'Check Site')}
          </span>
        </div>
      </div>

      <div class="product-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="openHistoryModal(${p.id})">
          History
        </button>
        <button class="btn btn-outline btn-sm" title="Re-check price now" onclick="recheckProduct(${p.id})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          Check
        </button>
        <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" title="Open in store">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>
        <button class="btn btn-ghost btn-sm btn-delete" title="Delete product" onclick="deleteProduct(${p.id})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  `;
}

function getBadgeClass(status) {
  if (status === 'in_stock') return 'badge-success';
  if (status === 'out_of_stock') return 'badge-danger';
  if (status === 'limited_stock') return 'badge-warning';
  if (status === 'pre_order') return 'badge-info';
  return 'badge-secondary';
}

// ============================================================================
// Actions: Recheck, Delete, Modal
// ============================================================================
window.recheckProduct = async function(id, fromModal = false) {
  showToast('Re-checking price & stock...', 'info');
  try {
    const res = await fetch(`/api/products/${id}/recheck`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast(`Updated: ${data.data.formattedPrice} (${data.data.availability.label})`, 'success');
    loadStats();
    loadBrands();
    loadProducts();

    if (fromModal) {
      openHistoryModal(id);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.deleteProduct = async function(id) {
  if (!confirm('Remove this product from your tracker?')) return;
  try {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast('Product removed', 'info');
    loadStats();
    loadBrands();
    loadProducts();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

async function handleRecheckAll() {
  recheckAllBtn.disabled = true;
  const brandMsg = currentBrand === 'all' ? 'all products' : `products in "${currentBrand}" folder`;
  showToast(`Re-checking ${brandMsg}...`, 'info');
  try {
    const res = await fetch('/api/products/recheck-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand: currentBrand })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast(`Re-checked all ${data.total} products successfully!`, 'success');
    loadStats();
    loadBrands();
    loadProducts();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    recheckAllBtn.disabled = false;
  }
}

// ============================================================================
// Price History Modal & SVG Chart
// ============================================================================
window.openHistoryModal = async function(id) {
  activeModalProductId = id;
  historyModal.classList.remove('hidden');

  try {
    const res = await fetch(`/api/products/${id}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const p = data.product;
    modalProductTitle.textContent = p.title;
    modalProductStore.textContent = `${p.domain} • Strategy: ${p.strategy || 'Standard'}`;
    modalCurrentPrice.textContent = p.formatted_price;
    modalLowestPrice.textContent = formatCurrency(p.lowest_price, p.currency);
    modalHighestPrice.textContent = formatCurrency(p.highest_price, p.currency);
    modalTargetPrice.textContent = p.target_price ? formatCurrency(p.target_price, p.currency) : 'Not set';
    modalBrandInput.value = (p.brand && p.brand !== 'Unassigned') ? p.brand : '';
    modalVisitLink.href = p.url;

    const history = p.history || [];
    modalDataPoints.textContent = `${history.length} check${history.length === 1 ? '' : 's'}`;

    renderSvgChart(history, p.currency);
    renderTimelineTable(history);
  } catch (err) {
    showToast(err.message, 'error');
    closeModal();
  }
};

function closeModal() {
  historyModal.classList.add('hidden');
  activeModalProductId = null;
}

function renderSvgChart(history, currency) {
  if (history.length === 0) {
    chartContainer.innerHTML = '<div style="text-align:center;padding:3rem 0;color:var(--text-dim);">No price data recorded yet</div>';
    return;
  }

  const prices = history.map(h => h.price ?? 0);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP === minP ? 1 : (maxP - minP);

  const width = 600;
  const height = 140;
  const paddingX = 40;
  const paddingY = 25;

  const points = history.map((h, i) => {
    const x = paddingX + (i / Math.max(1, history.length - 1)) * (width - paddingX * 2);
    const norm = (h.price - minP) / range;
    const y = (height - paddingY) - norm * (height - paddingY * 2);
    return { x, y, price: h.price, date: h.checked_at };
  });

  const polylineStr = points.map(pt => `${pt.x},${pt.y}`).join(' ');

  // Gradient fill area
  const areaPoints = `${points[0].x},${height - paddingY} ` + polylineStr + ` ${points[points.length - 1].x},${height - paddingY}`;

  const circlesHtml = points.map(pt => `
    <circle cx="${pt.x}" cy="${pt.y}" r="4" fill="#3b82f6" stroke="#fff" stroke-width="1.5">
      <title>${formatCurrency(pt.price, currency)} on ${new Date(pt.date).toLocaleString()}</title>
    </circle>
  `).join('');

  chartContainer.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="chartGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      <!-- Grid Lines -->
      <line x1="${paddingX}" y1="${paddingY}" x2="${width - paddingX}" y2="${paddingY}" stroke="var(--border-color)" stroke-dasharray="3,3" />
      <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" stroke="var(--border-color)" />

      <!-- Area fill -->
      <polygon points="${areaPoints}" fill="url(#chartGrad)" />

      <!-- Price line -->
      <polyline fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${polylineStr}" />

      <!-- Dots -->
      ${circlesHtml}

      <!-- Labels -->
      <text x="${paddingX}" y="${paddingY - 8}" fill="var(--text-dim)" font-size="10" font-family="monospace">Max: ${formatCurrency(maxP, currency)}</text>
      <text x="${paddingX}" y="${height - 6}" fill="var(--text-dim)" font-size="10" font-family="monospace">Min: ${formatCurrency(minP, currency)}</text>
    </svg>
  `;
}

function renderTimelineTable(history) {
  const reversed = [...history].reverse();
  modalTimelineBody.innerHTML = reversed.map(h => {
    const badgeClass = getBadgeClass(h.availability);
    return `
      <tr>
        <td>${new Date(h.checked_at).toLocaleString()}</td>
        <td style="font-family:var(--font-mono);font-weight:700;">${escapeHtml(h.formatted_price)}</td>
        <td>
          <span class="badge ${badgeClass}" style="font-size:0.7rem;padding:0.2rem 0.5rem;">
            <span class="badge-dot"></span>
            ${escapeHtml(h.availability_label || 'Check')}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

// ============================================================================
// Utilities
// ============================================================================
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function formatCurrency(num, currency = 'USD') {
  if (num === null || num === undefined || isNaN(num)) return '$0.00';
  const symbols = { 'USD': '$', 'EUR': '€', 'GBP': '£', 'PHP': '₱', 'JPY': '¥' };
  const sym = symbols[currency] || (currency ? currency + ' ' : '$');
  return `${sym}${Number(num).toFixed(2)}`;
}

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
