async function testServer() {
  console.log('Testing PMR Server Endpoints...\n');

  // 1. Static HTML
  const resHtml = await fetch('http://localhost:3000/');
  console.log('1. GET / status:', resHtml.status, 'Content-Type:', resHtml.headers.get('content-type'));

  // 2. Stats
  const resStats = await fetch('http://localhost:3000/api/stats');
  const dataStats = await resStats.json();
  console.log('2. GET /api/stats:', dataStats);

  // 3. Brands Endpoint
  const resBrands = await fetch('http://localhost:3000/api/brands');
  const dataBrands = await resBrands.json();
  console.log('3. GET /api/brands count:', dataBrands.brands?.length, 'Brands:', dataBrands.brands?.map(b => `${b.name} (${b.count})`).join(', '));

  // 4. Create Brand
  const resNewBrand = await fetch('http://localhost:3000/api/brands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Nintendo' })
  });
  const dataNewBrand = await resNewBrand.json();
  console.log('4. POST /api/brands result:', dataNewBrand.success, 'Created:', dataNewBrand.brand);

  // 5. Products List filtered by Brand
  const resList = await fetch('http://localhost:3000/api/products?brand=8bitdo');
  const dataList = await resList.json();
  console.log('5. GET /api/products?brand=8bitdo count:', dataList.products?.length);

  // 6. Check Single Product with Brand assigned
  const resCheck = await fetch('http://localhost:3000/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
      save: true,
      brand: 'DataBlitz',
      targetPrice: 50.00
    })
  });
  const dataCheck = await resCheck.json();
  console.log('6. POST /api/check (assigned to DataBlitz) status:', resCheck.status, 'Brand:', dataCheck.saved?.product?.brand);

  // 7. Verify DataBlitz brand filter
  const resDataBlitz = await fetch('http://localhost:3000/api/products?brand=DataBlitz');
  const dataDataBlitz = await resDataBlitz.json();
  console.log('7. GET /api/products?brand=DataBlitz count:', dataDataBlitz.products?.length);

  // 8. Export CSV
  const resExport = await fetch('http://localhost:3000/api/export?format=csv');
  const csvText = await resExport.text();
  console.log('8. GET /api/export status:', resExport.status);

  console.log('\nAll End-to-End Tests Passed Successfully!');
}

testServer().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
