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

test('mocked, not real: support links and no storefront admin references', async () => {
  const vm = require('node:vm');
  const website = path.join(__dirname, '../web/website');
  const app = fs.readFileSync(path.join(website, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(website, 'index.html'), 'utf8');
  const h = await helpers();
  const nodes = [];
  const el = (tag, attrs = {}, ...children) => {
    const node = { tag, attrs, children }; nodes.push(node); return node;
  };
  const render = app.slice(app.indexOf('function renderSupport()'), app.indexOf('/* ---------- Boot ---------- */'));
  const constants = app.slice(app.indexOf('const SUPPORT_PHONE_DISPLAY'), app.indexOf('/* ---------- State'));
  vm.runInNewContext(`${constants}\n${render}\nrenderSupport();`, {
    el, path: () => ({}), WHATSAPP_PATH: '', whatsappSupportUrl: h.whatsappSupportUrl,
    appMain: { append() {} },
  });
  assert(nodes.some(n => n.tag === 'a' && n.attrs.href === 'mailto:abdulmanan304000@gmail.com' && n.attrs.text === 'abdulmanan304000@gmail.com'));
  assert(nodes.some(n => n.tag === 'a' && n.attrs.href === 'tel:03221393770' && n.attrs.text === '03221393770'));
  assert(nodes.some(n => n.tag === 'a' && n.attrs.href === 'https://wa.me/923221393770'));
  assert.match(html, /id="whatsapp-fab"/);
  for (const name of fs.readdirSync(website)) {
    const file = path.join(website, name);
    if (fs.statSync(file).isFile()) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /admin/i);
  }
});
