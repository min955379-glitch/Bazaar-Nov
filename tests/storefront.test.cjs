const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function helpers() {
  const source = fs.readFileSync(path.join(__dirname, '../web/website/helpers.js'));
  return import(`data:text/javascript;base64,${source.toString('base64')}`);
}

test('Supabase products retain their name, category, price and images', async () => {
  const h = await helpers();
  const p = h.productFromSupabase({ id: '123', name: 'Lamp', description: 'Desk lamp', category: 'Home', price: '2580.00', in_stock: true, images: ['https://example.com/1.jpg'] });
  assert.equal(p.id, '123');
  assert.equal(p.title, 'Lamp');
  assert.equal(p.category, 'Home');
  assert.equal(h.fmtMoney(p.priceCents), 'Rs 2,580');
  assert.deepEqual(h.imagesFor(p), ['https://example.com/1.jpg']);
  assert.equal(h.matchFilters(p, 'Home', 'lamp'), true);
  assert.equal(h.matchFilters(p, 'Fashion', ''), false);
});

test('older products without a category default to Other', async () => {
  const h = await helpers();
  const p = h.productFromSupabase({ id: '1', name: 'Item', price: 1, in_stock: false });
  assert.equal(p.category, 'Other');
  assert.equal(p.stockCount, 0);
  assert.equal(p.active, false);
});
