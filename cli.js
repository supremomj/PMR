#!/usr/bin/env node
/**
 * cli.js
 * Command-line Price & Availability Checker
 * Usage: node cli.js <url> [--save] [--target 49.99] [--json]
 */

const { scrapeProduct } = require('./scraper');
const db = require('./db');

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
===========================================================
  PMR - Product Price & Availability Inspector (CLI)
===========================================================

Usage:
  node cli.js <url> [options]

Options:
  --save           Save product to persistent watchlist
  --target <num>   Set target price alert threshold
  --json           Output raw JSON result
  --list           List all saved products in database
  --help, -h       Show this help manual

Examples:
  node cli.js "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html"
  node cli.js "https://example.com/product" --save --target 49.99
  node cli.js --list
`);
    process.exit(0);
  }

  if (args.includes('--list')) {
    const products = db.getAllProducts();
    if (products.length === 0) {
      console.log('No tracked products found. Use "node cli.js <url> --save" to add one.');
      process.exit(0);
    }
    console.log('\nTracked Products (' + products.length + '):');
    console.log('-----------------------------------------------------------');
    for (const p of products) {
      const dropStr = p.price_diff < 0 ? ` [${p.diff_percent}% 📉]` : '';
      console.log(`[#${p.id}] ${p.title.slice(0, 40)}`);
      console.log(`     Price: ${p.formatted_price}${dropStr} | Status: ${p.availability_label}`);
      console.log(`     Store: ${p.domain} | URL: ${p.url}\n`);
    }
    process.exit(0);
  }

  const url = args.find(a => !a.startsWith('--'));
  if (!url) {
    console.error('Error: Please provide a valid product URL.');
    process.exit(1);
  }

  const shouldSave = args.includes('--save');
  const isJson = args.includes('--json');
  let targetPrice = null;
  const targetIdx = args.indexOf('--target');
  if (targetIdx !== -1 && args[targetIdx + 1]) {
    targetPrice = parseFloat(args[targetIdx + 1]);
  }

  if (!isJson) {
    console.log(`\nAnalyzing product: ${url}`);
    console.log('Fetching and extracting metadata...\n');
  }

  try {
    const result = await scrapeProduct(url);

    if (shouldSave) {
      db.saveOrUpdateProduct(result, targetPrice);
    }

    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('===========================================================');
      console.log(`  TITLE:        ${result.title}`);
      console.log(`  PRICE:        ${result.formattedPrice}`);
      console.log(`  AVAILABILITY: ${result.availability.label} (${result.availability.status})`);
      console.log(`  STORE/DOMAIN: ${result.domain}`);
      if (result.brand) console.log(`  BRAND:        ${result.brand}`);
      if (result.imageUrl) console.log(`  IMAGE:        ${result.imageUrl}`);
      console.log(`  STRATEGY:     ${result.strategy} (Confidence: ${result.confidence})`);
      console.log(`  RESPONSE:     ${result.responseTimeMs}ms`);
      console.log('===========================================================');
      if (shouldSave) {
        console.log('Saved to watchlist database!');
      }
    }
  } catch (err) {
    if (isJson) {
      console.log(JSON.stringify({ error: err.message }, null, 2));
    } else {
      console.error(`\nError: ${err.message}`);
    }
    process.exit(1);
  }
}

main();
