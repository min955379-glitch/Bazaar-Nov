import { WEBSITE_URL, SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { usernameEmail, signInError, createLockout } from './auth-utils.js';

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const bucket = client.storage.from('product-images');
const $ = id => document.getElementById(id);
$('view-website').href = WEBSITE_URL;
$('mobile-view-website').href = WEBSITE_URL;
const lock = createLockout();
const MAX_SIZE = 4 * 1024 * 1024;
const ADMIN = 'abdulmanan@bazaarshop.app';
let activeUser = null, initialized = false, signingIn = false, busy = false;
let products = [], editing = null, photos = [], originalImages = [], draftId = null;
let timer;

function errorText(error) { return String(error?.message || error || 'Unknown error'); }
// A timed-out request may still complete on the server. Never assume it failed.
function withTimeout(promise, label) {
  let id;
  return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { id = setTimeout(() => reject(new Error(`${label} timed out. Check the catalog before trying again.`)), 30000); })]).finally(() => clearTimeout(id));
}
function loginButton() {
  const seconds = lock.remaining();
  $('login-button').disabled = !initialized || signingIn || seconds > 0;
  $('login-button').textContent = !initialized ? 'Checking session…' : signingIn ? 'Signing in…' : seconds ? `Try again in ${seconds}s` : 'Sign in';
  if (!seconds && timer) { clearInterval(timer); timer = null; }
}
function clearPhotos() {
  photos.forEach(p => { if (p.preview?.startsWith('blob:')) URL.revokeObjectURL(p.preview); });
  photos = []; originalImages = [];
}
function signedOut() {
  activeUser = null; products = []; editing = null; draftId = null; clearPhotos();
  $('list-view').hidden = false; for (const id of ['total-count', 'stock-count', 'out-count']) $(id).textContent = '–'; $('product-list').replaceChildren();
  $('dash-actions').append($('mobile-view-website'));
  $('dashboard').hidden = true; $('sign-out').hidden = true; $('view-website').hidden = true; $('save-success').hidden = true; $('product-form').hidden = true; $('login').hidden = false;
  $('password').value = '';
}
function authChanged(event, session) {
  if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') return;
  const user = session?.user;
  const valid = user && String(user.email || '').toLowerCase() === ADMIN;
  if (event === 'INITIAL_SESSION' && initialized && (activeUser?.id || null) === (valid ? user.id : null)) return;
  initialized = true;
  if (!valid) {
    if (activeUser || !$('dashboard').hidden) signedOut();
    if (user) $('login-error').textContent = 'This account is not the Bazaar administrator.';
    loginButton(); return;
  }
  if (activeUser?.id === user.id) { loginButton(); return; }
  activeUser = user; $('login').hidden = true; $('dashboard').hidden = false; $('sign-out').hidden = false; $('view-website').hidden = false; $('login-error').textContent = '';
  setTimeout(loadProducts, 0);
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); if (signingIn || lock.remaining()) return;
  const password = $('password').value;
  signingIn = true; $('login-error').textContent = ''; loginButton();
  try {
    const { error } = await withTimeout(client.auth.signInWithPassword({ email: usernameEmail($('username').value), password }), 'Sign in');
    if (error) throw error;
    lock.reset();
  } catch (error) {
    // Log a sanitized error: never expose a password even if echoed by the server.
    const redact = value => String(value || '').split(password || '\u0000').join('[redacted]');
    const safe = { message: redact(error?.message), code: redact(error?.code), name: redact(error?.name), status: error?.status };
    console.error('Sign-in error:', safe);
    lock.fail(); $('login-error').textContent = signInError(safe);
    $('password').value = ''; $('password').focus();
    if (lock.remaining() && !timer) timer = setInterval(loginButton, 1000);
  } finally { signingIn = false; loginButton(); }
});
$('sign-out').addEventListener('click', async () => {
  const button = $('sign-out'); button.disabled = true;
  try { const { error } = await withTimeout(client.auth.signOut(), 'Sign out'); if (error) throw error; }
  catch (error) { $('list-message').textContent = `Sign out failed: ${errorText(error)}`; }
  finally { button.disabled = false; }
});
async function loadProducts() {
  $('list-message').textContent = 'Loading products…'; $('retry').hidden = true;
  for (const id of ['total-count', 'stock-count', 'out-count']) $(id).textContent = '–'; $('product-list').replaceChildren();
  try {
    const { data, error } = await withTimeout(client.from('products').select('id,name,price,description,images,in_stock,created_at').order('created_at', { ascending: false }), 'Loading');
    if (error) throw error;
    products = data || []; showProducts();
    $('list-message').textContent = products.length ? '' : 'No products yet. Tap Add product.';
  } catch (error) { $('list-message').textContent = `Could not load products: ${errorText(error)}`; $('retry').hidden = false; }
}
$('retry').onclick = () => loadProducts();
function node(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
function showProducts() {
  $('total-count').textContent = products.length;
  $('stock-count').textContent = products.filter(p => p.in_stock !== false).length;
  $('out-count').textContent = products.filter(p => p.in_stock === false).length;
  const list = $('product-list'); list.replaceChildren();
  for (const product of products) {
    const row = node('article', null, 'product-row');
    if (product.images?.[0]) { const img = node('img'); img.src = product.images[0]; img.alt = ''; row.append(img); }
    const info = node('div', null, 'info'); info.append(node('strong', product.name), node('div', `Rs ${Number(product.price).toLocaleString('en-PK')} · ${product.in_stock === false ? 'Out of stock' : 'In stock'}`, 'meta'));
    const actions = node('div', null, 'actions');
    const edit = node('button', 'Edit', 'secondary-btn'); edit.type = 'button'; edit.onclick = () => openForm(product);
    const del = node('button', 'Delete', 'secondary-btn'); del.type = 'button'; del.onclick = () => deleteProduct(product, del);
    actions.append(edit, del); row.append(info, actions); list.append(row);
  }
}
function openForm(product = null) {
  if (busy) return;
  if (!$('product-form').hidden && !confirm('Discard the current draft?')) return;
  $('save-success').hidden = true;
  $('editor-website').append($('mobile-view-website'));
  clearPhotos(); editing = product; draftId = product ? null : crypto.randomUUID();
  $('product-form').reset(); $('form-title').textContent = product ? 'Edit product' : 'Add product';
  $('name').value = product?.name || ''; $('price').value = product?.price ?? ''; $('description').value = product?.description || '';
  $('in-stock').checked = product ? product.in_stock !== false : true;
  originalImages = [...(product?.images || [])]; photos = originalImages.map(url => ({ url, preview: url }));
  $('form-error').textContent = ''; $('list-view').hidden = true; $('product-form').hidden = false; showPhotos(); $('name').focus();
}
$('add').onclick = () => openForm();
$('cancel').onclick = () => { if (busy) return; if (confirm('Discard this draft?')) { clearPhotos(); draftId = null; $('product-form').hidden = true; $('list-view').hidden = false; $('dash-actions').append($('mobile-view-website')); } };
$('photos').addEventListener('change', event => {
  const files = [...event.target.files]; event.target.value = '';
  if (photos.length + files.length > 3) { $('form-error').textContent = 'Choose no more than 3 photos.'; return; }
  for (const file of files) {
    if (!file.type.startsWith('image/')) { $('form-error').textContent = 'Please choose image files only.'; continue; }
    photos.push({ file, preview: URL.createObjectURL(file) });
  }
  showPhotos();
});
function showPhotos() {
  const list = $('image-list'); list.replaceChildren();
  photos.forEach((photo, index) => {
    const wrapper = node('div', null, 'image-slot'), img = node('img'); img.src = photo.preview; img.alt = `Photo ${index + 1}`;
    const remove = node('button', 'Remove', 'secondary-btn'); remove.type = 'button'; remove.disabled = busy;
    remove.onclick = () => { if (photo.preview.startsWith('blob:')) URL.revokeObjectURL(photo.preview); photos.splice(index, 1); showPhotos(); };
    wrapper.append(img, remove); list.append(wrapper);
  });
}
async function compress(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    await withTimeout(new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('This image format could not be opened. Try JPEG or PNG.')); }), 'Image processing');
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image compression is unavailable in this browser.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await withTimeout(new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .82)), 'Image compression');
    if (!blob || blob.size > MAX_SIZE) throw new Error('Compressed image must be under 4 MB.');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}
function ownPath(url) {
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/product-images/`;
  return typeof url === 'string' && url.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length).split('?')[0]) : null;
}
async function removeUnused(urls) {
  if (!urls.length) return;
  const { data, error } = await withTimeout(client.from('products').select('images'), 'Checking image references');
  if (error) throw error;
  const used = new Set((data || []).flatMap(p => p.images || []));
  const paths = [...new Set(urls.filter(url => !used.has(url)).map(ownPath).filter(Boolean))];
  if (paths.length) { const result = await withTimeout(bucket.remove(paths), 'Removing images'); if (result.error) throw result.error; }
}
function setBusy(value) {
  busy = value; $('save').disabled = value; $('cancel').disabled = value; $('add').disabled = value; $('photos').disabled = value;
  $('save').textContent = value ? 'Saving…' : 'Save product'; showPhotos();
}
$('product-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  if (photos.length < 2 || photos.length > 3) { $('form-error').textContent = 'Choose 2 or 3 images.'; return; }
  const price = Number($('price').value), name = $('name').value.trim(), description = $('description').value.trim();
  if (name.length < 2 || !description || !Number.isFinite(price) || price <= 0 || price > 10000000) { $('form-error').textContent = 'Enter a valid name, description and price.'; return; }
  setBusy(true); $('form-error').textContent = ''; let uploaded = [], saved = false;
  try {
    const urls = [];
    for (const photo of photos) {
      if (photo.url) { urls.push(photo.url); continue; }
      const blob = await compress(photo.file); const path = `${crypto.randomUUID()}.jpg`;
      const { error } = await withTimeout(bucket.upload(path, blob, { contentType: 'image/jpeg', upsert: false }), 'Upload');
      if (error) throw error;
      const { data } = bucket.getPublicUrl(path);
      // Keep successful uploads attached to the draft so retrying a failed save
      // does not upload a second copy of the same photo.
      photo.url = data.publicUrl; uploaded.push(data.publicUrl); urls.push(data.publicUrl);
    }
    const payload = { name, price, description, images: urls, in_stock: $('in-stock').checked };
    const operation = editing ? client.from('products').update(payload).eq('id', editing.id).select('id').single() : client.from('products').insert({ id: draftId, ...payload }).select('id').single();
    const { error } = await withTimeout(operation, 'Saving');
    let alreadySaved = false;
    if (error) {
      // A timed-out insert may already have completed. Only accept a duplicate
      // if this specific draft ID exists; other uniqueness errors remain errors.
      if (editing || error.code !== '23505') throw error;
      const existing = await withTimeout(client.from('products').select('id').eq('id', draftId).maybeSingle(), 'Checking saved product');
      if (existing.error || !existing.data) throw error;
      alreadySaved = true;
    }
    saved = true;
    let cleanupError = '';
    try { await removeUnused(originalImages.filter(url => !urls.includes(url))); } catch (err) { cleanupError = ` Product saved, but old photos could not be removed: ${errorText(err)}`; }
    clearPhotos(); draftId = null; $('product-form').hidden = true; $('list-view').hidden = false; $('dash-actions').append($('mobile-view-website')); await loadProducts();
    const success = $('save-success'); const link = node('a', 'View website', 'success-link');
    link.href = WEBSITE_URL; link.target = '_blank'; link.rel = 'noopener noreferrer';
    success.replaceChildren(); success.textContent = alreadySaved ? 'Product was already saved. ' : 'Product saved. ';
    success.append(link); success.hidden = false;
    if (cleanupError) $('list-message').textContent = cleanupError;
  } catch (error) {
    // Do not delete uploaded files: after a timeout the database may have saved them.
    $('form-error').textContent = `Save failed: ${errorText(error)}${uploaded.length && !saved ? ' Uploaded files may remain; check the catalog before retrying.' : ''}`;
  } finally { setBusy(false); }
});
async function deleteProduct(product, button) {
  if (busy || !confirm(`Delete ${product.name}?`)) return;
  button.disabled = true; busy = true;
  try {
    const { error } = await withTimeout(client.from('products').delete().eq('id', product.id).select('id').single(), 'Delete'); if (error) throw error;
    let warning = ''; try { await removeUnused(product.images || []); } catch (err) { warning = `Product deleted, but images could not be removed: ${errorText(err)}`; }
    if (editing?.id === product.id) { clearPhotos(); $('product-form').hidden = true; editing = null; }
    await loadProducts(); if (warning) $('list-message').textContent = warning;
  } catch (error) { $('list-message').textContent = `Delete failed: ${errorText(error)}`; }
  finally { button.disabled = false; busy = false; }
}
client.auth.onAuthStateChange(authChanged);
setTimeout(() => { if (!initialized) { initialized = true; $('login-error').textContent = 'Could not check the session. Check the internet.'; loginButton(); } }, 10000);
