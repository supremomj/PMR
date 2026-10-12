/**
 * scraper.js
 * Universal Price & Availability Extractor
 * Multi-layer parsing: JSON-LD -> Microdata -> OpenGraph -> Platform Patterns -> Heuristics
 */

const https = require('node:https');
const http = require('node:http');
const { URL } = require('node:url');

// Common browser User-Agent & Headers to avoid bot blocks
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1'
};

// Currency symbols mapping to ISO codes
const CURRENCY_MAP = {
  '$': 'USD',
  'USD': 'USD',
  'US$': 'USD',
  '€': 'EUR',
  'EUR': 'EUR',
  '£': 'GBP',
  'GBP': 'GBP',
  '¥': 'JPY',
  'JPY': 'JPY',
  '₱': 'PHP',
  'PHP': 'PHP',
  '₹': 'INR',
  'INR': 'INR',
  'C$': 'CAD',
  'CAD': 'CAD',
  'A$': 'AUD',
  'AUD': 'AUD',
  'NZ$': 'NZD',
  'NZD': 'NZD',
  'CHF': 'CHF',
  'SEK': 'SEK',
  'kr': 'SEK',
  'R$': 'BRL',
  'BRL': 'BRL',
  '₩': 'KRW',
  'KRW': 'KRW',
  'SGD': 'SGD',
  'S$': 'SGD',
  'HK$': 'HKD',
  'HKD': 'HKD',
  'MXN': 'MXN',
  'MX$': 'MXN'
};

/**
 * Decode common HTML entities
 */
function decodeHTMLEntities(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&pound;/g, '£')
    .replace(/&euro;/g, '€')
    .replace(/&yen;/g, '¥')
    .replace(/&#(\d+);/g, (_, dec) => {
      try { return String.fromCharCode(parseInt(dec, 10)); } catch { return ''; }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try { return String.fromCharCode(parseInt(hex, 16)); } catch { return ''; }
    })
    .trim();
}

/**
 * Clean text from multiple whitespace and newlines
 */
function cleanText(text) {
  if (!text) return '';
  return decodeHTMLEntities(text).replace(/\s+/g, ' ').trim();
}

/**
 * Parse price string to numeric value and currency
 */
function parsePriceAndCurrency(rawPrice, defaultCurrency = 'USD') {
  if (rawPrice === null || rawPrice === undefined) return { price: null, currency: defaultCurrency, formatted: null };

  if (typeof rawPrice === 'number') {
    return {
      price: rawPrice,
      currency: defaultCurrency,
      formatted: formatPrice(rawPrice, defaultCurrency)
    };
  }

  const str = String(rawPrice).trim();
  if (!str) return { price: null, currency: defaultCurrency, formatted: null };

  // Detect currency from string
  let detectedCurrency = defaultCurrency;
  for (const [sym, code] of Object.entries(CURRENCY_MAP)) {
    if (str.includes(sym)) {
      detectedCurrency = code;
      break;
    }
  }

  // Extract digits and decimal point
  // Match patterns like 1,299.99 or 1299.99 or 1299,99 (European)
  let cleanStr = str.replace(/[^\d.,]/g, '');
  
  if (!cleanStr) return { price: null, currency: detectedCurrency, formatted: null };

  // European format: 1.299,99 -> 1299.99
  if (cleanStr.includes(',') && cleanStr.includes('.')) {
    if (cleanStr.indexOf('.') < cleanStr.indexOf(',')) {
      // 1.299,99
      cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,299.99
      cleanStr = cleanStr.replace(/,/g, '');
    }
  } else if (cleanStr.includes(',')) {
    // Check if comma is decimal: like 29,99
    const parts = cleanStr.split(',');
    if (parts.length === 2 && parts[1].length === 2) {
      cleanStr = parts[0] + '.' + parts[1];
    } else {
      cleanStr = cleanStr.replace(/,/g, '');
    }
  }

  const num = parseFloat(cleanStr);
  if (isNaN(num)) return { price: null, currency: detectedCurrency, formatted: null };

  return {
    price: Math.round(num * 100) / 100,
    currency: detectedCurrency,
    formatted: formatPrice(num, detectedCurrency)
  };
}

/**
 * Format numeric price with currency symbol or code
 */
function formatPrice(num, currency = 'USD') {
  if (num === null || num === undefined || isNaN(num)) return 'Price N/A';
  const symbols = {
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'PHP': '₱',
    'JPY': '¥',
    'INR': '₹',
    'CAD': 'C$',
    'AUD': 'A$'
  };
  const sym = symbols[currency] || (currency ? currency + ' ' : '$');
  const formattedNum = Number(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${sym}${formattedNum}`;
}

/**
 * Normalize availability string into standardized status & badge
 */
function normalizeAvailability(rawAvailability, fullHtml = '') {
  const str = String(rawAvailability || '').toLowerCase();

  // In Stock positive indicators
  if (
    str.includes('instock') ||
    str.includes('in_stock') ||
    str.includes('in stock') ||
    str.includes('available') ||
    str.includes('ready to ship') ||
    str.includes('onlineonly') ||
    str.includes('instoreonly')
  ) {
    // Check if limited stock
    const limitedMatch = str.match(/only\s+(\d+)\s+left/i) || fullHtml.match(/only\s+(\d+)\s+left\s+in\s+stock/i);
    if (limitedMatch) {
      return {
        status: 'limited_stock',
        label: `Only ${limitedMatch[1]} Left in Stock`,
        badgeClass: 'badge-warning',
        inStock: true
      };
    }
    return {
      status: 'in_stock',
      label: 'In Stock',
      badgeClass: 'badge-success',
      inStock: true
    };
  }

  // Pre-Order
  if (str.includes('preorder') || str.includes('pre-order')) {
    return {
      status: 'pre_order',
      label: 'Pre-Order',
      badgeClass: 'badge-info',
      inStock: true
    };
  }

  // Back-Order
  if (str.includes('backorder') || str.includes('back-order')) {
    return {
      status: 'back_order',
      label: 'Backordered',
      badgeClass: 'badge-warning',
      inStock: false
    };
  }

  // Out of stock indicators
  if (
    str.includes('outofstock') ||
    str.includes('out_of_stock') ||
    str.includes('out of stock') ||
    str.includes('soldout') ||
    str.includes('sold out') ||
    str.includes('unavailable') ||
    str.includes('discontinued')
  ) {
    return {
      status: 'out_of_stock',
      label: 'Out of Stock',
      badgeClass: 'badge-danger',
      inStock: false
    };
  }

  // If no explicit raw availability, check HTML heuristics
  if (fullHtml) {
    const htmlLower = fullHtml.toLowerCase();
    
    // Explicit Out of stock signals
    if (
      htmlLower.includes('currently unavailable') ||
      htmlLower.includes('temporarily out of stock') ||
      htmlLower.includes('out of stock') ||
      htmlLower.includes('sold out') ||
      htmlLower.includes('item is currently out of stock')
    ) {
      return {
        status: 'out_of_stock',
        label: 'Out of Stock',
        badgeClass: 'badge-danger',
        inStock: false
      };
    }

    // Limited stock check
    const limitedMatch = fullHtml.match(/only\s+(\d+)\s+left\s+in\s+stock/i) || fullHtml.match(/only\s+(\d+)\s+available/i);
    if (limitedMatch) {
      return {
        status: 'limited_stock',
        label: `Only ${limitedMatch[1]} Left!`,
        badgeClass: 'badge-warning',
        inStock: true
      };
    }

    // Positive signals: "In Stock" text or buy buttons
    if (
      htmlLower.includes('in stock') ||
      htmlLower.includes('add to cart') ||
      htmlLower.includes('buy now') ||
      htmlLower.includes('add to basket') ||
      htmlLower.includes('proceed to checkout')
    ) {
      return {
        status: 'in_stock',
        label: 'In Stock',
        badgeClass: 'badge-success',
        inStock: true
      };
    }
  }

  return {
    status: 'unknown',
    label: 'Check Site',
    badgeClass: 'badge-secondary',
    inStock: null
  };
}

/**
 * Extract image URL safely, handling relative paths and arrays
 */
function normalizeImageUrl(img, baseUrl) {
  if (!img) return null;
  let rawUrl = '';
  if (typeof img === 'string') {
    rawUrl = img.trim();
  } else if (Array.isArray(img) && img.length > 0) {
    rawUrl = typeof img[0] === 'string' ? img[0] : (img[0]?.url || img[0]?.contentUrl || '');
  } else if (typeof img === 'object') {
    rawUrl = img.url || img.contentUrl || '';
  }

  if (!rawUrl) return null;
  // Strip escape quotes
  rawUrl = rawUrl.replace(/^["']|["']$/g, '');

  try {
    const resolved = new URL(rawUrl, baseUrl).href;
    return resolved;
  } catch {
    return rawUrl.startsWith('http') ? rawUrl : null;
  }
}


/**
 * Render JavaScript-heavy marketplace pages with Playwright.
 * Playwright is optional: if it is not installed or a site blocks automation,
 * the regular HTTP response and existing extractors remain available.
 */
function isMarketplaceHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return /(^|\.)shopee\./i.test(host) || /(^|\.)lazada\./i.test(host);
}

async function fetchRenderedHtml(targetUrl) {
  let chromium;
  try {
    // Lazy-load so other sites can still be scraped without Playwright installed.
    ({ chromium } = require('playwright'));
  } catch {
    try {
      ({ chromium } = require('playwright-core'));
    } catch {
      throw new Error('Playwright is not installed in this project. Run: npm install playwright');
    }
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent: DEFAULT_HEADERS['User-Agent'],
      locale: 'en-PH',
      viewport: { width: 1365, height: 900 }
    });

    page.setDefaultNavigationTimeout(25000);
    page.setDefaultTimeout(8000);

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

    // Give marketplace product data and client-side components time to render.
    await page.waitForTimeout(2500);

    // Wait briefly for a product/price area where available; do not fail if selectors change.
    try {
      await page.waitForFunction(() => {
        const text = document.body?.innerText || '';
        return /₱\s?[\d,]+|PHP\s?[\d,]+|US\$\s?[\d,.]+|\$\s?[\d,.]+/.test(text);
      }, { timeout: 5000 });
    } catch {
      // Continue with whatever content the site rendered.
    }

    const html = await page.content();
    return { html, url: page.url() || targetUrl };
  } finally {
    await browser.close();
  }
}

/**
 * Strategy 1: Schema.org JSON-LD parser
 */
function extractFromJSONLD(html, baseUrl) {
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  const products = [];

  while ((match = jsonLdRegex.exec(html)) !== null) {
    const rawContent = match[1].trim();
    if (!rawContent) continue;

    try {
      const data = JSON.parse(rawContent);
      findProductsInJson(data, products);
    } catch {
      // Handle slight JSON malformations (e.g. unescaped newlines or trailing commas)
      try {
        const cleaned = rawContent
          .replace(/,\s*([}\]])/g, '$1')
          .replace(/[\u0000-\u001F]+/g, ' ');
        const data = JSON.parse(cleaned);
        findProductsInJson(data, products);
      } catch {
        // Ignore unparseable JSON-LD blocks
      }
    }
  }

  if (products.length === 0) return null;

  // Pick the most complete product (has price and title)
  const bestProduct = products.find(p => p.price !== null && p.title) || products[0];

  return {
    strategy: 'JSON-LD (schema.org)',
    confidence: 'high',
    title: bestProduct.title,
    price: bestProduct.price,
    currency: bestProduct.currency,
    formattedPrice: formatPrice(bestProduct.price, bestProduct.currency),
    availability: bestProduct.availability,
    imageUrl: normalizeImageUrl(bestProduct.imageUrl, baseUrl),
    brand: bestProduct.brand,
    sku: bestProduct.sku,
    description: bestProduct.description
  };
}

/**
 * Recursively search JSON object or graph for Product / Offer nodes
 */
function findProductsInJson(node, list) {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const item of node) findProductsInJson(item, list);
    return;
  }

  if (typeof node !== 'object') return;

  // Check if @graph present
  if (Array.isArray(node['@graph'])) {
    for (const item of node['@graph']) findProductsInJson(item, list);
    return;
  }

  const type = String(node['@type'] || node.type || '').toLowerCase();
  const isProduct = type.includes('product');

  if (isProduct || node.offers) {
    const title = cleanText(node.name || node.title);
    const imageUrl = node.image;
    const brand = typeof node.brand === 'object' ? node.brand?.name : node.brand;
    const sku = node.sku || node.gtin13 || node.gtin || node.mpn;
    const description = cleanText(node.description);

    let price = null;
    let currency = 'USD';
    let rawAvailability = null;

    if (node.offers) {
      const offers = Array.isArray(node.offers) ? node.offers : [node.offers];
      for (const off of offers) {
        if (!off) continue;
        const offerPrice = off.price ?? off.lowPrice ?? off.highPrice;
        if (offerPrice !== undefined && offerPrice !== null) {
          const parsed = parsePriceAndCurrency(offerPrice, off.priceCurrency || 'USD');
          if (parsed.price !== null) {
            price = parsed.price;
            currency = parsed.currency || off.priceCurrency || 'USD';
            rawAvailability = off.availability || rawAvailability;
            break;
          }
        }
        if (off.availability && !rawAvailability) {
          rawAvailability = off.availability;
        }
      }
    } else if (node.price) {
      const parsed = parsePriceAndCurrency(node.price, node.priceCurrency || 'USD');
      price = parsed.price;
      currency = parsed.currency;
    }

    const avail = normalizeAvailability(rawAvailability);

    list.push({
      title,
      price,
      currency,
      availability: avail,
      imageUrl,
      brand: brand ? cleanText(brand) : null,
      sku: sku ? String(sku).trim() : null,
      description: description ? description.slice(0, 300) : null
    });
  }

  // Recurse into children
  for (const key of Object.keys(node)) {
    if (typeof node[key] === 'object' && node[key] !== null) {
      findProductsInJson(node[key], list);
    }
  }
}

/**
 * Strategy 2: OpenGraph & Twitter Meta Tags
 */
function extractFromMetaTags(html, baseUrl) {
  const getMeta = (propNames) => {
    for (const prop of propNames) {
      // <meta property="og:title" content="..." />
      const r1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i');
      const m1 = html.match(r1);
      if (m1 && m1[1]) return m1[1];

      // Reverse attribute order: <meta content="..." property="og:title" />
      const r2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i');
      const m2 = html.match(r2);
      if (m2 && m2[1]) return m2[1];
    }
    return null;
  };

  const title = getMeta(['og:title', 'twitter:title', 'title']);
  const image = getMeta(['og:image', 'twitter:image', 'og:image:secure_url']);
  const priceAmount = getMeta(['og:price:amount', 'product:price:amount', 'price', 'twitter:data1']);
  const priceCurrency = getMeta(['og:price:currency', 'product:price:currency', 'currency']) || 'USD';
  const availabilityRaw = getMeta(['product:availability', 'og:availability', 'availability']);

  if (!title && !priceAmount) return null;

  const parsedPrice = priceAmount ? parsePriceAndCurrency(priceAmount, priceCurrency) : { price: null, currency: priceCurrency, formatted: null };
  const availability = normalizeAvailability(availabilityRaw, html);

  return {
    strategy: 'OpenGraph / Meta Tags',
    confidence: parsedPrice.price !== null ? 'medium-high' : 'medium',
    title: cleanText(title),
    price: parsedPrice.price,
    currency: parsedPrice.currency,
    formattedPrice: parsedPrice.formatted,
    availability,
    imageUrl: normalizeImageUrl(image, baseUrl),
    brand: cleanText(getMeta(['og:site_name', 'product:brand'])),
    sku: null,
    description: cleanText(getMeta(['og:description', 'twitter:description']))
  };
}

/**
 * Strategy 3: HTML Microdata itemprops
 */
function extractFromMicrodata(html, baseUrl) {
  const getItemprop = (prop) => {
    // <... itemprop="price" content="29.99">
    const m1 = html.match(new RegExp(`itemprop=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i'));
    if (m1 && m1[1]) return m1[1];
    // <... content="29.99" itemprop="price">
    const m2 = html.match(new RegExp(`content=["']([^"']*)["'][^>]*itemprop=["']${prop}["']`, 'i'));
    if (m2 && m2[1]) return m2[1];
    // <span itemprop="price">$29.99</span>
    const m3 = html.match(new RegExp(`<[^>]+itemprop=["']${prop}["'][^>]*>([^<]+)<\/`, 'i'));
    if (m3 && m3[1]) return m3[1];
    return null;
  };

  const priceVal = getItemprop('price') || getItemprop('lowPrice');
  const currency = getItemprop('priceCurrency') || 'USD';
  const availRaw = getItemprop('availability');
  const name = getItemprop('name');
  const image = getItemprop('image');

  if (!priceVal && !name) return null;

  const parsed = parsePriceAndCurrency(priceVal, currency);
  return {
    strategy: 'HTML Microdata',
    confidence: 'high',
    title: cleanText(name),
    price: parsed.price,
    currency: parsed.currency,
    formattedPrice: parsed.formatted,
    availability: normalizeAvailability(availRaw, html),
    imageUrl: normalizeImageUrl(image, baseUrl),
    brand: cleanText(getItemprop('brand')),
    sku: getItemprop('sku'),
    description: null
  };
}

/**
 * Strategy 4: Platform-Specific Rules (Amazon, eBay, BestBuy, Walmart, Shopify, etc.)
 */
function extractPlatformSpecific(html, baseUrl, urlObj) {
  const host = urlObj.hostname.toLowerCase();

  // Amazon
  if (host.includes('amazon.')) {
    // Title
    const titleMatch = html.match(/<span\s+id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i);
    const title = titleMatch ? cleanText(titleMatch[1]) : null;

    // Price
    let price = null;
    let currency = 'USD';

    // Amazon price selectors
    const amazonPriceMatches = [
      html.match(/class=["'][^"']*priceToPay[^"']*["'][^>]*>[\s\S]*?<span\s+class=["']a-offscreen["']>([^<]+)<\/span>/i),
      html.match(/id=["']corePrice_desktop["'][\s\S]*?<span\s+class=["']a-offscreen["']>([^<]+)<\/span>/i),
      html.match(/id=["']corePriceDisplay_desktop_feature_div["'][\s\S]*?<span\s+class=["']a-offscreen["']>([^<]+)<\/span>/i),
      html.match(/id=["']priceblock_ourprice["'][^>]*>([^<]+)<\/span>/i),
      html.match(/id=["']priceblock_dealprice["'][^>]*>([^<]+)<\/span>/i),
      html.match(/<span\s+class=["']a-price\s+aok-align-center[^"']*["'][^>]*>[\s\S]*?<span\s+class=["']a-offscreen["']>([^<]+)<\/span>/i),
      html.match(/<span\s+class=["']a-offscreen["']>([^<]+)<\/span>/i)
    ];

    for (const m of amazonPriceMatches) {
      if (m && m[1]) {
        const parsed = parsePriceAndCurrency(m[1]);
        if (parsed.price !== null) {
          price = parsed.price;
          currency = parsed.currency;
          break;
        }
      }
    }

    // Availability
    let rawAvail = null;
    const availDiv = html.match(/<div\s+id=["']availability["'][^>]*>([\s\S]*?)<\/div>/i);
    if (availDiv) {
      rawAvail = cleanText(availDiv[1]);
    } else if (html.match(/id=["']outOfStock["']/i) || html.includes('Currently unavailable')) {
      rawAvail = 'Currently unavailable';
    }

    // Image
    let imgUrl = null;
    const landingImg = html.match(/id=["']landingImage["'][^>]+data-old-hires=["']([^"']+)["']/i) ||
                       html.match(/id=["']landingImage["'][^>]+src=["']([^"']+)["']/i);
    if (landingImg) imgUrl = landingImg[1];

    if (title || price !== null) {
      return {
        strategy: 'Amazon Custom Selector',
        confidence: 'high',
        title,
        price,
        currency,
        formattedPrice: formatPrice(price, currency),
        availability: normalizeAvailability(rawAvail, html),
        imageUrl: normalizeImageUrl(imgUrl, baseUrl),
        brand: 'Amazon',
        sku: urlObj.pathname.match(/\/dp\/([A-Z0-9]+)/i)?.[1] || null,
        description: null
      };
    }
  }

  // eBay
  if (host.includes('ebay.')) {
    const titleMatch = html.match(/<h1[^>]*class=["'][^"']*x-item-title__mainTitle[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
                       html.match(/<h1[^>]*id=["']itemTitle["'][^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? cleanText(titleMatch[1].replace(/<[^>]+>/g, '')) : null;

    let price = null;
    let currency = 'USD';
    const priceMatch = html.match(/<div[^>]*class=["'][^"']*x-price-primary[^"']*["'][^>]*>[\s\S]*?<span[^>]*class=["']ux-textspans["']>([^<]+)<\/span>/i) ||
                       html.match(/data-testid=["']x-price-primary["'][\s\S]*?<span[^>]*>([^<]+)<\/span>/i) ||
                       html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i);
    if (priceMatch) {
      const parsed = parsePriceAndCurrency(priceMatch[1]);
      price = parsed.price;
      currency = parsed.currency;
    }

    const availMatch = html.match(/<div[^>]*class=["'][^"']*d-quantity__availability[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const rawAvail = availMatch ? cleanText(availMatch[1].replace(/<[^>]+>/g, '')) : null;

    const imgMatch = html.match(/<div[^>]*class=["'][^"']*ux-image-magnify__image--original[^"']*["'][^>]+src=["']([^"']+)["']/i) ||
                     html.match(/<img[^>]+id=["']icImg["'][^>]+src=["']([^"']+)["']/i);

    if (title || price !== null) {
      return {
        strategy: 'eBay Custom Selector',
        confidence: 'high',
        title,
        price,
        currency,
        formattedPrice: formatPrice(price, currency),
        availability: normalizeAvailability(rawAvail, html),
        imageUrl: normalizeImageUrl(imgMatch?.[1], baseUrl),
        brand: 'eBay',
        sku: urlObj.pathname.match(/\/itm\/(\d+)/i)?.[1] || null,
        description: null
      };
    }
  }

  // Shopee / Lazada rendered product data. Their page markup changes often,
  // so prefer embedded product state and metadata over one fragile CSS selector.
  if (/(^|\.)shopee\./i.test(host) || /(^|\.)lazada\./i.test(host)) {
    const titleMatch =
      html.match(/<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:title["']/i) ||
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ||
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? cleanText(titleMatch[1].replace(/<[^>]+>/g, '')) : null;

    const imageMatch =
      html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i);

    // Look for known marketplace price elements in rendered HTML first.
    const pricePatterns = [
      /class=["'][^"']*(?:pdp-price|price--current|pdp-product-price|pqTWkA|IZPeQz)[^"']*["'][^>]*>([\s\S]{0,500}?)<\/(?:span|div|p)/i,
      /["'](?:price|salePrice|currentPrice|priceMin|priceMax)["']\s*:\s*["']?(\d+(?:\.\d{1,2})?)["']?/i,
      /["']price(?:_min)?["']\s*:\s*\{\s*["'](?:value|amount)["']\s*:\s*["']?(\d+(?:\.\d{1,2})?)/i
    ];
    let price = null;
    let currency = /lazada\.(?:com\.ph|ph)|shopee\.ph/i.test(host) ? 'PHP' : 'USD';

    for (const pattern of pricePatterns) {
      const match = html.match(pattern);
      if (!match?.[1]) continue;
      const parsed = parsePriceAndCurrency(cleanText(match[1].replace(/<[^>]+>/g, ' ')), currency);
      if (parsed.price !== null && parsed.price > 0) {
        price = parsed.price;
        currency = parsed.currency || currency;
        break;
      }
    }

    // Fallback to explicit price metadata if present.
    if (price === null) {
      const metaPrice = html.match(/<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["']/i);
      if (metaPrice?.[1]) {
        const parsed = parsePriceAndCurrency(metaPrice[1], currency);
        price = parsed.price;
        currency = parsed.currency || currency;
      }
    }

    if (title || price !== null) {
      return {
        strategy: 'Marketplace Rendered/Platform Extraction',
        confidence: price !== null && title ? 'medium-high' : 'medium',
        title,
        price,
        currency,
        formattedPrice: price !== null ? formatPrice(price, currency) : 'Price N/A',
        availability: normalizeAvailability(null, html),
        imageUrl: normalizeImageUrl(imageMatch?.[1], baseUrl),
        brand: /shopee\./i.test(host) ? 'Shopee' : 'Lazada',
        sku: null,
        description: null
      };
    }
  }

  // Shopify stores (often have shopify metadata or product script)
  const shopifyJsonMatch = html.match(/<script[^>]*id=["']ProductJson-[^"']*["'][^>]*>([\s\S]*?)<\/script>/i) ||
                           html.match(/window\.ShopifyAnalytics\.meta\.product\s*=\s*(\{[\s\S]*?\});/i);
  if (shopifyJsonMatch) {
    try {
      const data = JSON.parse(shopifyJsonMatch[1]);
      const title = data.title || data.name;
      const variant = data.variants?.[0] || data;
      const rawPrice = variant.price ? variant.price / 100 : data.price;
      const available = variant.available !== undefined ? (variant.available ? 'In Stock' : 'Out of Stock') : null;
      const image = data.featured_image || data.images?.[0];

      return {
        strategy: 'Shopify Store Engine',
        confidence: 'high',
        title: cleanText(title),
        price: rawPrice || null,
        currency: 'USD',
        formattedPrice: formatPrice(rawPrice, 'USD'),
        availability: normalizeAvailability(available, html),
        imageUrl: normalizeImageUrl(image, baseUrl),
        brand: data.vendor || host,
        sku: variant.sku || null,
        description: data.description ? cleanText(data.description).slice(0, 300) : null
      };
    } catch {
      // Fall through
    }
  }

  return null;
}

/**
 * Strategy 5: Generic DOM / Regex Fallback
 */
function extractHeuristicFallback(html, baseUrl, urlObj) {
  // Title from <title> or <h1>
  let title = null;
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    title = cleanText(h1Match[1].replace(/<[^>]+>/g, ''));
  }
  if (!title) {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      title = cleanText(titleMatch[1]);
    }
  }

  // Price heuristic: Search for currency strings in product/price containers or general text
  let price = null;
  let currency = 'USD';

  // Check specific price class containers first
  const priceContainerRegex = /<[^>]+class=["'][^"']*(?:price|amount|cost|current_price|sales-price|price-tag)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
  let containerMatch;
  while ((containerMatch = priceContainerRegex.exec(html)) !== null) {
    const inner = containerMatch[1].replace(/<[^>]+>/g, ' ').trim();
    const parsed = parsePriceAndCurrency(inner);
    if (parsed.price !== null && parsed.price > 0 && parsed.price < 1000000) {
      price = parsed.price;
      currency = parsed.currency;
      break;
    }
  }

  // If still not found, search general regex for currency
  if (price === null) {
    const generalPriceRegex = /(?:[$€£₱¥₹]\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)|([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)\s*(?:USD|EUR|GBP|PHP))/i;
    const genMatch = html.match(generalPriceRegex);
    if (genMatch) {
      const parsed = parsePriceAndCurrency(genMatch[0]);
      if (parsed.price !== null) {
        price = parsed.price;
        currency = parsed.currency;
      }
    }
  }

  // First image in body or main area
  let imageUrl = null;
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp|avif)[^"']*)["'][^>]*>/i);
  if (imgMatch) {
    imageUrl = normalizeImageUrl(imgMatch[1], baseUrl);
  }

  const availability = normalizeAvailability(null, html);

  return {
    strategy: 'Semantic Heuristic Analysis',
    confidence: price !== null ? 'medium' : 'low',
    title: title || urlObj.hostname,
    price,
    currency,
    formattedPrice: price !== null ? formatPrice(price, currency) : 'N/A',
    availability,
    imageUrl,
    brand: urlObj.hostname.replace(/^www\./, ''),
    sku: null,
    description: null
  };
}

/**
 * Main fetch & extract pipeline
 */
async function scrapeProduct(targetUrl, providedHtml = null) {
  let urlObj;
  try {
    let cleanUrl = targetUrl.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    urlObj = new URL(cleanUrl);
  } catch (err) {
    throw new Error(`Invalid URL provided: "${targetUrl}"`);
  }

  const startTime = Date.now();
  let responseHtml = providedHtml;
  let finalUrl = urlObj.href;

  if (!responseHtml) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const res = await fetch(urlObj.href, {
        method: 'GET',
        headers: {
          ...DEFAULT_HEADERS,
          'Host': urlObj.host
        },
        redirect: 'follow',
        signal: controller.signal
      });

      clearTimeout(timeout);
      finalUrl = res.url || urlObj.href;

      if (!res.ok && res.status !== 403 && res.status !== 404) {
        // Some e-commerce return 403 to bots, but still provide HTML with metadata!
        console.warn(`HTTP ${res.status} returned from ${urlObj.hostname}`);
      }

      responseHtml = await res.text();
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Connection timed out (15s) while fetching ${urlObj.hostname}`);
      }
      throw new Error(`Failed to fetch URL: ${err.message}`);
    }
  }

  // Shopee and Lazada frequently deliver a JavaScript shell to ordinary fetch().
  // Try a real browser render for these domains, but keep the HTTP result as fallback.
  if (!providedHtml && isMarketplaceHost(urlObj.hostname)) {
    try {
      const rendered = await fetchRenderedHtml(finalUrl || urlObj.href);
      if (rendered.html && rendered.html.length > 50) {
        responseHtml = rendered.html;
        finalUrl = rendered.url || finalUrl;
      }
    } catch (err) {
      console.warn(`Playwright marketplace fallback failed for ${urlObj.hostname}: ${err.message}`);
    }
  }

  if (!responseHtml || responseHtml.length < 50) {
    throw new Error(`Empty or invalid response received from ${urlObj.hostname}`);
  }

  // Pipeline cascade:
  // 1. Platform-specific rule
  const platformResult = extractPlatformSpecific(responseHtml, finalUrl, new URL(finalUrl));
  if (platformResult && platformResult.price !== null && platformResult.title) {
    return enrichResult(platformResult, finalUrl, startTime);
  }

  // 2. Schema.org JSON-LD
  const jsonLdResult = extractFromJSONLD(responseHtml, finalUrl);
  if (jsonLdResult && jsonLdResult.price !== null && jsonLdResult.title) {
    return enrichResult(jsonLdResult, finalUrl, startTime);
  }

  // 3. HTML Microdata
  const microdataResult = extractFromMicrodata(responseHtml, finalUrl);
  if (microdataResult && microdataResult.price !== null && microdataResult.title) {
    return enrichResult(microdataResult, finalUrl, startTime);
  }

  // 4. OpenGraph & Meta Tags
  const metaResult = extractFromMetaTags(responseHtml, finalUrl);
  if (metaResult && metaResult.price !== null && metaResult.title) {
    return enrichResult(metaResult, finalUrl, startTime);
  }

  // Merge best available attributes
  const candidates = [platformResult, jsonLdResult, microdataResult, metaResult].filter(Boolean);
  let bestTitle = candidates.find(c => c.title)?.title;
  let bestPrice = candidates.find(c => c.price !== null)?.price ?? null;
  let bestCurrency = candidates.find(c => c.price !== null)?.currency || 'USD';
  let bestImage = candidates.find(c => c.imageUrl)?.imageUrl;
  let bestAvail = candidates.find(c => c.availability?.status !== 'unknown')?.availability;
  let bestBrand = candidates.find(c => c.brand)?.brand;
  let usedStrategy = candidates[0]?.strategy || 'Multi-source Combined';

  // 5. If still missing price or title, try fallback heuristic
  if (bestPrice === null || !bestTitle) {
    const fallback = extractHeuristicFallback(responseHtml, finalUrl, new URL(finalUrl));
    bestTitle = bestTitle || fallback.title;
    bestPrice = bestPrice !== null ? bestPrice : fallback.price;
    bestCurrency = bestCurrency || fallback.currency;
    bestImage = bestImage || fallback.imageUrl;
    bestAvail = bestAvail || fallback.availability;
    bestBrand = bestBrand || fallback.brand;
    usedStrategy = usedStrategy !== 'Multi-source Combined' ? usedStrategy : fallback.strategy;
  }

  const merged = {
    strategy: usedStrategy,
    confidence: bestPrice !== null ? (candidates.length > 0 ? 'medium-high' : 'medium') : 'low',
    title: bestTitle || 'Unknown Product',
    price: bestPrice,
    currency: bestCurrency,
    formattedPrice: bestPrice !== null ? formatPrice(bestPrice, bestCurrency) : 'Price N/A',
    availability: bestAvail || normalizeAvailability(null, responseHtml),
    imageUrl: bestImage,
    brand: bestBrand || new URL(finalUrl).hostname.replace(/^www\./, ''),
    sku: null,
    description: null
  };

  return enrichResult(merged, finalUrl, startTime);
}

/**
 * Add metadata, latency, and hostname to final output
 */
function enrichResult(data, url, startTime) {
  const urlObj = new URL(url);
  const domain = urlObj.hostname.replace(/^www\./, '');

  return {
    url,
    domain,
    title: data.title || 'Product on ' + domain,
    price: data.price,
    currency: data.currency || 'USD',
    formattedPrice: data.price !== null ? formatPrice(data.price, data.currency) : 'Price N/A',
    availability: data.availability || {
      status: 'unknown',
      label: 'Check Site',
      badgeClass: 'badge-secondary',
      inStock: null
    },
    imageUrl: data.imageUrl,
    brand: data.brand || domain,
    sku: data.sku || null,
    description: data.description || null,
    strategy: data.strategy,
    confidence: data.confidence,
    responseTimeMs: Date.now() - startTime,
    scrapedAt: new Date().toISOString()
  };
}

module.exports = {
  scrapeProduct,
  parsePriceAndCurrency,
  formatPrice,
  normalizeAvailability,
  decodeHTMLEntities
};
