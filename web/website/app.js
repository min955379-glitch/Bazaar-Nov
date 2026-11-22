/* ===== Bazaar storefront — vanilla JS + Firebase ===== */
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
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
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
const ADMIN_PORTAL_URL = "https://bazaar-admin-min955379-6910.vercel.app";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, DATABASE_ID);
const googleProvider = new GoogleAuthProvider();

/* ---------- State ---------- */
let currentUser = null;
let products = [];
let cart = [];
let orders = [];
let productsReady = false;
let cartReady = false;
let ordersReady = false;
let loadingError = null;
let searchQuery = "";
let selectedCategory = null;
let currentRoute = "shop";
let unsubscribers = [];
let syncPromise = null;

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

function initialsOf(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "B").toUpperCase();
}

function escAttr(v) {
  return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ---------- Navigation ---------- */
const VIEWS = [
  { id: "shop", label: "Shop" },
  { id: "cart", label: "Cart" },
  { id: "orders", label: "Orders" },
  { id: "account", label: "Account" },
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
        v.id === "orders" ? path("M6 3h12v18l-3-2-3 2-3-2-3 2V3z") :
        path("M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0")
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

function renderUserChip() {
  const chip = $("#user-chip");
  chip.innerHTML = "";
  if (!currentUser) {
    chip.style.display = "none";
    return;
  }
  chip.style.display = "flex";
  const avatar = el("div", { class: "avatar" });
  const photo = currentUser.photoURL;
  if (photo && /^https?:\/\//i.test(photo)) {
    avatar.append(el("img", { src: photo, alt: "", referrerpolicy: "no-referrer" }));
  } else {
    avatar.textContent = initialsOf(currentUser.displayName);
  }
  const who = el("div", { class: "who" },
    el("div", { class: "name", text: currentUser.displayName || "Shopper" }),
    el("div", { class: "role", text: currentUser.email || "" })
  );
  const signOutBtn = el("button", { class: "icon-btn", title: "Sign out", onclick: handleSignOut },
    el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" },
      path("M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9")
    )
  );
  chip.append(avatar, who, signOutBtn);
}

/* ---------- Firestore sync ---------- */
function clearListeners() {
  unsubscribers.forEach((u) => { try { u(); } catch {} });
  unsubscribers = [];
}

function syncProfile(user) {
  if (syncPromise) return syncPromise;
  const path = `users/${user.uid}`;
  const ref = doc(db, "users", user.uid);
  const safeName = (user.displayName || "").trim().slice(0, 100) || "Bazaar Shopper";
  const safeEmail = (user.email || "").trim().slice(0, 160) || "shopper@bazaar.app";
  const safePhoto = user.photoURL ? String(user.photoURL).slice(0, 500) : null;
  syncPromise = (async () => {
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          userId: user.uid,
          displayName: safeName,
          email: safeEmail,
          ...(safePhoto ? { photoUrl: safePhoto } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(ref, {
          displayName: safeName,
          email: safeEmail,
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

function startListeners(user) {
  clearListeners();
  loadingError = null;
  productsReady = cartReady = ordersReady = false;
  products = [];
  cart = [];
  orders = [];

  unsubscribers.push(onSnapshot(query(collection(db, "products"), where("active", "==", true)), (snap) => {
    products = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p && typeof p.title === "string")
      .sort((a, b) => (b.featured === true) - (a.featured === true) || a.title.localeCompare(b.title));
    productsReady = true;
    rerender();
  }, (err) => {
    console.error(err);
    loadingError = "Could not load the catalog. Check your connection and sign-in.";
    productsReady = true;
    rerender();
  }));

  unsubscribers.push(onSnapshot(query(collection(db, "users", user.uid, "cart")), (snap) => {
    cart = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((i) => i && typeof i.title === "string")
      .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    cartReady = true;
    rerender();
  }, (err) => {
    console.error(err);
    loadingError = "Could not load your cart.";
    cartReady = true;
    rerender();
  }));

  unsubscribers.push(onSnapshot(query(collection(db, "orders"), where("userId", "==", user.uid)), (snap) => {
    orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((o) => o && typeof o.status === "string")
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    ordersReady = true;
    rerender();
  }, (err) => {
    console.error(err);
    loadingError = "Could not load your orders.";
    ordersReady = true;
    rerender();
  }));
}

/* ---------- Actions ---------- */
async function handleAddToCart(product) {
  if (!currentUser) return;
  if (product.stockCount <= 0) { toast("Out of stock — this item is unavailable.", true); return; }
  const uid = currentUser.uid;
  const cartRef = doc(db, "users", uid, "cart", product.id);
  try {
    const snap = await getDoc(cartRef);
    const current = snap.exists() ? (snap.data().quantity || 0) : 0;
    const target = Math.min(50, product.stockCount);
    const qty = Math.min(current + 1, target);
    const safeTitle = (product.title || "Product").slice(0, 120);
    const safeImage = (product.imageKey || "electronics").slice(0, 500) || "electronics";
    const safePrice = Math.max(1, Math.min(product.priceCents || 1, 100_000_000));
    if (snap.exists()) {
      await updateDoc(cartRef, { title: safeTitle, priceCents: safePrice, imageKey: safeImage, quantity: qty, updatedAt: serverTimestamp() });
    } else {
      await setDoc(cartRef, {
        productId: product.id, title: safeTitle, priceCents: safePrice, imageKey: safeImage,
        quantity: qty, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    }
    toast(`Added ${product.title} to your cart.`);
  } catch (e) {
    toast(e.message || "Could not add the item to your cart.", true);
  }
}

async function handleSetQty(item, qty) {
  if (!currentUser) return;
  const uid = currentUser.uid;
  const ref = doc(db, "users", uid, "cart", item.productId || item.id);
  const maxStock = products.find((p) => p.id === item.productId)?.stockCount ?? 50;
  try {
    if (qty <= 0) {
      await deleteDoc(ref);
      return;
    }
    const clamped = Math.max(1, Math.min(qty, Math.min(50, Math.max(1, maxStock))));
    await updateDoc(ref, { quantity: clamped, updatedAt: serverTimestamp() });
  } catch (e) {
    toast(e.message || "Could not update quantity.", true);
  }
}

async function handleRemoveItem(item) {
  if (!currentUser) return;
  const uid = currentUser.uid;
  try {
    await deleteDoc(doc(db, "users", uid, "cart", item.productId || item.id));
  } catch (e) {
    toast(e.message || "Could not remove the item.", true);
  }
}

async function handleCancelOrder(order) {
  if (!currentUser) return;
  try {
    await updateDoc(doc(db, "orders", order.id), { status: "CANCELLED", updatedAt: serverTimestamp() });
    toast("Order cancelled.");
  } catch (e) {
    toast(e.message || "Could not cancel the order.", true);
  }
}

async function handleCheckout({ name, address, phone, method }) {
  if (!currentUser) return;
  if (!cart.length) { toast("Your cart is empty.", true); return; }
  const trimmedName = name.trim();
  const trimmedAddress = address.trim();
  const trimmedPhone = phone.trim();
  if (trimmedName.length < 2 || trimmedName.length > 100) { toast("Please enter a valid recipient name (2–100 chars).", true); return; }
  if (trimmedAddress.length < 5 || trimmedAddress.length > 300) { toast("Please enter a complete shipping address (min 5 chars).", true); return; }
  if (trimmedPhone.length < 5 || trimmedPhone.length > 30) { toast("Please enter a valid contact phone number.", true); return; }

  const uid = currentUser.uid;
  const productsById = Object.fromEntries(products.map((p) => [p.id, p]));
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

  const batch = writeBatch(db);
  const orderRef = doc(collection(db, "orders"));
  batch.set(orderRef, {
    userId: uid,
    customerName: trimmedName,
    customerEmail: (currentUser.email || "shopper@bazaar.app").slice(0, 160),
    shippingAddress: trimmedAddress,
    customerPhone: trimmedPhone,
    paymentMethod: method,
    status: "PENDING",
    totalCents,
    itemCount,
    items: lineItems,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  for (const item of lineItems) {
    const product = productsById[item.productId];
    if (product && product.active && product.stockCount >= item.quantity) {
      const newStock = product.stockCount - item.quantity;
      if (newStock < product.stockCount) {
        batch.update(doc(db, "products", product.id), { stockCount: newStock, updatedAt: serverTimestamp() });
      }
    }
    batch.delete(doc(db, "users", uid, "cart", item.productId));
  }

  try {
    await batch.commit();
    toast(`Order #${orderRef.id.slice(0, 6).toUpperCase()} placed live!`);
    navigate("orders");
  } catch (e) {
    toast(e.message || "Order submission failed.", true);
  }
}

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
  try {
    await signOut(auth);
  } catch (e) {
    console.warn("Sign out failed", e);
  }
}

/* ---------- Views ---------- */
function render() {
  const nav = $("#nav-tabs");
  const foot = $("#foot");
  const chip = $("#user-chip");
  nav.innerHTML = "";
  chip.innerHTML = "";
  if (!currentUser) {
    nav.style.display = "none";
    foot.style.display = "none";
    chip.style.display = "none";
    appMain.innerHTML = "";
    appMain.append(gateView());
    return;
  }
  nav.style.display = "flex";
  foot.style.display = "block";
  $("#admin-link").href = ADMIN_PORTAL_URL;
  renderNav();
  renderUserChip();
  appMain.innerHTML = "";
  const view = currentRoute;
  const renderers = { shop: renderShop, cart: renderCart, orders: renderOrders, account: renderAccount };
  (renderers[view] || renderShop)();
}

function rerender() {
  render();
}

function gateView() {
  const signInBtn = el("button", { id: "gate-sign-in", class: "google-btn", onclick: handleSignIn },
    el("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", width: "22", height: "22" },
      el("circle", { cx: "12", cy: "12", r: "11", fill: "#ffffff" }),
      el("text", { x: "12", y: "16.4", "text-anchor": "middle", "font-size": "11.5", "font-weight": "800", fill: "#1a1917", "font-family": "Arial, sans-serif" }, "G")
    ),
    el("span", { text: "Sign in with Google" })
  );
  return el("div", { class: "gate-wrap" },
    el("div", { class: "gate-card" },
      el("div", { class: "hero-top" },
        el("img", { src: "assets/img_hero_banner.jpg", alt: "Bazaar editorial store collection" }),
        el("div", { class: "scrim" }),
        el("span", { class: "pill", text: "Live Store" })
      ),
      el("div", { class: "content" },
        el("h1", { text: "Bazaar Store" }),
        el("p", { class: "sub", text: "Curated goods, live cloud inventory, and instant order tracking — signed in with Google." }),
        signInBtn,
        el("p", { id: "gate-error", class: "gate-err", text: "" })
      )
    )
  );
}

/* ---------- Shop ---------- */
function renderShop() {
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
    if (loadingError) {
      grid.append(el("div", { class: "empty-state" },
        el("h3", { text: "Catalog unavailable" }),
        el("p", { text: loadingError })
      ));
    } else {
      grid.append(el("div", { class: "empty-state" },
        el("h3", { text: searchQuery ? "Nothing matches that search" : "No products yet" }),
        el("p", { text: searchQuery || selectedCategory ? "Try a different search or category." : "Products added by the store administrator will appear here in real time." })
      ));
    }
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

  if (!cartReady) {
    main.append(el("div", { class: "checkout-col" },
      el("div", { class: "skel", style: "height: 260px" }),
      el("div", { class: "skel", style: "height: 320px" })
    ));
    return;
  }

  if (cart.length === 0) {
    main.append(el("div", { class: "empty-state" },
      el("h3", { text: "Your cart is empty" }),
      el("p", { text: "Browse the shop and add something to your cart — it will sync live to your account." }),
      el("button", { class: "panel-btn", style: "margin-top:16px; max-width:260px", onclick: () => navigate("shop") }, el("span", { text: "Browse the shop" }))
    ));
    return;
  }

  const subtotal = cart.reduce((s, i) => s + (i.priceCents || 0) * (i.quantity || 0), 0);

  const grid = el("div", { class: "checkout-col" });

  const cartCard = el("div", { class: "cart-card" },
    el("div", { class: "head" }, el("h2", { text: `Cart (${cart.length})` }), el("span", { class: "sub", style: "color:var(--muted);font-size:.8rem", text: "Live cloud sync" }))
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

  const name = field("Recipient name", "input", "checkout-name", "Full name", currentUser ? currentUser.displayName || "" : "");
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
  body.append(name.wrapper, address.wrapper, phone.wrapper, method);

  const btn = el("button", { class: "place-btn", type: "button", onclick: onCheckoutClick },
    el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" }, path("M5 22l14-14-3.5-3.5L1.5 18.5 1 23z")),
    `Place Live Order · ${fmtMoney(subtotal)}`
  );
  body.append(btn);
  body.append(el("p", { class: "note", text: "Orders are written to your live Firestore account and confirmed instantly." }));

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
  const address = $("#checkout-address")?.value ?? "";
  const phone = $("#checkout-phone")?.value ?? "";
  const method = $("#checkout-method")?.value ?? "Cash on Delivery";
  handleCheckout({ name, address, phone, method });
}

/* ---------- Orders ---------- */
function renderOrders() {
  const main = appMain;
  if (!ordersReady) {
    main.append(el("div", { class: "skel", style: "height: 200px" }));
    return;
  }
  if (orders.length === 0) {
    main.append(el("div", { class: "empty-state" },
      el("h3", { text: "No orders yet" }),
      el("p", { text: "When you place an order, it appears here with live status tracking." })
    ));
    return;
  }
  main.append(el("div", { class: "section-head" },
    el("div", {}, el("h2", { text: "My orders" }), el("p", { class: "sub", text: `${orders.length} order${orders.length === 1 ? "" : "s"}` }))
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
    const meta2 = el("div", { class: "meta", text: `${o.customerEmail || ""} · ${o.paymentMethod || ""}` });
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

/* ---------- Account ---------- */
function renderAccount() {
  const main = appMain;
  const name = currentUser?.displayName || "Bazaar Shopper";
  const email = currentUser?.email || "";
  const photo = currentUser?.photoURL;
  const badge = (currentUser?.email && currentUser.email.toLowerCase() === "abdulmanan304000@gmail.com" && currentUser.emailVerified)
    ? "Firebase Live Admin" : "Firebase Connected";

  const avatar = el("div", { class: "avatar-lg" });
  if (photo && /^https?:\/\//i.test(photo)) {
    avatar.append(el("img", { src: photo, alt: "", referrerpolicy: "no-referrer" }));
  } else {
    avatar.textContent = initialsOf(name);
  }

  const card = el("div", { class: "profile-card" },
    avatar,
    el("div", { style: "flex:1; min-width:240px" },
      el("h2", { text: name }),
      el("p", { text: email }),
      el("span", { class: "badge" }, el("svg", { viewBox: "0 0 24 24", width: "13", height: "13", fill: "none", stroke: "currentColor", "stroke-width": "2" }, path("M12 2l3 6.2L21.5 9.3l-4.7 4.6 1.1 6.6L12 17.8 6.1 20.5l1.1-6.6-4.7-4.6 6.5-1.1z")), badge)
    )
  );
  main.append(card);

  const actions = el("div", { class: "profile-actions" });
  actions.append(el("a", { class: "panel-btn", href: ADMIN_PORTAL_URL, target: "_blank", rel: "noopener" },
    el("span", {}, el("span", { text: "Store admin portal" }), el("span", { class: "sub", text: "Manage products, orders and inventory" })),
    el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" }, path("M5 12h14M13 5l7 7-7 7"))
  ));
  actions.append(el("button", { class: "panel-btn", type: "button", onclick: handleSignOut },
    el("span", {}, el("span", { text: "Sign out" }), el("span", { class: "sub", text: "Sign out of this device" })),
    el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" }, path("M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"))
  ));
  main.append(actions);
}

/* ---------- Auth lifecycle ---------- */
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    syncPromise = null;
    syncProfile(user);
    startListeners(user);
    currentRoute = currentRouteId();
    render();
  } else {
    clearListeners();
    products = []; cart = []; orders = [];
    render();
  }
});

window.addEventListener("hashchange", () => {
  currentRoute = currentRouteId();
  render();
});

navigate(currentRouteId());
