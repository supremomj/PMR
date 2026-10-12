/**
 * server.js
 * Zero-dependency Price & Availability Monitoring Server
 * Native Node.js HTTP + SQLite API + Scraper Engine
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { scrapeProduct } = require('./scraper');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Helper: Parse incoming JSON request body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) { // 5MB limit
        reject(new Error('Request payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

// Helper: Send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// Concurrency helper for batch scraping
async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      try {
        results[current] = await fn(items[current], current);
      } catch (err) {
        results[current] = { error: err.message, url: items[current] };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // --- API ROUTES ---

  // GET /api/stats
  if (pathname === '/api/stats' && method === 'GET') {
    try {
      const stats = db.getStats();
      return sendJson(res, 200, { success: true, stats });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // GET /api/brands - List all brands with product counts
  if (pathname === '/api/brands' && method === 'GET') {
    try {
      const brands = db.getBrands();
      return sendJson(res, 200, { success: true, brands });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // POST /api/brands - Create a new brand folder
  if (pathname === '/api/brands' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (!body.name || !body.name.trim()) {
        return sendJson(res, 400, { success: false, error: 'Brand name is required' });
      }
      const created = db.addBrand(body.name);
      const brands = db.getBrands();
      return sendJson(res, 200, { success: true, brand: created, brands });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // DELETE /api/brands - Delete a brand folder
  if (pathname === '/api/brands' && method === 'DELETE') {
    try {
      const body = await parseJsonBody(req);
      if (!body.name) {
        return sendJson(res, 400, { success: false, error: 'Brand name is required' });
      }
      db.deleteBrand(body.name);
      const brands = db.getBrands();
      return sendJson(res, 200, { success: true, message: 'Brand deleted', brands });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // POST /api/check - Check a single link
  if (pathname === '/api/check' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (!body.url || typeof body.url !== 'string') {
        return sendJson(res, 400, { success: false, error: 'A valid "url" parameter is required' });
      }

      const scraped = await scrapeProduct(body.url, body.rawHtml);

      let savedRecord = null;
      if (body.save) {
        const targetPrice = body.targetPrice !== undefined ? Number(body.targetPrice) : null;
        savedRecord = db.saveOrUpdateProduct(scraped, isNaN(targetPrice) ? null : targetPrice, body.brand);
      }

      return sendJson(res, 200, {
        success: true,
        data: scraped,
        saved: savedRecord
      });
    } catch (err) {
      return sendJson(res, 400, { success: false, error: err.message });
    }
  }

  // POST /api/check-batch - Check multiple links
  if (pathname === '/api/check-batch' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const urls = (body.urls || []).filter(u => typeof u === 'string' && u.trim().length > 0);

      if (urls.length === 0) {
        return sendJson(res, 400, { success: false, error: 'Array of URLs is required' });
      }

      if (urls.length > 30) {
        return sendJson(res, 400, { success: false, error: 'Batch limit is 30 URLs at a time' });
      }

      const results = await mapConcurrent(urls, 3, async (url) => {
        try {
          const scraped = await scrapeProduct(url);
          if (body.save) {
            db.saveOrUpdateProduct(scraped, null, body.brand);
          }
          return { success: true, data: scraped };
        } catch (err) {
          return { success: false, url, error: err.message };
        }
      });

      return sendJson(res, 200, { success: true, count: results.length, results });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // GET /api/products - List tracked products
  if (pathname === '/api/products' && method === 'GET') {
    try {
      const search = parsedUrl.searchParams.get('search') || '';
      const filter = parsedUrl.searchParams.get('filter') || 'all';
      const sort = parsedUrl.searchParams.get('sort') || 'updated_desc';
      const brand = parsedUrl.searchParams.get('brand') || 'all';

      const products = db.getAllProducts(search, filter, sort, brand);
      return sendJson(res, 200, { success: true, products });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // GET /api/products/:id - Single product with history
  const productDetailMatch = pathname.match(/^\/api\/products\/(\d+)$/);
  if (productDetailMatch && method === 'GET') {
    try {
      const id = parseInt(productDetailMatch[1], 10);
      const product = db.getProductById(id);
      if (!product) {
        return sendJson(res, 404, { success: false, error: 'Product not found' });
      }
      return sendJson(res, 200, { success: true, product });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // POST /api/products/:id/recheck - Re-check price of specific product
  const recheckMatch = pathname.match(/^\/api\/products\/(\d+)\/recheck$/);
  if (recheckMatch && method === 'POST') {
    try {
      const id = parseInt(recheckMatch[1], 10);
      const existing = db.getProductById(id);
      if (!existing) {
        return sendJson(res, 404, { success: false, error: 'Product not found' });
      }

      const scraped = await scrapeProduct(existing.url);
      const updateResult = db.saveOrUpdateProduct(scraped);

      return sendJson(res, 200, {
        success: true,
        data: scraped,
        update: updateResult
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // POST /api/products/recheck-all - Re-check tracked products
  if (pathname === '/api/products/recheck-all' && method === 'POST') {
    try {
      const body = await parseJsonBody(req).catch(() => ({}));
      const brand = body.brand || parsedUrl.searchParams.get('brand') || 'all';
      const products = db.getAllProducts('', 'all', 'updated_desc', brand);
      const results = await mapConcurrent(products, 3, async (p) => {
        try {
          const scraped = await scrapeProduct(p.url);
          const update = db.saveOrUpdateProduct(scraped, null, p.brand);
          return { id: p.id, title: p.title, success: true, update };
        } catch (err) {
          return { id: p.id, title: p.title, success: false, error: err.message };
        }
      });

      return sendJson(res, 200, { success: true, total: products.length, results });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // PATCH /api/products/:id - Update target price and brand / folder
  if (productDetailMatch && method === 'PATCH') {
    try {
      const id = parseInt(productDetailMatch[1], 10);
      const body = await parseJsonBody(req);
      const updated = db.updateProduct(id, body);
      return sendJson(res, 200, { success: true, product: updated });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // DELETE /api/products/:id - Delete product
  if (productDetailMatch && method === 'DELETE') {
    try {
      const id = parseInt(productDetailMatch[1], 10);
      db.deleteProduct(id);
      return sendJson(res, 200, { success: true, message: 'Product removed' });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // GET /api/export - Export tracked list as CSV or JSON
  if (pathname === '/api/export' && method === 'GET') {
    try {
      const format = parsedUrl.searchParams.get('format') || 'csv';
      const products = db.getAllProducts();

      if (format === 'json') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="price-tracker-export.json"'
        });
        return res.end(JSON.stringify(products, null, 2));
      } else {
        // CSV Format
        const headers = ['ID', 'Title', 'Store', 'Current Price', 'Currency', 'Original Price', 'Availability', 'Target Price', 'URL', 'Last Checked'];
        const csvRows = [headers.join(',')];

        for (const p of products) {
          const row = [
            p.id,
            `"${(p.title || '').replace(/"/g, '""')}"`,
            `"${(p.domain || '').replace(/"/g, '""')}"`,
            p.current_price ?? '',
            p.currency ?? 'USD',
            p.original_price ?? '',
            `"${(p.availability_label || '').replace(/"/g, '""')}"`,
            p.target_price ?? '',
            `"${(p.url || '').replace(/"/g, '""')}"`,
            `"${p.updated_at || ''}"`
          ];
          csvRows.push(row.join(','));
        }

        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="price-tracker-export.csv"'
        });
        return res.end(csvRows.join('\r\n'));
      }
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // --- STATIC ASSETS SERVING ---
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);

  // Security: prevent path traversal outside PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Access denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA if not an api call
      const fallbackPath = path.join(PUBLIC_DIR, 'index.html');
      if (fs.existsSync(fallbackPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(fallbackPath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  PMR - Price & Availability Tracker Server running!`);
  console.log(`  Local URL:  http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
