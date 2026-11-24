// Mocked, not real: runs the admin script with a fake DOM and fake Supabase.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup() {
  const elements = {};
  function element(id = '') {
    return { id, hidden: ['dashboard', 'product-form', 'sign-out', 'view-website', 'save-success'].includes(id), value: '', checked: true, disabled: false, textContent: '', children: [], handlers: {},
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
  const context = { document, window: { supabase: { createClient: () => client } }, SUPABASE_URL: 'https://example.com', SUPABASE_ANON_KEY: 'public', WEBSITE_URL: 'https://bazaar-website-min955379-6910.vercel.app',
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
  assert.equal(a.elements['product-form'].hidden, false); assert.match(a.elements['form-error'].textContent, /1 to 3/); assert.equal(a.elements.name.value, 'Draft product');
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
  const link = a.elements['save-success'].children[0];
  assert.equal(link.href, 'https://bazaar-website-min955379-6910.vercel.app');
  assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer');
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

test('mocked, not real: dark default and blocked storage toggle', () => {
  let ready, click; const root = {dataset:{}}, button = {setAttribute(){}, addEventListener(_,fn){click=fn;}};
  const ctx = {document:{documentElement:root,addEventListener(_,fn){ready=fn;},getElementById(){return button;}}, localStorage:{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/admin/theme.js'),'utf8'),ctx);
  assert.equal(root.dataset.theme,'dark'); ready(); click(); assert.equal(root.dataset.theme,'light'); click(); assert.equal(root.dataset.theme,'dark');
});

test('mocked, not real: website link is private to signed-in header and opens safely', async () => {
  const html = fs.readFileSync(path.join(__dirname,'../web/admin/index.html'),'utf8');
  assert.match(html, /id="view-website"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*hidden/);
  assert.match(html, /id="mobile-view-website"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.equal((html.match(/id="sign-out"/g) || []).length, 1);
  assert.match(html, /<section id="dashboard" hidden>[\s\S]*id="mobile-view-website"/);
  const a=setup(); assert.equal(a.elements['view-website'].hidden,true);
  a.auth('INITIAL_SESSION',{user:{id:'admin',email:'abdulmanan@bazaarshop.app'}});
  assert.equal(a.elements['view-website'].hidden,false);
  assert.equal(a.elements['view-website'].href,'https://bazaar-website-min955379-6910.vercel.app');
  assert.equal(a.elements['mobile-view-website'].href,a.elements['view-website'].href);
  assert.equal(a.elements['sign-out'].hidden,false);
  a.auth('SIGNED_OUT',null); assert.equal(a.elements['view-website'].hidden,true);
});

test('mocked, not real: missing preference defaults dark and light preference is restored', () => {
  const run = saved => { const root = {dataset:{}}; const ctx={document:{documentElement:root,addEventListener(){}},localStorage:{getItem(){return saved}}}; vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/admin/theme.js'),'utf8'),ctx); return root.dataset.theme; };
  assert.equal(run(null),'dark'); assert.equal(run('light'),'light');
});


test('mocked, not real: mobile and desktop copies use exclusive CSS visibility', () => {
  const css=fs.readFileSync(path.join(__dirname,'../web/admin/style.css'),'utf8');
  assert.match(css,/\.mobile-website,#editor-website\{display:none\}/);
  assert.match(css,/@media\(max-width:767px\)/);
  assert.match(css,/\.header-actions \.desktop-website\{display:none\}/);
  assert.match(css,/\.dash-actions \.mobile-website,#editor-website \.mobile-website\{display:inline-flex\}/);
});

test('mocked, not real: 0 and 4 images fail; 1, 2 and 3 images save with category', async () => {
  for (const count of [0, 1, 2, 3, 4]) {
    const a = setup(); let payload;
    a.auth('INITIAL_SESSION', { user: { id: 'admin', email: 'abdulmanan@bazaarshop.app' } }); await flush();
    a.elements.add.onclick(); assert.equal(a.elements.category.value, 'Other');
    a.elements.name.value = 'Example'; a.elements.price.value = '300'; a.elements.description.value = 'Example'; a.elements.category.value = 'Fashion';
    vm.runInNewContext(`photos = Array.from({length:${count}}, (_,i) => ({url:'https://example.com/'+i, preview:'https://example.com/'+i}))`, a.context);
    a.client.from = () => ({ insert(p) { payload = p; return this; }, select() { return this; }, single() { return Promise.resolve({error:null}); }, order() { return Promise.resolve({data:[],error:null}); } });
    await a.elements['product-form'].handlers.submit({preventDefault(){}});
    if (count === 0 || count === 4) { assert.equal(payload, undefined); assert.match(a.elements['form-error'].textContent, /1 to 3/); }
    else { assert.equal(payload.images.length, count); assert.equal(payload.category, 'Fashion'); assert.equal(a.elements['product-form'].hidden, true); }
  }
});

test('mocked, not real: exact category choices and saved category survives a failed edit', async () => {
  const html = fs.readFileSync(path.join(__dirname,'../web/admin/index.html'),'utf8');
  const select = html.match(/<select id="category"[^>]*>([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...select.matchAll(/value="([^"]+)"/g)].map(m=>m[1]), ['Other','Electronics','Fashion','Home','Accessories']);
  const a=setup(); a.auth('INITIAL_SESSION',{user:{id:'admin',email:'abdulmanan@bazaarshop.app'}}); await flush();
  vm.runInNewContext("openForm({id:'edit',name:'Example',price:300,description:'Example',category:'Home',images:['https://example.com/1'],in_stock:true})",a.context);
  assert.equal(a.elements.category.value,'Home');
  a.elements.category.value='Accessories'; let payload;
  a.client.from=()=>({update(p){payload=p;return this;},eq(){return this;},select(){return this;},single(){return Promise.resolve({error:{message:'offline'}})}});
  await a.elements['product-form'].handlers.submit({preventDefault(){}});
  assert.equal(payload.category,'Accessories'); assert.equal(a.elements.category.value,'Accessories'); assert.equal(a.elements['product-form'].hidden,false);
});
