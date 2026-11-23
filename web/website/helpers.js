/* ===== Bazaar storefront — pure helpers (no Firebase imports; safe for tests) ===== */

export const WHATSAPP_NUMBER = "923221393770";
export const WHATSAPP_SUPPORT_TEXT = "Hello, I need help with Bazaar.";
export const WHATSAPP_FLOAT_TEXT = "Hello, I have a question about your products.";
export const WHATSAPP_PATH =
  "M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.46 1.33 4.96L2 22l5.25-1.39a9.87 9.87 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-5.46-4.45-9.91-9.91-9.91zm0 18.02h-.01a8.19 8.19 0 01-4.17-1.14l-.3-.18-3.12.82.82-3.05-.2-.31a8.17 8.17 0 01-1.27-4.36c0-4.54 3.69-8.23 8.23-8.23 2.18 0 4.23.85 5.77 2.38a8.14 8.14 0 012.38 5.77c0 4.54-3.69 8.23-8.22 8.24zm4.63-6.32c-.25-.13-1.48-.73-1.71-.81-.23-.08-.4-.13-.57.13-.17.25-.66.81-.81.97-.15.17-.29.19-.54.06-.25-.13-1.04-.38-1.98-1.22-.73-.65-1.22-1.45-1.36-1.7-.15-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.57-1.36-.78-1.86-.2-.48-.4-.42-.57-.43-.15-.01-.31-.01-.48-.01-.17 0-.44.06-.68.31-.23.25-.89.87-.89 2.12s.91 2.46 1.04 2.63c.13.17 1.79 2.73 4.34 3.83.61.26 1.08.42 1.46.54.61.19 1.17.16 1.61.1.49-.07 1.48-.6 1.69-1.19.21-.58.21-1.08.15-1.19-.07-.1-.24-.16-.49-.28z";

/* ---------- Currency (PKR display — amounts are unchanged, only the symbol/format changed) ---------- */
export function fmtMoney(cents) {
  const n = Math.round((Number(cents) || 0) / 100);
  return "Rs " + n.toLocaleString("en-US");
}

export function fmtDate(d) {
  if (!d) return "—";
  try {
    const date = typeof d.toDate === "function" ? d.toDate() : new Date(d);
    if (isNaN(date)) return "—";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

/* ---------- Demo preset images (local assets) ---------- */
export const PRESETS = {
  electronics: "assets/img_prod_electronics.jpg",
  fashion: "assets/img_prod_fashion.jpg",
  accessories: "assets/img_prod_fashion.jpg",
  home: "assets/img_prod_home.jpg",
  hero: "assets/img_hero_banner.jpg",
};

export function imgFor(key) {
  const t = (key || "").trim();
  if (/^https:\/\//i.test(t) || /^http:\/\//i.test(t)) return t;
  return PRESETS[t.toLowerCase()] || PRESETS.electronics;
}

/* ---------- Product images: images array preferred, legacy imageKey fallback ---------- */
export function imagesFor(p) {
  const list = Array.isArray(p && p.images)
    ? p.images.filter((s) => typeof s === "string" && /^https?:\/\//i.test(s))
    : [];
  if (list.length) return list;
  return [imgFor((p && p.imageKey) || "")];
}

/* ---------- WhatsApp ---------- */
export function whatsappUrl(text) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export function whatsappOrderMessage(cart) {
  const lines = ["Hello! I'd like to order from Bazaar."];
  for (const item of cart || []) {
    const qty = item.quantity || 1;
    const price = item.priceCents || 0;
    lines.push(`• ${item.title || "Item"} — Qty ${qty} · ${fmtMoney(price)} each · ${fmtMoney(price * qty)}`);
  }
  const total = (cart || []).reduce((s, i) => s + (i.priceCents || 0) * (i.quantity || 0), 0);
  lines.push(`Grand total: ${fmtMoney(total)}`);
  lines.push("Please share your name and delivery address.");
  return lines.join("\n");
}

export function whatsappOrderUrl(cart) {
  return whatsappUrl(whatsappOrderMessage(cart));
}

export function whatsappSupportUrl() {
  return whatsappUrl(WHATSAPP_SUPPORT_TEXT);
}

export function whatsappFloatUrl() {
  return whatsappUrl(WHATSAPP_FLOAT_TEXT);
}

/* ---------- Product filters ---------- */
export function matchFilters(p, selectedCategory, searchQuery) {
  if (selectedCategory && p.category !== selectedCategory) return false;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const hay = `${p.title} ${p.description || ""} ${p.category || ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function currentProducts(liveProducts, liveCatalogFailed, DEMO_CATALOG) {
  if (liveCatalogFailed) return DEMO_CATALOG;
  return liveProducts;
}
