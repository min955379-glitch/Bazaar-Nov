const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadApp(fields = {}) {
  const calls = [];
  let nextId = 0;
  const bucket = {
    upload: async (name) => { calls.push(name); return { error: null }; },
    getPublicUrl: (name) => ({ data: { publicUrl: `https://example.com/product-images/${name}` } }),
  };
  const source = fs.readFileSync(path.join(__dirname, '../web/admin/app.js'), 'utf8')
    .replace('/* ---------- Boot ---------- */\nrender();\nsupabase.auth.onAuthStateChange(onAuthStateChange);', '')
    + '\nthis.testing = { validateForm, pathFromUrl, uploadProductImage, setImages: value => { formImages = value; } };';
  const context = {
    window: { supabase: { createClient: () => ({ storage: { from: () => bucket } }) } },
    document: { querySelector: selector => fields[selector] || null },
    crypto: { randomUUID: () => `uuid-${++nextId}` },
    console,
  };
  vm.runInNewContext(source, context);
  return { ...context.testing, calls };
}

test('form accepts two or three images and rejects invalid entries', () => {
  const app = loadApp({
    '#f-name': { value: '  Lamp  ' }, '#f-price': { value: '1500' },
    '#f-desc': { value: 'Desk lamp' }, '#f-active': { checked: true }, '#f-category': { value: 'Home' },
  });
  app.setImages([{}, {}]);
  assert.equal(app.validateForm().name, 'Lamp');
  assert.equal(app.validateForm().category, 'Home');
  app.setImages([{}]);
  assert.match(app.validateForm().error, /at least 2/);
  app.setImages([{}, {}, {}, {}]);
  assert.match(app.validateForm().error, /Too many/);
});

test('uploaded images use unique paths and existing URLs can be resolved', async () => {
  const app = loadApp();
  const first = await app.uploadProductImage('product', {});
  const second = await app.uploadProductImage('product', {});
  assert.notEqual(first.path, second.path);
  assert.equal(app.pathFromUrl(first.url), first.path);
});
