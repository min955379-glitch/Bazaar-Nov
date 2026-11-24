/* ===== Bazaar admin portal — Supabase Auth (username + password) + Supabase DB/Storage =====
   No Google sign-in, no email field, no sign-up, no forgot-password.
   The username is converted to a hidden email (username + "@bazaarshop.app") for Supabase Auth.
   The password is typed by the user and sent to Supabase — never stored or hardcoded.
   Only this one signed-in admin can ADD/EDIT/DELETE products and images (see Row Level Security). */

/* ---------- Config (public only — RLS enforces the real access control) ---------- */
const SUPABASE_URL = "https://spetcfhneurdkipsmphx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwZXRjZmhuZXVyZGtpcHNtcGh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0NDgyOTUsImV4cCI6MjExMTAyNDI5NX0.RkniJOSufaYsqTkUZDLIkjqPUPIQ5JQPtbkpVY2dZTE";
const HIDDEN_EMAIL_DOMAIN = "bazaarshop.app";
const BUCKET = "product-images";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;   // safety net: reject huge uploads before compressing
const MIN_IMAGES = 2;
const MAX_IMAGES = 3;
const MAX_PRICE = 10_000_000;

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- State ---------- */
let authUser = null;          // signed-in Supabase user (or null)
let username = "";            // display username derived from the hidden email
let adminStatus = "loading";  // loading | signed-out | signed-in
let products = [];
let productsReady = false;
let productsError = null;
let viewMode = "list";          // list | form
let editingId = null;          // id when editing (null = add)
let formImages = [];           // [{ which, url?, file?, oldIndex?, tempUrl? }]
let removedIndexes = [];       // old indexes of kept images the user removed
let saving = false;
let formDraft = null;          // { name, pricePKR, desc, active } — survives re-renders
let failedAttempts = 0;
let lockedUntil = 0;           // Date.now() timestamp while locked out
let lockoutTimer = null;
let signInBusy = false;
let authError = null;
let deletePending = null;

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
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 5000);
}

function fmtPKR(n) {
  return "Rs " + Math.round(Number(n) || 0).toLocaleString("en-US");
}

function fmtDate(d) {
  if (!d) return "—";
  try {
    const date = new Date(d);
    if (isNaN(date)) return "—";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return "—"; }
}

function hiddenEmail(u) {
  return `${String(u || "").trim().toLowerCase()}@${HIDDEN_EMAIL_DOMAIN}`;
}

function usernameFromEmail(email) {
  const s = String(email || "");
  const suffix = `@${HIDDEN_EMAIL_DOMAIN}`;
  if (s.endsWith(suffix)) return s.slice(0, -suffix.length);
  return s;
}

function pathFromUrl(url) {
  const m = String(url || "").match(/\/product-images\/(.+?)(\?.*)?$/);
  return m ? m[1] : null;
}

function lockoutSecondsLeft() {
  const left = Math.ceil((lockedUntil - Date.now()) / 1000);
  return left > 0 ? left : 0;
}

// Temporary diagnostic: surface the Auth service's actual response without credentials.
function authDiagnostic(error, password) {
  const code = String(error?.code || error?.name || "unknown_error");
  const message = String(error?.message || "No error message returned.");
  const safe = (value) => password ? value.split(password).join("[redacted]") : value;
  return `Sign-in failed (${safe(code)}): ${safe(message)}`;
}

function recordFailedAttempt() {
  failedAttempts += 1;
  if (failedAttempts < 5) return;
  lockedUntil = Date.now() + 30_000;
  clearTimeout(lockoutTimer);
  lockoutTimer = setTimeout(() => {
    lockedUntil = 0;
    failedAttempts = 0;
    if (adminStatus === "signed-out") { authError = null; render(); }
  }, 30_000);
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

/* ---------- Auth (username + password → hidden email) ---------- */
function onAuthStateChange(event, session) {
  const user = session?.user || null;
  if (user) {
    username = usernameFromEmail(user.email);
    adminStatus = "signed-in";
    authUser = user;
    if (authError) authError = null;
    if (failedAttempts > 0) failedAttempts = 0;
    render();
    loadProducts();
  } else {
    authUser = null;
    username = "";
    adminStatus = "signed-out";
    products = [];
    productsReady = false;
    productsError = null;
    viewMode = "list";
    editingId = null;
    formImages = [];
    removedIndexes = [];
    formDraft = null;
    render();
  }
}

supabase.auth.onAuthStateChange(onAuthStateChange);

async function handleSignIn(e) {
  e?.preventDefault?.();
  if (signInBusy) return;

  const locked = lockoutSecondsLeft();
  if (locked > 0) {
    authError = `Too many failed attempts — try again in ${locked} seconds.`;
    render();
    return;
  }

  const usernameInput = ($("#f-username")?.value || "").trim();
  const passwordInput = $("#f-password")?.value || "";

  if (!usernameInput || !passwordInput) {
    authError = "Enter your username and password.";
    render();
    return;
  }

  const email = hiddenEmail(usernameInput);
  signInBusy = true;
  authError = null;
  render();

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password: passwordInput });
    if (error) {
      recordFailedAttempt();
      authError = authDiagnostic(error, passwordInput);
      render();
      return;
    }
    // success — onAuthStateChange will handle the transition
    failedAttempts = 0;
    lockedUntil = 0;
    clearTimeout(lockoutTimer);
    authError = null;
  } catch (err) {
    recordFailedAttempt();
    authError = authDiagnostic(err, passwordInput);
    render();
  } finally {
    signInBusy = false;
    render();
  }
}

async function handleSignOut() {
  try { await supabase.auth.signOut(); } catch (e) { console.error(e); }
}

/* ---------- Data loading ---------- */
async function loadProducts() {
  productsReady = false;
  productsError = null;
  render();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    productsError = error.message || "Could not load products.";
    productsReady = true;
    render();
    return;
  }
  products = (data || []).filter((p) => p && typeof p.name === "string");
  productsReady = true;
  render();
}

/* ---------- Rendering ---------- */
function render() {
  const nav = $("#nav-tabs");
  nav.innerHTML = "";
  if (adminStatus !== "signed-in") {
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
  const chip = el("div", { class: "user-chip" },
    el("span", { class: "who" },
      el("span", { class: "name", text: username || "Admin" }),
      el("span", { class: "role", text: "Administrator" })
    ),
    el("button", { class: "icon-btn", type: "button", title: "Sign out", "aria-label": "Sign out", onclick: handleSignOut }, signOutIcon())
  );
  nav.append(chip);
}

function signOutIcon() {
  return el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" },
    path("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"),
    path("M16 17l5-5-5-5"),
    path("M21 12H9")
  );
}

/* ---------- Gate / sign-in ---------- */
function gateView() {
  if (adminStatus === "loading") {
    return el("div", { class: "gate-wrap" }, el("div", { class: "gate-card" }, el("div", { class: "content" }, el("h1", { text: "Loading…" }), el("p", { class: "sub", text: "Checking admin session." }))));
  }
  const locked = lockoutSecondsLeft();
  const passwordField = el("div", { class: "field" },
    el("label", { text: "Password", for: "f-password" }),
    el("input", { id: "f-password", type: "password", autocomplete: "current-password", placeholder: "Enter your password", required: "", autocapitalize: "off", autocorrect: "off", spellcheck: "false" })
  );
  const usernameField = el("div", { class: "field" },
    el("label", { text: "Username", for: "f-username" }),
    el("input", { id: "f-username", type: "text", autocomplete: "username", placeholder: "Username", required: "", autocapitalize: "none", autocorrect: "off", spellcheck: "false" })
  );
  const error = authError;

  const signInBtn = el("button", {
    class: "primary-btn wide", type: "submit", id: "f-sign-in", disabled: signInBusy || locked > 0, onclick: null,
  },
    signInBusy ? "Signing in…" : (locked > 0 ? `Locked — try again in ${locked}s` : "Sign in")
  );

  const form = el("form", { class: "gate-form", onsubmit: handleSignIn },
    el("p", { class: "sub", style: "margin:0 0 0", text: "Sign in with your username and password to manage the catalog." }),
    usernameField,
    passwordField,
    error ? el("p", { class: "gate-err show", text: error }) : null,
    signInBtn,
    el("p", { class: "hint", style: "text-align:center", text: "Only the Bazaar administrator can sign in here." })
  );

  return el("div", { class: "gate-wrap" },
    el("div", { class: "gate-card" },
      el("div", { class: "hero-top" },
        el("img", { src: "assets/img_hero_banner.jpg", alt: "" }),
        el("div", { class: "scrim" }),
        el("span", { class: "pill", text: "Admin access" })
      ),
      el("div", { class: "content" },
        el("h1", { text: "Sign in to manage Bazaar" }),
        form
      )
    )
  );
}

/* ---------- Dashboard ---------- */
function kpiStrip(productsCount, inStockCount, hiddenCount) {
  const kpi = (label, value) => el("div", { class: "kpi" }, el("div", { class: "label", text: label }), el("div", { class: "value" }, value));
  return el("div", { class: "kpis" },
    kpi("Products", String(productsCount)),
    kpi("In stock", String(inStockCount)),
    kpi("Hidden", String(hiddenCount))
  );
}

function signedInChip() {
  return el("div", { class: "signed-in-chip" },
    el("span", { class: "signed-in-email", text: username || "Administrator" }),
    el("button", { class: "secondary-btn", type: "button", onclick: handleSignOut, text: "Sign out" })
  );
}

function dashboardView() {
  const inStock = products.filter((p) => p.in_stock !== false).length;
  const hidden = products.filter((p) => p.in_stock === false).length;

  const head = el("div", { class: "dash-head" },
    el("div", {},
      el("h1", { text: "Admin panel" }),
      el("p", { text: "Manage the catalog — changes appear on the storefront automatically." })
    ),
    signedInChip()
  );

  const content = el("div", {});
  content.append(productsTab(products.length, inStock, hidden));

  return el("div", {}, head, kpiStrip(products.length, inStock, hidden), content);
}

/* ---------- Products tab ---------- */
function productsTab() {
  const wrap = el("div", {});

  if (viewMode === "form") {
    wrap.append(productForm());
    return wrap;
  }

  const inStock = products.filter((p) => p.in_stock !== false).length;

  wrap.append(el("div", { class: "section-title" },
    el("h2", { text: "Catalog" }),
    el("span", { class: "hint", style: "color:var(--muted);font-size:.8rem", text: `${products.length} product${products.length === 1 ? "" : "s"} · ${inStock} in stock` })
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
  const imgs = Array.isArray(p.images) ? p.images.filter((s) => /^https?:\/\//i.test(String(s || ""))) : [];
  row.append(imgs.length ? el("img", { src: imgs[0], alt: p.name, loading: "lazy" }) : el("img", { src: "assets/img_hero_banner.jpg", alt: "", loading: "lazy" }));
  const meta = el("div", { class: "m" });
  meta.append(
    el("b", { text: fmtPKR(p.price) }),
    el("span", { text: p.in_stock === false ? "Hidden" : "In stock" }),
    el("span", { text: fmtDate(p.created_at) })
  );
  row.append(el("div", { class: "info" }, el("div", { class: "t", text: p.name }), meta));
  const actions = el("div", { class: "actions" },
    el("button", { class: "edit-btn", type: "button", onclick: () => openForm(p.id), text: "Edit" }),
    el("button", { class: "edit-btn danger", type: "button", onclick: () => handleDelete(p), text: "Delete" })
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
    const kept = Array.isArray(p && p.images) ? p.images.filter((s) => /^https?:\/\//i.test(String(s || ""))) : [];
    formImages = kept.map((url, i) => ({ which: "kept", url, oldIndex: i }));
  } else {
    formImages = [];
  }
  formDraft = null;
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

  const d = formDraft;
  const nameField = el("div", { class: "field" },
    el("label", { text: "Name", for: "f-name" }),
    el("input", { id: "f-name", type: "text", value: d ? d.name : (isEdit ? p.name : ""), placeholder: "e.g. Obsidian ANC Headphones", maxlength: "120", required: "" })
  );
  const priceField = el("div", { class: "field" },
    el("label", { text: "Price (PKR)", for: "f-price" }),
    el("input", { id: "f-price", type: "number", min: "1", step: "1", value: d ? d.pricePKR : (isEdit ? Math.round(Number(p.price) || 0) : ""), placeholder: "1500", required: "" })
  );
  const stockField = el("div", { class: "field" },
    el("label", { class: "toggle-label", style: "display:inline-flex;align-items:center;gap:10px;cursor:pointer;font-size:0.92rem;font-weight:700;color:var(--ink);text-transform:none;letter-spacing:0" },
      el("input", { type: "checkbox", id: "f-active", checked: d ? d.active : (isEdit ? p.in_stock !== false : true) }),
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
    el("label", { text: `Images (${formImages.length}/${MAX_IMAGES}) — ${MIN_IMAGES} or ${MAX_IMAGES} required`, for: "f-images" }),
    el("div", { class: "image-grid", id: "form-images" })
  ));
  const hint = el("p", { class: "hint", text: "Images are compressed in the browser and uploaded to Supabase Storage." });
  sheet.append(hint);

  const addBtn = el("button", { class: "secondary-btn", type: "button", id: "f-add-images", onclick: () => $("#f-image-input")?.click() }, iconUpload(), "Add images");
  const hidden = el("input", { id: "f-image-input", type: "file", accept: "image/*", multiple: "", style: "display:none", onchange: onImagesPicked });
  sheet.append(el("div", { class: "image-actions" }, addBtn, hidden));

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
  if (addBtn) addBtn.disabled = formImages.length >= MAX_IMAGES;
}

function onImagesPicked(e) {
  const files = [...(e.target.files || [])];
  const room = MAX_IMAGES - formImages.length;
  for (const f of files.slice(0, Math.max(0, room))) {
    if (f.size > MAX_IMAGE_BYTES) {
      toast(`“${f.name}” is too large — please use an image under 4 MB.`, true);
      continue;
    }
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
  const imgPath = `products/${productId}/image-${index}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(imgPath, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error("Image upload failed: " + (error.message || "unknown error"));
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(imgPath);
  return data.publicUrl;
}

function validateForm() {
  const name = ($("#f-name")?.value || "").trim();
  const pricePKR = Number($("#f-price")?.value || 0);
  const desc = ($("#f-desc")?.value || "").trim();
  const active = $("#f-active")?.checked !== false;
  if (name.length < 2 || name.length > 120) return { error: "Please enter a name (2–120 chars)." };
  if (!Number.isFinite(pricePKR) || pricePKR <= 0 || pricePKR > MAX_PRICE) return { error: "Please enter a valid price in PKR (greater than 0)." };
  if (desc.length < 2 || desc.length > 1000) return { error: "Please enter a description (2–1000 chars)." };
  if (formImages.length < MIN_IMAGES) return { error: `Add at least ${MIN_IMAGES} images (max ${MAX_IMAGES}).` };
  if (formImages.length > MAX_IMAGES) return { error: `Too many images — pick at most ${MAX_IMAGES}.` };
  return { name, pricePKR, desc, active };
}

async function submitProductForm() {
  if (saving) return;
  const v = validateForm();
  if (v.error) { toast(v.error, true); return; }
  const { name, pricePKR, desc, active } = v;
  const isEdit = !!editingId;

  formDraft = { name, pricePKR, desc, active };
  saving = true;
  const saveBtn = $("#f-save");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

  try {
    const productId = editingId || crypto.randomUUID();

    // upload only the new images; kept images keep their existing URLs
    const kept = formImages.filter((i) => i.which === "kept");
    const occupied = new Set(kept.map((i) => i.oldIndex));
    const uploadedNew = new Set();   // slot indices newly uploaded (not deleted later)
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

    const row = {
      name,
      price: Math.round(pricePKR * 100) / 100,
      description: desc,
      images: imageUrls,
      in_stock: active,
    };

    if (editingId) {
      const { error } = await supabase.from("products").update(row).eq("id", editingId);
      if (error) throw new Error(error.message || "Failed to update the product.");
      toast(`“${products.find((x) => x.id === editingId)?.name || name}” updated.`);
      // best-effort delete of removed old images (skip any path taken by a fresh upload)
      for (const i of removedIndexes) {
        if (uploadedNew.has(i)) continue;
        try {
          const imgPath = `products/${productId}/image-${i}.jpg`;
          await supabase.storage.from(BUCKET).remove([imgPath]);
        } catch {}
      }
    } else {
      const { error } = await supabase.from("products").insert({ id: productId, ...row });
      if (error) throw new Error(error.message || "Failed to add the product.");
      toast(`“${name}” added — it appears on the storefront now.`);
    }

    closeForm();
    await loadProducts();
  } catch (e) {
    console.error(e);
    saving = false;
    const msg = e?.message || "Save failed. Please try again.";
    toast(msg, true);
    const b = $("#f-save");
    if (b) { b.disabled = false; b.textContent = editingId ? "Save changes" : "Add product"; }
  }
}

async function handleDelete(p) {
  if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
  const images = Array.isArray(p.images) ? p.images.filter((s) => /^https?:\/\//i.test(String(s || ""))) : [];
  try {
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) throw new Error(error.message || "Delete failed.");
    toast(`“${p.name}” deleted.`);
    closeForm();
    // best-effort delete of the product's images
    for (const url of images) {
      try {
        const imgPath = pathFromUrl(url);
        if (imgPath) await supabase.storage.from(BUCKET).remove([imgPath]);
      } catch {}
    }
    await loadProducts();
  } catch (e) {
    console.error(e);
    toast(e?.message || "Delete failed.", true);
  }
}

/* ---------- Boot ---------- */
render();
