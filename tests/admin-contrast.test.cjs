const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const css = fs.readFileSync('web/admin/style.css','utf8');
function ratio(a,b) { const l = hex => { const c=hex.match(/[\da-f]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4); return .2126*c[0]+.7152*c[1]+.0722*c[2]; }; const x=l(a),y=l(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
function variables(block) { return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-fA-F]{6})(?![\da-fA-F])/g)].map(m=>[m[1],m[2]])); }
test('mocked, not real: theme palette contrast pairs', () => {
  const light=variables(css.match(/:root\s*\{([^}]+)\}/)[1]);
  const dark={...light,...variables(css.match(/:root\[data-theme="dark"\]\s*\{([^}]+)\}/)[1])};
  for (const [theme, vars] of Object.entries({light,dark})) {
    for (const [fg,bg] of [['ink','bg'],['ink','surface'],['muted','bg'],['muted','surface'],['red','surface'],['red','bg'],['primary','bg'],['accent-text','bg'],['gold-ink','gold']]) {
      const r=ratio(vars[fg],vars[bg]); console.log(`${theme} ${fg}/${bg}: ${r.toFixed(2)}:1`); assert.ok(r>=4.5, `${theme} ${fg}/${bg} ${r}`);
    }
  }
});
