/* ===== Bazaar storefront — vanilla JS + Firebase (no sign-in required) ===== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- Config (client-side public config; security is enforced by Firestore rules) ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyBwHTSlynCnwVaOuz4NBybOpC9Wzo8Pkp4",
  authDomain: "gen-lang-client-0568023966.firebaseapp.com",
  projectId: "gen-lang-client-0568023966",
  storageBucket: "gen-lang-client-0568023966.firebasestorage.app",
};
const DATABASE_ID = "ai-studio-android-bazaar-ff6147c8-9c50-47a7-a4c0-4235cdb6b40e";
const ADMIN_PORTAL_URL = "https://bazaar-admin-min955379-6910.vercel.app";
const CART_KEY = "bazaar_cart_v1";
const ORDERS_KEY = "bazaar_orders_v1";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, DATABASE_ID);

/* ---------- State (cart + orders live on this device; catalog is live from Firestore) ---------- */
let liveProducts = [];
let liveCatalogFailed = false;
let cart = loadJSON(CART_KEY, []);
let orders = loadJSON(ORDERS_KEY, []);
let productsReady = false;
let loadingError = null;
let searchQuery = "";
let selectedCategory = null;
let currentRoute = "shop";
let unsubscribers = [];

/* Demo catalog used only when the live Firestore catalog is unavailable (e.g. rules not deployed).
   Clearly labelled in the UI as a demo. */
const DEMO_CATALOG = [
  { id: "starter_anc_headphones", title: "Obsidian ANC Studio Headphones", description: "Active noise-canceling wireless over-ear headphones with 40-hour battery, plush memory foam earcups, and lossless USB-C audio.", category: "Electronics", priceCents: 18900, stockCount: 18, imageKey: "electronics", active: true, featured: true },
  { id: "starter_cognac_tote", title: "Artisan Cognac Leather Tote", description: "Hand-stitched full-grain vegetable-tanned leather tote with brass hardware and a padded 14-inch laptop sleeve.", category: "Fashion", priceCents: 14500, stockCount: 12, imageKey: "fashion", active: true, featured: true },
  { id: "starter_sage_carafe", title: "Matte Sage Ceramic Pour-Over Set", description: "Stoneware coffee dripper and insulated serving carafe with natural oak collar for clean, aromatic morning brews.", category: "Home", priceCents: 6400, stockCount: 24, imageKey: "home", active: true, featured: true },
  { id: "starter_titanium_watch", title: "Minimalist Titanium Smartwatch", description: "Sapphire crystal AMOLED display, 10-day endurance battery, heart-rate & sleep telemetry, and 5ATM water resistance.", category: "Electronics", priceCents: 22900, stockCount: 9, imageKey: "electronics", active: true, featured: false },
  { id: "starter_tortoise_shades", title: "Heritage Tortoise Sunglasses", description: "Polarized UV400 green-tint mineral lenses set in hand-finished Italian acetate and brushed gold temples.", category: "Accessories", priceCents: 8800, stockCount: 15, imageKey: "fashion", active: true, featured: false },
  { id: "starter_brass_lamp", title: "Arc Brushed Brass Desk Lamp", description: "Sculptural curved reading lamp in warm satin brass with stepless touch dimming and flicker-free warm LED.", category: "Home", priceCents: 11900, stockCount: 7, imageKey: "home", active: true, featured: false },
];

function currentProducts() {
  if (liveCatalogFailed) return DEMO_CATALOG;
  return liveProducts;
}

/* ---------- Local persistence helpers ---------- */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : fallback;
    return Array.isArray(v) ? v : fallback;
  } catch { return fallback; }
}

function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.warn("Could not persist", key, e); }
}

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
  } catch {
    return "—";
  }
}

const PRESETS = {
  electronics: "assets/img_prod_electronics.jpg",
  fashion: "assets/img_prod_fashion.jpg",
  accessories: "assets/img_prod_fashion.jpg",
  home: "assets/img_prod_home.jpg",
  hero: "assets/img_hero_banner.jpg",
};

function imgFor(key) {
  const t = (key || "").trim();
  if (/^https:\/\//i.test(t) || /^http:\/\//i.test(t)) return t;
  return PRESETS[t.toLowerCase()] || PRESETS.electronics;
}

/* ---------- Navigation ---------- */
const VIEWS = [
  { id: "shop", label: "Shop" },
  { id: "cart", label: "Cart" },
  { id: "orders", label: "Orders" },
];

function currentRouteId() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  const v = parts[0] || "shop";
  return VIEWS.some((x) => x.id === v) ? v : "shop";
}

function navigate(view) {
  location.hash = "#/" + view;
}

function setView(view) {
  currentRoute = view;
  render();
}

function renderNav() {
  const nav = $("#nav-tabs");
  nav.innerHTML = "";
  for (const v of VIEWS) {
    const isActive = currentRoute === v.id;
    const badge = v.id === "cart" ? Math.min(99, cart.reduce((n, i) => n + i.quantity, 0)) : 0;
    const btn = el("button", {
      class: "nav-tab" + (isActive ? " active" : ""),
      type: "button",
      onclick: () => navigate(v.id),
    },
      el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "aria-hidden": "true" },
        v.id === "shop" ? path("M3 7l9-4 9 4-9 4-9-4zM3 7v7l9 4 9-4V7M12 11v7") :
        v.id === "cart" ? path("M6 6h15l-2 10H8L6 6zM9 6a3 3 0 016 0") :
        path("M6 3h12v18l-3-2-3 2-3-2-3 2V3z")
      ),
      el("span", { text: v.label }),
      badge ? el("span", { class: "cart-badge", text: String(badge) }) : null
    );
    nav.append(btn);
  }
}

// helper for svg path children
function path(d) {
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  p.setAttribute("stroke", "currentColor");
  p.setAttribute("stroke-width", "2");
  p.setAttribute("fill", "none");
  p.setAttribute("stroke-linecap", "round");
  p.setAttribute("stroke-linejoin", "round");
  return p;
}

/* ---------- Firestore catalog (read-only) ---------- */
function clearListeners() {
  unsubscribers.forEach((u) => { try { u(); } catch {} });
  unsubscribers = [];
}

function startListeners() {
  clearListeners();
  loadingError = null;
  liveCatalogFailed = false;
  liveProducts = [];
  productsReady = false;

  unsubscribers.push(onSnapshot(query(collection(db, "products"), where("active", "==", true)), (snap) => {
    liveProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p && typeof p.title === "string")
      .sort((a, b) => (b.featured === true) - (a.featured === true) || a.title.localeCompare(b.title));
    productsReady = true;
    rerender();
  }, (err) => {
    console.error(err);
    loadingError = "Live catalog is unavailable. Showing the demo catalog.";
    liveCatalogFailed = true;
    productsReady = true;
    rerender();
  }));
}

/* ---------- Actions ---------- */
function handleAddToCart(product) {
  if (!product || product.active === false) { toast("Out of stock — this item is unavailable.", true); return; }
  if (product.stockCount <= 0) { toast("Out of stock — this item is unavailable.", true); return; }
  const existing = cart.find((i) => i.productId === product.id);
  const current = existing ? existing.quantity : 0;
  const target = Math.min(50, product.stockCount);
  const qty = Math.min(current + 1, target);
  if (existing) {
    existing.quantity = qty;
  } else {
    cart.push({
      productId: product.id,
      title: (product.title || "Product").slice(0, 120),
      priceCents: Math.max(1, Math.min(product.priceCents || 1, 100_000_000)),
      imageKey: (product.imageKey || "electronics").slice(0, 500),
      quantity: qty,
    });
  }
  saveJSON(CART_KEY, cart);
  toast(`Added ${product.title} to your cart.`);
  rerender();
}

function handleSetQty(item, qty) {
  const product = currentProducts().find((p) => p.id === item.productId);
  const maxStock = product ? product.stockCount : 50;
  const existing = cart.find((i) => i.productId === item.productId);
  if (!existing) return;
  if (qty <= 0) {
    cart = cart.filter((i) => i.productId !== item.productId);
  } else {
    const clamped = Math.max(1, Math.min(qty, Math.min(50, Math.max(1, maxStock))));
    existing.quantity = clamped;
  }
  saveJSON(CART_KEY, cart);
  rerender();
}

function handleRemoveItem(item) {
  cart = cart.filter((i) => i.productId !== item.productId);
  saveJSON(CART_KEY, cart);
  rerender();
}

function handleCancelOrder(order) {
  const idx = orders.findIndex((o) => o.id === order.id);
  if (idx < 0) return;
  orders = orders.map((o) => (o.id === order.id ? { ...o, status: "CANCELLED" } : o));
  saveJSON(ORDERS_KEY, orders);
  toast("Order cancelled.");
  rerender();
}

function makeOrderId() {
  try {
    if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  } catch {}
  return `local_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function handleCheckout({ name, email, address, phone, method }) {
  if (!cart.length) { toast("Your cart is empty.", true); return; }
  const trimmedName = name.trim();
  const trimmedEmail = (email || "").trim();
  const trimmedAddress = address.trim();
  const trimmedPhone = phone.trim();
  if (trimmedName.length < 2 || trimmedName.length > 100) { toast("Please enter a valid recipient name (2–100 chars).", true); return; }
  if (trimmedEmail.length > 160) { toast("Please enter a valid email (max 160 chars).", true); return; }
  if (trimmedAddress.length < 5 || trimmedAddress.length > 300) { toast("Please enter a complete shipping address (min 5 chars).", true); return; }
  if (trimmedPhone.length < 5 || trimmedPhone.length > 30) { toast("Please enter a valid contact phone number.", true); return; }

  const lineItems = cart.map((i) => ({
    productId: i.productId,
    title: (i.title || "").slice(0, 120),
    priceCents: Math.max(1, Math.min(i.priceCents || 1, 100_000_000)),
    quantity: Math.max(1, Math.min(i.quantity || 1, 50)),
  }));
  const totalCents = lineItems.reduce((s, i) => s + i.priceCents * i.quantity, 0);
  const itemCount = lineItems.reduce((s, i) => s + i.quantity, 0);
  if (totalCents < 1 || totalCents > 500_000_000) { toast("Order total is out of valid range.", true); return; }
  if (itemCount < 1 || itemCount > 200) { toast("Item count is out of valid range.", true); return; }

  const order = {
    id: makeOrderId(),
    customerName: trimmedName,
    customerEmail: trimmedEmail,
    shippingAddress: trimmedAddress,
    customerPhone: trimmedPhone,
    paymentMethod: method,
    status: "PENDING",
    totalCents,
    itemCount,
    items: lineItems,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  orders = [order, ...orders];
  saveJSON(ORDERS_KEY, orders);
  cart = [];
  saveJSON(CART_KEY, cart);
  toast(`Order #${order.id.slice(0, 6).toUpperCase()} placed!`);
  navigate("orders");
}

/* ---------- Views ---------- */
function render() {
  const nav = $("#nav-tabs");
  const foot = $("#foot");
  const chip = $("#user-chip");
  nav.innerHTML = "";
  nav.style.display = "flex";
  foot.style.display = "block";
  if (chip) chip.style.display = "none";
  $("#admin-link").href = ADMIN_PORTAL_URL;
  renderNav();
  appMain.innerHTML = "";
  const view = currentRoute;
  const renderers = { shop: renderShop, cart: renderCart, orders: renderOrders };
  (renderers[view] || renderShop)();
}

function rerender() {
  render();
}

/* ---------- Shop ---------- */
function renderShop() {
  const products = currentProducts();
  const hasDemo = liveCatalogFailed && liveProducts.length === 0;
  const main = appMain;

  const hero = el("div", { class: "hero" },
    el("img", { class: "bg", src: "assets/img_hero_banner.jpg", alt: "" }),
    el("div", { class: "scrim" }),
    el("div", { class: "hero-copy" },
      el("span", { class: "live" }, el("b"), "Live inventory"),
      el("h1", { text: "Crafted essentials, synced live." }),
      el("p", { text: "Direct from cloud inventory — updated as soon as the store changes." })
    )
  );
  main.append(hero);

  const toolbar = el("div", { class: "toolbar" });
  const search = el("div", { class: "search-wrap" + (searchQuery ? " has-query" : "") },
    el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" }, path("M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z")),
    el("input", { id: "search-input", type: "search", placeholder: "Search curated products…", value: searchQuery, "aria-label": "Search products", oninput: onSearchChange }),
    el("button", { type: "button", text: "Clear", onclick: () => { searchQuery = ""; rerender(); } })
  );
  toolbar.append(search);
  if (hasDemo) {
    toolbar.append(el("span", { class: "demo-pill", text: "Demo catalog — live inventory unavailable" }));
  }
  main.append(toolbar);

  const chips = el("div", { class: "chip-row" });
  const categories = ["All", "Electronics", "Fashion", "Home", "Accessories"];
  for (const c of categories) {
    const isActive = (c === "All" && selectedCategory === null) || selectedCategory === c;
    chips.append(el("button", {
      class: "chip" + (isActive ? " active" : ""),
      type: "button",
      onclick: () => { selectedCategory = c === "All" ? null : c; rerender(); },
      text: c,
    }));
  }
  main.append(chips);

  if (!productsReady) {
    const grid = el("div", { class: "product-grid" });
    for (let i = 0; i < 6; i++) grid.append(el("div", { class: "skel skel-card" }));
    main.append(grid);
    return;
  }

  const featured = products.filter((p) => p.featured && matchFilters(p));
  const rest = products.filter((p) => !p.featured && matchFilters(p));
  const all = [...featured, ...rest];

  if (featured.length || rest.length) {
    if (featured.length) {
      const head = el("div", { class: "section-head" },
        el("div", {}, el("h2", { text: "Featured" }), el("p", { class: "sub", text: "Hand-picked by the store owners" }))
      );
      main.append(head);
      const row = el("div", { class: "featured-row" });
      for (const p of featured) row.append(featuredCard(p));
      main.append(row);
    }
    const gridHead = el("div", { class: "section-head" },
      el("div", {}, el("h2", { text: "All products" }), el("p", { class: "sub", text: `${all.length} item${all.length === 1 ? "" : "s"} in stock` }))
    );
    main.append(gridHead);
  }

  const grid = el("div", { class: "product-grid" });
  if (all.length === 0) {
    grid.append(el("div", { class: "empty-state" },
      el("h3", { text: searchQuery ? "Nothing matches that search" : "No products yet" }),
      el("p", { text: searchQuery || selectedCategory ? "Try a different search or category." : "Products added by the store administrator will appear here in real time." })
    ));
  } else {
    for (const p of all) grid.append(productCard(p));
  }
  main.append(grid);
}

function matchFilters(p) {
  if (selectedCategory && p.category !== selectedCategory) return false;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const hay = `${p.title} ${p.description || ""} ${p.category || ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function onSearchChange(e) {
  searchQuery = e.target.value;
  const sw = e.target.closest(".search-wrap");
  sw.classList.toggle("has-query", !!searchQuery);
}

function featuredCard(p) {
  const img = imgFor(p.imageKey);
  return el("div", { class: "featured-card", onclick: () => addToCartSafe(p) },
    el("div", { class: "img" }, el("img", { src: img, alt: p.title, loading: "lazy" })),
    el("div", { class: "body" },
      el("div", { class: "cat", text: (p.category || "").toUpperCase() }),
      el("h3", { text: p.title }),
      el("div", { class: "price", text: fmtMoney(p.priceCents || 0) })
    )
  );
}

function productCard(p) {
  const img = imgFor(p.imageKey);
  const outOfStock = (p.stockCount || 0) <= 0;
  const card = el("article", { class: "product-card" });
  const imgWrap = el("div", { class: "img", onclick: () => addToCartSafe(p) });
  if (p.featured) {
    imgWrap.append(el("span", { class: "badge" }, el("svg", { viewBox: "0 0 24 24", width: "11", height: "11", fill: "currentColor" }, el("path", { d: "M12 2l2.9 6.26L21.5 9.3l-4.75 4.63L17.8 21 12 17.8 6.2 21l1.05-7.07L2.5 9.3l6.6-1.04z" })), "Featured"));
  }
  imgWrap.append(el("img", { src: img, alt: p.title, loading: "lazy" }));
  card.append(imgWrap);
  card.append(el("div", { class: "body" },
    el("div", { class: "cat", text: (p.category || "").toUpperCase() }),
    el("h3", { text: p.title }),
    el("div", { class: "price-row" },
      el("span", { class: "price", text: fmtMoney(p.priceCents || 0) }),
      el("span", { class: "stock" + (outOfStock ? " out" : ""), text: outOfStock ? "Sold out" : `${p.stockCount} left` })
    ),
    el("button", {
      class: "add-btn",
      type: "button",
      disabled: outOfStock,
      onclick: (ev) => { ev.stopPropagation(); handleAddToCart(p); },
    },
      el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" }, path("M6 6h15l-2 10H8L6 6zM9 6a3 3 0 016 0")),
      outOfStock ? "Sold Out" : "Add"
    )
  ));
  return card;
}

function addToCartSafe(p) {
  handleAddToCart(p);
}

/* ---------- Cart ---------- */
function renderCart() {
  const main = appMain;

  if (cart.length === 0) {
    main.append(el("div", { class: "empty-state" },
      el("h3", { text: "Your cart is empty" }),
      el("p", { text: "Browse the shop and add something to your cart — it's saved on this device." }),
      el("button", { class: "panel-btn", style: "margin-top:16px; max-width:260px", onclick: () => navigate("shop") }, el("span", { text: "Browse the shop" }))
    ));
    return;
  }

  const products = currentProducts();
  const subtotal = cart.reduce((s, i) => s + (i.priceCents || 0) * (i.quantity || 0), 0);
  const grid = el("div", { class: "checkout-col" });

  const cartCard = el("div", { class: "cart-card" },
    el("div", { class: "head" }, el("h2", { text: `Cart (${cart.length})` }), el("span", { class: "sub", style: "color:var(--muted);font-size:.8rem", text: "Saved on this device" }))
  );
  for (const item of cart) {
    const img = imgFor(item.imageKey);
    const product = products.find((p) => p.id === item.productId);
    const maxStock = product ? product.stockCount : 50;
    cartCard.append(el("div", { class: "cart-line" },
      el("img", { src: img, alt: item.title || "", loading: "lazy" }),
      el("div", { class: "info" },
        el("div", { class: "t", text: item.title || "Item" }),
        el("div", { class: "p", text: fmtMoney(item.priceCents || 0) })
      ),
      el("div", { class: "stepper" },
        el("button", { type: "button", "aria-label": "Decrease", onclick: () => handleSetQty(item, item.quantity - 1) }, "−"),
        el("span", { class: "qty", text: String(item.quantity) }),
        el("button", { type: "button", "aria-label": "Increase", disabled: item.quantity >= maxStock || item.quantity >= 50, onclick: () => handleSetQty(item, Math.min(item.quantity + 1, maxStock)) }, "+")
      ),
      el("button", { class: "rm", title: "Remove item", "aria-label": "Remove item", onclick: () => handleRemoveItem(item) },
        el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" }, path("M3 6h18M8 6V4h8v2m-9 0l1 14a2 2 0 002 2h8a2 2 0 002-2l1-14"))
      )
    ));
  }
  cartCard.append(el("div", { class: "subtotal-row" },
    el("span", { text: "Subtotal" }),
    el("span", { class: "amt", text: fmtMoney(subtotal) })
  ));

  const checkoutCard = el("div", { class: "cart-card checkout-card" },
    el("div", { class: "head" }, el("h2", { text: "Checkout" })),
    el("div", { class: "checkout-body" })
  );
  const body = checkoutCard.lastElementChild;

  const name = field("Recipient name", "input", "checkout-name", "Full name", "");
  const email = field("Email (optional)", "input", "checkout-email", "you@example.com", "");
  const address = field("Shipping address", "textarea", "checkout-address", "Street, city, postal code", "");
  const phone = field("Phone", "input", "checkout-phone", "+92 300 0000000", "");
  const method = el("div", { class: "field" },
    el("label", { text: "Payment method", for: "checkout-method" }),
    el("select", { id: "checkout-method" },
      el("option", { text: "Cash on Delivery", value: "Cash on Delivery" }),
      el("option", { text: "Card on Delivery", value: "Card on Delivery" }),
      el("option", { text: "Digital Wallet", value: "Digital Wallet" })
    )
  );
  body.append(name.wrapper, email.wrapper, address.wrapper, phone.wrapper, method);

  const btn = el("button", { class: "place-btn", type: "button", onclick: onCheckoutClick },
    el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" }, path("M5 22l14-14-3.5-3.5L1.5 18.5 1 23z")),
    `Place Order · ${fmtMoney(subtotal)}`
  );
  body.append(btn);
  body.append(el("p", { class: "note", text: "Orders are stored on this device only. No sign-in required." }));

  grid.append(cartCard, checkoutCard);
  main.append(grid);
}

function field(label, kind, id, placeholder, value) {
  const input = el(kind, { id, placeholder, value, ...(kind === "textarea" ? { rows: "2" } : { type: "text" }) });
  const wrapper = el("div", { class: "field" },
    el("label", { text: label, for: id }),
    input
  );
  return { wrapper, input, label };
}

function onCheckoutClick() {
  const name = $("#checkout-name")?.value ?? "";
  const email = $("#checkout-email")?.value ?? "";
  const address = $("#checkout-address")?.value ?? "";
  const phone = $("#checkout-phone")?.value ?? "";
  const method = $("#checkout-method")?.value ?? "Cash on Delivery";
  handleCheckout({ name, email, address, phone, method });
}

/* ---------- Orders ---------- */
function renderOrders() {
  const main = appMain;
  if (orders.length === 0) {
    main.append(el("div", { class: "empty-state" },
      el("h3", { text: "No orders yet" }),
      el("p", { text: "When you place an order, it appears here with live status tracking." })
    ));
    return;
  }
  main.append(el("div", { class: "section-head" },
    el("div", {}, el("h2", { text: "My orders" }), el("p", { class: "sub", text: `${orders.length} order${orders.length === 1 ? "" : "s"} on this device` }))
  ));
  for (const o of orders) {
    const status = (o.status || "PENDING").toUpperCase();
    const canCancel = status === "PENDING";
    const card = el("div", { class: "order-card" });
    const info = el("div", { class: "info" });
    const top = el("div", { class: "top" },
      el("span", { class: "oid", text: `#${o.id.slice(0, 6).toUpperCase()}` }),
      el("span", { class: `status-pill ${status.toLowerCase()}`, text: status }),
      el("span", { class: "date", text: fmtDate(o.createdAt) })
    );
    info.append(top);
    const items = Array.isArray(o.items) ? o.items : [];
    const itemText = items.map((i) => `${i.title} ×${i.quantity}`).join(" · ") || "—";
    info.append(el("div", { class: "meta", text: itemText }));
    const meta2 = el("div", { class: "meta", text: [o.customerEmail || "", o.paymentMethod || ""].filter(Boolean).join(" · ") });
    info.append(meta2);
    card.append(info);
    const right = el("div", { class: "amt", text: fmtMoney(o.totalCents || 0) });
    card.append(right);
    if (canCancel) {
      const cancelBtn = el("button", { class: "cancel-btn", type: "button", onclick: () => handleCancelOrder(o) }, "Cancel");
      card.append(cancelBtn);
    }
    main.append(card);
  }
}

/* ---------- Boot ---------- */
startListeners();

window.addEventListener("hashchange", () => {
  currentRoute = currentRouteId();
  render();
});

navigate(currentRouteId());
