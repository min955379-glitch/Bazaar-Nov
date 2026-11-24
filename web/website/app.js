/* ===== Bazaar storefront — Supabase public catalog ===== */
/* ---------- Pure helpers ---------- */
import {
  WHATSAPP_PATH,
  fmtMoney,
  fmtDate,
  imgFor,
  imagesFor,
  whatsappOrderUrl,
  whatsappSupportUrl,
  matchFilters,
  productFromSupabase,
} from "./helpers.js";

/* ---------- Public catalog configuration (access controlled by Supabase policies) ---------- */
const SUPABASE_URL = "https://spetcfhneurdkipsmphx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwZXRjZmhuZXVyZGtpcHNtcGh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0NDgyOTUsImV4cCI6MjExMTAyNDI5NX0.RkniJOSufaYsqTkUZDLIkjqPUPIQ5JQPtbkpVY2dZTE";
const CART_KEY = "bazaar_cart_v1";
const ORDERS_KEY = "bazaar_orders_v1";

/* ---------- Contact & support constants (editable by the store owner) ---------- */
const SUPPORT_PHONE_DISPLAY = "03221393770";
const SUPPORT_PHONE_TEL = "03221393770";
const SUPPORT_EMAIL = "abdulmanan304000@gmail.com";
const SUPPORT_HOURS = "Sunday – Thursday: 9:00 AM – 5:00 PM"; // editable placeholder

/* ---------- State (cart and orders stay on this device) ---------- */
let liveProducts = [];
let cart = loadJSON(CART_KEY, []);
let orders = loadJSON(ORDERS_KEY, []);
let productsReady = false;
let loadingError = null;
let searchQuery = "";
let selectedCategory = null;
let currentRoute = "shop";
let catalogRequestInFlight = false;
let galleryIndex = 0;

function currentProducts() {
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




/* ---------- Navigation ---------- */
const VIEWS = [
  { id: "shop", label: "Shop" },
  { id: "cart", label: "Cart" },
  { id: "orders", label: "Orders" },
  { id: "support", label: "Support" },
];

function currentRouteId() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  const v = parts[0] || "shop";
  if (v === "product") return "product";
  return VIEWS.some((x) => x.id === v) ? v : "shop";
}

function productIdFromHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  return parts[0] === "product" ? (parts[1] || "") : "";
}

function navigate(view, param) {
  if (param) location.hash = "#/" + view + "/" + encodeURIComponent(param);
  else location.hash = "#/" + view;
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
        path("M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z")
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

/* ---------- Supabase catalog (read-only) ---------- */
async function refreshCatalog() {
  if (catalogRequestInFlight) return;
  catalogRequestInFlight = true;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/products?select=*&order=created_at.desc`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid catalog response");
    const updated = rows.filter((row) => row && typeof row.name === "string").map(productFromSupabase);
    const changed = JSON.stringify(updated) !== JSON.stringify(liveProducts) || !productsReady || loadingError;
    liveProducts = updated;
    productsReady = true;
    loadingError = null;
    if (changed) rerender();
  } catch (error) {
    console.error("Catalog unavailable:", error);
    const changed = !productsReady || !loadingError;
    productsReady = true;
    loadingError = "The catalog is temporarily unavailable. Please try again.";
    if (changed) rerender();
  } finally {
    catalogRequestInFlight = false;
  }
}

function startListeners() {
  refreshCatalog();
  setInterval(() => { if (!document.hidden) refreshCatalog(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshCatalog(); });
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
      image: imagesFor(product)[0] || "",
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

/* ---------- Views ---------- */
function render() {
  const nav = $("#nav-tabs");
  const foot = $("#foot");
  nav.innerHTML = "";
  nav.style.display = "flex";
  foot.style.display = "block";
  renderNav();
  appMain.innerHTML = "";
  const view = currentRoute;
  const renderers = { shop: renderShop, cart: renderCart, orders: renderOrders, support: renderSupport, product: renderProduct };
  (renderers[view] || renderShop)();
}

function rerender() {
  render();
}

/* ---------- Shop ---------- */
function renderShop() {
  const products = currentProducts();
  const main = appMain;

  const hero = el("div", { class: "hero" },
    el("img", { class: "bg", src: "assets/img_hero_banner.jpg", alt: "" }),
    el("div", { class: "scrim" }),
    el("div", { class: "hero-copy" },
      el("span", { class: "live" }, el("b"), "Live inventory"),
      el("h1", { text: "Crafted essentials, synced live." }),
      el("p", { text: "Direct from cloud inventory — refreshed regularly as the store changes." })
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
  if (loadingError) {
    toolbar.append(el("span", { class: "demo-pill", text: loadingError }));
  }
  main.append(toolbar);

  const chips = el("div", { class: "chip-row" });
  const categories = ["All", "Electronics", "Fashion", "Home", "Accessories", "Other"];
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

  const featured = products.filter((p) => p.featured && matchFilters(p, selectedCategory, searchQuery));
  const rest = products.filter((p) => !p.featured && matchFilters(p, selectedCategory, searchQuery));
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
      el("div", {}, el("h2", { text: "All products" }), el("p", { class: "sub", text: `${all.length} item${all.length === 1 ? "" : "s"}` }))
    );
    main.append(gridHead);
  }

  const grid = el("div", { class: "product-grid" });
  if (all.length === 0) {
    grid.append(el("div", { class: "empty-state" },
      el("h3", { text: loadingError ? "Catalog unavailable" : (searchQuery ? "Nothing matches that search" : "No products yet") }),
      el("p", { text: loadingError || (searchQuery || selectedCategory ? "Try a different search or category." : "Products added by the store will appear here.") })
    ));
  } else {
    for (const p of all) grid.append(productCard(p));
  }
  main.append(grid);
}

function onSearchChange(e) {
  searchQuery = e.target.value;
  const position = e.target.selectionStart;
  rerender();
  const input = $("#search-input");
  if (input) {
    input.focus();
    if (position !== null) input.setSelectionRange(position, position);
  }
}

function featuredCard(p) {
  const img = imagesFor(p)[0];
  return el("div", { class: "featured-card", onclick: () => navigate("product", p.id) },
    el("div", { class: "img" }, el("img", { src: img, alt: p.title, loading: "lazy" })),
    el("div", { class: "body" },
      el("div", { class: "cat", text: (p.category || "").toUpperCase() }),
      el("h3", { text: p.title }),
      el("div", { class: "price", text: fmtMoney(p.priceCents || 0) })
    )
  );
}

function productCard(p) {
  const img = imagesFor(p)[0];
  const outOfStock = (p.stockCount || 0) <= 0;
  const card = el("article", { class: "product-card" });
  const imgWrap = el("div", { class: "img", onclick: () => navigate("product", p.id) });
  if (p.featured) {
    imgWrap.append(el("span", { class: "badge" }, el("svg", { viewBox: "0 0 24 24", width: "11", height: "11", fill: "currentColor" }, el("path", { d: "M12 2l2.9 6.26L21.5 9.3l-4.75 4.63L17.8 21 12 17.8 6.2 21l1.05-7.07L2.5 9.3l6.6-1.04z" })), "Featured"));
  }
  imgWrap.append(el("img", { src: img, alt: p.title, loading: "lazy" }));
  card.append(imgWrap);
  card.append(el("div", { class: "body" },
    el("div", { class: "cat", text: (p.category || "").toUpperCase() }),
    el("h3", { text: p.title, onclick: () => navigate("product", p.id) }),
    el("div", { class: "price-row" },
      el("span", { class: "price", text: fmtMoney(p.priceCents || 0) }),
      el("span", { class: "stock" + (outOfStock ? " out" : ""), text: outOfStock ? "Sold out" : "In stock" })
    ),
    el("button", {
      class: "add-btn",
      type: "button",
      disabled: outOfStock,
      onclick: (ev) => { ev.stopPropagation(); handleAddToCart(p); },
    },
      el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" }, path("M6 6h15l-2 10H8L6 6zM9 6a3 3 0 016 0")),
      outOfStock ? "Sold Out" : "Add to Cart"
    )
  ));
  return card;
}

/* ---------- Product detail (gallery) ---------- */
function renderProduct() {
  const main = appMain;
  const id = productIdFromHash();
  const product = currentProducts().find((p) => p.id === id);
  if (!product) {
    main.append(el("div", { class: "empty-state" },
      el("h3", { text: "Product not found" }),
      el("p", { text: "This product may have been removed from the catalog." }),
      el("button", { class: "panel-btn", style: "margin-top:16px; max-width:260px", onclick: () => navigate("shop") }, el("span", { text: "Back to shop" }))
    ));
    return;
  }

  const images = imagesFor(product);
  const gallery = el("div", { class: "gallery" });
  const mainImgWrap = el("div", { class: "gallery-main" });
  mainImgWrap.append(el("img", { src: images[galleryIndex % images.length], alt: product.title || "Product image" }));
  gallery.append(mainImgWrap);
  if (images.length > 1) {
    const thumbs = el("div", { class: "gallery-thumbs" });
    images.forEach((src, i) => {
      thumbs.append(el("button", {
        class: "gallery-thumb" + (i === galleryIndex % images.length ? " active" : ""),
        type: "button",
        "aria-label": `View image ${i + 1}`,
        onclick: () => { galleryIndex = i; rerender(); },
      },
        el("img", { src, alt: `Thumbnail ${i + 1}` })
      ));
    });
    gallery.append(thumbs);
  }

  const outOfStock = (product.stockCount || 0) <= 0;
  const info = el("div", { class: "product-detail" },
    el("button", { class: "back-link", type: "button", onclick: () => navigate("shop") }, "← Back to shop"),
    el("div", { class: "cat", text: (product.category || "").toUpperCase() }),
    el("h1", { text: product.title }),
    el("div", { class: "price-row" },
      el("span", { class: "price", text: fmtMoney(product.priceCents || 0) }),
      el("span", { class: "stock" + (outOfStock ? " out" : ""), text: outOfStock ? "Sold out" : "In stock" })
    ),
    el("p", { class: "desc", text: product.description || "" }),
    el("button", {
      class: "add-btn det-add-btn",
      type: "button",
      disabled: outOfStock,
      onclick: () => handleAddToCart(product),
    },
      el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" }, path("M6 6h15l-2 10H8L6 6zM9 6a3 3 0 016 0")),
      outOfStock ? "Sold Out" : "Add to Cart"
    )
  );

  galleryIndex = galleryIndex % images.length;

  const layout = el("div", { class: "product-layout" }, gallery, info);
  main.append(layout);
}

/* ---------- Cart ---------- */
function cartLineImage(item) {
  return item.image || imgFor(item.imageKey || "");
}

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
    const img = cartLineImage(item);
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

  const waCard = el("div", { class: "cart-card checkout-card whatsapp-card" },
    el("div", { class: "head" }, el("h2", { text: "Checkout" })),
    el("div", { class: "checkout-body" },
      el("p", { class: "note", text: "Checkout happens on WhatsApp — we confirm your order and delivery address there." }),
      el("a", { class: "wa-btn", href: whatsappOrderUrl(cart), target: "_blank", rel: "noopener" },
        el("svg", { viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true" }, el("path", { d: WHATSAPP_PATH })),
        "Buy on WhatsApp"
      ),
      el("div", { class: "wa-total" }, el("span", { text: "Grand total" }), el("b", { text: fmtMoney(subtotal) })),
      el("p", { class: "note", text: "You'll confirm your name and delivery address in the chat with the shop." })
    )
  );

  grid.append(cartCard, waCard);
  main.append(grid);
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

/* ---------- Support ---------- */
function renderSupport() {
  const main = appMain;
  const supportCard = el("div", { class: "support-card" },
    el("div", { class: "support-icon", "aria-hidden": "true" },
      el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" }, path("M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"))
    ),
    el("h1", { text: "Need help?" }),
    el("p", { class: "support-lead", text: "Our support team is here for you. Get a reply, fix your order, or ask about an item — we're happy to help." }),
    el("a", { class: "wa-btn support-cta", href: whatsappSupportUrl(), target: "_blank", rel: "noopener" },
      el("svg", { viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true" }, el("path", { d: WHATSAPP_PATH })),
      "Chat with Support"
    ),
    el("div", { class: "support-facts" },
      el("div", { class: "support-fact" },
        el("span", { class: "support-fact-label", text: "Phone" }),
        el("a", { class: "support-fact-link", href: `tel:${SUPPORT_PHONE_TEL}`, text: SUPPORT_PHONE_DISPLAY })
      ),
      el("div", { class: "support-fact" },
        el("span", { class: "support-fact-label", text: "Support hours" }),
        el("span", { class: "support-fact-value", text: SUPPORT_HOURS })
      )
    ),
    SUPPORT_EMAIL ? el("p", { class: "support-email" }, "Email: ", el("a", { href: `mailto:${SUPPORT_EMAIL}`, text: SUPPORT_EMAIL })) : null,
    el("p", { class: "support-tip", text: "Tip: WhatsApp is the fastest way to reach us. You'll get a quick reply right in the chat." })
  );
  main.append(supportCard);
}

/* ---------- Boot ---------- */
startListeners();
window.addEventListener("hashchange", () => {
  galleryIndex = 0;
  currentRoute = currentRouteId();
  render();
});
navigate(currentRouteId());
