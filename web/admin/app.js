/* ===== Bazaar admin portal — vanilla JS + Firebase (no sign-in required) ===== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- Config (client-side public config; security is enforced by Firestore rules) ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyBwHTSlynCnwVaOuz4NBybOpC9Wzo8Pkp4",
  authDomain: "gen-lang-client-0568023966.firebaseapp.com",
  projectId: "gen-lang-client-0568023966",
  storageBucket: "gen-lang-client-0568023966.firebasestorage.app",
};
const DATABASE_ID = "ai-studio-android-bazaar-ff6147c8-9c50-47a7-a4c0-4235cdb6b40e";
const PRESETS = {
  electronics: "assets/img_prod_electronics.jpg",
  fashion: "assets/img_prod_fashion.jpg",
  accessories: "assets/img_prod_fashion.jpg",
  home: "assets/img_prod_home.jpg",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, DATABASE_ID);

/* ---------- State ---------- */
let products = [];
let orders = [];
let productsReady = false, ordersReady = false;
let productsError = null, ordersError = null;
let tab = "products";          // products | orders
let unsubscribers = [];

/* ---------- DOM helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const appMain = $("#app");

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
  const chip = $("#user-chip");
  nav.innerHTML = "";
  if (chip) chip.style.display = "none";
  appMain.innerHTML = "";

  nav.style.display = "flex";
  renderNav();
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
      onclick: () => { tab = t.id; render(); },
    }, t.label + (t.count ? ` (${t.count})` : "")));
  }
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
      el("p", { text: "Read-only catalog view — sign-in is disabled for this deployment." })
    )
  );

  const banner = el("div", { class: "admin-banner off" },
    el("span", { text: "Sign-in and passcode gates are disabled on this deployment. Catalog writes require a signed-in Firebase admin — Firestore will reject changes." })
  );

  const tabRow = el("div", { class: "tab-row" });
  for (const t of ["products", "orders"]) {
    tabRow.append(el("button", {
      class: "tab-btn" + (tab === t ? " active" : ""),
      type: "button",
      onclick: () => { tab = t; render(); },
      text: t.charAt(0).toUpperCase() + t.slice(1) + (t === "orders" ? ` (${orders.length})` : ""),
    }));
  }

  const content = el("div", {});
  if (tab === "products") content.append(productsTab());
  else content.append(ordersTab(revenueCents, pendingCount, products.length, stockTotal));

  return el("div", {}, head, banner, kpiStrip(products.length, pendingCount, revenueCents, stockTotal), tabRow, content);
}

/* ---------- Products tab ---------- */
function productsTab() {
  const wrap = el("div", {});
  const stockTotal = products.reduce((s, p) => s + (p.stockCount || 0), 0);

  wrap.append(el("div", { class: "section-title" },
    el("h2", { text: "Catalog" }),
    el("span", { class: "hint", style: "color:var(--muted);font-size:.8rem", text: `${products.length} product${products.length === 1 ? "" : "s"} · ${stockTotal} in stock` })
  ));

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
      el("p", { text: "Products will appear here once the store admin publishes them." })
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
  return row;
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
startListeners();
render();
