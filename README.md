# PMR — Universal Price & Availability Inspector & Tracker

A zero-dependency, ultra-fast price and stock availability tracking system built with Node.js and native SQLite. Paste any e-commerce product link and instantly inspect its current price, currency, and real-time stock availability.

---

## ✨ Features

- 🔍 **Universal Product Link Inspector**: Paste links from Amazon, eBay, Walmart, Shopify stores, Best Buy, Target, or any e-commerce site.
- ⚡ **Multi-Layer Extraction Pipeline**:
  - **Schema.org JSON-LD**: Official structured data used by modern stores.
  - **HTML Microdata**: Itemprops for price, currency, and availability.
  - **OpenGraph & Twitter Meta**: Social commerce metadata tags.
  - **Custom Selectors**: Specialized engines for Amazon, eBay, Shopify, etc.
  - **Semantic Fallback**: Currency pattern matching and stock status heuristics.
- 📦 **Stock Availability Intelligence**: Detects `In Stock` 🟢, `Out of Stock` 🔴, `Only X Left` 🟡, `Pre-Order` 🔵, or `Backordered`.
- 📊 **Tracked Watchlist & Price History**:
  - Automatically records every check in a local SQLite database (`node:sqlite`).
  - Highlights price drops (e.g. `-15% 📉`).
  - Interactive modal with an SVG Price Trend Chart and full timestamped inspection log.
- 📁 **Brand Folders & Tabs Organization**:
  - Keep tracked products neatly organized by brand folders (e.g., **DataBlitz**, **8bitdo**, **Sony**, **Nintendo**).
  - One-click Brand Tabs to view products for a single brand, or switch to **Grouped Folder View** with collapsible file headers.
  - Create custom brand tabs with the **+ New Brand Tab** button.
  - Move/reassign products between brand folders directly from cards or the inspection modal.
- 🎯 **Target Price Alerts**: Set desired threshold prices and get notified when an item is at or below your target.
- 📋 **Batch Link Mode**: Paste multiple links (one per line) to analyze dozens of items concurrently.
- 🚀 **CLI & REST API Support**: Inspect items from the command line or integrate with any script or bot.
- 💾 **Export Data**: One-click export of your entire tracked list to **CSV** or **JSON**.
- 🌙 **Modern Glassmorphic UI**: Fast, responsive interface with Dark/Light mode.

---

## 🚀 Quick Start

### 1. Launch the Web Interface
Double-click `start.bat` in the project folder, or run:

```bash
node server.js
```

Then open your browser to **[http://localhost:3000](http://localhost:3000)**.

### 2. Inspect from the Command Line (CLI)
You can also inspect links directly from PowerShell or Command Prompt:

```bash
# Inspect a single URL
node cli.js "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html"

# Inspect and save to your watchlist with a target price alert
node cli.js "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html" --save --target 49.99

# List all tracked products
node cli.js --list
```

---

## 🛠️ Project Structure

```
PMR/
├── server.js          # HTTP Server, REST API & static file provider
├── scraper.js         # Multi-layer Price & Availability extraction engine
├── db.js              # SQLite Database engine (node:sqlite)
├── cli.js             # Terminal command-line inspector
├── start.bat          # One-click Windows launcher (starts server + opens browser)
├── test-e2e.js        # Automated integration test suite
├── public/            # Modern Frontend Web UI
│   ├── index.html     # Dashboard layout (hero search, cards, history modal)
│   ├── styles.css     # Responsive glassmorphic styles (dark/light themes)
│   └── app.js         # Frontend controller, API integration & SVG chart
└── data/
    └── tracker.db     # Persistent SQLite database file
```

---

## 📡 REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/check` | `POST` | Inspect single URL. Body: `{ "url": "...", "save": true, "targetPrice": 50 }` |
| `/api/check-batch` | `POST` | Inspect multiple URLs concurrently. Body: `{ "urls": [...], "save": true }` |
| `/api/products` | `GET` | List tracked items. Query: `?search=...&filter=...&sort=...` |
| `/api/products/:id` | `GET` | Retrieve single product details with full price history |
| `/api/products/:id/recheck` | `POST` | Re-fetch latest price and stock for product ID |
| `/api/products/recheck-all` | `POST` | Re-check all products in watchlist |
| `/api/products/:id` | `PATCH` | Update target price threshold. Body: `{ "targetPrice": 45 }` |
| `/api/products/:id` | `DELETE` | Delete product and history from watchlist |
| `/api/stats` | `GET` | Get total, in stock, out of stock, and price drop counters |
| `/api/export?format=csv` | `GET` | Download watchlist as CSV or JSON |
