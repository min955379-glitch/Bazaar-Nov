/* ===== Bazaar admin portal — Google sign-in + Firestore + Firebase Storage ===== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* ---------- Config (client-side public config; security is enforced by Firestore rules) ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyBwHTSlynCnwVaOuz4NBybOpC9Wzo8Pkp4",
  authDomain: "gen-lang-client-0568023966.firebaseapp.com",
  projectId: "gen-lang-client-0568023966",
  storageBucket: "gen-lang-client-0568023966.firebasestorage.app",
};
const DATABASE_ID = "ai-studio-android-bazaar-ff6147c8-9c50-47a7-a4c0-4235cdb6b40e";
const BOOTSTRAP_ADMIN_EMAIL = "abdulmanan304000@gmail.com";
const PRESETS = {
  electronics: "assets/img_prod_electronics.jpg",
  fashion: "assets/img_prod_fashion.jpg",
  accessories: "assets/img_prod_fashion.jpg",
  home: "assets/img_prod_home.jpg",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, DATABASE_ID);
const storage = getStorage(app);

/* ---------- State ---------- */
let authUser = null;          // signed-in Firebase user (or null)
let adminStatus = "loading";  // loading | signed-out | admin | not-admin
let products = [];
let orders = [];
let productsReady = false, ordersReady = false;
let productsError = null, ordersError = null;
let tab = "products";          // products | orders
let adminError = null;
let authError = null;
let signInBusy = false;

/* Product form state */
let viewMode = "list";         // list | form
let editingId = null;          // id when editing (null = add)
let formImages = [];           // [{ which: "kept"|"new", url?, file?, oldIndex?, tempUrl? }]
let removedIndexes = [];       // old indexes of kept images the user removed
let saving = false;
let pendingDelete = null;      // product id being deleted (for confirm)
let formDraft = null;          // { name, pricePKR, desc, active } — survives re-renders

let unsubscribers = [];

/* ---------- Helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const appMain = $("#app");
const toastEl = $("#toast");
let toastTimer = null;

function el(tag, opts = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(opts)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v; // only for trusted, static markup
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "id") node.id = v;
    else node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child);
  }
  return node;
}

function toast(msg, error = false) {
  toastEl.textContent = msg;
  toastEl.classList.toggle("error", error);
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 4000);
}

function fmtMoney(cents) {
  const n = Math.round((Number(cents) || 0) / 100);
  return "Rs " + n.toLocaleString("en-US");
}

function fmtDate(d) {
  if (!d) return "—";
  try {
    const date = typeof d.toDate === "function" ? d.toDate() : new Date(d);
    if (isNaN(date)) return "—";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return "—"; }
}

function imgFor(key) {
  const t = (key || "").trim();
  if (/^https:\/\//i.test(t) || /^http:\/\//i.test(t)) return t;
  return PRESETS[t.toLowerCase()] || PRESETS.electronics;
}

function imagesFor(p) {
  const list = Array.isArray(p && p.images)
    ? p.images.filter((s) => typeof s === "string" && /^https?:\/\//i.test(s))
    : [];
  if (list.length) return list;
  return [imgFor((p && p.imageKey) || "")];
}

function path(d, extra = {}) {
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  for (const [k, v] of Object.entries(extra)) p.setAttribute(k, v);
  p.setAttribute("stroke", extra.stroke ?? "currentColor");
  p.setAttribute("stroke-width", extra["stroke-width"] ?? "2");
  p.setAttribute("fill", extra.fill ?? "none");
  p.setAttribute("stroke-linecap", "round");
  p.setAttribute("stroke-linejoin", "round");
  return p;
}

function iconUpload() {
  return el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" }, path("M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"));
}

/* ---------- Auth ---------- */
async function handleSignIn() {
  if (signInBusy) return;
  signInBusy = true;
  authError = null;
  render();
  try {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    authUser = cred.user;
  } catch (e) {
    console.error(e);
    if (e?.code && e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      authError = "Sign-in failed. Is Firebase Auth enabled and authorized for this domain in the Firebase Console?";
    }
  } finally {
    signInBusy = false;
    // onAuthStateChanged will also fire and re-render
  }
}

async function handleSignOut() {
  try { await signOut(auth); } catch (e) { console.error(e); }
}

async function checkAdmin(user) {
  if (!user) return "signed-out";
  const isBootstrap = user.emailVerified && user.email === BOOTSTRAP_ADMIN_EMAIL;
  if (isBootstrap) return "admin";
  try {
    const d = await getDoc(doc(db, "admins", user.uid));
    if (d.exists()) return "admin";
  } catch (e) { console.error(e); }
  return "not-admin";
}

onAuthStateChanged(auth, async (user) => {
  authUser = user;
  adminStatus = "loading";
  adminError = null;
  render();
  if (user) {
    adminStatus = await checkAdmin(user);
    if (adminStatus === "admin") startListeners();
    else clearListeners();
  } else {
    adminStatus = "signed-out";
    clearListeners();
  }
  render();
});

/* ---------- Firestore listeners (read-only) ---------- */
function clearListeners() {
  unsubscribers.forEach((u) => { try { u(); } catch {} });
  unsubscribers = [];
}

function startListeners() {
  clearListeners();
  products = []; orders = [];
  productsReady = ordersReady = false;
  productsError = ordersError = null;

  unsubscribers.push(onSnapshot(collection(db, "products"), (snap) => {
    products = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p && typeof p.title === "string")
      .sort((a, b) => (b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0));
    productsReady = true;
    productsError = null;
    render();
  }, (err) => {
    console.error(err);
    productsError = "Could not load products (Firestore permission denied?).";
    productsReady = true;
    render();
  }));

  unsubscribers.push(onSnapshot(collection(db, "orders"), (snap) => {
    orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((o) => o && typeof o.status === "string")
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    ordersReady = true;
    ordersError = null;
    render();
  }, (err) => {
    console.error(err);
    ordersError = "Could not load orders (Firestore permission denied?).";
    ordersReady = true;
    render();
  }));
}

/* ---------- Rendering ---------- */
function render() {
  const nav = $("#nav-tabs");
  nav.innerHTML = "";
  if (adminStatus !== "admin") {
    nav.style.display = "none";
    appMain.innerHTML = "";
    appMain.append(gateView());
    return;
  }
  nav.style.display = "flex";
  renderNav();
  appMain.innerHTML = "";
  appMain.append(dashboardView());
}

function renderNav() {
  const nav = $("#nav-tabs");
  const tabs = [
    { id: "products", label: "Products" },
    { id: "orders", label: "Orders", count: orders.length },
  ];
  for (const t of tabs) {
    nav.append(el("button", {
      class: "nav-tab" + (tab === t.id ? " active" : ""),
      type: "button",
      onclick: () => { tab = t.id; if (tab === "orders") viewMode = "list"; render(); },
    }, t.label + (t.count ? ` (${t.count})` : "")));
  }
}

/* ---------- Gate / sign-in ---------- */
function gateView() {
  if (adminStatus === "loading") {
    return el("div", { class: "gate-wrap" }, el("div", { class: "gate-card" }, el("div", { class: "content" }, el("h1", { text: "Loading…" }), el("p", { class: "sub", text: "Checking admin access." }))));
  }
  if (adminStatus === "signed-out" || adminStatus === "not-admin") {
    const notAdmin = adminStatus === "not-admin";
    const err = authError || (notAdmin ? "This account does not have admin access. Ask the bootstrap admin to add your email to the admins collection." : "");
    return el("div", { class: "gate-wrap" },
      el("div", { class: "gate-card" },
        el("div", { class: "hero-top" },
          el("img", { src: "assets/img_hero_banner.jpg", alt: "" }),
          el("div", { class: "scrim" }),
          el("span", { class: "pill", text: "Admin access" })
        ),
        el("div", { class: "content" },
          el("h1", { text: notAdmin ? "Not authorized" : "Sign in to manage Bazaar" }),
          el("p", { class: "sub", text: notAdmin ? err : "Sign in with Google to view products and manage the catalog. You'll need an admin account." }),
          notAdmin
            ? el("button", { class: "primary-btn", type: "button", onclick: handleSignOut }, "Sign out")
            : el("button", { class: "google-btn", type: "button", onclick: handleSignIn, disabled: signInBusy },
                el("svg", { viewBox: "0 0 24 24", width: "20", height: "20" },
                  el("path", { fill: "#4285F4", d: "M23.15 12.35c0-.78-.07-1.53-.19-2.26H12v4.28h6.34c-.27 1.45-1.13 2.68-2.4 3.5v2.92h3.87c2.27-2.09 3.59-5.17 3.59-8.44z" }),
                  el("path", { fill: "#34A853", d: "M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.87-2.92c-1.07.72-2.44 1.15-4.06 1.15-3.11 0-5.76-2.1-6.7-4.93H1.54v3.02C3.53 21.3 7.48 24 12 24z" }),
                  el("path", { fill: "#FBBC05", d: "M5.3 14.51A7.27 7.27 0 014.9 12c0-.81.14-1.59.4-2.31V6.47H1.54A11.95 11.95 0 000 12c0 1.92.46 3.73 1.54 5.33l3.76-2.82z" }),
                  el("path", { fill: "#EA4335", d: "M12 4.7c1.77 0 3.36.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.48 0 3.53 2.7 1.54 6.47l3.76 2.82C6.24 6.8 8.89 4.7 12 4.7z" })),
                signInBusy ? "Signing in…" : "Continue with Google"
              ),
          err && !notAdmin ? el("p", { class: "gate-err show", text: err }) : null,
          notAdmin && authUser ? el("p", { class: "sub", style: "font-size:.8rem;color:var(--muted);margin-top:14px", text: `Signed in as ${authUser.email || "this account"}` }) : null
        )
      )
    );
  }
  return el("div", { class: "gate-wrap" }, el("div", { class: "gate-card" }, el("div", { class: "content" }, el("h1", { text: "Loading…" }))));
}

/* ---------- Dashboard ---------- */
function kpiStrip(productsCount, pendingCount, revenueCents, stockTotal) {
  const kpi = (label, value, sub) => el("div", { class: "kpi" }, el("div", { class: "label", text: label }), el("div", { class: "value" }, value, sub ? el("small", { text: " " + sub }) : null));
  return el("div", { class: "kpis" },
    kpi("Products", String(productsCount), `${stockTotal} in stock`),
    kpi("Pending orders", String(pendingCount)),
    kpi("Revenue", fmtMoney(revenueCents), "ex-cancelled")
  );
}

function signedInChip() {
  if (!authUser) return null;
  const email = authUser.email || "account";
  return el("div", { class: "signed-in-chip" },
    el("span", { class: "signed-in-email", text: email }),
    el("button", { class: "secondary-btn", type: "button", onclick: handleSignOut, text: "Sign out" })
  );
}

function dashboardView() {
  const nonCancelled = orders.filter((o) => o.status !== "CANCELLED");
  const revenueCents = nonCancelled.reduce((s, o) => s + (o.totalCents || 0), 0);
  const pendingCount = orders.filter((o) => o.status === "PENDING").length;
  const stockTotal = products.reduce((s, p) => s + (p.stockCount || 0), 0);

  const head = el("div", { class: "dash-head" },
    el("div", {},
      el("h1", { text: "Admin panel" }),
      el("p", { text: "Manage the catalog — changes appear on the storefront automatically." })
    ),
    signedInChip()
  );

  const tabRow = el("div", { class: "tab-row" });
  for (const t of ["products", "orders"]) {
    tabRow.append(el("button", {
      class: "tab-btn" + (tab === t ? " active" : ""),
      type: "button",
      onclick: () => { tab = t; if (t === "orders") viewMode = "list"; render(); },
      text: t.charAt(0).toUpperCase() + t.slice(1) + (t === "orders" ? ` (${orders.length})` : ""),
    }));
  }

  const content = el("div", {});
  if (tab === "products") content.append(productsTab());
  else content.append(ordersTab(revenueCents, pendingCount, products.length, stockTotal));

  return el("div", {}, head, kpiStrip(products.length, pendingCount, revenueCents, stockTotal), tabRow, content);
}

/* ---------- Products tab ---------- */
function productsTab() {
  const wrap = el("div", {});
  const stockTotal = products.reduce((s, p) => s + (p.stockCount || 0), 0);

  if (viewMode === "form") {
    wrap.append(productForm());
    return wrap;
  }

  wrap.append(el("div", { class: "section-title" },
    el("h2", { text: "Catalog" }),
    el("span", { class: "hint", style: "color:var(--muted);font-size:.8rem", text: `${products.length} product${products.length === 1 ? "" : "s"} · ${stockTotal} in stock` })
  ));

  const addBtn = el("button", { class: "primary-btn", type: "button", onclick: () => openForm(null) }, iconUpload(), "Add product");
  wrap.append(el("div", { class: "add-row" }, addBtn));

  if (productsError) {
    wrap.append(el("div", { class: "empty" }, el("h3", { text: "Catalog unavailable" }), el("p", { text: productsError })));
    return wrap;
  }
  if (!productsReady) {
    for (let i = 0; i < 4; i++) wrap.append(el("div", { class: "skel skel-row" }));
    return wrap;
  }
  if (products.length === 0) {
    wrap.append(el("div", { class: "empty" },
      el("h3", { text: "No products yet" }),
      el("p", { text: "Products added here appear on the live storefront automatically. Use “Add product” to create the first one." })
    ));
    return wrap;
  }

  for (const p of products) {
    wrap.append(productRow(p));
  }
  return wrap;
}

function productRow(p) {
  const row = el("div", { class: "product-row" });
  const imgs = imagesFor(p);
  row.append(el("img", { src: imgs[0], alt: p.title, loading: "lazy" }));
  const meta = el("div", { class: "m" });
  meta.append(
    el("span", { text: (p.category || "").toUpperCase() }),
    el("b", { text: fmtMoney(p.priceCents || 0) }),
    el("span", { text: `${p.stockCount || 0} in stock` }),
    el("span", { text: p.featured ? "Featured" : "" }),
    el("span", { text: p.active ? "In stock" : "Hidden" })
  );
  row.append(el("div", { class: "info" }, el("div", { class: "t", text: p.title }), meta));
  const actions = el("div", { class: "actions" },
    el("button", { class: "edit-btn", type: "button", onclick: () => openForm(p.id) }, "Edit"),
    el("button", { class: "edit-btn danger", type: "button", onclick: () => handleDelete(p) }, "Delete")
  );
  row.append(actions);
  return row;
}

/* ---------- Product form ---------- */
function openForm(id) {
  editingId = id;
  viewMode = "form";
  removedIndexes = [];
  if (id) {
    const p = products.find((x) => x.id === id);
    const kept = Array.isArray(p && p.images) ? p.images : [];
    formImages = kept.map((url, i) => ({ which: "kept", url, oldIndex: i }));
  } else {
    formImages = [];
  }
  render();
}

function closeForm() {
  formDraft = null;
  viewMode = "list";
  editingId = null;
  for (const img of formImages) {
    if (img.which === "new" && img.tempUrl) URL.revokeObjectURL(img.tempUrl);
  }
  formImages = [];
  removedIndexes = [];
  saving = false;
  render();
}

function productForm() {
  const p = editingId ? products.find((x) => x.id === editingId) : null;
  const isEdit = !!p;
  const sheet = el("div", { class: "sheet" });
  sheet.append(el("h3", { text: isEdit ? "Edit product" : "Add product" }));

  // basic fields
  const d = formDraft;
  const nameField = el("div", { class: "field" },
    el("label", { text: "Name", for: "f-name" }),
    el("input", { id: "f-name", type: "text", value: d ? d.name : (isEdit ? p.title : ""), placeholder: "e.g. Obsidian ANC Headphones", maxlength: "120", required: "" })
  );
  const priceField = el("div", { class: "field" },
    el("label", { text: "Price (PKR)", for: "f-price" }),
    el("input", { id: "f-price", type: "number", min: "1", step: "1", value: d ? d.pricePKR : (isEdit ? Math.round((p.priceCents || 0) / 100) : ""), placeholder: "1500", required: "" })
  );
  const stockField = el("div", { class: "field" },
    el("label", { class: "toggle-label", style: "display:inline-flex;align-items:center;gap:10px;cursor:pointer;font-size:0.92rem;font-weight:700;color:var(--ink);text-transform:none;letter-spacing:0" },
      el("input", { type: "checkbox", id: "f-active", checked: d ? d.active : (isEdit ? p.active !== false : true) }),
      "In stock (visible on storefront)"
    )
  );

  const descField = el("div", { class: "field full" },
    el("label", { text: "Description", for: "f-desc" }),
    el("textarea", { id: "f-desc", rows: "3", maxlength: "1000", placeholder: "Describe the product…" })
  );
  descField.querySelector("textarea").value = d ? d.desc : (isEdit ? (p.description || "") : "");

  const grid = el("div", { class: "form-grid" }, nameField, priceField, stockField, descField);
  sheet.append(grid);

  // images
  sheet.append(el("div", { class: "field full" },
    el("label", { text: `Images (${formImages.length}/3) — 2 or 3 required`, for: "f-images" }),
    el("div", { class: "image-grid", id: "form-images" })
  ));
  const hint = el("p", { class: "hint", text: "Images are compressed in the browser and uploaded to Firebase Storage — the storefront reads them automatically." });
  sheet.append(hint);

  // add image button
  const addBtn = el("button", { class: "secondary-btn", type: "button", id: "f-add-images", onclick: () => $("#f-image-input")?.click() }, iconUpload(), "Add images");
  const hidden = el("input", { id: "f-image-input", type: "file", accept: "image/*", multiple: "", style: "display:none", onchange: onImagesPicked });
  sheet.append(el("div", { class: "image-actions" }, addBtn, hidden));

  // actions
  const actions = el("div", { class: "form-actions" },
    el("button", { class: "primary-btn", type: "button", id: "f-save", onclick: submitProductForm, disabled: saving }, saving ? "Saving…" : (isEdit ? "Save changes" : "Add product")),
    el("button", { class: "secondary-btn", type: "button", onclick: closeForm }, "Cancel")
  );
  sheet.append(actions);

  renderImagesGrid();
  return sheet;
}

function renderImagesGrid() {
  const grid = $("#form-images");
  if (!grid) return;
  grid.innerHTML = "";
  formImages.forEach((img, i) => {
    const slot = el("div", { class: "image-slot" });
    const thumb = el("img", { src: img.which === "kept" ? img.url : img.tempUrl, alt: `Image ${i + 1}` });
    const removeBtn = el("button", {
      class: "image-remove",
      type: "button",
      "aria-label": `Remove image ${i + 1}`,
      title: "Remove image",
      onclick: () => removeImageAt(i),
    }, "×");
    slot.append(thumb, removeBtn);
    grid.append(slot);
  });
  const addBtn = $("#f-add-images");
  if (addBtn) addBtn.disabled = formImages.length >= 3;
}

function onImagesPicked(e) {
  const files = [...(e.target.files || [])];
  const room = 3 - formImages.length;
  for (const f of files.slice(0, Math.max(0, room))) {
    formImages.push({ which: "new", file: f, oldIndex: null, tempUrl: URL.createObjectURL(f) });
  }
  e.target.value = "";
  renderImagesGrid();
}

function removeImageAt(index) {
  const img = formImages[index];
  if (img && img.which === "kept") removedIndexes.push(img.oldIndex);
  if (img && img.which === "new" && img.tempUrl) URL.revokeObjectURL(img.tempUrl);
  formImages.splice(index, 1);
  renderImagesGrid();
}

async function compressImage(file, maxDim = 1200, quality = 0.78) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bmp, 0, 0, w, h);
  return await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image compression failed"))), "image/jpeg", quality)
  );
}

async function uploadProductImage(productId, index, blob) {
  const path = `products/${productId}/image-${index}.jpg`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  return await getDownloadURL(storageRef);
}

async function submitProductForm() {
  if (saving) return;
  // gather + validate
  const name = ($("#f-name")?.value || "").trim();
  const pricePKR = Number($("#f-price")?.value || 0);
  const desc = ($("#f-desc")?.value || "").trim();
  const active = $("#f-active")?.checked !== false;
  const isEdit = !!editingId;

  if (name.length < 2 || name.length > 120) { toast("Please enter a name (2–120 chars).", true); return; }
  if (!Number.isFinite(pricePKR) || pricePKR <= 0 || pricePKR > 10_000_000) { toast("Please enter a valid price in PKR (greater than 0).", true); return; }
  if (desc.length < 2 || desc.length > 1000) { toast("Please enter a description (2–1000 chars).", true); return; }
  if (formImages.length < 2) { toast("Add at least 2 images (max 3).", true); return; }
  if (formImages.length > 3) { toast("Too many images — pick at most 3.", true); return; }

  const priceCents = Math.round(pricePKR * 100);
  if (priceCents < 1 || priceCents > 100_000_000) { toast("Price is out of the valid range.", true); return; }

  formDraft = { name, pricePKR, desc, active };
  saving = true;
  const saveBtn = $("#f-save");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

  try {
    const productId = editingId || doc(collection(db, "products")).id;

    // upload only the new images; kept images keep their existing URLs
    const kept = formImages.filter((i) => i.which === "kept");
    const occupied = new Set(kept.map((i) => i.oldIndex));
    const uploadedNew = new Set();   // slot indices newly uploaded (not to be deleted later)
    let newIndex = 0;
    const imageUrls = [];
    for (const img of formImages) {
      if (img.which === "kept") {
        imageUrls.push(img.url);
        continue;
      }
      while (occupied.has(newIndex)) newIndex++;
      const blob = await compressImage(img.file);
      const url = await uploadProductImage(productId, newIndex, blob);
      occupied.add(newIndex);
      uploadedNew.add(newIndex);
      imageUrls.push(url);
      newIndex++;
    }

    if (editingId) {
      const existing = products.find((x) => x.id === editingId);
      await updateDoc(doc(db, "products", editingId), {
        title: name,
        description: desc,
        priceCents,
        active,
        images: imageUrls,
        updatedAt: serverTimestamp(),
      });
      toast(`“${existing?.title || name}” updated.`);
      // best-effort delete of removed old images (skip any path taken by a fresh upload)
      for (const i of removedIndexes) {
        if (uploadedNew.has(i)) continue;
        try { await deleteObject(ref(storage, `products/${productId}/image-${i}.jpg`)); } catch {}
      }
    } else {
      await setDoc(doc(db, "products", productId), {
        title: name,
        description: desc,
        category: "Electronics",
        priceCents,
        stockCount: 10,
        active,
        featured: false,
        images: imageUrls,
        createdBy: authUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast(`“${name}” added — it appears on the storefront now.`);
    }

    closeForm();
  } catch (e) {
    console.error(e);
    saving = false;
    const msg = e?.code === "storage/unauthorized" || e?.code === "storage/object-not-found"
      ? "Image upload failed — has Storage been published in the Firebase Console?"
      : (e?.code || "").toLowerCase().includes("permission")
        ? "Save failed — Firestore rules may not be deployed yet."
        : "Save failed. Please try again.";
    toast(msg, true);
    saving = false;
    const b = $("#f-save");
    if (b) { b.disabled = false; b.textContent = editingId ? "Save changes" : "Add product"; }
  }
}

async function handleDelete(p) {
  if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
  const images = Array.isArray(p.images) ? p.images : [];
  try {
    await deleteDoc(doc(db, "products", p.id));
    toast(`“${p.title}” deleted.`);
    closeForm();
    for (let i = 0; i < images.length; i++) {
      try { await deleteObject(ref(storage, `products/${p.id}/image-${i}.jpg`)); } catch {}
    }
  } catch (e) {
    console.error(e);
    toast("Delete failed — Firestore rules may not be deployed yet.", true);
  }
  render();
}

/* ---------- Orders tab ---------- */
function ordersTab(revenueCents, pendingCount, productsCount, stockTotal) {
  const wrap = el("div", {});
  wrap.append(el("div", { class: "section-title" },
    el("h2", { text: "Orders" }),
    el("span", { class: "hint", style: "color:var(--muted);font-size:.8rem", text: `${orders.length} total · ${fmtMoney(revenueCents)} revenue · ${stockTotal} units in stock` })
  ));

  if (ordersError) {
    wrap.append(el("div", { class: "empty" }, el("h3", { text: "Orders unavailable" }), el("p", { text: ordersError })));
    return wrap;
  }
  if (!ordersReady) {
    for (let i = 0; i < 3; i++) wrap.append(el("div", { class: "skel skel-row" }));
    return wrap;
  }
  if (orders.length === 0) {
    wrap.append(el("div", { class: "empty" }, el("h3", { text: "No orders yet" }), el("p", { text: "Orders placed on the storefront appear here in real time." })));
    return wrap;
  }

  for (const o of orders) {
    const items = Array.isArray(o.items) ? o.items : [];
    const itemText = items.map((i) => `${i.title} ×${i.quantity}`).join(" · ") || "—";
    const card = el("div", { class: "order-card2" });
    card.append(el("div", { class: "top" },
      el("span", { class: "oid", text: `#${o.id.slice(0, 6).toUpperCase()}` }),
      el("span", { class: "date", text: fmtDate(o.createdAt) }),
      el("span", { class: "amt", text: fmtMoney(o.totalCents || 0) })
    ));
    card.append(el("div", { class: "meta", text: `${o.customerName || "—"} · ${o.customerEmail || "—"} · ${o.paymentMethod || "—"}` }));
    card.append(el("div", { class: "meta", style: "font-size:.8rem", text: itemText }));

    const pill = el("div", { style: "margin-top:8px; font-size:.8rem; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:.08em", text: (o.status || "PENDING") });
    card.append(pill);
    wrap.append(card);
  }
  return wrap;
}

/* ---------- Boot ---------- */
render();
