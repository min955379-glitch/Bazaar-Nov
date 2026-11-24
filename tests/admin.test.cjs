// Mocked, not real: runs the admin script with a fake DOM and fake Supabase.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup() {
  const elements = {};
  function element(id = '') {
    return { id, hidden: ['dashboard', 'product-form', 'sign-out'].includes(id), value: '', checked: true, disabled: false, textContent: '', children: [], handlers: {},
      addEventListener(event, fn) { this.handlers[event] = fn; }, append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
      focus() { document.activeElement = this; }, reset() {}, classList: { add() {}, remove() {} } };
  }
  const document = { getElementById(id) { return elements[id] ||= element(id); }, createElement(tag) { return element(tag); }, activeElement: null };
  let authHandler, authError = null;
  const query = { select() { return this; }, order() { return Promise.resolve({ data: [], error: null }); } };
  const client = { auth: { onAuthStateChange(fn) { authHandler = fn; }, signInWithPassword: async () => ({ error: authError }), signOut: async () => ({ error: null }) },
    from() { return query; }, storage: { from() { return {}; } } };
  const source = fs.readFileSync(path.join(__dirname, '../web/admin/app.js'), 'utf8').replace(/^import .*;\n/gm, '');
  let now = 0, failures = 0, until = 0;
  const context = { document, window: { supabase: { createClient: () => client } }, SUPABASE_URL: 'https://example.com', SUPABASE_ANON_KEY: 'public',
    usernameEmail: x => x.trim().toLowerCase() + '@bazaarshop.app', signInError: e => e.message === 'Invalid login credentials' ? 'Wrong username or password' : e.message,
    createLockout: () => ({ remaining: () => Math.max(0, Math.ceil((until - now) / 1000)), fail: () => { if (++failures === 5) { until = now + 30000; failures = 0; } }, reset: () => { failures = 0; until = 0; } }),
    console, setTimeout, clearTimeout, setInterval, clearInterval, confirm: () => true, URL, crypto: { randomUUID: () => 'test' }, Image: function () {} };
  vm.runInNewContext(source, context);
  return { elements, document, context, client, auth: (...args) => authHandler(...args), setError: err => authError = err, advance(ms) { now += ms; } };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 5));
test('mocked, not real: invalid password preserves username and focuses password', async () => {
  const a = setup(); a.auth('INITIAL_SESSION', null); a.document.getElementById('username'); a.document.getElementById('password'); a.elements.username.value = 'Abdulmanan'; a.elements.password.value = 'wrong';
  a.setError({ message: 'Invalid login credentials' }); await a.elements['login-form'].handlers.submit({ preventDefault() {} });
  assert.equal(a.elements.username.value, 'Abdulmanan'); assert.equal(a.elements['login-error'].textContent, 'Wrong username or password'); assert.equal(a.document.activeElement, a.elements.password);
});
test('mocked, not real: token refresh leaves open product draft intact', async () => {
  const a = setup(); const session = { user: { id: 'admin', email: 'abdulmanan@bazaarshop.app' } };
  a.auth('INITIAL_SESSION', session); await flush(); a.elements.add.onclick(); a.elements.name.value = 'Draft product';
  a.auth('TOKEN_REFRESHED', session); assert.equal(a.elements.name.value, 'Draft product'); assert.equal(a.elements['product-form'].hidden, false);
  a.auth('SIGNED_IN', session); assert.equal(a.elements.name.value, 'Draft product');
});
test('mocked, not real: validation keeps draft open when too few images', async () => {
  const a = setup(); a.auth('INITIAL_SESSION', { user: { id: 'admin', email: 'abdulmanan@bazaarshop.app' } }); await flush(); a.elements.add.onclick();
  a.elements.name.value = 'Draft product'; await a.elements['product-form'].handlers.submit({ preventDefault() {} });
  assert.equal(a.elements['product-form'].hidden, false); assert.match(a.elements['form-error'].textContent, /2 or 3/); assert.equal(a.elements.name.value, 'Draft product');
});

test('mocked, not real: retry uses same product id and handles saved duplicate', async () => {
  const a = setup(); const ids = []; let attempt = 0;
  a.auth('INITIAL_SESSION', { user: { id: 'admin', email: 'abdulmanan@bazaarshop.app' } }); await flush();
  a.elements.add.onclick();
  assert.equal(a.elements['list-view'].hidden, true);
  a.elements.name.value = 'Example'; a.elements.price.value = '300'; a.elements.description.value = 'Example description';
  vm.runInNewContext("photos = [{url:'https://example.com/1',preview:'https://example.com/1'},{url:'https://example.com/2',preview:'https://example.com/2'}]", a.context);
  a.client.from = () => ({
    insert(payload) { ids.push(payload.id); return this; },
    select() { return this; }, eq() { return this; },
    single() { return Promise.resolve(++attempt === 1 ? { error: { message: 'connection lost' } } : { error: { code: '23505' } }); },
    maybeSingle() { return Promise.resolve({data:{id:'test'},error:null}); },
    order() { return Promise.resolve({data:[],error:null}); },
  });
  await a.elements['product-form'].handlers.submit({ preventDefault() {} });
  assert.equal(a.elements['product-form'].hidden, false);
  await a.elements['product-form'].handlers.submit({ preventDefault() {} });
  assert.deepEqual(ids, ['test', 'test']);
  assert.equal(a.elements['product-form'].hidden, true);
  assert.equal(a.elements['list-view'].hidden, false);
});

test('mocked, not real: theme loads saved choice and toggle saves', () => {
  let callback, click, stored = 'dark';
  const root = { dataset: {} }, button = { textContent:'', setAttribute() {}, addEventListener(_, fn) { click = fn; } };
  const ctx = { document: { documentElement: root, addEventListener(_, fn) { callback = fn; }, getElementById() { return button; } },
    localStorage: { getItem() { return stored; }, setItem(_, value) { stored = value; } }, matchMedia: () => ({matches:false,addEventListener(){}}) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/admin/theme.js'),'utf8'), ctx);
  assert.equal(root.dataset.theme, 'dark'); callback(); click(); assert.equal(root.dataset.theme, 'light'); assert.equal(stored, 'light');
});

test('mocked, not real: load failure keeps counters unknown and retry loads empty list', async () => {
  const a = setup(); let calls = 0;
  a.client.from = () => ({ select() { return this; }, order() { return Promise.resolve(++calls === 1 ? {error:{message:'offline'}} : {data:[],error:null}); } });
  a.auth('INITIAL_SESSION', { user: { id:'admin', email:'abdulmanan@bazaarshop.app' } }); await flush();
  assert.equal(a.elements['total-count'].textContent, '–'); assert.match(a.elements['list-message'].textContent, /offline/); assert.equal(a.elements.retry.hidden, false);
  await a.elements.retry.onclick(); assert.equal(a.elements['total-count'].textContent, 0); assert.equal(a.elements['list-message'].textContent, 'No products yet. Tap Add product.');
});
