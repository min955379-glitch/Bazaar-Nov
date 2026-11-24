# Storefront contrast checks

Calculated from CSS variables; not a browser or live test. Ratios are text/background unless stated.

| Element | Theme | Ratio | Result |
|---|---|---:|---|
| Body, header, cart, orders, support | dark | 14.80:1 | PASS |
| Cards, inputs, headings | dark | 13.23:1 | PASS |
| Muted text, search, footer | dark | 8.64:1 | PASS |
| Muted on cards, stock, disabled | dark | 7.72:1 | PASS |
| Quantity buttons, disabled | dark | 11.72:1 | PASS |
| Nav inactive hover | dark | 11.72:1 | PASS |
| Nav active | dark | 9.03:1 | PASS |
| Chips/add button/toast | dark | 10.01:1 | PASS |
| Gold badge and button | dark | 10.82:1 | PASS |
| Price and links on page | dark | 11.01:1 | PASS |
| Price and links on cards | dark | 9.84:1 | PASS |
| Out of stock/error | dark | 9.62:1 | PASS |
| Out of stock/error on card | dark | 8.60:1 | PASS |
| Cancel hover | dark | 8.63:1 | PASS |
| Order delivered badge | dark | 12.05:1 | PASS |
| Order pending badge/error toast | dark | 12.82:1 | PASS |
| Order status badge | dark | 13.31:1 | PASS |
| Support phone/email | dark | 9.59:1 | PASS |
| Hero title | dark | 14.46:1 | PASS |
| Hero subtitle | dark | 11.05:1 | PASS |
| Hero eyebrow | dark | 8.63:1 | PASS |
| WhatsApp button and icon | dark | 8.69:1 | PASS |
| Focus ring on page | dark | 11.01:1 | PASS |
| Focus ring on cards | dark | 9.84:1 | PASS |
| Text on raised surface | dark | 6.84:1 | PASS |
| Theme icon | dark | 13.23:1 | PASS |
| Hero live indicator | dark | 8.40:1 | PASS |
| Hero live text | dark | 14.46:1 | PASS |
| Body, header, cart, orders, support | light | 16.44:1 | PASS |
| Cards, inputs, headings | light | 17.57:1 | PASS |
| Muted text, search, footer | light | 6.31:1 | PASS |
| Muted on cards, stock, disabled | light | 6.74:1 | PASS |
| Quantity buttons, disabled | light | 15.06:1 | PASS |
| Nav inactive hover | light | 15.06:1 | PASS |
| Nav active | light | 12.05:1 | PASS |
| Chips/add button/toast | light | 15.03:1 | PASS |
| Gold badge and button | light | 7.11:1 | PASS |
| Price and links on page | light | 6.75:1 | PASS |
| Price and links on cards | light | 7.21:1 | PASS |
| Out of stock/error | light | 6.45:1 | PASS |
| Out of stock/error on card | light | 6.90:1 | PASS |
| Cancel hover | light | 5.34:1 | PASS |
| Order delivered badge | light | 13.36:1 | PASS |
| Order pending badge/error toast | light | 12.82:1 | PASS |
| Order status badge | light | 13.31:1 | PASS |
| Support phone/email | light | 6.86:1 | PASS |
| Hero title | light | 14.46:1 | PASS |
| Hero subtitle | light | 11.05:1 | PASS |
| Hero eyebrow | light | 8.63:1 | PASS |
| WhatsApp button and icon | light | 8.69:1 | PASS |
| Focus ring on page | light | 6.75:1 | PASS |
| Focus ring on cards | light | 7.21:1 | PASS |
| Text on raised surface | light | 5.78:1 | PASS |
| Theme icon | light | 17.57:1 | PASS |
| Hero live indicator | light | 8.40:1 | PASS |
| Hero live text | light | 14.46:1 | PASS |

## Fixed colour values

All hex and RGB colours are declared as variables in web/website/style.css. Fixed values include the green WhatsApp button, hero overlay/text and decorative shadows. No hex or RGB colours were found in the website JavaScript.

Fixed colour variables (hero, shadows and WhatsApp):

```css
  --fixed-color-1:rgba(15,47,36,0.97);
  --fixed-color-2:rgba(15,47,36,0.95);
  --fixed-color-3:rgba(15,47,36,0.90);
  --fixed-color-4:#fff;
  --fixed-color-5:#e5c47f;
  --fixed-color-6:#d8e4dc;
  --fixed-color-7:rgba(255,255,255,.14);
  --fixed-color-8:rgba(255,255,255,.25);
  --fixed-color-9:#8cd5a9;
  --fixed-color-10:rgba(140,213,169,.6);
  --fixed-color-11:rgba(140,213,169,0);
  --fixed-color-12:#1c1503;
  --fixed-color-13:rgba(15,47,36,0.10);
  --fixed-color-14:rgba(15,47,36,0.85);
  --fixed-color-15:rgba(0,0,0,0.35);
  --fixed-color-16:#25d366;
  --fixed-color-17:#0a1f14;
  --fixed-color-18:rgba(37,211,102,0.35);
  --fixed-color-19:rgba(37,211,102,0.45);
  --fixed-color-20:rgba(0,0,0,0.18);
  --fixed-color-21:rgba(37,211,102,0.55);
  --fixed-color-22:rgba(0,0,0,0.2);
  --fixed-color-23:rgba(37,211,102,0.4);
```
