/**
 * db.js
 * Persistent SQLite Database Engine using Node.js native node:sqlite
 * Stores tracked items, price histories, and target price alerts.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, 'tracker.db');
const db = new DatabaseSync(DB_FILE);

// Initialize Tables
db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    domain TEXT,
    title TEXT NOT NULL,
    image_url TEXT,
    current_price REAL,
    currency TEXT DEFAULT 'USD',
    formatted_price TEXT,
    original_price REAL,
    lowest_price REAL,
    highest_price REAL,
    availability TEXT,
    availability_label TEXT,
    target_price REAL,
    brand TEXT,
    sku TEXT,
    strategy TEXT,
    confidence TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    price REAL,
    currency TEXT,
    formatted_price TEXT,
    availability TEXT,
    availability_label TEXT,
    checked_at TEXT NOT NULL,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_products_url ON products(url);
  CREATE INDEX IF NOT EXISTS idx_history_product_id ON price_history(product_id);
  CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
`);

/**
 * Save or update product with price history tracking
 * NOTE: Tabs/folders are NEVER auto-created from scraped data.
 * A product only belongs to a brand tab if explicitly assigned by the user.
 */
function saveOrUpdateProduct(data, targetPrice = null, brandOverride = null) {
  const now = new Date().toISOString();
  const selectStmt = db.prepare('SELECT * FROM products WHERE url = ?');
  const existing = selectStmt.get(data.url);

  const price = data.price;
  const currency = data.currency || 'USD';
  const formattedPrice = data.formattedPrice || (price !== null ? `${price}` : 'Price N/A');
  const availability = data.availability?.status || 'unknown';
  const availabilityLabel = data.availability?.label || 'Check Site';

  // Only assign to a brand tab if explicitly provided by the user; NEVER auto-create tabs from scraped data!
  const assignedBrand = (brandOverride && brandOverride.trim()) 
    ? brandOverride.trim() 
    : 'Unassigned';

  if (!existing) {
    // Insert new product
    const insertStmt = db.prepare(`
      INSERT INTO products (
        url, domain, title, image_url, current_price, currency,
        formatted_price, original_price, lowest_price, highest_price,
        availability, availability_label, target_price, brand, sku,
        strategy, confidence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      data.url,
      data.domain || '',
      data.title || 'Untitled Product',
      data.imageUrl || null,
      price,
      currency,
      formattedPrice,
      price, // original_price
      price, // lowest_price
      price, // highest_price
      availability,
      availabilityLabel,
      targetPrice,
      assignedBrand,
      data.sku || null,
      data.strategy || null,
      data.confidence || null,
      now,
      now
    );

    const newProd = selectStmt.get(data.url);

    // Record initial price history
    const histStmt = db.prepare(`
      INSERT INTO price_history (
        product_id, price, currency, formatted_price, availability, availability_label, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    histStmt.run(newProd.id, price, currency, formattedPrice, availability, availabilityLabel, now);

    return {
      product: newProd,
      isNew: true,
      priceChanged: false,
      priceDelta: 0,
      percentChange: 0
    };
  } else {
    // Existing product: calculate changes
    const oldPrice = existing.current_price;
    const priceChanged = (oldPrice !== null && price !== null && Math.abs(oldPrice - price) > 0.001);
    const availChanged = existing.availability !== availability;

    let lowestPrice = existing.lowest_price;
    let highestPrice = existing.highest_price;

    if (price !== null) {
      if (lowestPrice === null || price < lowestPrice) lowestPrice = price;
      if (highestPrice === null || price > highestPrice) highestPrice = price;
    }

    const newTargetPrice = targetPrice !== null ? targetPrice : existing.target_price;
    const finalBrand = (brandOverride && brandOverride.trim()) 
      ? brandOverride.trim() 
      : (existing.brand ? existing.brand : 'Unassigned');

    const updateStmt = db.prepare(`
      UPDATE products SET
        title = ?,
        image_url = coalesce(?, image_url),
        current_price = ?,
        currency = ?,
        formatted_price = ?,
        lowest_price = ?,
        highest_price = ?,
        availability = ?,
        availability_label = ?,
        target_price = ?,
        brand = ?,
        strategy = ?,
        confidence = ?,
        updated_at = ?
      WHERE id = ?
    `);

    updateStmt.run(
      data.title || existing.title,
      data.imageUrl || null,
      price,
      currency,
      formattedPrice,
      lowestPrice,
      highestPrice,
      availability,
      availabilityLabel,
      newTargetPrice,
      finalBrand,
      data.strategy || existing.strategy,
      data.confidence || existing.confidence,
      now,
      existing.id
    );

    // If price or availability changed, log in history
    if (priceChanged || availChanged) {
      const histStmt = db.prepare(`
        INSERT INTO price_history (
          product_id, price, currency, formatted_price, availability, availability_label, checked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      histStmt.run(existing.id, price, currency, formattedPrice, availability, availabilityLabel, now);
    }

    const updated = selectStmt.get(data.url);
    const priceDelta = (oldPrice !== null && price !== null) ? (price - oldPrice) : 0;
    const percentChange = (oldPrice && oldPrice > 0 && price !== null) ? ((price - oldPrice) / oldPrice) * 100 : 0;

    return {
      product: updated,
      isNew: false,
      priceChanged,
      priceDelta: Math.round(priceDelta * 100) / 100,
      percentChange: Math.round(percentChange * 10) / 10
    };
  }
}

/**
 * Get all products with optional search, filter, sort, and brand tab filter
 */
function getAllProducts(search = '', filter = 'all', sort = 'updated_desc', brand = 'all') {
  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (search && search.trim()) {
    query += ' AND (title LIKE ? OR domain LIKE ? OR brand LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }

  if (brand && brand !== 'all') {
    if (brand === 'Unassigned') {
      query += " AND (brand IS NULL OR trim(brand) = '' OR trim(brand) = 'Unassigned' OR trim(brand) NOT IN (SELECT trim(name) FROM brands))";
    } else {
      query += " AND trim(brand) = ?";
      params.push(brand.trim());
    }
  }

  if (filter === 'in_stock') {
    query += " AND availability IN ('in_stock', 'limited_stock', 'pre_order')";
  } else if (filter === 'out_of_stock') {
    query += " AND availability IN ('out_of_stock', 'back_order')";
  } else if (filter === 'price_drop') {
    query += ' AND current_price IS NOT NULL AND original_price IS NOT NULL AND current_price < original_price';
  } else if (filter === 'target_met') {
    query += ' AND target_price IS NOT NULL AND current_price IS NOT NULL AND current_price <= target_price';
  }

  if (sort === 'price_asc') {
    query += ' ORDER BY current_price ASC';
  } else if (sort === 'price_desc') {
    query += ' ORDER BY current_price DESC';
  } else if (sort === 'name_asc') {
    query += ' ORDER BY title ASC';
  } else if (sort === 'created_desc') {
    query += ' ORDER BY created_at DESC';
  } else {
    query += ' ORDER BY updated_at DESC';
  }

  const stmt = db.prepare(query);
  const products = stmt.all(...params);

  // Attach latest history count and price difference
  return products.map(p => {
    const original = p.original_price;
    const current = p.current_price;
    let diff = 0;
    let diffPercent = 0;
    if (original !== null && current !== null && original > 0) {
      diff = current - original;
      diffPercent = Math.round(((current - original) / original) * 1000) / 10;
    }
    const targetMet = (p.target_price !== null && current !== null && current <= p.target_price);

    return {
      ...p,
      brand: (p.brand && p.brand.trim()) ? p.brand.trim() : 'Unassigned',
      price_diff: Math.round(diff * 100) / 100,
      diff_percent: diffPercent,
      target_met: targetMet
    };
  });
}

/**
/**
 * Get all user-created brand tabs with product counts
 * Only brands explicitly created by the user in the brands table exist as tabs.
 */
function getBrands() {
  const registeredStmt = db.prepare(`SELECT name FROM brands ORDER BY id ASC`);
  const registered = registeredStmt.all();

  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM products WHERE trim(brand) = ?`);

  const result = [];
  for (const r of registered) {
    const c = countStmt.get(r.name.trim()).count;
    result.push({
      name: r.name.trim(),
      count: c
    });
  }

  // Count unassigned items (items with brand null, empty, 'Unassigned', or not matching any user-created tab)
  const unassignedStmt = db.prepare(`
    SELECT COUNT(*) as count FROM products 
    WHERE brand IS NULL OR trim(brand) = '' OR trim(brand) = 'Unassigned'
       OR trim(brand) NOT IN (SELECT trim(name) FROM brands)
  `);
  const unassignedCount = unassignedStmt.get().count;
  if (unassignedCount > 0) {
    result.push({
      name: 'Unassigned',
      count: unassignedCount
    });
  }

  return result;
}

/**
 * Add a new brand / folder tab (User-created only)
 */
function addBrand(name) {
  if (!name || !name.trim()) return;
  const clean = name.trim();
  const stmt = db.prepare(`INSERT OR IGNORE INTO brands (name, created_at) VALUES (?, ?)`);
  stmt.run(clean, new Date().toISOString());
  return clean;
}

/**
 * Delete a brand folder tab and reassign its products to 'Unassigned'
 */
function deleteBrand(name) {
  if (!name || !name.trim()) return;
  const clean = name.trim();
  const deleteBrandStmt = db.prepare(`DELETE FROM brands WHERE name = ?`);
  deleteBrandStmt.run(clean);

  const updateProdStmt = db.prepare(`UPDATE products SET brand = 'Unassigned', updated_at = ? WHERE trim(brand) = ?`);
  updateProdStmt.run(new Date().toISOString(), clean);
  return true;
}

/**
 * Rename a brand folder across products and brands table
 */
function renameBrand(oldName, newName) {
  if (!oldName || !newName || !oldName.trim() || !newName.trim()) return;
  const oldClean = oldName.trim();
  const newClean = newName.trim();

  addBrand(newClean);
  const updateProdStmt = db.prepare(`UPDATE products SET brand = ?, updated_at = ? WHERE trim(brand) = ?`);
  updateProdStmt.run(newClean, new Date().toISOString(), oldClean);

  const deleteOldStmt = db.prepare(`DELETE FROM brands WHERE name = ?`);
  deleteOldStmt.run(oldClean);
  return newClean;
}

/**
 * Update product fields (target price, brand / folder)
 */
function updateProduct(id, fields = {}) {
  const existing = getProductById(id);
  if (!existing) return null;

  const newTarget = fields.targetPrice !== undefined 
    ? (fields.targetPrice === null ? null : Number(fields.targetPrice)) 
    : existing.target_price;

  let newBrand = existing.brand;
  if (fields.brand !== undefined) {
    newBrand = (fields.brand && fields.brand.trim()) ? fields.brand.trim() : 'Unassigned';
  }

  const stmt = db.prepare(`UPDATE products SET target_price = ?, brand = ?, updated_at = ? WHERE id = ?`);
  stmt.run(newTarget, newBrand, new Date().toISOString(), id);
  return getProductById(id);
}

/**
 * Get single product by ID with full price history
 */
function getProductById(id) {
  const prodStmt = db.prepare('SELECT * FROM products WHERE id = ?');
  const product = prodStmt.get(id);
  if (!product) return null;

  const histStmt = db.prepare('SELECT * FROM price_history WHERE product_id = ? ORDER BY checked_at ASC');
  const history = histStmt.all(id);

  return {
    ...product,
    brand: (product.brand && product.brand.trim()) ? product.brand.trim() : 'Unassigned',
    history
  };
}

/**
 * Delete product by ID
 */
function deleteProduct(id) {
  const deleteHist = db.prepare('DELETE FROM price_history WHERE product_id = ?');
  deleteHist.run(id);
  const deleteProd = db.prepare('DELETE FROM products WHERE id = ?');
  deleteProd.run(id);
  return true;
}

/**
 * Update target price for a product
 */
function updateTargetPrice(id, targetPrice) {
  return updateProduct(id, { targetPrice });
}

/**
 * Get summary stats for the dashboard
 */
function getStats() {
  const totalStmt = db.prepare('SELECT COUNT(*) as count FROM products');
  const total = totalStmt.get().count;

  const inStockStmt = db.prepare("SELECT COUNT(*) as count FROM products WHERE availability IN ('in_stock', 'limited_stock', 'pre_order')");
  const inStock = inStockStmt.get().count;

  const outOfStockStmt = db.prepare("SELECT COUNT(*) as count FROM products WHERE availability IN ('out_of_stock', 'back_order')");
  const outOfStock = outOfStockStmt.get().count;

  const dropsStmt = db.prepare('SELECT COUNT(*) as count FROM products WHERE current_price IS NOT NULL AND original_price IS NOT NULL AND current_price < original_price');
  const priceDrops = dropsStmt.get().count;

  const targetMetStmt = db.prepare('SELECT COUNT(*) as count FROM products WHERE target_price IS NOT NULL AND current_price IS NOT NULL AND current_price <= target_price');
  const targetMet = targetMetStmt.get().count;

  const brandsCountStmt = db.prepare("SELECT COUNT(DISTINCT case when brand is null or trim(brand) = '' then 'Unassigned' else trim(brand) end) as count FROM products");
  const brandsCount = brandsCountStmt.get().count;

  return {
    total,
    inStock,
    outOfStock,
    priceDrops,
    targetMet,
    brandsCount
  };
}

module.exports = {
  saveOrUpdateProduct,
  getAllProducts,
  getProductById,
  deleteProduct,
  updateTargetPrice,
  updateProduct,
  getBrands,
  addBrand,
  deleteBrand,
  renameBrand,
  getStats,
  db
};
