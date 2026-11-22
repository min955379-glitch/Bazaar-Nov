/* ===== Bazaar admin portal — vanilla JS + Firebase ===== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- Config (client-side public config; security is enforced by Firestore rules) ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyBwHTSlynCnwVaOuz4NBybOpC9Wzo8Pkp4",
  authDomain: "gen-lang-client-0568023966.firebaseapp.com",
  projectId: "gen-lang-client-0568023966",
  storageBucket: "gen-lang-client-0568023966.firebasestorage.app",
};
const DATABASE_ID = "ai-studio-android-bazaar-ff6147c8-9c50-47a7-a4c0-4235cdb6b40e";
const BOOTSTRAPPED_ADMIN_EMAIL = "abdulmanan304000@gmail.com";
const VERIFIER_KEY = "bazaar_admin_verifier_v1";
const PBKDF2_ITERS = 100000;
const DOC_CATEGORIES = ["Electronics", "Fashion", "Home", "Accessories"];
const DOC_STATUSES = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];
const PRESETS = {
  electronics: "assets/img_prod_electronics.jpg",
  fashion: "assets/img_prod_fashion.jpg",
  accessories: "assets/img_prod_fashion.jpg",
  home: "assets/img_prod_home.jpg",
};
const STARTER_CATALOG = [
  { id: "starter_anc_headphones", title: "Obsidian ANC Studio Headphones", description: "Active noise-canceling wireless over-ear headphones with 40-hour battery, plush memory foam earcups, and lossless USB-C audio.", category: "Electronics", priceCents: 18900, stockCount: 18, imageKey: "electronics", active: true, featured: true },
  { id: "starter_cognac_tote", title: "Artisan Cognac Leather Tote", description: "Hand-stitched full-grain vegetable-tanned leather tote with brass hardware and a padded 14-inch laptop sleeve.", category: "Fashion", priceCents: 14500, stockCount: 12, imageKey: "fashion", active: true, featured: true },
  { id: "starter_sage_carafe", title: "Matte Sage Ceramic Pour-Over Set", description: "Stoneware coffee dripper and insulated serving carafe with natural oak collar for clean, aromatic morning brews.", category: "Home", priceCents: 6400, stockCount: 24, imageKey: "home", active: true, featured: true },
  { id: "starter_titanium_watch", title: "Minimalist Titanium Smartwatch", description: "Sapphire crystal AMOLED display, 10-day endurance battery, heart-rate & sleep telemetry, and 5ATM water resistance.", category: "Electronics", priceCents: 22900, stockCount: 9, imageKey: "electronics", active: true, featured: false },
  { id: "starter_tortoise_shades", title: "Heritage Tortoise Sunglasses", description: "Polarized UV400 green-tint mineral lenses set in hand-finished Italian acetate and brushed gold temples.", category: "Accessories", priceCents: 8800, stockCount: 15, imageKey: "fashion", active: true, featured: false },
  { id: "starter_brass_lamp", title: "Arc Brushed Brass Desk Lamp", description: "Sculptural curved reading lamp in warm satin brass with stepless touch dimming and flicker-free warm LED.", category: "Home", priceCents: 11900, stockCount: 7, imageKey: "home", active: true, featured: false },
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, DATABASE_ID);
const googleProvider = new GoogleAuthProvider();

/* ---------- State ---------- */
let currentUser = null;
let isLiveAdmin = false;
let unlocked = false;          // local passcode gate state
let products = [];
let orders = [];
let productsReady = false, ordersReady = false;
let productsError = null, ordersError = null;
let tab = "products";          // products | orders | security
let editingId = null;          // product id being edited, or "new"
let syncPromise = null;
let unsubscribers = [];

/* ---------- DOM helpers ---------- */
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
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3600);
}

function fmtMoney(cents) {
  return "$" + (cents / 100).toFixed(2);
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

function initialsOf(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "A").toUpperCase();
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

/* ---------- Passcode gate (local verification; real boundaries live in Firestore rules) ---------- */
function b64encode(bytes) { return btoa(String.fromCharCode(...bytes)); }
function b64decode(s) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }

async function pbkdf2Hex(passcode, saltBytes) {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: PBKDF2_ITERS }, keyMaterial, 256);
  return new Uint8Array(bits);
}

function verifierExists() {
  try {
    const raw = localStorage.getItem(VERIFIER_KEY);
    if (!raw) return false;
    const v = JSON.parse(raw);
    return !!(v && v.salt && v.hash);
  } catch { return false; }
}

async function storeVerifier(passcode) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2Hex(passcode, salt);
  localStorage.setItem(VERIFIER_KEY, JSON.stringify({ salt: b64encode(salt), hash: b64encode(hash) }));
}

async function verifyVerifier(passcode) {
  try {
    const raw = localStorage.getItem(VERIFIER_KEY);
    if (!raw) return false;
    const v = JSON.parse(raw);
    const salt = b64decode(v.salt);
    const expected = b64decode(v.hash);
    const actual = await pbkdf2Hex(passcode, salt);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch { return false; }
}

function lockPanel() {
  unlocked = false;
  render();
}

/* ---------- Auth + admin check ---------- */
async function checkLiveAdmin() {
  try {
    const user = auth.currentUser;
    if (!user) { isLiveAdmin = false; return; }
    const bootstrap = user.emailVerified && (user.email || "").toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
    if (bootstrap) { isLiveAdmin = true; return; }
    const snap = await getDoc(doc(db, "admins", user.uid));
    isLiveAdmin = snap.exists();
  } catch {
    isLiveAdmin = false;
  }
}

function syncProfile(user) {
  if (syncPromise) return syncPromise;
  const ref = doc(db, "users", user.uid);
  const safeName = (user.displayName || "").trim().slice(0, 100) || "Bazaar Shopper";
  const safeEmail = (user.email || "").trim().slice(0, 160) || "shopper@bazaar.app";
  const safePhoto = user.photoURL ? String(user.photoURL).slice(0, 500) : null;
  syncPromise = (async () => {
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          userId: user.uid, displayName: safeName, email: safeEmail,
          ...(safePhoto ? { photoUrl: safePhoto } : {}),
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(ref, {
          displayName: safeName, email: safeEmail,
          ...(safePhoto ? { photoUrl: safePhoto } : {}),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.warn("Profile sync failed", e);
    }
  })();
  return syncPromise;
}

function clearListeners() {
  unsubscribers.forEach((u) => { try { u(); } catch {} });
  unsubscribers = [];
}

function startListeners(user) {
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

/* ---------- Actions ---------- */
async function handleSignIn() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    if (e && (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request")) return;
    const msg = e && e.code === "auth/unauthorized-domain"
      ? `Google sign-in is not enabled for this domain (${location.hostname}). Add it to Firebase Authentication → Settings → Authorized domains, then try again.`
      : (e && e.message) || "Google sign-in failed.";
    toast(msg, true);
    const gateErr = $("#gate-error");
    if (gateErr) { gateErr.textContent = msg; gateErr.classList.add("show"); }
  }
}

async function handleSignOut() {
  try { await signOut(auth); } catch (e) { console.warn("Sign out failed", e); }
}

async function saveProduct(payload) {
  if (!currentUser || !isLiveAdmin) return;
  const uid = currentUser.uid;
  const isCreate = !payload.id;
  const title = (payload.title || "").trim();
  const description = (payload.description || "").trim();
  const category = payload.category || "Electronics";
  const imageKey = (payload.imageKey || "").trim();
  const priceCents = Math.round((parseFloat(payload.price) || 0) * 100);
  const stockCount = Math.round(parseInt(payload.stock, 10) || 0);

  if (title.length < 2 || title.length > 120) { toast("Title must be 2–120 characters.", true); return; }
  if (description.length < 2 || description.length > 1000) { toast("Description must be 2–1000 characters.", true); return; }
  if (priceCents < 1 || priceCents > 100_000_000) { toast("Price must be greater than $0.00.", true); return; }
  if (stockCount < 0 || stockCount > 100_000) { toast("Stock must be 0–100,000.", true); return; }
  if (!imageKey) { toast("Choose an image preset or URL.", true); return; }

  const base = {
    title, description, category, priceCents, stockCount, imageKey,
    active: !!payload.active, featured: !!payload.featured,
    updatedAt: serverTimestamp(),
  };

  try {
    if (isCreate) {
      const ref = doc(collection(db, "products"));
      await setDoc(ref, { ...base, createdBy: uid, createdAt: serverTimestamp() });
      toast("Product published live to Firestore.");
    } else {
      await updateDoc(doc(db, "products", payload.id), base);
      toast("Product updated live.");
    }
    editingId = null;
    render();
  } catch (e) {
    toast(e.message || "Could not save the product.", true);
  }
}

async function deleteProduct(id) {
  if (!isLiveAdmin) return;
  const product = products.find((p) => p.id === id);
  if (!window.confirm(`Delete "${product?.title || "this product"}"? This cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, "products", id));
    toast("Product removed from the catalog.");
  } catch (e) {
    toast(e.message || "Could not delete the product.", true);
  }
}

async function seedStarterCatalog() {
  if (!isLiveAdmin || !currentUser) return;
  const uid = currentUser.uid;
  try {
    const batch = writeBatch(db);
    for (const item of STARTER_CATALOG) {
      batch.set(doc(db, "products", item.id), {
        title: item.title, description: item.description, category: item.category,
        priceCents: item.priceCents, stockCount: item.stockCount, imageKey: item.imageKey,
        active: item.active, featured: item.featured, createdBy: uid,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    toast(`${STARTER_CATALOG.length} starter products published live!`);
  } catch (e) {
    toast(e.message || "Could not load the starter catalog.", true);
  }
}

async function updateOrderStatus(orderId, status) {
  if (!isLiveAdmin) return;
  try {
    await updateDoc(doc(db, "orders", orderId), { status, updatedAt: serverTimestamp() });
    toast(`Order updated to ${status}.`);
  } catch (e) {
    toast(e.message || "Could not update order status.", true);
  }
}

async function handleChangePasscode(current, next, confirm) {
  if (next !== confirm) { toast("New passcode and confirmation do not match.", true); return; }
  if (next.length < 6) { toast("Passcode must be at least 6 characters.", true); return; }
  const ok = await verifyVerifier(current);
  if (!ok) { toast("Current admin passcode is incorrect.", true); return; }
  await storeVerifier(next);
  toast("Admin passcode updated.");
  render();
}

async function handleSetupPasscode(next, confirm) {
  if (next !== confirm) { toast("Passcodes do not match.", true); return; }
  if (next.length < 6) { toast("Passcode must be at least 6 characters.", true); return; }
  if (verifierExists()) { toast("An admin passcode is already set.", true); return; }
  await storeVerifier(next);
  unlocked = true;
  toast("Admin passcode created and verified.");
  render();
}

async function handleUnlock(candidate) {
  const ok = await verifyVerifier(candidate);
  if (ok) {
    unlocked = true;
    toast("Admin panel unlocked.");
  } else {
    toast("Invalid passcode. Please try again.", true);
  }
  render();
}

/* ---------- Rendering ---------- */
function render() {
  const nav = $("#nav-tabs");
  const chip = $("#user-chip");
  nav.innerHTML = "";
  chip.innerHTML = "";
  appMain.innerHTML = "";

  if (!currentUser) {
    nav.style.display = "none";
    chip.style.display = "none";
    appMain.append(gateSignInView());
    return;
  }

  nav.style.display = "flex";
  renderNav();
  renderUserChip();
  chip.style.display = "flex";

  if (!unlocked) {
    appMain.append(gatePasscodeView());
    return;
  }

  appMain.append(dashboardView());
}

function renderNav() {
  const nav = $("#nav-tabs");
  const tabs = [
    { id: "products", label: "Products" },
    { id: "orders", label: "Orders", count: orders.length },
    { id: "security", label: "Security" },
  ];
  for (const t of tabs) {
    nav.append(el("button", {
      class: "nav-tab" + (tab === t.id ? " active" : ""),
      type: "button",
      onclick: () => { tab = t.id; render(); },
    }, t.label + (t.count ? ` (${t.count})` : "")));
  }
  const lock = el("button", { class: "nav-tab", type: "button", title: "Lock admin panel", onclick: lockPanel }, "Lock");
  nav.append(lock);
}

function renderUserChip() {
  const chip = $("#user-chip");
  const avatar = el("div", { class: "avatar" });
  const photo = currentUser.photoURL;
  if (photo && /^https?:\/\//i.test(photo)) {
    avatar.append(el("img", { src: photo, alt: "", referrerpolicy: "no-referrer" }));
  } else {
    avatar.textContent = initialsOf(currentUser.displayName);
  }
  const who = el("div", { class: "who" },
    el("div", { class: "name", text: currentUser.displayName || "Admin" }),
    el("div", { class: "role", text: isLiveAdmin ? "Firebase Live Admin" : (currentUser.email || "") })
  );
  const signOutBtn = el("button", { class: "icon-btn", title: "Sign out", onclick: handleSignOut },
    el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" }, path("M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"))
  );
  chip.append(avatar, who, signOutBtn);
}

/* ---------- Views ---------- */
function gateSignInView() {
  const signInBtn = el("button", { id: "gate-sign-in", class: "google-btn", onclick: handleSignIn },
    el("svg", { viewBox: "0 0 24 24", width: "22", height: "22", "aria-hidden": "true" },
      el("circle", { cx: "12", cy: "12", r: "11", fill: "#ffffff" }),
      el("text", { x: "12", y: "16.4", "text-anchor": "middle", "font-size": "11.5", "font-weight": "800", fill: "#1a1917", "font-family": "Arial, sans-serif" }, "G")
    ),
    el("span", { text: "Sign in with Google" })
  );
  return el("div", { class: "gate-wrap" },
    el("div", { class: "gate-card" },
      el("div", { class: "hero-top" },
        el("img", { src: "assets/img_hero_banner.jpg", alt: "Bazaar admin preview" }),
        el("div", { class: "scrim" }),
        el("span", { class: "pill", text: "Admin Portal" })
      ),
      el("div", { class: "content" },
        el("h1", { text: "Bazaar Admin" }),
        el("p", { class: "sub", text: "Manage the live Bazaar catalog, orders and inventory — signed in with Google." }),
        signInBtn,
        el("p", { id: "gate-error", class: "gate-err", text: "" })
      )
    )
  );
}

function gatePasscodeView() {
  const hasVerifier = verifierExists();
  if (!hasVerifier) {
    const confirmField = el("input", { id: "setup-confirm", type: "password", placeholder: "Confirm passcode", autocomplete: "new-password" });
    const passField = el("input", { id: "setup-pass", type: "password", placeholder: "Choose a passcode (min 6 characters)", autocomplete: "new-password" });
    const btn = el("button", { class: "primary-btn wide", type: "button", onclick: async () => {
      const next = $("#setup-pass").value.trim();
      const confirm = $("#setup-confirm").value.trim();
      await handleSetupPasscode(next, confirm);
    } }, "Create Admin Passcode");
    return el("div", { class: "gate-wrap" },
      el("div", { class: "gate-card" },
        el("div", { class: "hero-top" },
          el("img", { src: "assets/img_hero_banner.jpg", alt: "" }),
          el("div", { class: "scrim" }),
          el("span", { class: "pill", text: "First run" })
        ),
        el("div", { class: "content" },
          el("h1", { text: "Set up your admin passcode" }),
          el("p", { class: "sub", text: "No passcode exists on this device yet. The passcode is sealed as a PBKDF2 digest in your browser — it cannot be recovered. Firestore admin control is enforced by Firebase security rules, not by this passcode." }),
          el("div", { class: "setup-form" },
            el("div", { class: "field" }, el("label", { for: "setup-pass", text: "New passcode" }), passField),
            el("div", { class: "field" }, el("label", { for: "setup-confirm", text: "Confirm passcode" }), confirmField),
            el("p", { class: "hint", text: "Minimum 6 characters. No default is shipped — you create your own." }),
            btn
          )
        )
      )
    );
  }

  const passField = el("input", { id: "unlock-pass", type: "password", placeholder: "Admin passcode", autocomplete: "current-password" });
  const btn = el("button", { class: "primary-btn wide", type: "button", onclick: async () => {
    await handleUnlock($("#unlock-pass").value.trim());
  } }, "Unlock Admin Panel");
  return el("div", { class: "gate-wrap" },
    el("div", { class: "gate-card" },
      el("div", { class: "hero-top" },
        el("img", { src: "assets/img_hero_banner.jpg", alt: "" }),
        el("div", { class: "scrim" }),
        el("span", { class: "pill", text: "Encrypted gate" })
      ),
      el("div", { class: "content" },
        el("h1", { text: "Encrypted admin access" }),
        el("p", { class: "sub", text: "Enter your admin passcode to unlock the live catalog and order controls. The passcode is verified locally in your browser and never sent to a server." }),
        el("div", { class: "setup-form" },
          el("div", { class: "field" }, el("label", { for: "unlock-pass", text: "Admin passcode" }), passField),
          btn
        )
      )
    )
  );
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

function dashboardView() {
  const nonCancelled = orders.filter((o) => o.status !== "CANCELLED");
  const revenueCents = nonCancelled.reduce((s, o) => s + (o.totalCents || 0), 0);
  const pendingCount = orders.filter((o) => o.status === "PENDING").length;
  const stockTotal = products.reduce((s, p) => s + (p.stockCount || 0), 0);

  const head = el("div", { class: "dash-head" },
    el("div", {},
      el("h1", { text: "Admin panel" }),
      el("p", { text: isLiveAdmin
        ? `Live cloud control · ${currentUser.email || ""}`
        : `Read-only · ${currentUser.email || ""}` })
    ),
    el("button", { class: "secondary-btn", type: "button", onclick: lockPanel }, "Lock panel")
  );

  const banner = el("div", { class: "admin-banner " + (isLiveAdmin ? "on" : "off") },
    el("span", { text: isLiveAdmin
      ? "You are an authorized store admin. Writes are protected and live in Firestore."
      : "You are signed in but are not an authorized store admin. Firestore will reject all writes for your account." })
  );

  const tabRow = el("div", { class: "tab-row" });
  for (const t of ["products", "orders", "security"]) {
    tabRow.append(el("button", {
      class: "tab-btn" + (tab === t ? " active" : ""),
      type: "button",
      onclick: () => { tab = t; render(); },
      text: t.charAt(0).toUpperCase() + t.slice(1) + (t === "orders" ? ` (${orders.length})` : ""),
    }));
  }

  const content = el("div", {});
  if (tab === "products") content.append(productsTab(products.length, pendingCount, revenueCents, stockTotal));
  else if (tab === "orders") content.append(ordersTab(revenueCents, pendingCount, products.length, stockTotal));
  else content.append(securityTab());

  return el("div", {}, head, banner, kpiStrip(products.length, pendingCount, revenueCents, stockTotal), tabRow, content);
}

/* ---------- Products tab ---------- */
function productsTab(_productsCount, _pendingCount, _revenueCents, _stockTotal) {
  const wrap = el("div", {});

  wrap.append(el("div", { class: "section-title" },
    el("h2", { text: "Catalog" }),
    el("span", { class: "hint", style: "color:var(--muted);font-size:.8rem", text: `${products.length} product${products.length === 1 ? "" : "s"}` })
  ));

  const actionsRow = el("div", { class: "form-actions", style: "margin-bottom:14px" });
  if (isLiveAdmin) {
    actionsRow.append(
      el("button", { class: "primary-btn", type: "button", onclick: () => { editingId = "new"; render(); } }, "+ Add product"),
      el("button", { class: "secondary-btn", type: "button", onclick: seedStarterCatalog }, `Publish ${STARTER_CATALOG.length} starter products`)
    );
  }
  wrap.append(actionsRow);

  if (editingId) {
    wrap.append(productForm());
  }

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
      el("p", { text: isLiveAdmin ? "Publish the 6 starter products or add your own." : "The store administrator has not published any products yet." })
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
  row.append(el("img", { src: imgFor(p.imageKey), alt: p.title, loading: "lazy" }));
  const meta = el("div", { class: "m" });
  meta.append(
    el("span", { text: (p.category || "").toUpperCase() }),
    el("b", { text: fmtMoney(p.priceCents || 0) }),
    el("span", { text: `${p.stockCount || 0} in stock` }),
    el("span", { text: p.featured ? "Featured" : "" }),
    el("span", { text: p.active ? "Active" : "Hidden" })
  );
  row.append(el("div", { class: "info" }, el("div", { class: "t", text: p.title }), meta));

  const actions = el("div", { class: "actions" });
  if (isLiveAdmin) {
    actions.append(el("button", { class: "toggle-btn" + (p.active ? " on" : ""), type: "button", title: "Toggle visibility", onclick: async () => {
      await updateDoc(doc(db, "products", p.id), { active: !p.active, updatedAt: serverTimestamp() })
        .then(() => toast(`${p.title} ${p.active ? "hidden" : "published"}.`))
        .catch((e) => toast(e.message || "Could not update product.", true));
    } }, p.active ? "Live" : "Hidden"));
    actions.append(el("button", { class: "edit-btn", type: "button", onclick: () => { editingId = p.id; render(); } }, "Edit"));
    actions.append(el("button", { class: "icon-mini danger", type: "button", title: "Delete product", onclick: () => deleteProduct(p.id) },
      el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" }, path("M3 6h18M8 6V4h8v2m-9 0l1 14a2 2 0 002 2h8a2 2 0 002-2l1-14"))
    ));
  }
  row.append(actions);
  return row;
}

function productForm() {
  const editing = editingId !== "new" ? products.find((p) => p.id === editingId) : null;
  const form = el("div", { class: "sheet" });
  form.append(el("h3", { text: editing ? "Edit product" : "Add new product" }));

  const title = el("input", { id: "f-title", type: "text", placeholder: "Product title", maxlength: "120" });
  const desc = el("textarea", { id: "f-desc", placeholder: "Short product description", rows: "3", maxlength: "1000" });
  const categorySel = el("select", { id: "f-category" }, ...DOC_CATEGORIES.map((c) => el("option", { value: c, text: c })));
  const price = el("input", { id: "f-price", type: "number", min: "0", step: "0.01", placeholder: "Price (USD)" });
  const stock = el("input", { id: "f-stock", type: "number", min: "0", max: "100000", step: "1", placeholder: "Stock" });
  const imageSelect = el("select", { id: "f-image" });
  for (const [key, label] of [["electronics", "Electronics image"], ["fashion", "Fashion image"], ["home", "Home image"], ["accessories", "Accessories image"], ["url", "Custom URL…"]]) {
    imageSelect.append(el("option", { value: key, text: label }));
  }
  const imageUrl = el("input", { id: "f-image-url", type: "text", placeholder: "Image URL (https://…)" });
  const active = el("input", { id: "f-active", type: "checkbox" });
  const featured = el("input", { id: "f-featured", type: "checkbox" });
  active.checked = editing ? !!editing.active : true;
  featured.checked = editing ? !!editing.featured : false;

  if (editing) {
    title.value = editing.title || "";
    desc.value = editing.description || "";
    categorySel.value = editing.category || "Electronics";
    price.value = ((editing.priceCents || 0) / 100).toFixed(2);
    stock.value = String(editing.stockCount || 0);
    const isUrl = /^https?:\/\//i.test((editing.imageKey || ""));
    imageSelect.value = isUrl ? "url" : (editing.imageKey || "electronics");
    imageUrl.value = isUrl ? editing.imageKey : "";
  }

  const urlRow = el("div", { class: "field full", id: "f-image-url-row" },
    el("label", { for: "f-image-url", text: "Image URL" }),
    imageUrl
  );
  const syncUrlRow = () => { urlRow.style.display = imageSelect.value === "url" ? "block" : "none"; };
  imageSelect.addEventListener("change", syncUrlRow);
  syncUrlRow();

  const grid = el("div", { class: "form-grid" });
  grid.append(
    el("div", { class: "field full" }, el("label", { for: "f-title", text: "Title" }), title),
    el("div", { class: "field full" }, el("label", { for: "f-desc", text: "Description" }), desc),
    el("div", { class: "field" }, el("label", { for: "f-category", text: "Category" }), categorySel),
    el("div", { class: "field" }, el("label", { for: "f-price", text: "Price (USD)" }), price),
    el("div", { class: "field" }, el("label", { for: "f-stock", text: "Stock" }), stock),
    el("div", { class: "field" }, el("label", { for: "f-image", text: "Image" }), imageSelect),
    urlRow,
    el("div", { class: "field" }, el("label", { text: "Visibility" }),
      el("label", { class: "check-row" }, active, "Live")
    ),
    el("div", { class: "field" }, el("label", { text: "Featured" }),
      el("label", { class: "check-row" }, featured, "Featured")
    )
  );

  form.append(grid);
  form.append(el("div", { class: "form-actions" },
    el("button", { class: "primary-btn", type: "button", onclick: () => {
      const url = imageSelect.value === "url" ? (imageUrl.value || "").trim() : "";
      let imageKey = imageSelect.value === "url" ? url : imageSelect.value;
      if (!imageKey) imageKey = "electronics";
      saveProduct({
        id: editing ? editing.id : "",
        title: title.value,
        description: desc.value,
        category: categorySel.value,
        price: price.value,
        stock: stock.value,
        imageKey,
        active: active.checked,
        featured: featured.checked,
      });
    } }, editing ? "Update product" : "Publish product"),
    el("button", { class: "secondary-btn", type: "button", onclick: () => { editingId = null; render(); } }, "Cancel")
  ));
  return form;
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

    if (isLiveAdmin) {
      const select = el("select", { class: "status-select", title: "Change status" },
        ...DOC_STATUSES.map((s) => el("option", { value: s, text: s, ...(s === o.status ? { selected: "selected" } : {}) }))
      );
      select.value = orderStatusValue(o.status);
      select.addEventListener("change", () => updateOrderStatus(o.id, select.value));
      const wrapSelect = el("div", { class: "top", style: "margin-top:10px" }, el("span", { class: "hint", style: "color:var(--muted);font-size:.78rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase", text: "Status" }), select);
      card.append(wrapSelect);
    } else {
      const pill = el("div", { style: "margin-top:8px; font-size:.8rem; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:.08em", text: (o.status || "PENDING") });
      card.append(pill);
    }
    wrap.append(card);
  }
  return wrap;
}

function orderStatusValue(status) {
  const s = (status || "PENDING").toUpperCase();
  return DOC_STATUSES.includes(s) ? s : "PENDING";
}

/* ---------- Security tab ---------- */
function securityTab() {
  const wrap = el("div", { class: "security-card" });
  wrap.append(el("div", { class: "section-title" }, el("h2", { text: "Security" })));

  const current = el("input", { id: "sec-current", type: "password", placeholder: "Current passcode", autocomplete: "current-password" });
  const next = el("input", { id: "sec-next", type: "password", placeholder: "New passcode (min 6)", autocomplete: "new-password" });
  const confirm = el("input", { id: "sec-confirm", type: "password", placeholder: "Confirm new passcode", autocomplete: "new-password" });

  const card = el("div", { class: "sheet" });
  card.append(el("h3", { text: "Change admin passcode" }));
  card.append(el("div", { class: "setup-form" },
    el("div", { class: "field" }, el("label", { for: "sec-current", text: "Current passcode" }), current),
    el("div", { class: "field" }, el("label", { for: "sec-next", text: "New passcode" }), next),
    el("div", { class: "field" }, el("label", { for: "sec-confirm", text: "Confirm new passcode" }), confirm),
    el("button", { class: "primary-btn", type: "button", onclick: async () => {
      await handleChangePasscode($("#sec-current").value.trim(), $("#sec-next").value.trim(), $("#sec-confirm").value.trim());
    } }, "Update passcode")
  ));
  card.append(el("div", { class: "security-note" },
    "Verification uses PBKDF2-HMAC-SHA256 (100,000 iterations). The verifier is stored in this browser's local storage " +
    "and is never sent to any server. It is a local UI gate — real admin control is enforced by Firebase Firestore rules " +
    "(only the bootstrapped admin email and authorized admin accounts can read or write live catalog and order data)."
  ));
  wrap.append(card);
  return wrap;
}

/* ---------- Auth lifecycle ---------- */
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    clearListeners();
    syncPromise = null;
    unlocked = false;
    await syncProfile(user);
    await checkLiveAdmin();
    startListeners(user);
    render();
  } else {
    clearListeners();
    unlocked = false;
    products = []; orders = [];
    isLiveAdmin = false;
    render();
  }
});

navigateGuard();

function navigateGuard() { /* hash no-op */ }
