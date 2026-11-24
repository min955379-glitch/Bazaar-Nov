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
  return { elements, document, auth: (...args) => authHandler(...args), setError: err => authError = err, advance(ms) { now += ms; } };
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
